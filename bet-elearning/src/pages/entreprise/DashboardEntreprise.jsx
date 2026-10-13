import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import PastilleGroupe from '../../components/shared/PastilleGroupe';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { genererPDF, fmtDatePDF, exporterExcelStyle } from '../../utils/genererPDF';
import { genererRecuVersement } from '../../utils/recuVersement';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlerte, useConfirm } from '../../contexts/ConfirmContext';
import { BadgeStatutVersement, VignettesPreuves, estVerse } from '../../components/shared/PreuvesPaiement';
import * as XLSX from 'xlsx';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
function authHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── helpers ──────────────────────────────────────────────────────────────────

function dureeFormation(dateDebut, dateFin) {
  const d1 = new Date(dateDebut);
  const d2 = new Date(dateFin);
  const mois = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (mois >= 12 && mois % 12 === 0) return `${mois / 12} an${mois / 12 > 1 ? 's' : ''}`;
  if (mois >= 12) return `${Math.floor(mois / 12)} an${Math.floor(mois / 12) > 1 ? 's' : ''} et ${mois % 12} mois`;
  return `${mois} mois`;
}
function pctFormationEcoule(dateDebut, dateFin) {
  const debut = new Date(dateDebut).getTime();
  const fin   = new Date(dateFin).getTime();
  const now   = Date.now();
  if (now <= debut) return 0;
  if (now >= fin)   return 100;
  return Math.round(((now - debut) / (fin - debut)) * 100);
}
function joursRestants(dateFin) {
  return Math.ceil((new Date(dateFin) - new Date()) / (1000 * 60 * 60 * 24));
}
function fmtDateFr(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUT_CONTRAT_LIB_LOCAL = {
  brouillon: { bg: '#F1F5F9', txt: '#475569', lib: '📝 Brouillon' },
  actif:     { bg: '#D1FAE5', txt: '#065F46', lib: '✅ Actif' },
  suspendu:  { bg: '#FEF3C7', txt: '#92400E', lib: '⏸️ Suspendu' },
  expire:    { bg: '#F1F5F9', txt: '#64748B', lib: '⌛ Expiré' },
  resilie:   { bg: '#FEE2E2', txt: '#991B1B', lib: '🚫 Résilié' },
};

const WORKFLOW_ETAPES = [
  { num: 1, lib: 'Liste transmise',       icone: '📋', acteur: '{nomEntreprise}' },
  { num: 2, lib: 'Comptes créés',         icone: '👤', acteur: 'Onboarding BET' },
  { num: 3, lib: 'Emails de bienvenue',   icone: '📧', acteur: 'Système' },
  { num: 4, lib: 'Onboarding apprenant',  icone: '🎓', acteur: 'Apprenant + Parent' },
  { num: 5, lib: 'Test de niveau',        icone: '📝', acteur: 'Apprenant' },
  { num: 6, lib: 'Groupe assigné',        icone: '🏫', acteur: 'Agent Placement' },
  { num: 7, lib: 'Accès complet activé',  icone: '✅', acteur: 'Système' },
  { num: 8, lib: 'Notification finale',   icone: '🔔', acteur: 'Système → TLG' },
];

function statutVersEtape(statut) {
  const map = {
    inscription_soumise: 1,
    en_attente:          2,
    test_niveau_pending: 5,
    actif:               7,
    certifie:            8,
    suspendu:            0,
  };
  return map[statut] ?? 2;
}

const STATUT_MAP = {
  actif:               { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  certifie:            { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Certifié' },
  en_attente:          { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente' },
  test_niveau_pending: { bg: '#FEF3C7', txt: '#92400E', lib: 'Test en cours' },
  suspendu:            { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
};

function Badge({ statut }) {
  const s = STATUT_MAP[statut] || STATUT_MAP.en_attente;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      background: s.bg, color: s.txt, fontSize: 11, fontWeight: 600,
    }}>
      {s.lib}
    </span>
  );
}

function WorkflowStepper({ etapeActuelle, compact = false }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  if (compact) {
    const etape = WORKFLOW_ETAPES.find(e => e.num === etapeActuelle);
    const pct   = Math.round(((etapeActuelle - 1) / 7) * 100);
    const fini  = etapeActuelle >= 7;
    return (
      <div style={{ minWidth: 140 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COULEURS.gris600, marginBottom: 3 }}>
          <span>{etape?.icone} Étape {etapeActuelle}/8</span>
          <span style={{ color: fini ? COULEURS.succes : COULEURS.attention }}>{pct}%</span>
        </div>
        <div style={{ height: 5, background: COULEURS.gris100, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.4s',
            width: `${pct}%`,
            background: fini ? COULEURS.succes : couleurTheme,
          }} />
        </div>
        <div style={{ fontSize: 10, color: COULEURS.gris600, marginTop: 3 }}>{etape?.lib}</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 700 }}>
        {WORKFLOW_ETAPES.map((e, i) => {
          const fait    = etapeActuelle > e.num;
          const courant = etapeActuelle === e.num;
          const futur   = etapeActuelle < e.num;
          return (
            <div key={e.num} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* Ligne de connexion */}
              {i < WORKFLOW_ETAPES.length - 1 && (
                <div style={{
                  position: 'absolute', top: 17, left: '50%', width: '100%', height: 2,
                  background: fait ? COULEURS.succes : COULEURS.gris200, zIndex: 0,
                }} />
              )}
              {/* Cercle */}
              <div style={{
                width: 34, height: 34, borderRadius: '50%', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: courant ? 16 : 13,
                background: fait ? COULEURS.succes : courant ? couleurTheme : COULEURS.gris100,
                color: (fait || courant) ? COULEURS.blanc : COULEURS.gris400,
                border: courant ? `2px solid ${couleurThemeFonce}` : '2px solid transparent',
                boxShadow: courant ? '0 0 0 3px rgba(8,145,178,0.2)' : 'none',
                fontWeight: 700,
                transition: 'all 0.2s',
              }}>
                {fait ? '✓' : e.icone}
              </div>
              {/* Label */}
              <div style={{ marginTop: 6, textAlign: 'center', padding: '0 2px' }}>
                <div style={{
                  fontSize: 10, fontWeight: courant ? 700 : 500,
                  color: fait ? COULEURS.succes : courant ? couleurTheme : COULEURS.gris400,
                  lineHeight: 1.3, marginBottom: 2,
                }}>
                  {e.lib}
                </div>
                <div style={{ fontSize: 9, color: COULEURS.gris400 }}>{e.acteur}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── onglet 1 : Tableau de bord RH ────────────────────────────────────────────

function OngletTableauBord({ apprenants, groupes, sessions, presences, notes, entId, couleurEnt = '#0891B2', contrat = null, contratsHistorique = [] }) {
  const actifs     = apprenants.filter(a => a.statut === 'actif').length;
  const certifies  = apprenants.filter(a => a.statut === 'certifie').length;
  const total      = apprenants.length;
  const tauxAct    = total > 0 ? Math.round((actifs / total) * 100) : 0;

  const groupesTLG  = groupes.filter(g => g.client_id === entId);
  const sessionsFaites = sessions.filter(s => s.statut === 'realisee' || s.statut === 'en_cours');
  const sessionsGroupesTLG = sessionsFaites.filter(s =>
    groupesTLG.some(g => g.id === s.groupe_id)
  );

  const nbPresents = presences.filter(p => p.statut === 'present').length;
  const nbAbsents  = presences.filter(p => p.statut === 'absent').length;
  const tauxPresence = (nbPresents + nbAbsents) > 0
    ? Math.round((nbPresents / (nbPresents + nbAbsents)) * 100)
    : 0;

  const notesApp = notes.filter(n => apprenants.some(a => a.id === n.apprenant_id));
  const moyenne  = notesApp.length > 0
    ? (notesApp.reduce((s, n) => s + (n.note / n.note_max) * 20, 0) / notesApp.length).toFixed(1)
    : '--';

  const kpis = [
    { icon: '👥', label: 'Apprenants inscrits',  val: total,           couleur: couleurEnt },
    { icon: '✅', label: 'Taux de présence',      val: `${tauxPresence}%`, couleur: COULEURS.succes },
    { icon: '📈', label: 'Progression moyenne',   val: `${tauxAct}%`,  couleur: '#A78BFA' },
    { icon: '📚', label: 'Cours réalisés',         val: sessionsGroupesTLG.length, couleur: COULEURS.orangeEnfant },
    { icon: '🏅', label: 'Certificats délivrés',  val: certifies,      couleur: couleurEnt + 'CC' },
    { icon: '⭐', label: 'Note moyenne',           val: `${moyenne}/20`, couleur: '#F59E0B' },
  ];

  const niveaux = ['A1', 'A2', 'B1', 'B2'];
  const repartNiveau = niveaux.map(n => ({
    niv: n,
    nb: apprenants.filter(a => a.niveau_cecr === n).length,
  }));
  const maxNiv = Math.max(...repartNiveau.map(r => r.nb), 1);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: COULEURS.blanc, borderRadius: 14, padding: '18px 20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`,
            borderTop: `4px solid ${k.couleur}`,
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: COULEURS.navy, lineHeight: 1, marginBottom: 4 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Durée de formation ── */}
      {contrat && (() => {
        const pct    = pctFormationEcoule(contrat.date_debut, contrat.date_fin);
        const jours  = joursRestants(contrat.date_fin);
        const fini   = jours <= 0;
        const couleurBarre = fini ? '#DC2626' : pct > 75 ? '#F97316' : couleurEnt;
        return (
          <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, borderTop: `4px solid ${couleurEnt}`, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 }}>📅 Durée de la formation</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { lbl: 'Début',  val: fmtDateFr(contrat.date_debut),                        icone: '🟢', couleur: '#059669' },
                { lbl: 'Fin',    val: fmtDateFr(contrat.date_fin),                           icone: '🔴', couleur: fini ? '#DC2626' : '#92400E' },
                { lbl: 'Durée',  val: dureeFormation(contrat.date_debut, contrat.date_fin),  icone: '⏱',  couleur: couleurEnt },
              ].map(({ lbl, val, icone, couleur }) => (
                <div key={lbl} style={{ background: COULEURS.gris50, borderRadius: 10, padding: '12px 14px', textAlign: 'center', border: `1px solid ${COULEURS.gris100}` }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{icone}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: couleur, marginBottom: 2 }}>{val}</div>
                  <div style={{ fontSize: 10, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COULEURS.gris400, marginBottom: 6 }}>
              <span>Avancement de la formation</span>
              <span style={{ fontWeight: 700, color: couleurBarre }}>{pct}% écoulé</span>
            </div>
            <div style={{ height: 10, background: COULEURS.gris100, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: couleurBarre, borderRadius: 6, transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: 11, marginTop: 6, textAlign: 'right', color: fini ? '#DC2626' : jours < 60 ? '#F97316' : COULEURS.gris400, fontWeight: fini || jours < 60 ? 700 : 400 }}>
              {fini ? '⚠️ Formation expirée' : `${jours} jour${jours > 1 ? 's' : ''} restant${jours > 1 ? 's' : ''}`}
            </div>
          </div>
        );
      })()}

      {/* ── Historique des contrats précédents (renouvellements) ── */}
      {contratsHistorique.filter(c => c.id !== contrat?.id).length > 0 && (
        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>
            📚 Historique des contrats ({contratsHistorique.filter(c => c.id !== contrat?.id).length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contratsHistorique.filter(c => c.id !== contrat?.id).map(c => {
              const cfgC = STATUT_CONTRAT_LIB_LOCAL[c.statut] || STATUT_CONTRAT_LIB_LOCAL.expire;
              return (
                <div key={c.id} style={{ background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy }}>Package {c.package || '-'}</span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, background: cfgC.bg, color: cfgC.txt, fontSize: 10, fontWeight: 700 }}>{cfgC.lib}</span>
                  </div>
                  <div style={{ fontSize: 11, color: COULEURS.gris600 }}>
                    {fmtDateFr(c.date_debut)} → {fmtDateFr(c.date_fin)} · {c.nb_licences || 0} bénéficiaires
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Répartition par niveau */}
        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 }}>📊 Répartition par niveau CECR</div>
          {repartNiveau.map(r => (
            <div key={r.niv} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: COULEURS.navy }}>Niveau {r.niv}</span>
                <span style={{ color: COULEURS.gris600 }}>{r.nb} apprenant(s)</span>
              </div>
              <div style={{ height: 8, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${(r.nb / maxNiv) * 100}%`,
                  background: couleurEnt, transition: 'width 0.4s',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Groupes dédiés */}
        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 }}>🏫 Groupes dédiés</div>
          {groupesTLG.length === 0 && (
            <p style={{ fontSize: 13, color: COULEURS.gris600 }}>Aucun groupe assigné.</p>
          )}
          {groupesTLG.map(g => (
            <div key={g.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13,
            }}>
              <div>
                <div style={{ fontWeight: 600, color: COULEURS.navy }}>{g.nom}</div>
                <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{g.tranche_age} · {g.cecr_min}→{g.cecr_max}</div>
              </div>
              <span style={{
                background: g.est_actif ? '#D1FAE5' : '#FEE2E2',
                color: g.est_actif ? '#065F46' : '#991B1B',
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              }}>
                {g.est_actif ? 'Actif' : 'Inactif'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Suivi workflow inscriptions en cours */}
      {apprenants.some(a => a.statut !== 'actif' && a.statut !== 'certifie' && a.statut !== 'suspendu') && (
        <div style={{
          background: COULEURS.blanc, borderRadius: 14, padding: 24, marginTop: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>
            ⏳ Inscriptions en cours de traitement
          </div>
          <div style={{ fontSize: 12, color: COULEURS.gris600, marginBottom: 20 }}>
            Suivi de l'avancement dans le workflow d'activation BET
          </div>
          {apprenants
            .filter(a => a.statut !== 'actif' && a.statut !== 'certifie' && a.statut !== 'suspendu')
            .map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '12px 0', borderBottom: `1px solid ${COULEURS.gris100}`,
              }}>
                <div style={{ width: 130, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COULEURS.navy }}>{a.prenom} {a.nom}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{a.age} ans</div>
                </div>
                <div style={{ flex: 1 }}>
                  <WorkflowStepper etapeActuelle={statutVersEtape(a.statut)} compact />
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

// ── onglet 2 : Liste des bénéficiaires ────────────────────────────────────────

const NIV_COULEUR_ENT = { A0:'#94A3B8', A1:'#60A5FA', A2:'#34D399', B1:'#818CF8', B2:'#F59E0B', C1:'#F97316', C2:'#EF4444' };

function ModalDetailBeneficiaire({ benef, classe, couleurEnt, onFermer, onStatutChange }) {
  const [tab,          setTab]          = useState('infos');
  const [localStatut,  setLocalStatut]  = useState(benef.statut || 'actif');
  const [confirm,        setConfirm]        = useState(null);
  const [typeSuspension, setTypeSuspension] = useState('momentanee');
  const [motifSuspension,setMotifSuspension]= useState('');
  const [saving,         setSaving]         = useState(false);
  const [flash,          setFlash]          = useState(null);
  const [presencesBenef,    setPresencesBenef]    = useState(null);
  const [presencesMoisFil,  setPresencesMoisFil]  = useState('');
  const [resultats,         setResultats]         = useState(null);
  const [resultatsMoisFil,  setResultatsMoisFil]  = useState('');
  const [testsNiveau,       setTestsNiveau]       = useState(null);

  useEffect(() => {
    if (!benef.id) return;
    if (tab === 'presences') {
      setPresencesBenef(null);
      fetch(`${API_URL}/api/elearning/apprenants/${benef.id}/presences`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => setPresencesBenef(d.presences || []))
        .catch(e => { console.error('[RH presences] erreur', e); setPresencesBenef([]); });
    }
    /* L'HISTORIQUE DES TESTS, ET PAS SEULEMENT LE DERNIER NIVEAU. Un apprenant en passe
       plusieurs au fil de sa formation - à l'entrée, puis à chaque changement de classe -
       et le RH qui finance a de quoi vouloir suivre cette progression, que la seule
       mention « Niveau CECR : A1 » de l'onglet Infos ne raconte pas.
       La route passe par l'ID DU BÉNÉFICIAIRE et non par son e-mail : elle vérifie côté
       serveur qu'il appartient bien à cette entreprise avant de répondre. */
    /* Chargé pour « tests » ET pour « competences » : ce dernier s'appuie dessus pour
       dater le niveau affiché et dire de quel test il provient. */
    if ((tab === 'tests' || tab === 'competences') && testsNiveau === null) {
      setTestsNiveau(null);
      fetch(`${API_URL}/api/entreprise/elearning/beneficiaires/${benef.id}/tests`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : { tests: [] })
        .then(d => setTestsNiveau(Array.isArray(d.tests) ? d.tests : []))
        .catch(() => setTestsNiveau([]));
    }
    if (tab === 'evaluations') {
      setResultats(null);
      fetch(`${API_URL}/api/elearning/apprenants/${benef.id}/evaluations`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
        .then(d => setResultats(d.evaluations || []))
        .catch(e => { console.error('[RH evaluations] erreur:', e); setResultats([]); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, benef.id]);

  const nom      = benef.nom_complet || `${benef.prenom || ''} ${benef.nom || ''}`.trim() || '-';
  const initiales = nom.split(/\s+/).map(p => p[0] || '').slice(0,2).join('').toUpperCase();
  const niv      = benef.niveau_cecr;
  const estActif = localStatut === 'actif';

  const STATUTS_CFG = {
    actif:    { bg:'#D1FAE5', txt:'#065F46', lib:'Actif' },
    suspendu: { bg:'#FEE2E2', txt:'#991B1B', lib:'Suspendu' },
    certifie: { bg:'#EDE9FE', txt:'#5B21B6', lib:'Certifié' },
  };
  const cfg = STATUTS_CFG[localStatut] || STATUTS_CFG.actif;

  const TABS = [
    { id:'infos',        lib:'Infos',         icone:'ℹ️' },
    { id:'competences',  lib:'Compétences',   icone:'🎯' },
    { id:'tests',        lib:'Test de niveau', icone:'📈' },
    { id:'evaluations',  lib:'Évaluations',   icone:'📊' },
    { id:'presences',    lib:'Présences',     icone:'✅' },
    { id:'acces',        lib:'Accès',         icone:'🔐' },
  ];

  const row = (l, v) => v ? (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, gap:12 }}>
      <span style={{ color:COULEURS.gris600, flexShrink:0 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right', wordBreak:'break-word' }}>{v}</span>
    </div>
  ) : null;

  async function changerStatut() {
    if (!confirm) return;
    const newStatut = confirm === 'activer' ? 'actif' : 'suspendu';
    setSaving(true);
    try {
      const body = { statut: newStatut };
      if (newStatut === 'suspendu') {
        body.type_suspension = typeSuspension;
        if (motifSuspension.trim()) body.motif = motifSuspension.trim();
      }
      const r = await fetch(`${API_URL}/api/entreprise/elearning/apprenants/${benef.id}/statut`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setLocalStatut(newStatut);
        onStatutChange?.(benef.id, newStatut);
        const msgSusp = typeSuspension === 'definitive'
          ? '🚫 Accès définitivement suspendu. L\'apprenant ne pourra plus se connecter.'
          : '⏸️ Accès temporairement suspendu. L\'apprenant ne peut plus se connecter.';
        setFlash({ type:'ok', msg: newStatut === 'actif' ? '✅ Accès réactivé avec succès.' : msgSusp });
      } else {
        const d = await r.json();
        setFlash({ type:'err', msg: d.error || 'Erreur lors de la mise à jour.' });
      }
    } catch {
      setFlash({ type:'err', msg: 'Erreur réseau.' });
    } finally {
      setSaving(false);
      setConfirm(null);
      setMotifSuspension('');
      setTypeSuspension('momentanee');
      setTimeout(() => setFlash(null), 5000);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, backdropFilter:'blur(4px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 40px 100px rgba(0,0,0,0.4)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg, ${couleurEnt}CC, ${couleurEnt})`, padding:'22px 28px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:54, height:54, borderRadius:14, overflow:'hidden', background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {benef.avatar_url ? (
                  <img src={benef.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                ) : initiales}
              </div>
              <div>
                <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>{nom}</div>
                <div style={{ display:'flex', gap:8, marginTop:5, alignItems:'center', flexWrap:'wrap' }}>
                  {niv && <span style={{ background:NIV_COULEUR_ENT[niv]||'rgba(255,255,255,0.3)', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:800 }}>{niv}</span>}
                  <span style={{ background:cfg.bg, color:cfg.txt, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{cfg.lib}</span>
                  {classe?.nom && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>· {classe.nom}</span>}
                </div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:36, height:36, cursor:'pointer', fontSize:20, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* ── Onglets ── */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, padding:'0 24px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'13px 18px', border:'none', borderBottom: tab===t.id ? `2.5px solid ${couleurEnt}` : '2.5px solid transparent', background:'none', color: tab===t.id ? couleurEnt : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', transition:'color 0.15s' }}>
              {t.icone} {t.lib}
            </button>
          ))}
        </div>

        {/* ── Contenu scrollable ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {flash && (
            <div style={{ marginBottom:16, padding:'11px 16px', borderRadius:10, background: flash.type==='ok' ? '#D1FAE5' : '#FEE2E2', color: flash.type==='ok' ? '#065F46' : '#991B1B', fontSize:13, fontWeight:600 }}>
              {flash.msg}
            </div>
          )}

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>👤 Coordonnées</div>
                {row('Nom complet',  nom)}
                {row('Email',        benef.email || benef.utilisateur?.email)}
                {row('Téléphone',    benef.telephone || benef.utilisateur?.telephone)}
                {row('Poste',        benef.poste)}
                {row('Département',  benef.departement)}
              </div>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>🎓 Formation</div>
                {row('Classe',      classe?.nom || benef.classe_nom || benef.groupe_nom)}
                {row('Niveau CECR', niv)}
                {row('Coach',       classe?.coach_nom || benef.coach_nom)}
                {row('Format',      { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' }[classe?.type_cours] || null)}
                {row('Date début',  classe?.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null)}
                {row('Inscrit le',  benef.date_inscription ? new Date(benef.date_inscription).toLocaleDateString('fr-FR') : null)}
              </div>
              {benef.profil_type && benef.profil_type !== 'adulte' && (
                <div style={{ gridColumn:'1/-1', background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0369A1', marginBottom:12, paddingBottom:10, borderBottom:'1px solid #BAE6FD' }}>
                    👨‍👩‍👧 Parent / Tuteur - {benef.profil_type === 'enfant' ? 'Enfant' : 'Adolescent'}
                    {benef.date_naissance && ` · ${Math.floor((Date.now() - new Date(benef.date_naissance)) / (365.25*24*3600*1000))} ans`}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                    {row('Prénom', benef.prenom_parent)}
                    {row('Nom', benef.nom_parent)}
                    {row('Email parent', benef.email_parent)}
                    {row('Téléphone parent', benef.telephone_parent)}
                    {benef.classe_scolaire && row('Classe scolaire', benef.classe_scolaire)}
                    {benef.date_naissance && row('Né(e) le', new Date(benef.date_naissance).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }))}
                  </div>
                </div>
              )}
              {niv && (
                <div style={{ gridColumn:'1/-1', background:`${NIV_COULEUR_ENT[niv]||couleurEnt}10`, border:`1px solid ${NIV_COULEUR_ENT[niv]||couleurEnt}30`, borderRadius:14, padding:'20px 24px', display:'flex', gap:20, alignItems:'center' }}>
                  <div style={{ width:68, height:68, borderRadius:14, background:NIV_COULEUR_ENT[niv]||couleurEnt, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:900, color:'#fff', flexShrink:0, boxShadow:`0 6px 20px ${NIV_COULEUR_ENT[niv]||couleurEnt}50` }}>{niv}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>
                      {{ A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire supérieur', C1:'Avancé', C2:'Maîtrise' }[niv] || niv}
                    </div>
                    <div style={{ fontSize:13, color:COULEURS.gris600 }}>Niveau CECR attribué lors du test de placement BET</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── COMPÉTENCES ── */}
          {/* ── TEST DE NIVEAU : l'historique, et la progression qu'il raconte ── */}
          {tab === 'tests' && (
            testsNiveau === null ? (
              <div style={{ textAlign:'center', padding:'40px 0', color:COULEURS.gris400 }}>Chargement…</div>
            ) : testsNiveau.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 24px', background:COULEURS.gris50, borderRadius:14, border:`2px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📈</div>
                <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucun test de niveau enregistré</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>
                  Les résultats apparaîtront ici après le passage du test de placement.
                </div>
              </div>
            ) : (
              <>
                {testsNiveau.length > 1 && (
                  <div style={{ background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:14, padding:'16px 20px', marginBottom:18 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#6D28D9', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
                      Progression · {testsNiveau.length} tests
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {[...testsNiveau].reverse().map((t, i, arr) => (
                        <span key={t.id || i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ padding:'5px 14px', borderRadius:9, background: i === arr.length-1 ? couleurEnt : COULEURS.blanc, color: i === arr.length-1 ? '#fff' : COULEURS.navy, border:`1px solid ${i === arr.length-1 ? couleurEnt : COULEURS.gris200}`, fontSize:14, fontWeight:800 }}>
                            {t.niveau || '?'}
                          </span>
                          {i < arr.length-1 && <span style={{ color:'#A78BFA', fontSize:15 }}>→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {testsNiveau.map((t, i) => (
                    <div key={t.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderLeft:`3px solid ${i === 0 ? couleurEnt : COULEURS.gris200}`, borderRadius:14, padding:'16px 20px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom: (t.score != null || t.by_category) ? 12 : 0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:20, fontWeight:800, color: NIV_COULEUR_ENT[t.niveau] || couleurEnt }}>{t.niveau || '-'}</span>
                          <span style={{ padding:'3px 10px', borderRadius:20, background:'#EDE9FE', color:'#5B21B6', fontSize:10, fontWeight:700 }}>{t.libelle_origine}</span>
                          {i === 0 && <span style={{ padding:'3px 10px', borderRadius:20, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:700 }}>Le plus récent</span>}
                        </div>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>{t.date ? fmtDateFr(t.date) : '-'}</span>
                      </div>
                      {(t.score != null || t.points || t.reponses || t.duree_min) && (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10 }}>
                          {[
                            t.score != null && { l:'Score',           v:`${t.score}%` },
                            t.points        && { l:'Points',          v:t.points },
                            t.reponses      && { l:'Bonnes réponses', v:t.reponses },
                            t.duree_min     && { l:'Durée',           v:`${t.duree_min} min` },
                          ].filter(Boolean).map(k => (
                            <div key={k.l} style={{ background:COULEURS.gris50, borderRadius:8, padding:'8px 12px' }}>
                              <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>{k.v}</div>
                              <div style={{ fontSize:9.5, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.04em', marginTop:2 }}>{k.l}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {t.by_category && Object.keys(t.by_category).length > 0 && (
                        <div style={{ marginTop:12 }}>
                          {Object.entries(t.by_category).map(([cat, val]) => {
                            const pct = typeof val === 'number' ? val : (val?.pourcentage ?? val?.score ?? 0);
                            return (
                              <div key={cat} style={{ marginBottom:7 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, marginBottom:3 }}>
                                  <span style={{ color:COULEURS.gris600, textTransform:'capitalize' }}>{cat}</span>
                                  <span style={{ fontWeight:700, color: pct >= 70 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626' }}>{Math.round(pct)}%</span>
                                </div>
                                <div style={{ height:5, background:COULEURS.gris100, borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${Math.min(100, Math.max(0, pct))}%`, background: pct >= 70 ? '#059669' : pct >= 50 ? '#F59E0B' : '#DC2626', borderRadius:3 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {tab === 'competences' && (
            <div style={{ maxWidth:900 }}>
              {/* Niveau CECR */}
              {niv ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:16, marginBottom:24 }}>
                    {[
                      { label:'Niveau actuel', val: niv, couleur: NIV_COULEUR_ENT[niv] || couleurEnt, desc: { A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Inter. supérieur', C1:'Avancé', C2:'Maîtrise' }[niv] },
                      { label:'Langue', val: benef.langue_souhaitee || 'Anglais', couleur: couleurEnt, desc: 'Langue de formation' },
                      /* « Test de placement initial » était écrit en dur : après un second
                         test - et il y en a un à chaque changement de classe - cette carte
                         affirmait encore que le niveau venait du tout premier. On lit donc
                         le test le plus récent, quand l'onglet voisin l'a chargé. */
                      { label:'Source évaluation', val: testsNiveau?.[0]?.libelle_origine || 'Test BET',
                        couleur:'#7C3AED',
                        desc: testsNiveau?.length > 1
                          ? `Dernier des ${testsNiveau.length} tests · ${fmtDateFr(testsNiveau[0].date)}`
                          : testsNiveau?.[0]?.date ? `Test du ${fmtDateFr(testsNiveau[0].date)}` : 'Test de placement' },
                    ].map(k => (
                      <div key={k.label} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'18px 20px', borderTop:`4px solid ${k.couleur}` }}>
                        <div style={{ fontSize:22, fontWeight:900, color:k.couleur, marginBottom:4 }}>{k.val}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:2 }}>{k.label}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400 }}>{k.desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Grille de compétences CECR */}
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, overflow:'hidden', marginBottom:20 }}>
                    <div style={{ padding:'16px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>📋 Compétences clés CECR - niveau {niv}</div>
                      <span style={{ background:`${NIV_COULEUR_ENT[niv]||couleurEnt}20`, color:NIV_COULEUR_ENT[niv]||couleurEnt, borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:700 }}>{niv}</span>
                    </div>
                    {[
                      { comp:'Compréhension orale',   icone:'👂', desc: { A0:'Mots isolés et phrases très simples', A1:'Expressions familières du quotidien', A2:'Phrases et expressions courantes', B1:'Points essentiels d\'un discours clair', B2:'Discours complexe sur sujets concrets', C1:'Discours long et complexe', C2:'Tout type de langue parlée' }[niv] || '-' },
                      { comp:'Compréhension écrite',  icone:'📖', desc: { A0:'Panneaux et mots familiers', A1:'Textes courts très simples', A2:'Textes courts et simples', B1:'Textes sur sujets quotidiens', B2:'Articles et rapports complexes', C1:'Textes longs et complexes', C2:'Textes abstraits ou spécialisés' }[niv] || '-' },
                      { comp:'Expression orale',      icone:'🗣️', desc: { A0:'Mots simples si l\'interlocuteur aide', A1:'Interaction simple si discours lent', A2:'Échanges simples sur sujets familiers', B1:'Se débrouiller en voyage', B2:'Conversations fluides avec natifs', C1:'S\'exprimer spontanément et couramment', C2:'Maîtrise parfaite' }[niv] || '-' },
                      { comp:'Expression écrite',     icone:'✍️', desc: { A0:'Remplir formulaires très simples', A1:'Notes et messages simples', A2:'Notes et messages simples personnels', B1:'Textes simples sur sujets familiers', B2:'Textes clairs et détaillés', C1:'Textes bien structurés', C2:'Textes complexes de façon nuancée' }[niv] || '-' },
                    ].map((c, i, arr) => (
                      <div key={c.comp} style={{ display:'grid', gridTemplateColumns:'180px 1fr auto', padding:'13px 20px', borderBottom: i < arr.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', gap:16 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:16 }}>{c.icone}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{c.comp}</span>
                        </div>
                        <span style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.5 }}>{c.desc}</span>
                        <span style={{ background:`${NIV_COULEUR_ENT[niv]||couleurEnt}18`, color:NIV_COULEUR_ENT[niv]||couleurEnt, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{niv} ✓</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ background:`${couleurEnt}08`, border:`1px solid ${couleurEnt}20`, borderRadius:12, padding:'12px 16px', fontSize:12, color:COULEURS.gris600, lineHeight:1.6 }}>
                    💡 Le niveau <strong style={{ color:COULEURS.navy }}>{niv}</strong>
                    {testsNiveau?.length > 1
                      ? <> est le résultat du dernier des <strong style={{ color:COULEURS.navy }}>{testsNiveau.length} tests</strong> passés{testsNiveau[0]?.date ? ` le ${fmtDateFr(testsNiveau[0].date)}` : ''}. Le détail de la progression est dans l'onglet « Test de niveau ».</>
                      : <> a été attribué lors du test de placement BET{testsNiveau?.[0]?.date ? ` du ${fmtDateFr(testsNiveau[0].date)}` : ''}. L'évolution vers le niveau supérieur sera réévaluée en cours de formation.</>}
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:52, marginBottom:16 }}>🎯</div>
                  <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Niveau en attente</div>
                  <div style={{ fontSize:13, color:COULEURS.gris600, maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>
                    Les compétences de <strong style={{ color:COULEURS.navy }}>{nom}</strong> seront renseignées après le test de placement BET.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ÉVALUATIONS ── */}
          {tab === 'evaluations' && (() => {
            if (resultats === null) return (
              <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:28, opacity:0.5 }}>⏳</div>
                <div style={{ fontSize:13, marginTop:10 }}>Chargement des évaluations…</div>
              </div>
            );
            const MENTION_C = { Excellent:'#059669', Bien:'#2563EB', 'Assez Bien':'#7C3AED', Passable:'#D97706', Insuffisant:'#DC2626' };
            const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
            const moisDispo = [...new Set(resultats.map(r => r.date_evaluation?.slice(0,7)).filter(Boolean))].sort().reverse();
            const listeFiltree = resultatsMoisFil
              ? resultats.filter(r => r.date_evaluation?.slice(0,7) === resultatsMoisFil)
              : resultats;
            const noteMoy = resultats.filter(r=>r.note!=null).length > 0
              ? (resultats.reduce((s, r) => s + (r.note != null ? r.note / (r.note_max || 20) * 20 : 0), 0) / resultats.filter(r=>r.note!=null).length).toFixed(1)
              : null;
            return (
              <div style={{ maxWidth:900 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                    {[
                      { label:'Évaluations', val: resultats.length, icone:'📝', couleur: couleurEnt },
                      { label:'Note moyenne', val: noteMoy ? `${noteMoy}/20` : '-', icone:'⭐', couleur:'#F59E0B' },
                      { label:'Réussies', val: resultats.filter(r => r.mention && r.mention !== 'Insuffisant').length, icone:'✅', couleur:'#059669' },
                      { label:'Dernière éval.', val: resultats[0]?.date_evaluation ? new Date(resultats[0].date_evaluation).toLocaleDateString('fr-FR') : '-', icone:'📅', couleur:'#7C3AED' },
                    ].map(k => (
                      <div key={k.label} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'14px 18px', borderTop:`4px solid ${k.couleur}` }}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{k.icone}</div>
                        <div style={{ fontSize:20, fontWeight:900, color:k.couleur, marginBottom:2 }}>{k.val}</div>
                        <div style={{ fontSize:10, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', fontWeight:600 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {moisDispo.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:12, color:COULEURS.gris600 }}>Mois :</span>
                      <select value={resultatsMoisFil} onChange={e => setResultatsMoisFil(e.target.value)}
                        style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'6px 10px', fontSize:13, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, cursor:'pointer' }}>
                        <option value="">Tous les mois</option>
                        {moisDispo.map(m => {
                          const [y, mo] = m.split('-');
                          return <option key={m} value={m}>{MOIS_FR[parseInt(mo,10)]} {y}</option>;
                        })}
                      </select>
                    </div>
                  )}
                </div>
                {resultats.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'52px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:48, marginBottom:14 }}>📊</div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune évaluation enregistrée</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>
                      Les résultats d'évaluation de <strong style={{ color:COULEURS.navy }}>{nom}</strong> apparaîtront ici au fur et à mesure de la formation.
                    </div>
                    {niv && (
                      <div style={{ marginTop:22, background:`${couleurEnt}10`, border:`1px solid ${couleurEnt}25`, borderRadius:12, padding:'12px 20px', display:'inline-block' }}>
                        <span style={{ fontSize:13, color:COULEURS.navy }}>📝 Test de placement effectué · Niveau <strong>{niv}</strong> attribué</span>
                      </div>
                    )}
                  </div>
                ) : listeFiltree.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>Aucune évaluation ce mois-là</div>
                  </div>
                ) : (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, display:'grid', gridTemplateColumns:'1fr 90px 120px 100px 1fr', fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Évaluation</span><span>Type</span><span>Date</span><span>Note</span><span>Commentaire</span>
                    </div>
                    {listeFiltree.map((ev, i) => {
                      const pct = ev.note != null && ev.note_max ? (ev.note / ev.note_max) * 100 : null;
                      const coulNote = pct == null ? COULEURS.gris400 : pct >= 75 ? '#059669' : pct >= 50 ? '#B45309' : '#DC2626';
                      const isDevoir = ev.source === 'devoir';
                      return (
                        <div key={ev.id || i} style={{ display:'grid', gridTemplateColumns:'1fr 90px 120px 100px 1fr', padding:'12px 20px', borderBottom: i < listeFiltree.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                          <div>
                            <div style={{ fontWeight:600, color:COULEURS.navy }}>{ev.titre || 'Évaluation'}</div>
                          </div>
                          <span style={{ background: isDevoir ? '#EFF6FF' : `${couleurEnt}12`, color: isDevoir ? '#1E40AF' : couleurEnt, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700, display:'inline-block', textTransform:'capitalize' }}>
                            {isDevoir ? '📝 Devoir' : (ev.type || 'Note')}
                          </span>
                          <span style={{ color:COULEURS.gris600, fontSize:12 }}>{ev.date_evaluation ? new Date(ev.date_evaluation).toLocaleDateString('fr-FR') : '-'}</span>
                          <span style={{ fontWeight:700, color:coulNote }}>
                            {ev.note != null ? `${ev.note}/${ev.note_max||20}` : '-'}
                          </span>
                          <span style={{ fontSize:11, color:COULEURS.gris500, fontStyle: ev.commentaire_coach ? 'normal' : 'italic' }}>{ev.commentaire_coach || '-'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── PRÉSENCES ── */}
          {tab === 'presences' && (() => {
            if (presencesBenef === null) return (
              <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:28, opacity:0.5 }}>⏳</div>
                <div style={{ fontSize:13, marginTop:10 }}>Chargement des présences…</div>
              </div>
            );
            const STATUT_P = {
              present: { lib:'Présent',  bg:'#D1FAE5', txt:'#065F46' },
              absent:  { lib:'Absent',   bg:'#FEE2E2', txt:'#991B1B' },
              retard:  { lib:'Retard',   bg:'#FEF3C7', txt:'#92400E' },
              excuse:  { lib:'Excusé',   bg:'#EFF6FF', txt:'#1E40AF' },
            };
            const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
            const moisDispo = [...new Set(presencesBenef.map(p => p.seance?.date?.slice(0,7)).filter(Boolean))].sort().reverse();
            const listeFiltree = presencesMoisFil
              ? presencesBenef.filter(p => p.seance?.date?.slice(0,7) === presencesMoisFil)
              : presencesBenef;
            const nbPresents = presencesBenef.filter(p => p.statut === 'present').length;
            const nbAbsents  = presencesBenef.filter(p => p.statut === 'absent').length;
            const nbRetards  = presencesBenef.filter(p => p.statut === 'retard').length;
            const tauxP = presencesBenef.length > 0 ? Math.round((nbPresents / presencesBenef.length) * 100) : null;
            return (
              <div style={{ maxWidth:900 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    {[
                      { l:'Total séances', v:presencesBenef.length, c:couleurEnt },
                      { l:'Présences',     v:nbPresents,            c:'#16A34A'  },
                      { l:'Absences',      v:nbAbsents,             c:'#DC2626'  },
                      { l:'Retards',       v:nbRetards,             c:'#D97706'  },
                      tauxP !== null && { l:'Taux', v:`${tauxP}%`, c: tauxP >= 75 ? '#16A34A' : '#DC2626' },
                    ].filter(Boolean).map(({ l, v, c }) => (
                      <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'8px 14px', textAlign:'center', minWidth:90 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                        <div style={{ fontSize:9, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {moisDispo.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:12, color:COULEURS.gris600 }}>Mois :</span>
                      <select value={presencesMoisFil} onChange={e => setPresencesMoisFil(e.target.value)}
                        style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'6px 10px', fontSize:13, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, cursor:'pointer' }}>
                        <option value="">Tous les mois</option>
                        {moisDispo.map(m => {
                          const [y, mo] = m.split('-');
                          return <option key={m} value={m}>{MOIS_FR[parseInt(mo,10)]} {y}</option>;
                        })}
                      </select>
                    </div>
                  )}
                </div>
                {presencesBenef.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'52px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:44, marginBottom:12 }}>📋</div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune présence enregistrée</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, maxWidth:380, margin:'0 auto', lineHeight:1.6 }}>
                      Les feuilles de présence apparaîtront ici dès que les sessions de cours démarreront.
                    </div>
                  </div>
                ) : listeFiltree.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>Aucune présence ce mois-là</div>
                  </div>
                ) : (
                  <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 1fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Date & Séance</span><span>Heure</span><span>Statut</span><span>Observation</span>
                    </div>
                    {listeFiltree.map((p, i) => {
                      const s  = p.seance || {};
                      const st = STATUT_P[p.statut] || { lib: p.statut, bg: COULEURS.gris100, txt: COULEURS.gris600 };
                      return (
                        <div key={p.id || i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 1fr', padding:'12px 20px', borderBottom: i < listeFiltree.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                          <div>
                            <div style={{ fontWeight:600, color:COULEURS.navy }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}) : '-'}</div>
                            {s.objectifs_session && <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{s.objectifs_session.slice(0,60)}{s.objectifs_session.length>60?'…':''}</div>}
                          </div>
                          <span style={{ fontSize:12, color:COULEURS.gris600 }}>{s.heure_debut || '-'}{s.heure_fin ? ` → ${s.heure_fin}`:''}</span>
                          <span style={{ background:st.bg, color:st.txt, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, display:'inline-block' }}>{st.lib}</span>
                          <span style={{ fontSize:12, color:COULEURS.gris500, fontStyle: p.observation ? 'normal' : 'italic' }}>{p.observation || '-'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── ACCÈS ── */}
          {tab === 'acces' && (
            <div style={{ maxWidth:620 }}>
              <div style={{ background:`${couleurEnt}08`, border:`1px solid ${couleurEnt}25`, borderRadius:14, padding:'18px 22px', marginBottom:24, fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>
                ⚠️ <strong>Données pédagogiques en lecture seule.</strong> Seule la gestion administrative des accès est disponible ici. Contactez l'équipe BET pour tout ajustement de niveau.
              </div>

              {/* Statut actuel */}
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'22px 24px', marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${COULEURS.gris100}` }}>🔐 Statut d'accès actuel</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:46, height:46, borderRadius:12, background: estActif ? '#D1FAE510' : '#FEE2E210', border:`2px solid ${estActif ? '#059669' : '#DC2626'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                      {estActif ? '✅' : '⛔'}
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color: estActif ? '#059669' : '#DC2626' }}>
                        {estActif ? '✅ Accès actif' : typeSuspension === 'definitive' ? '🚫 Suspendu définitivement' : '⏸️ Suspendu temporairement'}
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>
                        {estActif
                          ? `${nom} a accès à la plateforme BET E-Learning.`
                          : typeSuspension === 'definitive'
                            ? `L'accès de ${nom} a été définitivement révoqué.`
                            : `L'accès de ${nom} est temporairement bloqué.`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    {!estActif && (
                      <button onClick={() => setConfirm('activer')}
                        style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'#059669', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        ✅ Activer l'accès
                      </button>
                    )}
                    {estActif && (
                      <button onClick={() => setConfirm('suspendre')}
                        style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        ⛔ Suspendre l'accès
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Infos complémentaires */}
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>📧 Informations de connexion</div>
                {row('Email de connexion', benef.email || benef.utilisateur?.email)}
                {row('Classe assignée',    classe?.nom || benef.classe_nom)}
                {row('Coach',              classe?.coach_nom || benef.coach_nom)}
                <div style={{ marginTop:14, padding:'10px 14px', background:COULEURS.gris50, borderRadius:9, fontSize:12, color:COULEURS.gris600 }}>
                  💡 Les identifiants sont envoyés par l'équipe BET lors de l'activation initiale.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal confirmation statut ── */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 }}
          onClick={() => { setConfirm(null); setMotifSuspension(''); setTypeSuspension('momentanee'); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:16, padding:'28px 32px', maxWidth:440, width:'90%', boxShadow:'0 24px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:22, marginBottom:12 }}>{confirm==='activer' ? '✅' : '⛔'}</div>
            <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>
              {confirm==='activer' ? "Réactiver l'accès" : "Suspendre l'accès"}
            </div>

            {confirm === 'suspendre' ? (
              <>
                {/* Type de suspension */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Type de suspension</div>
                  {[
                    { val:'momentanee', ic:'⏸️', lib:'Temporaire', desc:'Accès bloqué momentanément - réactivable à tout moment' },
                    { val:'definitive', ic:'🚫', lib:'Définitive',  desc:'Arrêt définitif - contrat terminé ou exclu' },
                  ].map(opt => (
                    <div key={opt.val} onClick={() => setTypeSuspension(opt.val)}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`2px solid ${typeSuspension===opt.val ? (opt.val==='definitive' ? '#DC2626' : '#D97706') : COULEURS.gris200}`, background: typeSuspension===opt.val ? (opt.val==='definitive' ? '#FEF2F2' : '#FFFBEB') : COULEURS.blanc, cursor:'pointer', marginBottom:8, transition:'all 0.15s' }}>
                      <span style={{ fontSize:18 }}>{opt.ic}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color: typeSuspension===opt.val ? (opt.val==='definitive' ? '#DC2626' : '#D97706') : COULEURS.navy }}>{opt.lib}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:1 }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Motif */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                    Motif <span style={{ fontWeight:400, textTransform:'none', fontSize:11 }}>(optionnel)</span>
                  </label>
                  <textarea
                    value={motifSuspension}
                    onChange={e => setMotifSuspension(e.target.value)}
                    placeholder={typeSuspension === 'definitive' ? 'Ex : Fin de contrat, comportement…' : 'Ex : Congé maternité, maladie…'}
                    rows={2}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, fontSize:13, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'none', boxSizing:'border-box', outline:'none' }}
                  />
                </div>

                <div style={{ padding:'10px 14px', borderRadius:9, background: typeSuspension==='definitive' ? '#FEF2F2' : '#FFFBEB', border:`1px solid ${typeSuspension==='definitive' ? '#FECACA' : '#FDE68A'}`, fontSize:12, color: typeSuspension==='definitive' ? '#991B1B' : '#92400E', marginBottom:20, lineHeight:1.5 }}>
                  {typeSuspension === 'definitive'
                    ? `⚠️ ${nom} ne pourra plus jamais se connecter à la plateforme. Cette action doit être confirmée consciemment.`
                    : `ℹ️ ${nom} verra son accès bloqué immédiatement. Vous pourrez le réactiver depuis cet écran.`}
                </div>
              </>
            ) : (
              <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:20, lineHeight:1.6 }}>
                {nom} pourra de nouveau accéder à la plateforme BET E-Learning et à ses cours.
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setConfirm(null); setMotifSuspension(''); setTypeSuspension('momentanee'); }}
                style={{ flex:1, padding:'10px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Annuler
              </button>
              <button onClick={changerStatut} disabled={saving}
                style={{ flex:1, padding:'10px', borderRadius:9, border:'none', background: confirm==='activer' ? '#059669' : (typeSuspension==='definitive' ? '#991B1B' : '#DC2626'), color:'#fff', fontWeight:700, fontSize:13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                {saving ? '⏳…' : confirm==='activer' ? '✅ Confirmer activation' : typeSuspension==='definitive' ? '🚫 Suspendre définitivement' : '⏸️ Suspendre temporairement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SESSIONS_PAR_PAGE = 8;

function OngletSessionsClasse({ classeId, coachNom, couleur }) {
  const [seances,     setSeances]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erreur,      setErreur]      = useState(null);
  const [dateFiltre,  setDateFiltre]  = useState(''); // 'YYYY-MM'
  const [page,        setPage]        = useState(1);

  useEffect(() => {
    if (!classeId) return;
    setLoading(true);
    setErreur(null);
    fetch(`${API_URL}/api/elearning/seances?classe_id=${classeId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setErreur(d.error);
        else setSeances((d.seances || []).sort((a, b) => new Date(b.date) - new Date(a.date)));
      })
      .catch(e => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [classeId]);

  const STATUT = {
    planifiee: { lib:'Planifiée',  bg:'#EFF6FF', txt:'#1E40AF', dot:'#3B82F6' },
    realisee:  { lib:'Réalisée',   bg:'#F0FDF4', txt:'#166534', dot:'#22C55E' },
    annulee:   { lib:'Annulée',    bg:'#FEF2F2', txt:'#991B1B', dot:'#EF4444' },
  };

  const col = couleur || '#0891B2';

  const seancesFiltrees = dateFiltre
    ? seances.filter(s => s.date && s.date.slice(0, 7) === dateFiltre)
    : seances;

  const nbPages    = Math.max(1, Math.ceil(seancesFiltrees.length / SESSIONS_PAR_PAGE));
  const pageCour   = Math.min(page, nbPages);
  const seancesPage = seancesFiltrees.slice((pageCour - 1) * SESSIONS_PAR_PAGE, pageCour * SESSIONS_PAR_PAGE);

  const nbRealisees  = seances.filter(s => s.statut === 'realisee').length;
  const nbPlanifiees = seances.filter(s => s.statut === 'planifiee').length;

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
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {[
            { l:'Total', v:seances.length,  c:col },
            { l:'Réalisées', v:nbRealisees,  c:'#16A34A' },
            { l:'Planifiées', v:nbPlanifiees, c:'#2563EB' },
            { l:'Annulées', v:seances.filter(s=>s.statut==='annulee').length, c:'#DC2626' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'8px 14px', textAlign:'center', minWidth:90 }}>
              <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
              <div style={{ fontSize:9, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
            </div>
          ))}
        </div>
        {(() => {
          const moisDispo = [...new Set(seances.map(s => s.date?.slice(0,7)).filter(Boolean))].sort().reverse();
          const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
          return moisDispo.length > 0 ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>Mois :</span>
              <select value={dateFiltre} onChange={e => { setDateFiltre(e.target.value); setPage(1); }}
                style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'6px 10px', fontSize:13, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, cursor:'pointer' }}>
                <option value="">Tous les mois</option>
                {moisDispo.map(m => {
                  const [y, mo] = m.split('-');
                  return <option key={m} value={m}>{MOIS_FR[parseInt(mo,10)]} {y}</option>;
                })}
              </select>
            </div>
          ) : null;
        })()}
      </div>

      {dateFiltre && seancesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Aucune session ce mois-là</div>
        </div>
      ) : seances.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:14 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune session enregistrée</div>
          <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, maxWidth:360, margin:'0 auto' }}>
            Les sessions de cours apparaîtront ici dès que le coach commencera à les saisir.
          </div>
          {coachNom && (
            <div style={{ marginTop:20, background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'10px 18px', display:'inline-block' }}>
              <span style={{ fontSize:13, color:COULEURS.navy }}>👨‍🏫 Coach : <strong>{coachNom}</strong></span>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            {seancesPage.map((s, i) => {
              const st = STATUT[s.statut] || STATUT.planifiee;
              const duree = s.heure_debut && s.heure_fin
                ? (() => {
                    const [h1, m1] = s.heure_debut.split(':').map(Number);
                    const [h2, m2] = s.heure_fin.split(':').map(Number);
                    const diff = (h2*60+m2) - (h1*60+m1);
                    return diff > 0 ? `${Math.floor(diff/60)}h${String(diff%60).padStart(2,'0')}` : null;
                  })()
                : null;
              const lien = s.lien_zoom || s.lien_meet || s.lien_teams;
              return (
                <div key={s.id || i} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div style={{ flexShrink:0, width:52, textAlign:'center', background:`${col}10`, border:`1px solid ${col}25`, borderRadius:10, padding:'8px 6px' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:col, lineHeight:1 }}>
                      {s.date ? new Date(s.date).getDate() : '-'}
                    </div>
                    <div style={{ fontSize:9, fontWeight:700, color:col, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>
                      {s.date ? new Date(s.date).toLocaleDateString('fr-FR',{month:'short'}) : ''}
                    </div>
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

          {/* Pagination */}
          {nbPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageCour === 1}
                style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:pageCour===1?COULEURS.gris50:COULEURS.blanc, color:pageCour===1?COULEURS.gris400:COULEURS.navy, cursor:pageCour===1?'default':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                ← Préc.
              </button>
              <span style={{ fontSize:13, color:COULEURS.gris600 }}>Page {pageCour} / {nbPages}</span>
              <button onClick={() => setPage(p => Math.min(nbPages, p + 1))} disabled={pageCour === nbPages}
                style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:pageCour===nbPages?COULEURS.gris50:COULEURS.blanc, color:pageCour===nbPages?COULEURS.gris400:COULEURS.navy, cursor:pageCour===nbPages?'default':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                Suiv. →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const PRESENCES_PAR_PAGE = 10;

function ModalDetailClasse({ classe, couleurEnt, onFermer, onOuvrirBenef }) {
  const [tab, setTab] = useState('infos');
  const [presencesClasse,   setPresencesClasse]   = useState(null);
  const [seancesClasse,     setSeancesClasse]     = useState([]);
  const [presencesDateFiltre, setPresencesDateFiltre] = useState('');
  const [presencesPage,     setPresencesPage]     = useState(1);
  const [accesStatuts,      setAccesStatuts]      = useState({}); // inscriptionId → { bloque, saving }

  useEffect(() => {
    if (tab === 'presences' && presencesClasse === null && classe.id) {
      fetch(`${API_URL}/api/elearning/classes/${classe.id}/presences`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { setPresencesClasse(d.presences || []); setSeancesClasse(d.seances || []); })
        .catch(() => setPresencesClasse([]));
    }
  }, [tab, classe.id, presencesClasse]);

  async function toggleAccesBloque(inscriptionId, currentBloque) {
    setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: true } }));
    try {
      const r = await fetch(`${API_URL}/api/elearning/apprenants/${inscriptionId}/suspension`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloque: !currentBloque }),
      });
      if (r.ok) {
        setAccesStatuts(p => ({ ...p, [inscriptionId]: { bloque: !currentBloque, saving: false } }));
      } else {
        setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: false } }));
      }
    } catch {
      setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: false } }));
    }
  }

  const niv      = classe.niveau;
  const benefs   = classe.apprenants || [];
  const horaires = Array.isArray(classe.horaire) ? classe.horaire : [];
  const FORMAT   = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };
  const TABS = [
    { id:'infos',          lib:'Infos',            icone:'ℹ️' },
    { id:'dispos',         lib:'Disponibilités',   icone:'📅', badge: horaires.length },
    { id:'beneficiaires',  lib:'Bénéficiaires',    icone:'👥' },
    { id:'presences',      lib:'Présences',        icone:'✅' },
    { id:'sessions',       lib:'Sessions',         icone:'📅' },
    { id:'acces',          lib:'Accès',            icone:'🔐' },
  ];

  const row = (l, v) => v ? (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, gap:12 }}>
      <span style={{ color:COULEURS.gris600, flexShrink:0 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right' }}>{v}</span>
    </div>
  ) : null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500, backdropFilter:'blur(4px)' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 40px 100px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg, ${couleurEnt}DD, ${couleurEnt})`, padding:'22px 28px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              {/* La photo de la classe plutôt qu'une icône identique pour toutes :
                  le RH reconnaît ainsi ses classes d'un coup d'œil. */}
              <PastilleGroupe nom={classe.nom || 'Classe'} url={classe.photo_url} taille={52} accent={couleurEnt} agrandissable />
              <div>
                <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>{classe.nom}</div>
                <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap', alignItems:'center' }}>
                  {niv && <span style={{ background:NIV_COULEUR_ENT[niv]||'rgba(255,255,255,0.3)', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:800 }}>{niv}</span>}
                  {classe.type_cours && <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.9)', borderRadius:20, padding:'2px 9px', fontSize:11 }}>{FORMAT[classe.type_cours]||classe.type_cours}</span>}
                  <span style={{
                    background: classe.statut==='actif' ? '#D1FAE5' : classe.statut==='clos' ? '#fee2e2' : '#FEF3C7',
                    color: classe.statut==='actif' ? '#065F46' : classe.statut==='clos' ? '#dc2626' : '#92400E',
                    borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700
                  }}>
                    {classe.statut === 'actif' ? 'Active' : classe.statut === 'clos' ? '🔒 Clôturée' : classe.statut}
                  </span>
                  <span style={{ color:'rgba(255,255,255,0.75)', fontSize:12 }}>· {benefs.length} bénéficiaire{benefs.length!==1?'s':''}</span>
                </div>
                {horaires.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:8, padding:'4px 12px', display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>📅 {h.jour}</span>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.85)', fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:36, height:36, cursor:'pointer', fontSize:20, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* ── Onglets ── */}
        <div style={{ display:'flex', borderBottom:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, padding:'0 24px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'13px 18px', border:'none', borderBottom: tab===t.id ? `2.5px solid ${couleurEnt}` : '2.5px solid transparent', background:'none', color: tab===t.id ? couleurEnt : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', transition:'color 0.15s' }}>
              <span>{t.icone}</span>{t.lib}
              {t.badge > 0 && (
                <span style={{ background:couleurEnt, color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700, marginLeft:2 }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Contenu ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>📋 Détails de la classe</div>
                {row('Nom',        classe.nom)}
                {row('Niveau',     niv)}
                {row('Format',     FORMAT[classe.type_cours] || classe.type_cours)}
                {row('Statut',     classe.statut === 'actif' ? '✅ Active' : classe.statut === 'clos' ? '🔒 Clôturée' : classe.statut)}
                {row('Capacité',   classe.capacite_max ? `${benefs.length} / ${classe.capacite_max} places` : null)}
              </div>
              <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>👨‍🏫 Encadrement & Planification</div>
                {row('Coach',        classe.coach_nom || '- Non assigné')}
                {row('Date début',   classe.date_debut ? new Date(classe.date_debut).toLocaleDateString('fr-FR') : null)}
                {row('Date fin',     classe.date_fin   ? new Date(classe.date_fin).toLocaleDateString('fr-FR')   : null)}
                {row('Type',         classe.type === 'elearning' ? '🎓 E-Learning BET' : '🏫 Groupe classique')}
              </div>
              {horaires.length > 0 && (
                <div style={{ gridColumn:'1/-1', background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>📅 Disponibilités - créneaux horaires</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:`${couleurEnt}10`, border:`1px solid ${couleurEnt}30`, borderRadius:10, padding:'8px 16px', display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:couleurEnt }}>{h.jour}</span>
                        <span style={{ fontSize:12, color:COULEURS.navy, fontWeight:600 }}>{h.debut} – {h.fin}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {niv && (
                <div style={{ gridColumn:'1/-1', background:`${NIV_COULEUR_ENT[niv]||couleurEnt}10`, border:`1px solid ${NIV_COULEUR_ENT[niv]||couleurEnt}30`, borderRadius:14, padding:'20px 24px', display:'flex', gap:20, alignItems:'center' }}>
                  <div style={{ width:64, height:64, borderRadius:14, background:NIV_COULEUR_ENT[niv]||couleurEnt, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:900, color:'#fff', flexShrink:0, boxShadow:`0 6px 20px ${NIV_COULEUR_ENT[niv]||couleurEnt}50` }}>{niv}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>
                      {{ A0:'Faux débutant', A1:'Débutant', A2:'Élémentaire', B1:'Intermédiaire', B2:'Intermédiaire supérieur', C1:'Avancé', C2:'Maîtrise' }[niv] || niv}
                    </div>
                    <div style={{ fontSize:13, color:COULEURS.gris600 }}>Niveau CECR de la classe - test de placement requis</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DISPONIBILITÉS ── */}
          {tab === 'dispos' && (
            <div style={{ maxWidth:860 }}>
              {horaires.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:48, marginBottom:14 }}>📅</div>
                  <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucun créneau configuré</div>
                  <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.6, maxWidth:400, margin:'0 auto' }}>
                    L'emploi du temps de cette classe n'a pas encore été défini. Contactez l'équipe BET pour plus d'informations.
                  </div>
                </div>
              ) : (
                <>
                  {/* Bandeau récap */}
                  <div style={{ background:`${couleurEnt}10`, border:`1px solid ${couleurEnt}25`, borderRadius:14, padding:'16px 22px', marginBottom:24, display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:couleurEnt, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📅</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>{horaires.length} créneau{horaires.length > 1 ? 'x' : ''} par semaine</div>
                      <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>
                        {horaires.map(h => h.jour).join(' · ')}
                      </div>
                    </div>
                  </div>

                  {/* Grille des créneaux */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:14, marginBottom:28 }}>
                    {horaires.map((h, i) => (
                      <div key={i} style={{ background:COULEURS.blanc, border:`1.5px solid ${couleurEnt}30`, borderRadius:14, overflow:'hidden', boxShadow:`0 2px 8px ${couleurEnt}10` }}>
                        <div style={{ background:`linear-gradient(135deg, ${couleurEnt}CC, ${couleurEnt})`, padding:'12px 18px' }}>
                          <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{h.jour}</div>
                        </div>
                        <div style={{ padding:'14px 18px' }}>
                          <div style={{ fontSize:22, fontWeight:800, color:couleurEnt, letterSpacing:'-0.5px' }}>{h.debut}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, margin:'2px 0 6px', fontWeight:600 }}>DÉBUT</div>
                          <div style={{ height:2, background:`${couleurEnt}20`, borderRadius:2, marginBottom:8 }} />
                          <div style={{ fontSize:22, fontWeight:800, color:COULEURS.navy, letterSpacing:'-0.5px' }}>{h.fin}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2, fontWeight:600 }}>FIN</div>
                          <div style={{ marginTop:10, background:`${couleurEnt}10`, borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
                            <span style={{ fontSize:12, fontWeight:700, color:couleurEnt }}>
                              {(() => {
                                const [hD, mD] = (h.debut||'00:00').split(':').map(Number);
                                const [hF, mF] = (h.fin||'00:00').split(':').map(Number);
                                const dur = (hF * 60 + mF) - (hD * 60 + mD);
                                if (dur <= 0) return '-';
                                const heures = Math.floor(dur / 60);
                                const mins   = dur % 60;
                                return heures > 0 ? `${heures}h${mins > 0 ? mins.toString().padStart(2,'0') : ''}` : `${mins}min`;
                              })()}
                            </span>
                            <span style={{ fontSize:11, color:COULEURS.gris600, marginLeft:4 }}>de cours</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Vue calendrier hebdo */}
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, fontWeight:700, color:COULEURS.navy }}>🗓 Vue hebdomadaire</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:0 }}>
                      {['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].map(jour => {
                        const creneau = horaires.find(h => h.jour === jour);
                        return (
                          <div key={jour} style={{ padding:'12px 10px', textAlign:'center', borderRight:'1px solid ' + COULEURS.gris100, background: creneau ? `${couleurEnt}08` : 'transparent' }}>
                            <div style={{ fontSize:11, fontWeight:700, color: creneau ? couleurEnt : COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{jour.slice(0,3)}</div>
                            {creneau ? (
                              <div style={{ background:couleurEnt, borderRadius:8, padding:'8px 6px' }}>
                                <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{creneau.debut}</div>
                                <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', margin:'2px 0' }}>↓</div>
                                <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{creneau.fin}</div>
                              </div>
                            ) : (
                              <div style={{ fontSize:18, color:COULEURS.gris200 }}>–</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BÉNÉFICIAIRES ── */}
          {tab === 'beneficiaires' && (
            <>
              <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                {[
                  { l:'Total', v:benefs.length, c:couleurEnt },
                  { l:'Actifs', v:benefs.filter(b=>b.statut==='actif').length, c:'#059669' },
                  { l:'Niveaux renseignés', v:benefs.filter(b=>b.niveau_cecr).length, c:'#7C3AED' },
                ].map(({l,v,c}) => (
                  <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'12px 20px', textAlign:'center', minWidth:120 }}>
                    <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>

              {benefs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>👥</div>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Aucun bénéficiaire dans cette classe</div>
                  <div style={{ fontSize:13 }}>Les bénéficiaires apparaîtront ici une fois assignés par l'équipe BET.</div>
                </div>
              ) : (
                <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 90px', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Bénéficiaire</span><span>Contact</span><span>Niveau</span><span>Statut</span><span></span>
                  </div>
                  {benefs.map((b, i) => {
                    const nom  = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
                    const init = nom.split(/\s+/).map(p=>p[0]||'').slice(0,2).join('').toUpperCase();
                    const niv  = b.niveau_cecr;
                    return (
                      <div key={b.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 90px', padding:'12px 20px', borderBottom: i < benefs.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:10, overflow:'hidden', background:`${couleurEnt}18`, border:`1.5px solid ${couleurEnt}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:couleurEnt, flexShrink:0 }}>
                            {b.avatar_url ? <img src={b.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} /> : init}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, color:COULEURS.navy }}>{nom}</div>
                            {b.telephone && <div style={{ fontSize:11, color:COULEURS.gris400 }}>{b.telephone}</div>}
                          </div>
                        </div>
                        <span style={{ color:COULEURS.gris600, fontSize:12 }}>{b.email || '-'}</span>
                        <span>
                          {niv
                            ? <span style={{ background:NIV_COULEUR_ENT[niv]||couleurEnt, color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700 }}>{niv}</span>
                            : <span style={{ color:COULEURS.gris400, fontSize:12 }}>-</span>}
                        </span>
                        <span style={{ background: b.statut==='suspendu' ? '#FEE2E2' : '#D1FAE5', color: b.statut==='suspendu' ? '#991B1B' : '#065F46', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600, display:'inline-block' }}>
                          {b.statut === 'suspendu' ? 'Suspendu' : 'Actif'}
                        </span>
                        <button onClick={() => onOuvrirBenef(b)}
                          style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${couleurEnt}`, background:`${couleurEnt}10`, color:couleurEnt, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          👁 Détail
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── PRÉSENCES ── */}
          {tab === 'presences' && (() => {
            if (presencesClasse === null) return (
              <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:28, opacity:0.5 }}>⏳</div>
                <div style={{ fontSize:13, marginTop:10 }}>Chargement des présences…</div>
              </div>
            );
            const STATUT_P = {
              present: { lib:'Présent',  bg:'#D1FAE5', txt:'#065F46' },
              absent:  { lib:'Absent',   bg:'#FEE2E2', txt:'#991B1B' },
              retard:  { lib:'Retard',   bg:'#FEF3C7', txt:'#92400E' },
              excuse:  { lib:'Excusé',   bg:'#EFF6FF', txt:'#1E40AF' },
            };
            const presencesFiltrees = presencesDateFiltre
              ? presencesClasse.filter(p => p.seance?.date && p.seance.date.slice(0, 7) === presencesDateFiltre)
              : presencesClasse;
            const nbPP   = Math.max(1, Math.ceil(presencesFiltrees.length / PRESENCES_PAR_PAGE));
            const pCour  = Math.min(presencesPage, nbPP);
            const presPage = presencesFiltrees.slice((pCour - 1) * PRESENCES_PAR_PAGE, pCour * PRESENCES_PAR_PAGE);
            const nbP    = presencesClasse.filter(p=>p.statut==='present').length;
            const nbA    = presencesClasse.filter(p=>p.statut==='absent').length;
            const tauxP  = presencesClasse.length > 0 ? Math.round((nbP / presencesClasse.length) * 100) : null;
            const apprenantsDis = [...new Set(presencesClasse.map(p=>p.inscription?.apprenant_id||p.inscription_id).filter(Boolean))].length;
            return (
              <div>
                <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    {[
                      { l:'Entrées', v:presencesClasse.length, c:couleurEnt },
                      { l:'Présences', v:nbP, c:'#16A34A' },
                      { l:'Absences', v:nbA, c:'#DC2626' },
                      apprenantsDis > 0 && { l:'Apprenants', v:apprenantsDis, c:'#7C3AED' },
                      tauxP !== null && { l:'Taux', v:`${tauxP}%`, c:tauxP>=75?'#059669':'#DC2626' },
                    ].filter(Boolean).map(({ l, v, c }) => (
                      <div key={l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'8px 14px', textAlign:'center', minWidth:90 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                        <div style={{ fontSize:9, color:COULEURS.gris500, marginTop:2, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const moisDispo = [...new Set(presencesClasse.map(p => p.seance?.date?.slice(0,7)).filter(Boolean))].sort().reverse();
                    const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
                    return moisDispo.length > 0 ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, color:COULEURS.gris600 }}>Mois :</span>
                        <select value={presencesDateFiltre} onChange={e => { setPresencesDateFiltre(e.target.value); setPresencesPage(1); }}
                          style={{ border:`1px solid ${COULEURS.gris200}`, borderRadius:8, padding:'6px 10px', fontSize:13, color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', background:COULEURS.blanc, cursor:'pointer' }}>
                          <option value="">Tous les mois</option>
                          {moisDispo.map(m => {
                            const [y, mo] = m.split('-');
                            return <option key={m} value={m}>{MOIS_FR[parseInt(mo,10)]} {y}</option>;
                          })}
                        </select>
                      </div>
                    ) : null;
                  })()}
                </div>
                {presencesClasse.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'52px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:44, marginBottom:12 }}>📋</div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Aucune présence enregistrée</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>
                      Les feuilles de présence apparaîtront dès que les sessions de cours démarreront.
                    </div>
                  </div>
                ) : presencesFiltrees.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'36px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>Aucune présence ce mois-là</div>
                  </div>
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, marginBottom:14 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1.2fr 100px 100px 1fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Apprenant</span><span>Date séance</span><span>Heure</span><span>Statut</span><span>Observation</span>
                      </div>
                      {presPage.map((p, i) => {
                        const s   = p.seance || {};
                        const nom = p.inscription?.nom_complet || '-';
                        const niv2 = p.inscription?.niveau_cecr;
                        const st  = STATUT_P[p.statut] || { lib:p.statut, bg:COULEURS.gris100, txt:COULEURS.gris600 };
                        return (
                          <div key={p.id || i} style={{ display:'grid', gridTemplateColumns:'1.8fr 1.2fr 100px 100px 1fr', padding:'11px 20px', borderBottom: i < presPage.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:28, height:28, borderRadius:8, background:`${couleurEnt}18`, border:`1px solid ${couleurEnt}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:couleurEnt, flexShrink:0 }}>
                                {nom.split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:600, color:COULEURS.navy }}>{nom}</div>
                                {niv2 && <span style={{ fontSize:10, background:couleurEnt, color:'#fff', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>{niv2}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize:12, color:COULEURS.gris600 }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</span>
                            <span style={{ fontSize:12, color:COULEURS.gris600 }}>{s.heure_debut || '-'}</span>
                            <span style={{ background:st.bg, color:st.txt, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700, display:'inline-block' }}>{st.lib}</span>
                            <span style={{ fontSize:12, color:COULEURS.gris500, fontStyle:p.observation?'normal':'italic' }}>{p.observation || '-'}</span>
                          </div>
                        );
                      })}
                    </div>
                    {nbPP > 1 && (
                      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8 }}>
                        <button onClick={() => setPresencesPage(p => Math.max(1, p-1))} disabled={pCour===1}
                          style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:pCour===1?COULEURS.gris50:COULEURS.blanc, color:pCour===1?COULEURS.gris400:COULEURS.navy, cursor:pCour===1?'default':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          ← Préc.
                        </button>
                        <span style={{ fontSize:13, color:COULEURS.gris600 }}>Page {pCour} / {nbPP}</span>
                        <button onClick={() => setPresencesPage(p => Math.min(nbPP, p+1))} disabled={pCour===nbPP}
                          style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:pCour===nbPP?COULEURS.gris50:COULEURS.blanc, color:pCour===nbPP?COULEURS.gris400:COULEURS.navy, cursor:pCour===nbPP?'default':'pointer', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          Suiv. →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── SESSIONS ── */}
          {tab === 'sessions' && (
            <OngletSessionsClasse classeId={classe.id} coachNom={classe.coach_nom} couleur={couleurEnt} />
          )}

          {/* ── ACCÈS ── */}
          {tab === 'acces' && (
            <div style={{ maxWidth:900 }}>
              <div style={{ background:`${couleurEnt}08`, border:`1px solid ${couleurEnt}25`, borderRadius:14, padding:'14px 20px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start', fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>
                <span style={{ fontSize:18, flexShrink:0 }}>🔐</span>
                <span>Gérez l'accès à la plateforme pour chaque bénéficiaire. Bloquer un apprenant l'empêche immédiatement de se connecter.</span>
              </div>
              {benefs.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:13 }}>Aucun bénéficiaire dans cette classe.</div>
              ) : (
                <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 160px', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Bénéficiaire</span><span>Email</span><span>Statut</span><span>Action</span>
                  </div>
                  {benefs.map((b, i) => {
                    const nom     = b.nom_complet || `${b.prenom||''} ${b.nom||''}`.trim() || '-';
                    const accesEt = accesStatuts[b.id];
                    const bloque  = accesEt !== undefined ? accesEt.bloque : (b.statut === 'suspendu');
                    const saving  = accesEt?.saving || false;
                    return (
                      <div key={b.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 160px', padding:'12px 20px', borderBottom: i < benefs.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', alignItems:'center', fontSize:13 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:30, height:30, borderRadius:8, background:`${couleurEnt}18`, border:`1px solid ${couleurEnt}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:couleurEnt, flexShrink:0 }}>
                            {nom.split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase()}
                          </div>
                          <span style={{ fontWeight:600, color:COULEURS.navy }}>{nom}</span>
                        </div>
                        <span style={{ color:COULEURS.gris600, fontSize:12 }}>{b.email || '-'}</span>
                        <span style={{ background: bloque ? '#FEE2E2' : '#D1FAE5', color: bloque ? '#991B1B' : '#065F46', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, display:'inline-block' }}>
                          {bloque ? '⛔ Bloqué' : '✅ Actif'}
                        </span>
                        <button
                          onClick={() => toggleAccesBloque(b.id, bloque)}
                          disabled={saving}
                          style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${bloque ? '#059669' : '#DC2626'}`, background: bloque ? '#F0FDF4' : '#FEF2F2', color: bloque ? '#059669' : '#DC2626', fontSize:12, fontWeight:700, cursor:saving?'wait':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', opacity:saving?0.6:1 }}>
                          {saving ? '…' : bloque ? '🔓 Débloquer' : '🔒 Bloquer'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function OngletBeneficiaires({ apprenants, groupes, classes, couleurEnt }) {
  const { couleurTheme } = useTheme();
  const [modalClasse, setModalClasse] = useState(null);
  const [modalBenef,  setModalBenef]  = useState(null);
  const couleur = couleurEnt || couleurTheme;

  function handleStatutBenef(benefId, newStatut) {
    setModalClasse(prev => prev ? ({
      ...prev,
      apprenants: prev.apprenants.map(a => a.id === benefId ? { ...a, statut: newStatut } : a),
    }) : prev);
    setModalBenef(prev => prev ? ({
      ...prev,
      benef: prev.benef.id === benefId ? { ...prev.benef, statut: newStatut } : prev.benef,
    }) : prev);
  }

  const toutesClasses = [
    ...classes.map(c => ({
      id: c.id, nom: c.nom, niveau: c.niveau, coach_nom: c.coach_nom,
      date_debut: c.date_debut, date_fin: c.date_fin, type_cours: c.type_cours,
      statut: c.statut, capacite_max: c.capacite_max, type: 'elearning',
      horaire: c.horaire || [],
      apprenants: c.apprenants || [],
    })),
    ...groupes.map(g => ({
      id: g.id, nom: g.nom, niveau: g.niveau, coach_nom: g.coach_nom,
      date_debut: g.date_debut, date_fin: g.date_fin, type_cours: null,
      statut: g.statut || 'actif', capacite_max: null, type: 'groupe',
      horaire: g.horaire || [],
      apprenants: apprenants.filter(a => a._source === 'ancien' && a.groupe_id === g.id),
    })),
  ];

  const totalBenef = toutesClasses.reduce((s, c) => s + c.apprenants.length, 0);

  return (
    <>
      {/* En-tête */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>{toutesClasses.length} classe{toutesClasses.length!==1?'s':''}</div>
          <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:2 }}>{totalBenef} bénéficiaire{totalBenef!==1?'s':''} au total · Cliquez sur une classe pour le détail</div>
        </div>
      </div>

      {toutesClasses.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:16, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:12 }}>🏫</div>
          <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Aucune classe assignée</div>
          <div style={{ fontSize:13 }}>Vos bénéficiaires apparaîtront ici une fois assignés à une classe par l'équipe BET.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:20 }}>
          {toutesClasses.map(c => (
            <div key={c.id}
              onClick={() => setModalClasse(c)}
              style={{ background:COULEURS.blanc, borderRadius:16, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow 0.2s, transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.14)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e  => { e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform=''; }}
            >
              <div style={{ background:`linear-gradient(135deg, ${couleur}CC, ${couleur})`, padding:'18px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ fontSize:15, fontWeight:800, color:'#fff', lineHeight:1.3, flex:1, marginRight:8 }}>{c.nom}</div>
                  {c.niveau && <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:800, flexShrink:0 }}>{c.niveau}</span>}
                </div>
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.9)', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:600 }}>
                    {c.type === 'elearning' ? '🎓 E-Learning' : '🏫 Groupe'}
                  </span>
                  {c.type_cours && <span style={{ background:'rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.9)', borderRadius:20, padding:'2px 9px', fontSize:11 }}>
                    {{ en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' }[c.type_cours]}
                  </span>}
                </div>
                {Array.isArray(c.horaire) && c.horaire.length > 0 && (
                  <div style={{ marginTop:8, fontSize:10, color:'rgba(255,255,255,0.8)' }}>
                    📅 {c.horaire.slice(0,2).map(h=>`${h.jour} ${h.debut}–${h.fin}`).join(' · ')}
                    {c.horaire.length > 2 && ` +${c.horaire.length-2}`}
                  </div>
                )}
              </div>
              <div style={{ padding:'16px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:`${couleur}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:900, color:couleur }}>{c.apprenants.length}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{c.apprenants.length} bénéficiaire{c.apprenants.length!==1?'s':''}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400 }}>{c.capacite_max ? `/ ${c.capacite_max} places` : 'inscrits'}</div>
                    </div>
                  </div>
                  <span style={{ background: c.statut==='actif' ? '#D1FAE5' : '#FEF3C7', color: c.statut==='actif' ? '#065F46' : '#92400E', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                    {c.statut === 'actif' ? 'Active' : c.statut}
                  </span>
                </div>
                {c.coach_nom && <div style={{ fontSize:12, color:COULEURS.gris600, marginBottom:4 }}>👨‍🏫 {c.coach_nom}</div>}
                {c.date_debut && <div style={{ fontSize:12, color:COULEURS.gris600 }}>📅 {new Date(c.date_debut).toLocaleDateString('fr-FR')}</div>}
                <div style={{ marginTop:14, padding:'8px 0', borderTop:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:couleur }}>Voir le détail</span>
                  <span style={{ color:couleur, fontSize:14 }}>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalClasse && (
        <ModalDetailClasse
          classe={modalClasse}
          couleurEnt={couleur}
          onFermer={() => setModalClasse(null)}
          onOuvrirBenef={b => setModalBenef({ benef: b, classe: modalClasse })}
        />
      )}

      {modalBenef && (
        <ModalDetailBeneficiaire
          benef={modalBenef.benef}
          classe={modalBenef.classe}
          couleurEnt={couleur}
          onFermer={() => setModalBenef(null)}
          onStatutChange={handleStatutBenef}
        />
      )}
    </>
  );
}

// ── onglet 3 : Inscription des bénéficiaires ─────────────────────────────────

// Configuration par type de profil
export const PROFILS_BENEFICIAIRE = {
  adulte: {
    icone:       '👔',
    lib:         'Adulte / Employé',
    desc:        'Collaborateur, manager, stagiaire 18 ans et +',
    couleur:     '#0891B2',
    bg:          '#EFF6FF',
    ageMin:      18, ageMax: 65,
    avecParent:  false,
    csvColonnes: 'nom;prenom;email;telephone;poste;departement;niveau_cecr_estime',
    csvExemple:  'Koné;Aminata;aminata.kone@tlgpharma.com;+225 07 00 00 00;Responsable RH;Ressources Humaines;A1',
    champsSupp:  ['poste','departement'],
  },
  adolescent: {
    icone:       '🧑',
    lib:         'Adolescent',
    desc:        'Lycéen, étudiant - 13 à 17 ans',
    couleur:     '#8B5CF6',
    bg:          '#F5F3FF',
    ageMin:      13, ageMax: 17,
    avecParent:  true,
    parentOblig: false, // contact parent optionnel
    csvColonnes: 'nom;prenom;date_naissance;etablissement;niveau_cecr_estime;email;prenom_parent;nom_parent;email_parent;telephone_parent',
    csvExemple:  'Traoré;Moussa;2009-07-24;Lycée Sainte-Marie;A2;moussa.traore@email.com;Fatou;Traoré;parent@email.com;+225 05 00 00 00',
    champsSupp:  ['etablissement'],
  },
  enfant: {
    icone:       '🧒',
    lib:         'Enfant',
    desc:        'Élève - 6 à 12 ans, contact parent obligatoire',
    couleur:     '#F97316',
    bg:          '#FFF7ED',
    ageMin:      6, ageMax: 12,
    avecParent:  true,
    parentOblig: true,
    csvColonnes: 'nom;prenom;date_naissance;classe;niveau_cecr_estime;prenom_parent;nom_parent;email_parent;telephone_parent',
    csvExemple:  'Koné;Aminata;2015-03-12;CM1;A1;Djeneba;Koné;djeneba.kone@tlgpharma.com;+225 07 00 00 00',
    champsSupp:  ['classe'],
  },
};

const STATUT_INS = {
  recu:               { lib:'En attente',           bg:'#EFF6FF', txt:'#1D4ED8', ic:'📥' },
  verifie:            { lib:'Vérifié',               bg:'#F0FDF4', txt:'#15803D', ic:'✅' },
  transmis_placement: { lib:'Test de niveau',        bg:'#FEF3C7', txt:'#B45309', ic:'🎯' },
  teste:              { lib:'Test effectué',          bg:'#EDE9FE', txt:'#5B21B6', ic:'📝' },
  assigne:            { lib:'Classe assignée',        bg:'#E0F2FE', txt:'#0369A1', ic:'🏫' },
  actif:              { lib:'Actif',                  bg:'#D1FAE5', txt:'#065F46', ic:'🟢' },
};

const INS_PAR_PAGE = 6;

function OngletInscriptions({ entrepriseId = null, entrepriseNom = '', onInscriptionAjoutee }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [profil, setProfil]   = useState(null);  // profil du modal ouvert
  const [modalOuvert, setModalOuvert] = useState(false);
  const [modalChoixProfil, setModalChoixProfil] = useState(false); // modal sélection profil
  const [pageIns, setPageIns] = useState(1);
  const [filtreNom, setFiltreNom]   = useState('');
  const [filtreMois, setFiltreMois] = useState('');
  const [mode, setMode]       = useState('manuel');
  const [soumis, setSoumis]   = useState(false);
  const [nbCsvLignes, setNbCsvLignes] = useState(null);
  const [csvFichier, setCsvFichier]   = useState(null);
  const [csvBeneficiaires, setCsvBeneficiaires] = useState([]);
  const [csvErreur, setCsvErreur]     = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [erreurSoumission, setErreurSoumission] = useState(null);

  // ── Liste des inscriptions soumises ──────────────────────────────────────
  const [mesInscriptions, setMesInscriptions] = useState([]);
  const [loadingIns, setLoadingIns]           = useState(true);

  useEffect(() => {
    if (!entrepriseId) { setLoadingIns(false); return; }
    fetch(`${API_URL}/api/inscriptions-elearning?entreprise_id=${entrepriseId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setMesInscriptions(d.inscriptions || []))
      .catch(() => {})
      .finally(() => setLoadingIns(false));
  }, [entrepriseId]);

  function ouvrirModal(key) {
    setProfil(key);
    setModalOuvert(true);
    setMode('manuel');
    setSoumis(false);
    setCsvFichier(null);
    setNbCsvLignes(null);
    setCsvErreur(null);
    setCsvBeneficiaires([]);
    setForm({ prenom:'',nom:'',dateNaissance:'',email:'',telephone:'',poste:'',departement:'',etablissement:'',classe:'',niveauCecr:'A1',prenomParent:'',nomParent:'',emailParent:'',telParent:'' });
  }

  function fermerModal() {
    setModalOuvert(false);
    setProfil(null);
    setSoumis(false);
  }

  const [form, setForm] = useState({
    prenom:'', nom:'', dateNaissance:'', email:'', telephone:'',
    poste:'', departement:'', etablissement:'', classe:'',
    niveauCecr:'A1',
    prenomParent:'', nomParent:'', emailParent:'', telParent:'',
  });

  const inp = {
    width:'100%', padding:'10px 14px', borderRadius:8,
    border:`1px solid ${COULEURS.gris200}`, fontSize:13,
    fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy,
    outline:'none', boxSizing:'border-box',
  };
  const lbl = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 };
  const grp = (extra={}) => ({ marginBottom:16, ...extra });

  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  function telechargerModele() {
    const cfg = PROFILS_BENEFICIAIRE[profil];
    const colonnes = cfg.csvColonnes.split(';');
    const exemple  = cfg.csvExemple.split(';');
    const ws = XLSX.utils.aoa_to_sheet([colonnes, exemple]);
    // largeur auto
    ws['!cols'] = colonnes.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bénéficiaires');
    XLSX.writeFile(wb, `modele_import_${profil}.xlsx`);
  }

  function normaliserLigne(obj) {
    const k = (s) => (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[̀-͌]/g, '')
      .replace(/[\s\-\/]/g, '_');
    const norm = {};
    Object.entries(obj).forEach(([key, val]) => { norm[k(key)] = val?.toString().trim() || ''; });

    const emailParent    = norm.email_parent    || norm.emailparent    || norm.email_tuteur    || norm.courriel_parent || '';
    const telParent      = norm.telephone_parent|| norm.tel_parent     || norm.telparent       || norm.telephone_tuteur|| '';
    const emailEnfant    = norm.email           || norm.email_enfant   || norm.email_apprenant || '';
    const telEnfant      = norm.telephone       || norm.tel            || norm.telephone_enfant || '';

    return {
      nom_complet:      norm.nom_complet || `${norm.prenom || ''} ${norm.nom || ''}`.trim(),
      prenom:           norm.prenom || '',
      nom:              norm.nom || '',
      // Pour enfant/ado : si pas d'email direct, on prend celui du parent
      email:            emailEnfant || emailParent,
      telephone:        telEnfant   || telParent,
      poste:            norm.poste       || norm.fonction  || '',
      departement:      norm.departement || norm.service   || '',
      langue:           norm.langue      || norm.langue_apprise || norm.langue_souhaitee || 'Anglais',
      niveau:           norm.niveau_cecr || norm.niveau_cecr_estime || norm.niveau || 'A1',
      niveau_cecr_estime: norm.niveau_cecr || norm.niveau_cecr_estime || norm.niveau || 'A1',
      date_naissance:   norm.date_naissance || norm.datenaissance || norm.naissance || '',
      etablissement:    norm.etablissement  || norm.ecole || norm.lycee || norm.college || '',
      classe:           norm.classe || norm.classe_scolaire || norm.niveau_classe || '',
      prenom_parent:    norm.prenom_parent  || norm.prenomparent  || norm.prenom_tuteur || '',
      nom_parent:       norm.nom_parent     || norm.nomparent     || norm.nom_tuteur    || '',
      email_parent:     emailParent,
      telephone_parent: telParent,
      // Le profil (adulte/adolescent/enfant) choisi avant l'import - sans ça le backend le
      // redéduit uniquement à partir de la présence d'un contact parent, ce qui ne peut jamais
      // produire "adolescent" (seulement "enfant" ou "adulte").
      profil_type:      profil,
    };
  }

  function lireFichierImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFichier(file.name);
    setCsvErreur(null);
    setCsvBeneficiaires([]);
    setNbCsvLignes(null);

    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    const traiterRows = (rows) => {
      const beneficiaires = rows.map(normaliserLigne).filter(b => b.nom_complet.length > 1);
      if (beneficiaires.length === 0) {
        setCsvErreur('Aucun bénéficiaire valide trouvé. Vérifiez les colonnes (nom / prenom requis).');
        setCsvFichier(null);
        return;
      }
      setCsvBeneficiaires(beneficiaires);
      setNbCsvLignes(beneficiaires.length);
    };

    if (ext === 'json') {
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          const arr = Array.isArray(parsed) ? parsed : parsed.beneficiaires || parsed.data || [];
          traiterRows(arr);
        } catch {
          setCsvErreur('Fichier JSON invalide. Attendu : tableau d\'objets ou { beneficiaires: [...] }');
          setCsvFichier(null);
        }
      };
      reader.readAsText(file, 'UTF-8');

    } else if (['xlsx', 'xls', 'ods', 'xlsm', 'xlsb'].includes(ext)) {
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
          // Chercher le 1er onglet non vide parmi les feuilles
          let ws = null;
          for (const name of wb.SheetNames) {
            const candidate = wb.Sheets[name];
            const preview = XLSX.utils.sheet_to_json(candidate, { header: 1, defval: '' });
            if (preview.length > 1) { ws = candidate; break; }
          }
          if (!ws) throw new Error('Feuille vide');
          // Détecter la ligne d'en-tête : première ligne contenant un champ connu
          const CHAMPS_CONNUS = ['nom','prenom','nom_complet','email','telephone','email_parent','date_naissance','niveau_cecr_estime','niveau'];
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          let headerIdx = 0;
          for (let i = 0; i < Math.min(6, rawRows.length); i++) {
            const cells = rawRows[i].map(c => (c||'').toString().toLowerCase().trim().replace(/\s+/g,'_'));
            if (CHAMPS_CONNUS.some(f => cells.includes(f))) { headerIdx = i; break; }
          }
          const rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerIdx });
          traiterRows(rows);
        } catch {
          setCsvErreur('Impossible de lire ce fichier. Assurez-vous qu\'il n\'est pas protégé ou corrompu.');
          setCsvFichier(null);
        }
      };
      reader.readAsArrayBuffer(file);

    } else {
      // CSV / TXT / TSV
      reader.onload = (ev) => {
        try {
          const texte = ev.target.result;
          const sep = texte.includes(';') ? ';' : texte.includes('\t') ? '\t' : ',';
          const lignes = texte.split('\n').map(l => l.trim().replace(/\r$/, '')).filter(Boolean);
          if (lignes.length < 2) {
            setCsvErreur('Fichier vide ou sans données après l\'en-tête.');
            setCsvFichier(null);
            return;
          }
          const headers = lignes[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim());
          const rows = lignes.slice(1).map(line => {
            const vals = line.split(sep).map(v => v.replace(/^["']|["']$/g, '').trim());
            const obj = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
          });
          traiterRows(rows);
        } catch {
          setCsvErreur('Impossible de lire ce fichier texte.');
          setCsvFichier(null);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
    // reset input pour permettre de re-sélectionner le même fichier
    e.target.value = '';
  }

  // ── Soumission réelle vers API ────────────────────────────────────────────
  async function soumettre(estCsv = false) {
    setSubmitting(true);
    setErreurSoumission(null);
    try {
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };

      if (estCsv) {
        // Import groupé
        const r = await fetch(`${API_URL}/api/inscriptions-elearning/bulk`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            beneficiaires:  csvBeneficiaires,
            entreprise_id:  entrepriseId  || null,
            entreprise_nom: entrepriseNom || null,
            source:         'entreprise_portail',
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
        // Mise à jour immédiate de la liste
        setMesInscriptions(prev => [...(d.inscriptions || []), ...prev]);
      } else {
        // Inscription unique
        const nomComplet = `${form.prenom} ${form.nom}`.trim();
        const r = await fetch(`${API_URL}/api/inscriptions-elearning`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entreprise_id:    entrepriseId  || null,
            entreprise_nom:   entrepriseNom || null,
            nom_complet:      nomComplet,
            email:            form.email || form.emailParent || null,
            telephone:        form.telephone || form.telParent || null,
            poste:            form.poste       || null,
            departement:      form.departement || null,
            langue_souhaitee: 'Anglais',
            niveau_declare:   form.niveauCecr  || null,
            source:           'entreprise_portail',
            // Champs enfant/ado - déjà supportés côté backend mais jamais transmis jusqu'ici,
            // ce qui faisait disparaître classe, niveau CECR et contact parent à l'inscription unique.
            date_naissance:     form.dateNaissance || null,
            classe:             form.classe        || null,
            niveau_cecr_estime: form.niveauCecr    || null,
            prenom_parent:      form.prenomParent  || null,
            nom_parent:         form.nomParent     || null,
            email_parent:       form.emailParent   || null,
            telephone_parent:   form.telParent     || null,
            profil_type:        profil,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
        // Mise à jour immédiate de la liste (optimistic)
        if (d.inscription) setMesInscriptions(prev => [d.inscription, ...prev]);
      }

      // Notifier les agents Onboarding
      fetch(`${API_URL}/api/notifications/to-role`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role:    'admin_onboarding',
          type:    'info',
          titre:   estCsv
            ? `Nouvelles inscriptions - ${entrepriseNom || 'Entreprise'}`
            : `Nouvelle inscription - ${form.prenom} ${form.nom}`,
          message: estCsv
            ? `${csvBeneficiaires.length} bénéficiaire(s) soumis par ${entrepriseNom || 'une entreprise'} via portail.`
            : `${form.prenom} ${form.nom} (${entrepriseNom || 'Entreprise'}) a soumis une demande d'inscription.`,
          meta: { entreprise_id: entrepriseId, entreprise_nom: entrepriseNom },
        }),
      }).catch(() => {});

      setSoumis(true);
      if (onInscriptionAjoutee) onInscriptionAjoutee();
    } catch (err) {
      setErreurSoumission(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (soumis) {
    const cfg = PROFILS_BENEFICIAIRE[profil];
    const nomComplet = `${form.prenom} ${form.nom}`.trim() || `${nbCsvLignes} bénéficiaires`;
    const emailContact = profil === 'adulte' ? form.email : form.emailParent;
    return (
      <div style={{ maxWidth:680 }}>
        <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:14, padding:28, marginBottom:28 }}>
          <div style={{ fontSize:28, marginBottom:10 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#065F46', marginBottom:6 }}>Demande envoyée à l'équipe BET !</div>
          <div style={{ fontSize:13, color:'#065F46', marginBottom:4 }}>
            Dossier de <strong>{nomComplet}</strong> transmis ({cfg.icone} {cfg.lib}).
          </div>
          {emailContact && <div style={{ fontSize:13, color:'#047857', marginBottom:16 }}>Confirmation envoyée à <strong>{emailContact}</strong>.</div>}
          <button onClick={() => { setSoumis(false); setProfil(null); setForm({ prenom:'',nom:'',dateNaissance:'',email:'',telephone:'',poste:'',departement:'',etablissement:'',classe:'',niveauCecr:'A1',prenomParent:'',nomParent:'',emailParent:'',telParent:'' }); setCsvFichier(null); setNbCsvLignes(null); }}
            style={{ background:couleurTheme, color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            + Inscrire un autre bénéficiaire
          </button>
        </div>
        <div style={{ background:COULEURS.blanc, borderRadius:14, padding:24, border:`1px solid ${COULEURS.gris200}` }}>
          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16 }}>📋 Prochaines étapes BET</div>
          <WorkflowStepper etapeActuelle={2} />
          <div style={{ marginTop:16, padding:'10px 14px', background:'#EFF6FF', borderRadius:8, fontSize:12, color:'#1D4ED8' }}>
            ⏱️ Comptes créés sous <strong>24h ouvrées</strong>. Notification dès l'activation complète.
          </div>
        </div>
      </div>
    );
  }

  const cfg = profil ? PROFILS_BENEFICIAIRE[profil] : null;

  return (
    <div style={{ width:'100%' }}>

      {/* ── Dossiers en cours ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:800, color:COULEURS.navy }}>
            📋 Vos dossiers d'inscription ({mesInscriptions.length})
          </div>
          <button
            onClick={() => setModalChoixProfil(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:20, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:`0 2px 8px ${couleurTheme}40` }}
          >
            ＋ Inscrire
          </button>
        </div>
        {loadingIns ? (
          <div style={{ color:COULEURS.gris400, fontSize:13 }}>Chargement…</div>
        ) : (() => {
          const moisDispo = [...new Set(mesInscriptions.map(i => i.created_at?.slice(0,7)).filter(Boolean))].sort().reverse();
          const MOIS_FR = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
          const inscFiltrees = mesInscriptions.filter(i => {
            const nomOk  = !filtreNom  || (i.nom_complet || '').toLowerCase().includes(filtreNom.toLowerCase());
            const moisOk = !filtreMois || (i.created_at || '').slice(0,7) === filtreMois;
            return nomOk && moisOk;
          });
          const totalPages = Math.ceil(inscFiltrees.length / INS_PAR_PAGE);
          const pageCourante = Math.min(pageIns, totalPages || 1);
          return (
            <>
              {/* Barre de filtres */}
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <input
                  type="text"
                  placeholder="🔍 Rechercher par nom…"
                  value={filtreNom}
                  onChange={e => { setFiltreNom(e.target.value); setPageIns(1); }}
                  style={{ flex:1, padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, outline:'none' }}
                />
                {moisDispo.length > 0 && (
                  <select value={filtreMois} onChange={e => { setFiltreMois(e.target.value); setPageIns(1); }}
                    style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', color:COULEURS.navy, background:COULEURS.blanc, cursor:'pointer' }}>
                    <option value="">Tous les mois</option>
                    {moisDispo.map(m => {
                      const [annee, mNum] = m.split('-');
                      return <option key={m} value={m}>{MOIS_FR[parseInt(mNum, 10)]} {annee}</option>;
                    })}
                  </select>
                )}
              </div>

              {inscFiltrees.length === 0 ? (
                <div style={{ color:COULEURS.gris400, fontSize:13, padding:'12px 0' }}>Aucun dossier ne correspond aux filtres.</div>
              ) : (
                <>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {inscFiltrees.slice((pageCourante - 1) * INS_PAR_PAGE, pageCourante * INS_PAR_PAGE).map(ins => {
                      const s = STATUT_INS[ins.statut] || STATUT_INS.recu;
                      return (
                        <div key={ins.id} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderLeft:`4px solid ${s.txt}`, borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{ins.nom_complet}</div>
                            <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:2 }}>
                              {ins.poste || ins.departement ? `${ins.poste || ''}${ins.poste && ins.departement ? ' · ' : ''}${ins.departement || ''}` : 'Aucun poste renseigné'}
                              {' · '}Soumis le {new Date(ins.created_at).toLocaleDateString('fr-FR')}
                            </div>
                          </div>
                          <span style={{ background:s.bg, color:s.txt, padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                            {s.ic} {s.lib}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {inscFiltrees.length > INS_PAR_PAGE && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12 }}>
                      <span style={{ fontSize:12, color:COULEURS.gris600 }}>
                        Page {pageCourante} / {totalPages} ({inscFiltrees.length} résultat{inscFiltrees.length > 1 ? 's' : ''})
                      </span>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => setPageIns(p => Math.max(1, p - 1))} disabled={pageCourante === 1}
                          style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontSize:12, cursor:pageCourante === 1 ? 'not-allowed' : 'pointer', opacity:pageCourante === 1 ? 0.4 : 1 }}>
                          ← Préc.
                        </button>
                        <button onClick={() => setPageIns(p => Math.min(totalPages, p + 1))} disabled={pageCourante >= totalPages}
                          style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.navy, fontSize:12, cursor:pageCourante >= totalPages ? 'not-allowed' : 'pointer', opacity:pageCourante >= totalPages ? 0.4 : 1 }}>
                          Suiv. →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          );
        })()}
        <hr style={{ border:'none', borderTop:`1px solid ${COULEURS.gris200}`, margin:'20px 0' }} />
      </div>

      {/* ── Modal choix du profil ── */}
      {modalChoixProfil && (
        <>
          <div onClick={() => setModalChoixProfil(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(96vw,600px)', background:'#fff', borderRadius:20, zIndex:1001, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
            <div style={{ padding:'24px 28px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:COULEURS.navy }}>Qui souhaitez-vous inscrire ?</div>
                <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:2 }}>Cliquez sur un profil pour ouvrir le formulaire d'inscription.</div>
              </div>
              <button onClick={() => setModalChoixProfil(false)}
                style={{ width:32, height:32, borderRadius:'50%', border:'none', background:COULEURS.gris100, color:COULEURS.gris600, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                ×
              </button>
            </div>
            <div style={{ padding:'24px 28px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 }}>
              {Object.entries(PROFILS_BENEFICIAIRE).map(([key, c]) => (
                <button key={key} onClick={() => { setModalChoixProfil(false); ouvrirModal(key); }}
                  style={{ background:c.bg, border:`2px solid ${c.couleur}40`, borderRadius:16, padding:'20px 16px', cursor:'pointer', textAlign:'left', transition:'all 0.15s', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = c.couleur; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 18px ${c.couleur}25`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = `${c.couleur}40`; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ fontSize:36, marginBottom:8 }}>{c.icone}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy, marginBottom:4 }}>{c.lib}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris600, lineHeight:1.5 }}>{c.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ margin:'0 28px 20px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'10px 16px', fontSize:12, color:'#1E40AF' }}>
              ℹ️ Le programme BET accepte des bénéficiaires de <strong>6 à 65 ans</strong>. Les groupes sont constitués par tranche d'âge homogène.
            </div>
          </div>
        </>
      )}

      {/* ── Modal formulaire ── */}
      {modalOuvert && cfg && (
        <>
          {/* Overlay */}
          <div onClick={fermerModal} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000 }} />

          {/* Fenêtre modale */}
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(96vw,640px)', maxHeight:'90vh', overflowY:'auto', background:'#fff', borderRadius:20, zIndex:1001, boxShadow:'0 24px 64px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>

            {/* En-tête modal */}
            <div style={{ background:`linear-gradient(135deg, ${cfg.couleur}15, ${cfg.bg})`, padding:'20px 28px', borderRadius:'20px 20px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${cfg.couleur}20` }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:32 }}>{cfg.icone}</span>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>Inscription - {cfg.lib}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600 }}>{cfg.desc} · {cfg.ageMin}–{cfg.ageMax} ans</div>
                </div>
              </div>
              <button onClick={fermerModal}
                style={{ width:32, height:32, borderRadius:'50%', border:'none', background:COULEURS.gris100, color:COULEURS.gris600, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                ×
              </button>
            </div>

            {/* Corps modal */}
            <div style={{ padding:'24px 28px' }}>

              {/* Confirmation soumission */}
              {soumis ? (
                <div>
                  <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:12, padding:24, marginBottom:20 }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#065F46', marginBottom:4 }}>Demande envoyée à l'équipe BET !</div>
                    <div style={{ fontSize:13, color:'#047857', marginBottom:12 }}>
                      Dossier de <strong>{form.prenom} {form.nom}</strong> transmis.
                      {(profil === 'adulte' ? form.email : form.emailParent) && (
                        <> Confirmation envoyée à <strong>{profil === 'adulte' ? form.email : form.emailParent}</strong>.</>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:'#065F46' }}>⏱️ Comptes activés sous <strong>24h ouvrées</strong>.</div>
                  </div>
                  <WorkflowStepper etapeActuelle={2} />
                  <div style={{ display:'flex', gap:10, marginTop:20 }}>
                    <button onClick={() => { setSoumis(false); setForm({ prenom:'',nom:'',dateNaissance:'',email:'',telephone:'',poste:'',departement:'',etablissement:'',classe:'',niveauCecr:'A1',prenomParent:'',nomParent:'',emailParent:'',telParent:'' }); }}
                      style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:couleurTheme, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                      + Inscrire un autre {cfg.lib.toLowerCase()}
                    </button>
                    <button onClick={fermerModal}
                      style={{ padding:'10px 20px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      Fermer
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Sélecteur manuel / CSV */}
      <div style={{ display:'flex', gap:8, marginBottom:24, background:COULEURS.gris50, padding:6, borderRadius:10 }}>
        {[['manuel','✏️ Saisie manuelle'],['csv','📂 Import fichier']].map(([k,lib]) => (
          <button key={k} onClick={() => setMode(k)}
            style={{ flex:1, padding:'9px 16px', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:13, fontWeight:600, transition:'all 0.15s', background:mode===k?'#fff':COULEURS.gris50, color:mode===k?COULEURS.navy:COULEURS.gris500, boxShadow:mode===k?'0 1px 4px rgba(0,0,0,0.1)':'none' }}>
            {lib}
          </button>
        ))}
      </div>

      {/* ── MODE IMPORT FICHIER ── */}
      {mode === 'csv' && (
        <div>
          {/* Modèle à télécharger */}
          <div style={{ background:'#F0FDF4', border:'1px solid #6EE7B7', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#065F46', marginBottom:3 }}>
                📋 Modèle Excel pour {cfg.icone} {cfg.lib}
              </div>
              <div style={{ fontSize:11, fontFamily:'monospace', color:'#047857', background:'#DCFCE7', padding:'3px 8px', borderRadius:4 }}>
                {cfg.csvColonnes.replace(/;/g,' · ')}
              </div>
            </div>
            <button onClick={telechargerModele}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
              ⬇️ Télécharger le modèle .xlsx
            </button>
          </div>

          {/* Formats acceptés */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
            {[
              ['📊','Excel (.xlsx, .xls)','#EFF6FF','#1D4ED8'],
              ['📄','CSV / TSV (.csv, .txt)','#F0FDF4','#15803D'],
              ['📋','LibreOffice (.ods)','#FFF7ED','#C2410C'],
              ['{ }','JSON (.json)','#FAF5FF','#7C3AED'],
            ].map(([ic, label, bg, col]) => (
              <span key={label} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', background:bg, color:col, borderRadius:20, fontSize:11, fontWeight:600, border:`1px solid ${col}30` }}>
                {ic} {label}
              </span>
            ))}
          </div>

          {/* Zone de dépôt */}
          <label htmlFor="csv-input-adapt"
            style={{ display:'block', background:csvFichier?'#F0FDF4':csvErreur?'#FFF1F2':COULEURS.gris50, border:`2px dashed ${csvFichier?'#6EE7B7':csvErreur?'#FDA4AF':COULEURS.gris200}`, borderRadius:14, padding:'36px 24px', textAlign:'center', cursor:'pointer', marginBottom:16, transition:'all 0.2s' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>
              {csvFichier ? '✅' : csvErreur ? '❌' : '📂'}
            </div>
            {csvFichier ? (
              <>
                <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:4 }}>{csvFichier}</div>
                <div style={{ fontSize:13, color:COULEURS.succes, fontWeight:600 }}>
                  {nbCsvLignes} bénéficiaire{nbCsvLignes > 1 ? 's' : ''} détecté{nbCsvLignes > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>Cliquer pour choisir un autre fichier</div>
              </>
            ) : csvErreur ? (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:'#BE123C', marginBottom:4 }}>Erreur de lecture</div>
                <div style={{ fontSize:12, color:'#BE123C' }}>{csvErreur}</div>
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:6 }}>Cliquer pour réessayer</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>
                  Déposer votre fichier ici
                </div>
                <div style={{ fontSize:12, color:COULEURS.gris400 }}>
                  ou cliquer pour choisir · Excel, CSV, ODS, JSON acceptés
                </div>
              </>
            )}
            <input id="csv-input-adapt" type="file"
              accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.xlsb,.ods,.json"
              style={{ display:'none' }} onChange={lireFichierImport} />
          </label>

          {/* Aperçu des premières lignes */}
          {csvBeneficiaires.length > 0 && (
            <div style={{ background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'12px 16px', marginBottom:16, overflowX:'auto' }}>
              <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>
                Aperçu - {Math.min(3, csvBeneficiaires.length)} première{Math.min(3, csvBeneficiaires.length) > 1 ? 's' : ''} ligne{Math.min(3, csvBeneficiaires.length) > 1 ? 's' : ''} sur {csvBeneficiaires.length}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:COULEURS.gris50 }}>
                    {['Nom complet','Email','Téléphone','Niveau','Poste / Classe'].map(h => (
                      <th key={h} style={{ padding:'5px 10px', textAlign:'left', color:COULEURS.gris600, fontWeight:700, borderBottom:`1px solid ${COULEURS.gris200}`, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvBeneficiaires.slice(0, 3).map((b, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      <td style={{ padding:'5px 10px', fontWeight:600, color:COULEURS.navy }}>{b.nom_complet || '-'}</td>
                      <td style={{ padding:'5px 10px', color:COULEURS.gris600 }}>{b.email || b.email_parent || '-'}</td>
                      <td style={{ padding:'5px 10px', color:COULEURS.gris600 }}>{b.telephone || b.telephone_parent || '-'}</td>
                      <td style={{ padding:'5px 10px' }}><span style={{ background:'#EFF6FF', color:'#1D4ED8', padding:'2px 7px', borderRadius:8, fontWeight:700, fontSize:10 }}>{b.niveau || 'A1'}</span></td>
                      <td style={{ padding:'5px 10px', color:COULEURS.gris600 }}>{b.poste || b.classe || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Exemple de colonnes attendues */}
          {!csvFichier && (
            <div style={{ background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, padding:'12px 16px', marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Colonnes attendues (exemple CSV)</div>
              <div style={{ fontSize:11, fontFamily:'monospace', color:COULEURS.navy, overflowX:'auto', whiteSpace:'nowrap' }}>{cfg.csvExemple}</div>
            </div>
          )}

          <div style={{ background:'#FEF3C7', borderRadius:8, padding:'12px 16px', fontSize:12, color:'#92400E', marginBottom:20 }}>
            ⚠️ Le fichier sera transmis à l'équipe Onboarding BET pour validation avant activation des comptes.
          </div>

          {csvFichier && nbCsvLignes > 0 && (
            <button onClick={() => soumettre(true)} disabled={submitting}
              style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background:submitting ? '#94A3B8' : cfg.couleur, color:'#fff', fontSize:14, fontWeight:800, cursor:submitting ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
              {submitting ? 'Envoi en cours…' : `Envoyer les ${nbCsvLignes} bénéficiaires à BET →`}
            </button>
          )}
        </div>
      )}

      {/* ── MODE MANUEL ── */}
      {mode === 'manuel' && (
        <form onSubmit={e => { e.preventDefault(); soumettre(false); }}>

          {/* Section identité */}
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'22px 24px', border:`1px solid ${COULEURS.gris200}`, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:18, display:'flex', alignItems:'center', gap:8 }}>
              {cfg.icone} Informations du bénéficiaire
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div style={grp()}>
                <label style={lbl}>Prénom *</label>
                <input style={inp} name="prenom" value={form.prenom} onChange={handleChange} required placeholder={profil==='adulte'?'Aminata':'Moussa'} />
              </div>
              <div style={grp()}>
                <label style={lbl}>Nom *</label>
                <input style={inp} name="nom" value={form.nom} onChange={handleChange} required placeholder={profil==='adulte'?'Koné':'Traoré'} />
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div style={grp()}>
                <label style={lbl}>Date de naissance *</label>
                <input style={inp} type="date" name="dateNaissance" value={form.dateNaissance} onChange={handleChange} required
                  min={`${new Date().getFullYear() - cfg.ageMax}-01-01`}
                  max={`${new Date().getFullYear() - cfg.ageMin}-12-31`} />
                <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:3 }}>{cfg.ageMin} – {cfg.ageMax} ans</div>
              </div>
              <div style={grp()}>
                <label style={lbl}>Niveau CECR estimé</label>
                <select style={{ ...inp }} name="niveauCecr" value={form.niveauCecr} onChange={handleChange}>
                  {['A1','A2','B1','B2','C1','C2','Non évalué'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {/* Champs spécifiques adulte */}
            {profil === 'adulte' && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                  <div style={grp()}>
                    <label style={lbl}>Email professionnel *</label>
                    <input style={inp} type="email" name="email" value={form.email} onChange={handleChange} required placeholder="prenom.nom@tlgpharma.com" />
                  </div>
                  <div style={grp()}>
                    <label style={lbl}>Téléphone</label>
                    <input style={inp} name="telephone" value={form.telephone} onChange={handleChange} placeholder="+225 07 00 00 00" />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={grp()}>
                    <label style={lbl}>Poste / Fonction</label>
                    <input style={inp} name="poste" value={form.poste} onChange={handleChange} placeholder="Responsable RH, Comptable…" />
                  </div>
                  <div style={grp()}>
                    <label style={lbl}>Département / Service</label>
                    <input style={inp} name="departement" value={form.departement} onChange={handleChange} placeholder="Ressources Humaines, Finance…" />
                  </div>
                </div>
              </>
            )}

            {/* Champs spécifiques adolescent */}
            {profil === 'adolescent' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={grp()}>
                  <label style={lbl}>Établissement scolaire</label>
                  <input style={inp} name="etablissement" value={form.etablissement} onChange={handleChange} placeholder="Lycée, Collège…" />
                </div>
                <div style={grp()}>
                  <label style={lbl}>Email personnel</label>
                  <input style={inp} type="email" name="email" value={form.email} onChange={handleChange} placeholder="moussa.traore@email.com" />
                  <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:3 }}>Optionnel - certains ados ont déjà leur propre adresse. À défaut, celle du parent est utilisée.</div>
                </div>
              </div>
            )}

            {/* Champs spécifiques enfant */}
            {profil === 'enfant' && (
              <div style={grp()}>
                <label style={lbl}>Classe *</label>
                <select style={{ ...inp }} name="classe" value={form.classe} onChange={handleChange} required>
                  <option value="">- Sélectionner -</option>
                  {['CP','CE1','CE2','CM1','CM2','6ème','5ème','4ème','3ème'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Section contact parent/tuteur (enfant obligatoire, ado optionnel) */}
          {cfg.avecParent && (
            <div style={{ background:COULEURS.blanc, borderRadius:14, padding:'22px 24px', border:`1px solid ${COULEURS.gris200}`, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
                👨‍👩‍👧 Contact parent / tuteur
                {!cfg.parentOblig && <span style={{ fontSize:11, fontWeight:500, color:COULEURS.gris400, background:COULEURS.gris100, padding:'2px 8px', borderRadius:10 }}>Optionnel</span>}
              </div>
              <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:16 }}>
                {cfg.parentOblig
                  ? 'Obligatoire pour les mineurs de moins de 13 ans.'
                  : 'Recommandé pour un suivi parental - non obligatoire pour les 13-17 ans.'}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                <div style={grp()}>
                  <label style={lbl}>Prénom du parent {cfg.parentOblig ? '*' : ''}</label>
                  <input style={inp} name="prenomParent" value={form.prenomParent} onChange={handleChange} required={cfg.parentOblig} placeholder="Djeneba" />
                </div>
                <div style={grp()}>
                  <label style={lbl}>Nom du parent {cfg.parentOblig ? '*' : ''}</label>
                  <input style={inp} name="nomParent" value={form.nomParent} onChange={handleChange} required={cfg.parentOblig} placeholder="Koné" />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={grp()}>
                  <label style={lbl}>Email {cfg.parentOblig ? '*' : ''}</label>
                  <input style={inp} type="email" name="emailParent" value={form.emailParent} onChange={handleChange} required={cfg.parentOblig} placeholder="parent@email.com" />
                </div>
                <div style={grp()}>
                  <label style={lbl}>Téléphone</label>
                  <input style={inp} name="telParent" value={form.telParent} onChange={handleChange} placeholder="+225 07 00 00 00" />
                </div>
              </div>
            </div>
          )}

                  {erreurSoumission && (
                    <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#991B1B' }}>
                      ❌ {erreurSoumission}
                    </div>
                  )}
                  <button type="submit" disabled={submitting}
                    style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background: submitting ? '#94A3B8' : cfg.couleur, color:'#fff', fontSize:14, fontWeight:800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginTop:4 }}>
                    {submitting ? 'Envoi en cours…' : 'Envoyer la demande d\'inscription →'}
                  </button>
                </form>
              )}
                </>
              )}
            </div>{/* fin corps modal */}
          </div>{/* fin fenêtre modale */}
        </>
      )}
    </div>
  );
}

// ── onglet 4 : Rapports de formation ─────────────────────────────────────────

function OngletRapports({ apprenants, classes, notes: notesProp, presences: presencesProp, entId, nomEntreprise = 'Mon Entreprise' }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();

  // ── Mois dynamiques : 12 derniers mois ────────────────────────────────────
  const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const moisDispo = (() => {
    const now = new Date();
    const res = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      res.push(`${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`);
    }
    return res;
  })();
  const [moisSelectionne, setMoisSelectionne] = useState(moisDispo[0]);

  // ── Fetch présences et notes réelles ──────────────────────────────────────
  const [presences, setPresences] = useState(presencesProp || []);
  const [notes,     setNotes]     = useState(notesProp     || []);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!classes?.length) return;
    setLoadingData(true);
    Promise.all(
      classes.map(c =>
        fetch(`${API_URL}/api/elearning/classes/${c.id}/presences`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : { presences: [] })
          .then(d => d.presences || [])
          .catch(() => [])
      )
    ).then(results => {
      setPresences(results.flat());
      setLoadingData(false);
    });
  }, [classes]);

  useEffect(() => {
    if (!apprenants?.length) return;
    Promise.all(
      apprenants.map(a =>
        fetch(`${API_URL}/api/elearning/apprenants/${a.id}/evaluations`, { headers: authHeaders() })
          .then(r => r.ok ? r.json() : { evaluations: [] })
          .then(d => (d.evaluations || []).map(e => ({ ...e, apprenant_id: a.id })))
          .catch(() => [])
      )
    ).then(results => setNotes(results.flat()));
  }, [apprenants]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const actifs     = apprenants.filter(a => a.statut === 'actif').length;
  const classesDed = classes || [];

  const tauxPres = (() => {
    const total = presences.length;
    if (total === 0) return 0;
    return Math.round((presences.filter(pr => pr.statut === 'present').length / total) * 100);
  })();

  return (
    <>
      {/* Sélecteur de mois */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: COULEURS.gris600, fontWeight: 600 }}>Période :</span>
        {moisDispo.map(m => (
          <button key={m} onClick={() => setMoisSelectionne(m)} style={{
            padding: '7px 14px', borderRadius: 20, border: `1px solid ${moisSelectionne === m ? couleurTheme : COULEURS.gris200}`,
            background: moisSelectionne === m ? couleurTheme : COULEURS.blanc,
            color: moisSelectionne === m ? COULEURS.blanc : COULEURS.gris600,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}>
            {m}
          </button>
        ))}
      </div>

      {/* Rapport de synthèse */}
      <div style={{
        background: COULEURS.blanc, borderRadius: 16, padding: 28,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy }}>
              📊 Rapport mensuel - {moisSelectionne}
            </div>
            <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>
              Programme anglais BET · {apprenants.length} bénéficiaires inscrits
            </div>
          </div>
          <button onClick={() => {
            const lignesGroupe = classesDed.map(g => {
              const membres = apprenants.filter(a => a.classe_id === g.id || a.groupe_id === g.id);
              const notesG  = notes.filter(n => membres.some(a => a.id === n.apprenant_id));
              const presG   = presences.filter(p => p.classe_id === g.id);
              const moy     = notesG.length > 0 ? (notesG.reduce((s,n)=>s+(n.note/(n.note_max||20))*20,0)/notesG.length).toFixed(1) : '-';
              const pres    = presG.length > 0 ? Math.round(presG.filter(p=>p.statut==='present').length/presG.length*100) : 0;
              return `<tr><td>${g.nom}</td><td>${membres.length}</td><td>${g.niveau||'-'}</td><td style="font-weight:800;color:${Number(moy)>=14?'#059669':Number(moy)>=10?'#D97706':'#DC2626'}">${moy}/20</td><td>${pres}%</td></tr>`;
            }).join('');
            genererPDF(`
              <div class="doc-header">
                <div><div class="doc-header-logo">BET × ${nomEntreprise}</div><div class="doc-header-sub">British English Training · Programme de formation en anglais</div></div>
                <div class="doc-header-right">Période : ${moisSelectionne}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}</div>
              </div>
              <div class="doc-title-band">📊 RAPPORT MENSUEL DE FORMATION - ${moisSelectionne.toUpperCase()}</div>
              <div class="doc-body">
                <div class="section-title">Informations générales</div>
                <div class="info-grid">
                  <div class="info-row"><span class="info-label">Entreprise cliente</span><span class="info-value">${nomEntreprise}</span></div>
                  <div class="info-row"><span class="info-label">Prestataire</span><span class="info-value">British English Training (BET)</span></div>
                  <div class="info-row"><span class="info-label">Période</span><span class="info-value">${moisSelectionne}</span></div>
                  <div class="info-row"><span class="info-label">Date d'émission</span><span class="info-value">${fmtDatePDF(new Date().toISOString())}</span></div>
                </div>
                <div class="section-title">Indicateurs globaux</div>
                <div class="kpi-row">
                  <div class="kpi-card"><div class="kpi-val">${apprenants.length}</div><div class="kpi-lbl">Total inscrits</div></div>
                  <div class="kpi-card"><div class="kpi-val">${actifs}</div><div class="kpi-lbl">Apprenants actifs</div></div>
                  <div class="kpi-card"><div class="kpi-val">${tauxPres}%</div><div class="kpi-lbl">Taux de présence</div></div>
                  <div class="kpi-card"><div class="kpi-val">${classesDed.length}</div><div class="kpi-lbl">Groupes dédiés</div></div>
                </div>
                <div class="section-title">Détail par groupe</div>
                <table>
                  <thead><tr><th>Groupe</th><th>Effectif</th><th>Niveau CECR</th><th>Moyenne</th><th>Présence</th></tr></thead>
                  <tbody>${lignesGroupe}</tbody>
                </table>
                <div class="section-title">Apprenants certifiés ce mois</div>
                ${apprenants.filter(a=>a.statut==='certifie').length > 0
                  ? `<table><thead><tr><th>Nom</th><th>Classe</th><th>Niveau atteint</th><th>Statut</th></tr></thead><tbody>${apprenants.filter(a=>a.statut==='certifie').map(a=>`<tr><td>${a.prenom||''} ${a.nom||a.nom_complet||''}</td><td>${a.classe_nom||'-'}</td><td>${a.niveau_cecr||'-'}</td><td><span class="badge badge-green">Certifié</span></td></tr>`).join('')}</tbody></table>`
                  : '<p style="color:#64748B;font-size:13px;padding:12px 0">Aucun apprenant certifié ce mois.</p>'
                }
                <div class="signatures" style="margin-top:40px">
                  <div class="sig-block"><div class="sig-line"></div><div class="sig-name">La Direction BET</div><div class="sig-role">British English Training</div></div>
                  <div class="sig-block"><div class="sig-line"></div><div class="sig-name">Le Responsable Pédagogique</div><div class="sig-role">PA Advisor BET</div></div>
                  <div class="sig-block"><div class="sig-line"></div><div class="sig-name">${nomEntreprise} - DRH</div><div class="sig-role">Direction des Ressources Humaines</div></div>
                </div>
                <div class="doc-footer"><span>BET × ${nomEntreprise} · Rapport confidentiel · Abidjan, Côte d'Ivoire</span><span>Rapport mensuel ${moisSelectionne}</span></div>
              </div>
            `, `Rapport mensuel ${moisSelectionne} - ${nomEntreprise}`);
          }} style={{
            background: '#003087', color: COULEURS.blanc, border: 'none',
            borderRadius: 8, padding: '9px 18px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📥 PDF
          </button>
          <button onClick={() => {
            const kpis = [
              ['Période', moisSelectionne],
              ['Entreprise', nomEntreprise],
              ['Total inscrits', apprenants.length],
              ['Apprenants actifs', actifs],
              ['Taux de présence moyen', `${tauxPres}%`],
              ['Groupes dédiés', classesDed.length],
              ['Certifiés ce mois', apprenants.filter(a => a.statut === 'certifie').length],
            ];
            const lignesGroupe = classesDed.map(g => {
              const membres = apprenants.filter(a => a.classe_id === g.id || a.groupe_id === g.id);
              const notesG  = notes.filter(n => membres.some(a => a.id === n.apprenant_id));
              const presG   = presences.filter(p => p.classe_id === g.id);
              const moy     = notesG.length > 0 ? (notesG.reduce((s,n)=>s+(n.note/(n.note_max||20))*20,0)/notesG.length).toFixed(1) : '-';
              const pres    = presG.length > 0 ? Math.round(presG.filter(p=>p.statut==='present').length/presG.length*100) : 0;
              return [g.nom, membres.length, g.niveau||'-', moy, `${pres}%`];
            });
            const lignesApp = apprenants.map(a => [
              a.nom_complet || `${a.prenom||''} ${a.nom||''}`.trim(),
              a.classe_nom || '-',
              a.niveau_cecr || '-',
              a.statut,
            ]);
            exporterExcelStyle({
              nomFichier: `Rapport_formation_TLG_${moisSelectionne.replace(' ', '_')}`,
              couleurEntete: '217346',
              feuilles: [
                {
                  nom: 'Synthèse',
                  titre: `📊 Rapport mensuel de formation - ${moisSelectionne}`,
                  sousTitre: nomEntreprise,
                  couleurEntete: '217346',
                  colonnes: [{ label: 'Indicateur', width: 30, bold: true }, { label: 'Valeur', width: 20, align: 'right' }],
                  lignes: kpis,
                },
                {
                  nom: 'Détail par groupe',
                  titre: '👥 Détail par groupe',
                  sousTitre: `${nomEntreprise} - ${moisSelectionne}`,
                  couleurEntete: '217346',
                  colonnes: [
                    { label: 'Groupe', width: 24, bold: true }, { label: 'Effectif', width: 12, align: 'center' },
                    { label: 'Niveau CECR', width: 14, align: 'center' }, { label: 'Moyenne /20', width: 14, align: 'center' },
                    { label: 'Taux présence', width: 14, align: 'center' },
                  ],
                  lignes: lignesGroupe,
                },
                {
                  nom: 'Apprenants',
                  titre: '🎓 Liste des apprenants',
                  sousTitre: `${nomEntreprise} - ${moisSelectionne}`,
                  couleurEntete: '217346',
                  colonnes: [
                    { label: 'Nom', width: 26, bold: true }, { label: 'Classe', width: 20 },
                    { label: 'Niveau', width: 14, align: 'center' }, { label: 'Statut', width: 14 },
                  ],
                  lignes: lignesApp,
                },
              ],
            });
          }} style={{
            background: '#217346', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 18px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📊 Excel
          </button>
        </div>

        {loadingData && (
          <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:12 }}>Chargement des présences…</div>
        )}
        {[
          { label: 'Total inscrits', val: apprenants.length },
          { label: 'Apprenants actifs', val: actifs },
          { label: 'Taux de présence moyen', val: `${tauxPres}%` },
          { label: 'Groupes dédiés', val: classesDed.length },
          { label: 'Notes saisies', val: notes.length },
          { label: 'Certifiés ce mois', val: apprenants.filter(a => a.statut === 'certifie').length },
        ].map(({ label, val }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 14,
          }}>
            <span style={{ color: COULEURS.gris600 }}>{label}</span>
            <span style={{ fontWeight: 700, color: COULEURS.navy }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Rapport par groupe */}
      <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>
        Détail par groupe
      </div>
      {classesDed.length === 0 && (
        <div style={{ color:COULEURS.gris400, fontSize:13, padding:'12px 0' }}>
          Aucune classe dédiée pour le moment.
        </div>
      )}
      {classesDed.map(g => {
        const membres     = apprenants.filter(a => a.classe_id === g.id || a.groupe_id === g.id);
        const notesGroupe = notes.filter(n => membres.some(a => a.id === n.apprenant_id));
        const presGroupe  = presences.filter(p => p.classe_id === g.id);
        const moy = notesGroupe.length > 0
          ? (notesGroupe.reduce((s, n) => s + (n.note / (n.note_max || 20)) * 20, 0) / notesGroupe.length).toFixed(1)
          : '--';
        const tauxPG = presGroupe.length > 0
          ? Math.round(presGroupe.filter(p => p.statut === 'present').length / presGroupe.length * 100)
          : 0;

        return (
          <div key={g.id} style={{
            background: COULEURS.blanc, borderRadius: 14, padding: 20, marginBottom: 16,
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)', border: `1px solid ${COULEURS.gris200}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{g.nom}</div>
              <button onClick={() => {
                const lignesApp = membres.map(a => {
                  const notesA = notes.filter(n => n.apprenant_id === a.id);
                  const presA  = presences.filter(p => p.inscription_id === a.id || p.apprenant_id === a.id);
                  const moyA   = notesA.length > 0 ? (notesA.reduce((s,n)=>s+(n.note/(n.note_max||20))*20,0)/notesA.length).toFixed(1) : '-';
                  const presP  = presA.length > 0 ? Math.round(presA.filter(p=>p.statut==='present').length/presA.length*100) : 0;
                  const statMap = { actif:'badge-green', inactif:'badge-red', certifie:'badge-blue', en_attente:'badge-orange' };
                  const nomAff = a.nom_complet || `${a.prenom||''} ${a.nom||''}`.trim();
                  return `<tr><td>${nomAff}</td><td>${a.niveau_cecr||'-'}</td><td style="font-weight:800">${moyA}/20</td><td>${presP}%</td><td><span class="badge ${statMap[a.statut]||'badge-blue'}">${a.statut}</span></td></tr>`;
                }).join('');
                genererPDF(`
                  <div class="doc-header">
                    <div><div class="doc-header-logo">BET × ${nomEntreprise}</div><div class="doc-header-sub">British English Training · Rapport de groupe</div></div>
                    <div class="doc-header-right">Période : ${moisSelectionne}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                  </div>
                  <div class="doc-title-band">📊 RAPPORT GROUPE - ${g.nom.toUpperCase()}</div>
                  <div class="doc-body">
                    <div class="section-title">Informations du groupe</div>
                    <div class="info-grid">
                      <div class="info-row"><span class="info-label">Groupe</span><span class="info-value">${g.nom}</span></div>
                      <div class="info-row"><span class="info-label">Niveau CECR</span><span class="info-value">${g.niveau||'-'}</span></div>
                      <div class="info-row"><span class="info-label">Effectif</span><span class="info-value">${membres.length} apprenants</span></div>
                      <div class="info-row"><span class="info-label">Moyenne groupe</span><span class="info-value">${moy}/20</span></div>
                    </div>
                    <div class="kpi-row">
                      <div class="kpi-card"><div class="kpi-val">${membres.length}</div><div class="kpi-lbl">Effectif</div></div>
                      <div class="kpi-card"><div class="kpi-val">${moy}/20</div><div class="kpi-lbl">Moyenne</div></div>
                      <div class="kpi-card"><div class="kpi-val">${tauxPG}%</div><div class="kpi-lbl">Présence</div></div>
                      <div class="kpi-card"><div class="kpi-val">${moisSelectionne.split(' ')[0]}</div><div class="kpi-lbl">Période</div></div>
                    </div>
                    <div class="section-title">Résultats par apprenant</div>
                    <table>
                      <thead><tr><th>Apprenant</th><th>Niveau</th><th>Moyenne</th><th>Présence</th><th>Statut</th></tr></thead>
                      <tbody>${lignesApp}</tbody>
                    </table>
                    <div class="doc-footer"><span>BET × ${nomEntreprise} · Rapport de groupe · Confidentiel</span><span>${moisSelectionne}</span></div>
                  </div>
                `, `Rapport groupe ${g.nom} - ${moisSelectionne}`);
              }} style={{
                background: 'transparent', border: `1px solid ${COULEURS.gris200}`,
                borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                color: COULEURS.gris600, fontFamily: '"Plus Jakarta Sans", sans-serif',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                📥 PDF groupe
              </button>
              <button onClick={() => {
                const lignesApp = membres.map(a => {
                  const notesA = notes.filter(n => n.apprenant_id === a.id);
                  const presA  = presences.filter(p => p.inscription_id === a.id || p.apprenant_id === a.id);
                  const moyA   = notesA.length > 0 ? (notesA.reduce((s,n)=>s+(n.note/(n.note_max||20))*20,0)/notesA.length).toFixed(1) : '-';
                  const presP  = presA.length > 0 ? Math.round(presA.filter(p=>p.statut==='present').length/presA.length*100) : 0;
                  const nomAff = a.nom_complet || `${a.prenom||''} ${a.nom||''}`.trim();
                  return [nomAff, a.niveau_cecr||'-', moyA, `${presP}%`, a.statut];
                });
                exporterExcelStyle({
                  nomFichier: `Rapport_groupe_${g.nom.replace(/\s+/g,'_')}_${moisSelectionne.replace(' ','_')}`,
                  couleurEntete: '217346',
                  feuilles: [
                    {
                      nom: 'Synthèse',
                      titre: `📋 Rapport groupe - ${g.nom}`,
                      sousTitre: `${nomEntreprise} - ${moisSelectionne}`,
                      couleurEntete: '217346',
                      colonnes: [{ label: 'Indicateur', width: 26, bold: true }, { label: 'Valeur', width: 20, align: 'right' }],
                      lignes: [
                        ['Groupe', g.nom],
                        ['Niveau CECR', g.niveau||'-'],
                        ['Effectif', membres.length],
                        ['Moyenne groupe', `${moy}/20`],
                        ['Taux présence', `${tauxPG}%`],
                        ['Période', moisSelectionne],
                      ],
                    },
                    {
                      nom: 'Apprenants',
                      titre: '🎓 Résultats par apprenant',
                      sousTitre: `${g.nom} - ${moisSelectionne}`,
                      couleurEntete: '217346',
                      colonnes: [
                        { label: 'Nom', width: 26, bold: true }, { label: 'Niveau', width: 14, align: 'center' },
                        { label: 'Moyenne /20', width: 14, align: 'center' }, { label: 'Taux présence', width: 14, align: 'center' },
                        { label: 'Statut', width: 14 },
                      ],
                      lignes: lignesApp,
                    },
                  ],
                });
              }} style={{
                background: '#217346', border: 'none',
                borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                color: '#fff', fontFamily: '"Plus Jakarta Sans", sans-serif',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                📊 Excel groupe
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { l: 'Effectif', v: membres.length },
                { l: 'Niveau', v: g.niveau || '-' },
                { l: 'Moyenne', v: `${moy}/20` },
              ].map(({ l, v }) => (
                <div key={l} style={{ textAlign: 'center', padding: 12, background: COULEURS.gris50, borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: COULEURS.navy }}>{v}</div>
                  <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Détail par apprenant */}
            {membres.map(a => {
              const notesA = notes.filter(n => n.apprenant_id === a.id);
              const moyA = notesA.length > 0
                ? (notesA.reduce((s, n) => s + (n.note / (n.note_max || 20)) * 20, 0) / notesA.length).toFixed(1)
                : '--';
              const commentaires = notesA.filter(n => n.commentaire_coach || n.commentaire).map(n => n.commentaire_coach || n.commentaire);
              const nomAff = a.nom_complet || `${a.prenom||''} ${a.nom||''}`.trim();

              return (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderTop: `1px solid ${COULEURS.gris100}`, fontSize: 13,
                }}>
                  <div>
                    <span style={{ fontWeight: 600, color: COULEURS.navy }}>{nomAff}</span>
                    {commentaires.length > 0 && (
                      <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 2, fontStyle: 'italic' }}>
                        "{commentaires[0]}"
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: COULEURS.navy }}>{moyA}/20</span>
                    <Badge statut={a.statut} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ── onglet 5 : Gestion des accès ─────────────────────────────────────────────

function OngletAcces({ classes }) {
  const { couleurTheme } = useTheme();
  const [classeOuverte, setClasseOuverte] = useState(null); // classe sélectionnée
  const [apprenants,    setApprenants]    = useState([]);   // apprenants de la classe ouverte
  const [loading,       setLoading]       = useState(false);
  const [accesStatuts,  setAccesStatuts]  = useState({});   // inscriptionId → { bloque, saving }

  // Charger les apprenants quand une classe est sélectionnée
  useEffect(() => {
    if (!classeOuverte) return;
    setAccesStatuts({});
    // Afficher immédiatement les apprenants déjà embarqués
    const embarques = classeOuverte.apprenants || [];
    setApprenants(embarques);
    setLoading(true);
    // Fetch complet (inclut les suspendus)
    fetch(`${API_URL}/api/elearning/classes/${classeOuverte.id}/apprenants`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => {
        const liste = d.apprenants || [];
        setApprenants(liste.length ? liste : embarques);
        setLoading(false);
      })
      .catch(err => {
        console.error('[OngletAcces] fetch apprenants échoué:', err);
        setLoading(false);
      });
  }, [classeOuverte]);

  async function toggleAcces(inscriptionId, currentBloque) {
    setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: true } }));
    try {
      const r = await fetch(`${API_URL}/api/elearning/apprenants/${inscriptionId}/suspension`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloque: !currentBloque }),
      });
      if (r.ok) {
        setAccesStatuts(p => ({ ...p, [inscriptionId]: { bloque: !currentBloque, saving: false } }));
        // Mettre à jour statut local
        setApprenants(prev => prev.map(a =>
          a.id === inscriptionId ? { ...a, statut: !currentBloque ? 'suspendu' : 'actif' } : a
        ));
      } else {
        setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: false } }));
      }
    } catch {
      setAccesStatuts(p => ({ ...p, [inscriptionId]: { ...p[inscriptionId], saving: false } }));
    }
  }

  function fermerModal() {
    setClasseOuverte(null);
    setApprenants([]);
    setAccesStatuts({});
  }

  return (
    <>
      {/* ── Liste des classes ── */}
      {!classes?.length ? (
        <div style={{ color: COULEURS.gris400, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          Aucune classe trouvée pour votre entreprise.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: COULEURS.gris600, marginBottom: 16 }}>
            Cliquez sur une classe pour gérer les accès de ses apprenants.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {classes.map(c => {
              const nbApp = c.apprenants?.length ?? c.nb_apprenants ?? '-';
              return (
                <button key={c.id} onClick={() => setClasseOuverte(c)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
                    borderRadius: 12, padding: '16px 20px', cursor: 'pointer', textAlign: 'left',
                    fontFamily: '"Plus Jakarta Sans",sans-serif', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = couleurTheme; e.currentTarget.style.boxShadow = `0 4px 12px ${couleurTheme}20`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = COULEURS.gris200; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 3 }}>
                      🏫 {c.nom}
                    </div>
                    <div style={{ fontSize: 12, color: COULEURS.gris600 }}>
                      {c.coach_nom ? `Coach : ${c.coach_nom}` : 'Coach non assigné'}
                      {c.niveau ? ` · Niveau ${c.niveau}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: COULEURS.gris600 }}>
                      {nbApp} apprenant{nbApp > 1 ? 's' : ''}
                    </span>
                    <span style={{
                      background: c.statut === 'actif' ? '#D1FAE5' : c.statut === 'clos' ? '#fee2e2' : '#FEF3C7',
                      color: c.statut === 'actif' ? '#065F46' : c.statut === 'clos' ? '#dc2626' : '#92400E',
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    }}>{c.statut === 'actif' ? 'Active' : c.statut === 'clos' ? '🔒 Clôturée' : (c.statut || 'actif')}</span>
                    <span style={{ color: COULEURS.gris400, fontSize: 18 }}>›</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modal détail classe ── */}
      {classeOuverte && (
        <>
          {/* Overlay */}
          <div onClick={fermerModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />

          {/* Fenêtre */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '90vw', height: '90vh', display: 'flex', flexDirection: 'column',
            background: '#fff', borderRadius: 20, zIndex: 1001,
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: '"Plus Jakarta Sans",sans-serif', overflow: 'hidden',
          }}>
            {/* En-tête */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${COULEURS.gris100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COULEURS.navy }}>🏫 {classeOuverte.nom}</div>
                <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 2 }}>
                  {classeOuverte.coach_nom ? `Coach : ${classeOuverte.coach_nom}` : 'Coach non assigné'}
                  {classeOuverte.niveau ? ` · Niveau ${classeOuverte.niveau}` : ''}
                  {' · '}Gestion des accès
                </div>
              </div>
              <button onClick={fermerModal}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: COULEURS.gris100, color: COULEURS.gris600, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                ×
              </button>
            </div>

            {/* Corps scrollable */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Entête table */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 150px', padding: '10px 24px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0 }}>
                <span>Apprenant</span><span>Email</span><span>Statut</span><span>Action</span>
              </div>

              {loading && (
                <div style={{ padding: '28px 24px', color: COULEURS.gris400, fontSize: 13 }}>Chargement…</div>
              )}

              {!loading && apprenants.length === 0 && (
                <div style={{ padding: '28px 24px', color: COULEURS.gris400, fontSize: 13 }}>
                  Aucun apprenant inscrit dans cette classe.
                </div>
              )}

              {!loading && apprenants.map(a => {
                const accesEt = accesStatuts[a.id];
                const bloque  = accesEt !== undefined ? accesEt.bloque : (a.statut === 'suspendu');
                const saving  = accesEt?.saving || false;
                const nomAff  = a.nom_complet || `${a.prenom||''} ${a.nom||''}`.trim() || '-';

                return (
                  <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 150px', padding: '14px 24px', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: COULEURS.navy }}>{nomAff}</span>
                    <span style={{ color: COULEURS.gris600, fontSize: 12 }}>{a.email || '-'}</span>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: bloque ? '#FEE2E2' : '#D1FAE5',
                      color: bloque ? '#991B1B' : '#065F46',
                    }}>
                      {bloque ? 'Bloqué' : 'Actif'}
                    </span>
                    <button
                      onClick={() => toggleAcces(a.id, bloque)}
                      disabled={saving}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        border: `1px solid ${bloque ? '#059669' : '#DC2626'}`,
                        background: bloque ? '#F0FDF4' : '#FFF1F2',
                        color: bloque ? '#059669' : '#DC2626',
                        fontFamily: '"Plus Jakarta Sans",sans-serif', opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {saving ? '…' : bloque ? '🔓 Débloquer' : '🔒 Bloquer'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── onglet : Contrat & Paiements ───────────────────────────────────────────────
// Le RH DÉCLARE ses versements avec justificatifs ; il ne les valide pas. Chaque
// déclaration part en 'declare' et attend qu'une vérificatrice de BET ouvre la
// pièce jointe - jusque-là elle ne compte dans aucun total.
const MODES_PAIEMENT_LIB = { virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces', mobile_money: 'Mobile Money' };
function fmtFCFA(v) { return `${(v || 0).toLocaleString('fr-FR')} FCFA`; }

function OngletPaiementsEntreprise({ couleurEnt, contrat, contratsHistorique, nomEntreprise, entreprise }) {
  const [paiements, setPaiements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [paiementDetail, setPaiementDetail] = useState(null);
  const [modalDeclaration, setModalDeclaration] = useState(false);

  const recharger = () => fetch(`${API_URL}/api/entreprise/elearning/mes-paiements`, { headers: authHeaders() })
    .then(r => r.json())
    .then(d => setPaiements(d.paiements || []))
    .catch(() => {});

  useEffect(() => { recharger().finally(() => setChargement(false)); }, []);

  const montantContrat = contrat?.montant_ht || 0;
  /* SEULS LES VERSEMENTS VALIDÉS COMPTENT. La somme portait auparavant sur tous
     les paiements indistinctement - c'était sans conséquence tant que toute ligne
     naissait 'recu', mais une déclaration en attente gonflerait désormais le
     « Total versé » et ferait croire au RH que son solde est éteint avant
     vérification. Le backend applique la même règle pour la trésorerie. */
  const totalEncaisse   = paiements.filter(estVerse).reduce((s, p) => s + (p.montant || 0), 0);
  const enAttente       = paiements.filter(p => p.statut === 'declare');
  const totalEnAttente  = enAttente.reduce((s, p) => s + (p.montant || 0), 0);
  const soldeRestant    = Math.max(0, montantContrat - totalEncaisse);
  const pctPaie         = montantContrat > 0 ? Math.round((totalEncaisse / montantContrat) * 100) : 0;

  return (
    <div>
      {/* KPIs financiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { l: 'Montant total contrat', v: fmtFCFA(montantContrat), c: couleurEnt },
          { l: 'Total versé',           v: fmtFCFA(totalEncaisse),  c: '#059669' },
          { l: 'Solde restant dû',      v: fmtFCFA(soldeRestant),   c: soldeRestant > 0 ? '#DC2626' : '#059669' },
        ].map(k => (
          <div key={k.l} style={{ background: COULEURS.blanc, borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, borderTop: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c, marginBottom: 4 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris600 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Barre progression */}
      <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: COULEURS.navy }}>Taux d'encaissement</span>
          <span style={{ fontWeight: 800, color: pctPaie === 100 ? '#059669' : '#F59E0B' }}>{pctPaie}%</span>
        </div>
        <div style={{ height: 10, background: COULEURS.gris100, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pctPaie}%`, background: pctPaie === 100 ? '#059669' : '#F59E0B', borderRadius: 5, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Rappel des déclarations en cours de vérification */}
      {enAttente.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🕐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
              {enAttente.length} versement{enAttente.length > 1 ? 's' : ''} en cours de vérification · {fmtFCFA(totalEnAttente)}
            </div>
            <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
              Ces montants n'apparaîtront dans votre total versé qu'une fois les justificatifs vérifiés par BET.
            </div>
          </div>
        </div>
      )}

      {/* Historique des versements */}
      <div style={{ background: COULEURS.blanc, borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>
            🧾 Historique des versements ({paiements.length})
          </span>
          <button onClick={() => setModalDeclaration(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: couleurEnt, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            💳 Déclarer un versement
          </button>
        </div>
        {chargement ? (
          <div style={{ textAlign: 'center', padding: 32, color: COULEURS.gris400 }}>Chargement…</div>
        ) : paiements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>💳</div>
            <div style={{ fontWeight: 600, color: COULEURS.navy, marginBottom: 4 }}>Aucun versement enregistré pour le moment.</div>
            <div style={{ fontSize: 12, color: COULEURS.gris400 }}>
              Vous avez effectué un paiement ? Déclarez-le avec sa preuve, BET le vérifiera.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.3fr 110px 100px 90px', padding: '9px 20px', background: COULEURS.gris50, fontSize: 10, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Date</span><span>Montant</span><span>Mode</span><span>Référence</span><span>Statut</span><span>Preuve</span><span>Reçu</span>
            </div>
            {paiements.map(p => (
              <div key={p.id} onClick={() => setPaiementDetail(p)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.3fr 110px 100px 90px', padding: '12px 20px', borderTop: `1px solid ${COULEURS.gris100}`, fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: COULEURS.gris600 }}>{p.date}</span>
                <span style={{ fontWeight: 700, color: estVerse(p) ? '#059669' : COULEURS.gris600 }}>{fmtFCFA(p.montant)}</span>
                <span style={{ color: COULEURS.gris600 }}>{MODES_PAIEMENT_LIB[p.mode] || p.mode || '-'}</span>
                <span style={{ color: COULEURS.gris600, fontSize: 12 }}>{p.reference || '-'}</span>
                <span><BadgeStatutVersement statut={p.statut} compact /></span>
                <span onClick={e => e.stopPropagation()}><VignettesPreuves preuves={p.preuves} taille={30} /></span>
                {/* Un reçu n'a de sens que pour un versement vérifié : l'imprimer
                    sur une déclaration en attente produirait une pièce comptable
                    pour de l'argent que BET n'a pas confirmé avoir reçu. */}
                {estVerse(p) ? (
                  <button onClick={e => { e.stopPropagation(); genererRecuVersement(p, entreprise, { montantContrat, soldeRestant }); }}
                    title="Imprimer le reçu"
                    style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${couleurEnt}`, background: COULEURS.blanc, color: couleurEnt, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', width: 'fit-content' }}>
                    🖨️ Imprimer
                  </button>
                ) : <span style={{ fontSize: 11, color: COULEURS.gris400 }}>—</span>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Historique des contrats */}
      {contratsHistorique?.length > 0 && (
        <div style={{ background: COULEURS.blanc, borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}`, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📚 Historique des contrats ({contratsHistorique.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contratsHistorique.map(c => {
              const cfgC = STATUT_CONTRAT_LIB_LOCAL[c.statut] || STATUT_CONTRAT_LIB_LOCAL.expire;
              return (
                <div key={c.id} style={{ background: COULEURS.gris50, border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy }}>Package {c.package || '-'}</span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, background: cfgC.bg, color: cfgC.txt, fontSize: 10, fontWeight: 700 }}>{cfgC.lib}</span>
                  </div>
                  <div style={{ fontSize: 11, color: COULEURS.gris600 }}>
                    {fmtDateFr(c.date_debut)} → {fmtDateFr(c.date_fin)} · {c.nb_licences || 0} bénéficiaires · {fmtFCFA(c.montant_ht)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modale détail versement (lecture seule) */}
      {paiementDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150 }} onClick={() => setPaiementDetail(null)}>
          <div style={{ background: COULEURS.blanc, borderRadius: 16, width: 460, maxWidth: '94vw', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: `linear-gradient(135deg, ${couleurEnt}CC, ${couleurEnt})`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>💰 Détail du versement</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{nomEntreprise}</div>
              </div>
              <button onClick={() => setPaiementDetail(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 12px' }}>
                <span style={{ fontSize: 12, color: COULEURS.gris600 }}>Statut</span>
                <BadgeStatutVersement statut={paiementDetail.statut} />
              </div>
              {[
                { lbl: 'Montant', val: fmtFCFA(paiementDetail.montant) },
                { lbl: 'Date du versement', val: paiementDetail.date },
                { lbl: 'Mode de paiement', val: MODES_PAIEMENT_LIB[paiementDetail.mode] || paiementDetail.mode || '-' },
                { lbl: 'Référence', val: paiementDetail.reference || '-' },
                { lbl: 'Note', val: paiementDetail.note || '-' },
                ...(paiementDetail.declare_par_nom ? [{ lbl: 'Déclaré par', val: paiementDetail.declare_par_nom }] : []),
                ...(paiementDetail.statut === 'recu' && paiementDetail.valide_par_nom
                  ? [{ lbl: 'Validé par', val: paiementDetail.valide_par_nom }] : []),
              ].map(({ lbl, val }) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${COULEURS.gris100}`, fontSize: 13 }}>
                  <span style={{ color: COULEURS.gris600 }}>{lbl}</span>
                  <span style={{ fontWeight: 700, color: COULEURS.navy }}>{val}</span>
                </div>
              ))}

              {/* Le motif du rejet, écrit en toutes lettres : sans lui le RH
                  redéclare à l'identique et la même pièce revient en boucle. */}
              {paiementDetail.statut === 'rejete' && paiementDetail.motif_rejet && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>⚠️ Motif du rejet</div>
                  <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.5 }}>{paiementDetail.motif_rejet}</div>
                </div>
              )}

              {(paiementDetail.preuves || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Justificatifs ({paiementDetail.preuves.length})
                  </div>
                  <VignettesPreuves preuves={paiementDetail.preuves} taille={40} vertical />
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setPaiementDetail(null)} style={{ padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
              {estVerse(paiementDetail) && (
                <button onClick={() => genererRecuVersement(paiementDetail, entreprise, { montantContrat, soldeRestant })} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: couleurEnt, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  🖨️ Imprimer le reçu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalDeclaration && (
        <ModalDeclarationVersement
          couleurEnt={couleurEnt}
          nomEntreprise={nomEntreprise}
          soldeRestant={soldeRestant}
          onFermer={() => setModalDeclaration(false)}
          onDeclare={() => { setModalDeclaration(false); recharger(); }}
        />
      )}
    </div>
  );
}

/**
 * Déclaration d'un versement par le RH de l'entreprise.
 *
 * Les pièces partent À LA SÉLECTION, pas à la validation du formulaire : le RH
 * voit immédiatement si son PDF est passé, et l'envoi du formulaire ne porte
 * plus que des URL déjà obtenues - une déclaration ne peut donc pas être
 * enregistrée en référençant une pièce dont l'envoi a échoué.
 */
function ModalDeclarationVersement({ couleurEnt, nomEntreprise, soldeRestant, onFermer, onDeclare }) {
  const alerte = useAlerte();
  const confirm = useConfirm();
  const [form, setForm] = useState({ montant: '', date: new Date().toISOString().slice(0, 10), mode: 'virement', reference: '', note: '' });
  const [preuves, setPreuves] = useState([]);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  const MAX_MO = 5;   // la limite de multer côté backend (entreprise.js)

  async function ajouterFichiers(e) {
    const fichiers = Array.from(e.target.files || []);
    e.target.value = '';   // permet de resélectionner le même fichier après un retrait
    if (fichiers.length === 0) return;

    setEnvoiEnCours(true);
    for (const f of fichiers) {
      if (f.size > MAX_MO * 1024 * 1024) {
        await alerte(`« ${f.name} » dépasse ${MAX_MO} Mo. Compressez le fichier ou envoyez une photo de moins bonne définition.`, { titre: 'Fichier trop lourd', danger: true });
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('preuve', f);
        const r = await fetch(`${API_URL}/api/entreprise/elearning/preuve-paiement`, { method: 'POST', headers: authHeaders(), body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Envoi impossible');
        setPreuves(prev => [...prev, d.preuve]);
      } catch (err) {
        await alerte(`« ${f.name} » n'a pas pu être envoyé : ${err.message}`, { titre: 'Pièce jointe refusée', danger: true });
      }
    }
    setEnvoiEnCours(false);
  }

  const montantNum = Number(form.montant) || 0;
  const pretAEnvoyer = montantNum > 0 && form.date && preuves.length > 0 && !envoiEnCours && !enregistrement;

  async function envoyer() {
    if (!pretAEnvoyer) return;
    const ok = await confirm(
      `Déclarer un versement de ${fmtFCFA(montantNum)} avec ${preuves.length} justificatif${preuves.length > 1 ? 's' : ''} ?\n\nBET vérifiera vos pièces avant de l'enregistrer sur votre contrat.`,
      { titre: 'Confirmer la déclaration', confirmLabel: 'Déclarer le versement', danger: false }
    );
    if (!ok) return;

    setEnregistrement(true);
    try {
      const r = await fetch(`${API_URL}/api/entreprise/elearning/mes-paiements`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, montant: montantNum, preuves }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Déclaration impossible');
      await alerte('Votre versement a été déclaré. BET vérifiera vos justificatifs et vous serez notifié dès validation.', { titre: '✅ Déclaration envoyée' });
      onDeclare();
    } catch (err) {
      await alerte(err.message, { titre: 'Déclaration impossible', danger: true });
      setEnregistrement(false);
    }
  }

  const styleChamp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', boxSizing: 'border-box', outline: 'none' };
  const styleLabel = { fontSize: 10, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150, padding: 20 }} onClick={onFermer}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: COULEURS.blanc, borderRadius: 16, width: 560, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

        <div style={{ background: `linear-gradient(135deg, ${couleurEnt}CC, ${couleurEnt})`, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>💳 Déclarer un versement</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 3 }}>
              {nomEntreprise}{soldeRestant > 0 ? ` · solde restant ${fmtFCFA(soldeRestant)}` : ''}
            </div>
          </div>
          <button onClick={onFermer} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={styleLabel}>Montant versé (FCFA) *</label>
              <input type="number" min="1" value={form.montant} placeholder="ex : 950 000"
                onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} style={styleChamp} />
            </div>
            <div>
              <label style={styleLabel}>Date du versement *</label>
              <input type="date" value={form.date} max={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={styleChamp} />
            </div>
            <div>
              <label style={styleLabel}>Mode de paiement</label>
              <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))} style={{ ...styleChamp, background: '#fff' }}>
                {Object.entries(MODES_PAIEMENT_LIB).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={styleLabel}>Référence</label>
              <input type="text" value={form.reference} placeholder="ex : VIR-2026-087"
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={styleChamp} />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={styleLabel}>Commentaire</label>
            <textarea rows={2} value={form.note} placeholder="Précision utile à la vérification (banque émettrice, échéance concernée…)"
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ ...styleChamp, resize: 'vertical' }} />
          </div>

          {/* Les justificatifs */}
          <div style={{ border: `1.5px dashed ${preuves.length ? '#86EFAC' : COULEURS.gris200}`, background: preuves.length ? '#F0FDF4' : COULEURS.gris50, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>
              📎 Preuves de paiement *
            </div>
            <div style={{ fontSize: 11, color: COULEURS.gris600, marginBottom: 12 }}>
              Ordre de virement, avis de débit, reçu… · JPG, PNG ou PDF · {MAX_MO} Mo maximum par fichier
            </div>

            {preuves.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
                {preuves.map((p, i) => (
                  <div key={p.url + i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 8, padding: '7px 10px' }}>
                    {(p.type || '').startsWith('image/')
                      ? <img src={p.url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ fontSize: 18, width: 32, textAlign: 'center', flexShrink: 0 }}>📄</span>}
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                    <span style={{ fontSize: 10, color: COULEURS.gris400, flexShrink: 0 }}>{Math.round((p.taille || 0) / 1024)} Ko</span>
                    <button onClick={() => setPreuves(prev => prev.filter((_, j) => j !== i))} title="Retirer"
                      style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 15, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${couleurEnt}`, background: COULEURS.blanc, color: couleurEnt, fontSize: 12, fontWeight: 700, cursor: envoiEnCours ? 'wait' : 'pointer' }}>
              {envoiEnCours ? '⏳ Envoi en cours…' : (preuves.length ? '+ Ajouter une autre pièce' : '+ Joindre une pièce')}
              <input type="file" accept="image/*,application/pdf" multiple disabled={envoiEnCours}
                onChange={ajouterFichiers} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: COULEURS.gris400 }}>
            {preuves.length === 0 ? 'Une pièce justificative au moins est requise.' : 'BET vérifiera vos pièces avant validation.'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onFermer} style={{ padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
            <button onClick={envoyer} disabled={!pretAEnvoyer}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: pretAEnvoyer ? couleurEnt : COULEURS.gris200, color: '#fff', cursor: pretAEnvoyer ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif', whiteSpace: 'nowrap' }}>
              {enregistrement ? '⏳ Envoi…' : '✅ Déclarer le versement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

const CHEMIN_VERS_ONGLET = {
  '/entreprise/dashboard':     'tableau_bord',
  '/entreprise/beneficiaires': 'beneficiaires',
  '/entreprise/inscription':   'inscriptions',
  '/entreprise/rapports':      'rapports',
  '/entreprise/paiements':     'paiements',
  '/entreprise/acces':         'acces',
};


export default function DashboardEntreprise() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile, connexionReel } = useAuth();
  const location    = useLocation();
  const alerte = useAlerte();

  const ongletActif = CHEMIN_VERS_ONGLET[location.pathname] || 'tableau_bord';

  // ── État données réelles ──────────────────────────────────────
  const [entreprise,        setEntreprise]        = useState(null);
  const [contratEnt,        setContratEnt]        = useState(null);
  const [contratsHistoriqueEnt, setContratsHistoriqueEnt] = useState([]);
  const [apprenants,        setApprenants]        = useState([]);
  const [groupes,           setGroupes]           = useState([]);
  const [classes,           setClasses]           = useState([]);
  const [sessions,          setSessions]          = useState([]);
  const [presences,         setPresences]         = useState([]);
  const [notes,             setNotes]             = useState([]);
  const [inscriptionsPend,  setInscriptionsPend]  = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [notifsDismissed,   setNotifsDismissed]   = useState(() => localStorage.getItem('bet_notif_actifs_dismissed') === 'true');
  const [uploadingLogo,     setUploadingLogo]     = useState(false);
  const logoInputRef = useRef(null);

  // Recharger les inscriptions en attente (appelé aussi depuis OngletInscriptions après soumission)
  function rechargerInscriptions(entId) {
    if (!entId) return;
    fetch(`${API_URL}/api/inscriptions-elearning?entreprise_id=${entId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setInscriptionsPend(d.inscriptions || []))
      .catch(() => {});
  }

  // ── Chargement des données au montage ────────────────────────
  useEffect(() => {
    async function chargerDonnees() {
      setLoading(true);
      try {
        const [compteRes, benefRes, groupesRes, classesRes] = await Promise.all([
          fetch(`${API_URL}/api/entreprise/elearning/mon-compte`,    { headers: authHeaders() }),
          fetch(`${API_URL}/api/entreprise/elearning/beneficiaires`, { headers: authHeaders() }),
          fetch(`${API_URL}/api/entreprise/elearning/groupes`,       { headers: authHeaders() }),
          fetch(`${API_URL}/api/entreprise/elearning/mes-classes`,   { headers: authHeaders() }),
        ]);

        if (compteRes.ok) {
          const d = await compteRes.json();
          setEntreprise(d.entreprise || null);
          setContratEnt(d.contrat   || null);
          setContratsHistoriqueEnt(d.contratsHistorique || []);
          if (d.entreprise?.logo_url && profile) {
            connexionReel({ ...profile, logo_url: d.entreprise.logo_url });
          }
        }
        if (benefRes.ok) {
          const d = await benefRes.json();
          setApprenants(d.beneficiaires || []);
        }
        if (groupesRes.ok) {
          const d = await groupesRes.json();
          setGroupes(d.groupes || []);
        }
        if (classesRes.ok) {
          const d = await classesRes.json();
          setClasses(d.classes || []);
        }
        // Inscriptions en attente (parcours e-learning)
        const entIdLocal = profile?.entreprise_id || null;
        if (entIdLocal) {
          fetch(`${API_URL}/api/inscriptions-elearning?entreprise_id=${entIdLocal}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setInscriptionsPend(d.inscriptions || []))
            .catch(() => {});
        }
      } catch (err) {
        console.error("Erreur chargement entreprise:", err);
      } finally {
        setLoading(false);
      }
    }
    chargerDonnees();
  }, []);

  const nomEntreprise   = entreprise?.nom    || profile?.nom_entreprise || 'Mon Entreprise';
  const couleurEnt      = entreprise?.couleur || '#0891B2';
  const couleurEntFonce = couleurEnt + 'CC';
  const initialesEnt    = entreprise?.initiales || nomEntreprise.slice(0, 2).toUpperCase();
  const entId           = entreprise?.id || profile?.entreprise_id || null;

  const actifs    = apprenants.filter(a => a.statut === 'actif');
  const certifies = apprenants.filter(a => a.statut === 'termine' || a.statut === 'certifie');
  const enAttente = apprenants.filter(a => a.statut === 'en_attente' || a.statut === 'suspendu');

  const tauxActivation = apprenants.length > 0
    ? Math.round((actifs.length / apprenants.length) * 100)
    : 0;

  const nbInscriptionsPend = inscriptionsPend.filter(x => ['recu','verifie','transmis_placement','teste'].includes(x.statut)).length;

  const stats = [
    { label: 'Bénéficiaires actifs', valeur: actifs.length,            couleur: COULEURS.succes },
    { label: 'En cours de parcours', valeur: nbInscriptionsPend,       couleur: couleurEnt },
    { label: 'Certifiés',            valeur: certifies.length,          couleur: '#A78BFA' },
    { label: 'Taux activation',      valeur: `${tauxActivation}%`,     couleur: COULEURS.attention },
  ];

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !entreprise?.id) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/entreprise/elearning/update-logo`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur upload');
      setEntreprise(prev => ({ ...prev, logo_url: d.logo_url }));
      if (profile) connexionReel({ ...profile, logo_url: d.logo_url });
    } catch (err) {
      await alerte('Erreur upload : ' + err.message, { danger: true });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  if (loading) {
    return (
      <TopNavLayout stats={[]}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16 }}>
          <div style={{ width:40, height:40, border:`3px solid #e2e8f0`, borderTop:`3px solid ${couleurEnt}`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <div style={{ fontSize:14, color:'#64748b' }}>Chargement de votre espace entreprise…</div>
        </div>
      </TopNavLayout>
    );
  }

  return (
    <TopNavLayout stats={stats}>
      <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>

        {/* ── Notification : tous les bénéficiaires actifs ── */}
        {!notifsDismissed && enAttente.length === 0 && actifs.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #065F46, #059669)',
            borderRadius: 14, padding: '16px 24px', marginBottom: 24,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: '0 4px 16px rgba(5,150,105,0.3)',
          }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 32 }}>🎉</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                  {actifs.length} bénéficiaire{actifs.length > 1 ? 's' : ''} actif{actifs.length > 1 ? 's' : ''} sur la plateforme
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                  ✉️ Un email de confirmation a été envoyé à chaque bénéficiaire. Ils ont maintenant accès complet à leurs cours et sessions live.
                </div>
              </div>
            </div>
            <button onClick={() => { setNotifsDismissed(true); localStorage.setItem('bet_notif_actifs_dismissed', 'true'); }} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', flexShrink: 0 }}>
              OK ✓
            </button>
          </div>
        )}

        {/* ── Alerte bénéficiaires en attente ── */}
        {enAttente.length > 0 && (
          <div style={{
            background: '#FEF3C7', border: '1px solid #FDE68A',
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: '#92400E',
          }}>
            <span style={{ fontSize: 20 }}>⏳</span>
            <span>
              <strong>{enAttente.length} bénéficiaire{enAttente.length > 1 ? 's' : ''}</strong> en attente d'assignation de groupe. L'équipe BET traite les dossiers sous 48h ouvrées.
            </span>
          </div>
        )}

        {/* ── Bannière entreprise ── */}
        <div style={{
          background: `linear-gradient(135deg, ${couleurEnt} 0%, ${couleurEntFonce} 100%)`,
          borderRadius: 16, padding: '24px 32px', marginBottom: 28,
          color: COULEURS.blanc, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: `0 8px 32px ${couleurEnt}40`,
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{nomEntreprise} × BET</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Programme d'anglais pour {apprenants.length} bénéficiaire{apprenants.length !== 1 ? 's' : ''} · {entreprise?.ville || 'Côte d\'Ivoire'}
            </div>
          </div>

          {/* Logo cliquable - mise à jour par le RH */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              title="Changer le logo de l'entreprise"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
              style={{
                width: 70, height: 70, background: 'rgba(255,255,255,0.15)',
                borderRadius: 16, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff',
                cursor: 'pointer', overflow: 'hidden', position: 'relative',
                border: '2px solid rgba(255,255,255,0.3)',
              }}
            >
              {uploadingLogo ? (
                <span style={{ fontSize: 24 }}>⏳</span>
              ) : entreprise?.logo_url ? (
                <img src={entreprise.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                initialesEnt
              )}
              {/* Overlay au survol */}
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.2s', borderRadius: 14, gap: 2,
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
              >
                <span style={{ fontSize: 18 }}>📷</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2 }}>Modifier</span>
              </div>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
          </div>
        </div>

        {/* ── Contenu par onglet ── */}
        {ongletActif === 'tableau_bord' && (
          <OngletTableauBord
            apprenants={apprenants}
            groupes={groupes}
            sessions={sessions}
            presences={presences}
            notes={notes}
            entId={entId}
            couleurEnt={couleurEnt}
            contrat={contratEnt}
            contratsHistorique={contratsHistoriqueEnt}
          />
        )}

        {ongletActif === 'beneficiaires' && (
          <OngletBeneficiaires apprenants={apprenants} groupes={groupes} classes={classes} couleurEnt={couleurEnt} />
        )}

        {ongletActif === 'inscriptions' && (
          <OngletInscriptions
            entrepriseId={entId}
            entrepriseNom={nomEntreprise}
            onInscriptionAjoutee={() => rechargerInscriptions(entId)}
          />
        )}

        {ongletActif === 'rapports' && (
          <OngletRapports
            apprenants={apprenants}
            classes={classes}
            entId={entId}
            nomEntreprise={nomEntreprise}
          />
        )}

        {ongletActif === 'acces' && (
          <OngletAcces classes={classes} />
        )}

        {ongletActif === 'paiements' && (
          <OngletPaiementsEntreprise couleurEnt={couleurTheme} contrat={contratEnt} contratsHistorique={contratsHistoriqueEnt} nomEntreprise={nomEntreprise} entreprise={entreprise} />
        )}

      </div>
    </TopNavLayout>
  );
}
