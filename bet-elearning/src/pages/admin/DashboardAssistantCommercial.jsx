import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlerte } from '../../contexts/ConfirmContext';
import { ModalSoumissionParcours } from './GestionEntreprises';
import { chargerPackages } from '../../constants/packagesCommerciaux';
import { OngletEntreprises } from './DashboardAdminShared';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
function authHeaders() {
  const t = localStorage.getItem('admin_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, 'X-Plateforme': 'bet-elearning' };
}

// ── Couleur accent du pôle commercial ────────────────────────────────────────
const VERT = '#10B981';
const VERT_CLAIR = '#D1FAE5';
const VERT_FONCE = '#065F46';
const ORANGE = '#F97316';
const ORANGE_CLAIR = '#FEF3C7';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMontant(val) {
  const v = Number(val) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)} M FCFA`;
  if (v >= 1000)    return `${(v / 1000).toFixed(0)} K FCFA`;
  return `${v} FCFA`;
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Statuts réels de public.contrats_entreprises_elearning (voir Backend/sql/entreprises_elearning_migration.sql)
const STATUTS_CONTRAT = {
  brouillon: { lib: 'Brouillon',  couleur: '#94A3B8', fond: '#F1F5F9' },
  actif:     { lib: 'Actif',      couleur: '#10B981', fond: '#D1FAE5' },
  suspendu:  { lib: 'Suspendu',   couleur: '#F97316', fond: '#FEF3C7' },
  expire:    { lib: 'Expiré',     couleur: '#DC2626', fond: '#FEE2E2' },
  resilie:   { lib: 'Résilié',    couleur: '#64748B', fond: '#F1F5F9' },
};

// Statuts réels de public.demandes_devis (Backend/src/routes/devis.js) - 'nouveau' par défaut,
// les autres valeurs peuvent apparaître si le statut est mis à jour ailleurs plus tard.
const STATUTS_DEVIS = {
  nouveau:  { lib: 'Nouveau',  couleur: '#0891B2', fond: '#E0F2FE' },
  traite:   { lib: 'Traité',   couleur: '#10B981', fond: '#D1FAE5' },
  refuse:   { lib: 'Refusé',   couleur: '#DC2626', fond: '#FEE2E2' },
};

// Statuts réels des demandes B2B pré-inscription (assignations_parcours / demandes_entreprise),
// mêmes valeurs que le dashboard Commercial (dash) - voir CommercialDashboard.jsx "B2B_STATUT"
const STATUTS_DEMANDE = {
  en_attente: { lib: 'Nouvelle demande', couleur: '#D97706', fond: '#FEF3C7', icone: '🆕' },
  en_cours:   { lib: 'En contact',       couleur: '#0891B2', fond: '#E0F2FE', icone: '📞' },
  converti:   { lib: 'Contrat signé',    couleur: '#16A34A', fond: '#DCFCE7', icone: '✅' },
  perdu:      { lib: 'Perdu',            couleur: '#DC2626', fond: '#FEE2E2', icone: '❌' },
};
const TYPE_DEMANDE = {
  devis:      { lib: 'Demande de devis',    couleur: '#7C3AED', fond: '#EDE9FE' },
  simulateur: { lib: 'Simulateur détaillé', couleur: '#0891B2', fond: '#E0F2FE' },
  web:        { lib: 'Formulaire web',      couleur: '#64748B', fond: '#F1F5F9' },
};

const S_MODAL = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal:   { background: COULEURS.blanc, borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' },
  header:  { padding: '18px 24px', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  titre:   { fontSize: 17, fontWeight: 800, color: COULEURS.navy },
  sous:    { fontSize: 12, color: COULEURS.gris400, marginTop: 2 },
  btnX:    { background: COULEURS.gris100, border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: COULEURS.gris600 },
  corps:   { flex: 1, overflowY: 'auto', padding: 24 },
  section: { marginBottom: 20 },
  label:   { fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 },
  grille2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  groupe:  { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
  champLabel: { fontSize: 11, fontWeight: 700, color: COULEURS.gris600 },
  input:   { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
  select:  { padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', background: COULEURS.blanc, color: COULEURS.navy, width: '100%', boxSizing: 'border-box' },
  textarea:{ padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', color: COULEURS.navy, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 70 },
  carte:   { background: COULEURS.gris50, borderRadius: 10, padding: 14, border: `1px solid ${COULEURS.gris100}` },
  footer:  { padding: '14px 24px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'flex-end', gap: 10 },
  btnAnn:  { padding: '9px 18px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
  btnSauv: { padding: '9px 22px', borderRadius: 8, border: 'none', background: VERT, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
};

// ── Modale détail d'une demande reçue ─────────────────────────────────────────
function ModalDetailDemande({ demande, onFermer, onChangerStatut, majEnCours, onSauvegarderNote, noteSauvegarde, onFinaliser }) {
  const [note, setNote] = useState(demande.notes_commercial || '');
  const type = TYPE_DEMANDE[demande.type_demande] || TYPE_DEMANDE.web;

  return (
    <div style={S_MODAL.overlay} onClick={onFermer}>
      <div style={S_MODAL.modal} onClick={e => e.stopPropagation()}>
        <div style={S_MODAL.header}>
          <div>
            <div style={S_MODAL.titre}>🏢 {demande.entreprise || demande.contact}</div>
            <div style={S_MODAL.sous}>Reçue le {formatDate(demande.date_reception)}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <span style={S_MODAL.badgeInline || {}}>{type.lib}</span>
            </div>
          </div>
          <button style={S_MODAL.btnX} onClick={onFermer}>×</button>
        </div>
        <div style={S_MODAL.corps}>
          <div style={S_MODAL.section}>
            <div style={S_MODAL.label}>Contact</div>
            <div style={S_MODAL.carte}>
              <div style={{ fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>{demande.contact}</div>
              <div style={{ fontSize: 12, color: COULEURS.gris600 }}>✉️ {demande.email}</div>
              <div style={{ fontSize: 12, color: COULEURS.gris600 }}>📞 {demande.telephone || '-'}</div>
              <div style={{ fontSize: 12, color: COULEURS.gris600, marginTop: 4 }}>🏭 {demande.secteur || '-'} · 👥 {demande.nb_employes || '-'} employés</div>
            </div>
          </div>

          {(demande.niveau_actuel || demande.niveau_cible) && (
            <div style={S_MODAL.section}>
              <div style={S_MODAL.label}>Niveaux CECRL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={S_MODAL.carte}>{demande.niveau_actuel || '-'}</div>
                <span>→</span>
                <div style={{ ...S_MODAL.carte, borderColor: VERT, color: VERT_FONCE, fontWeight: 700 }}>{demande.niveau_cible || '-'}</div>
              </div>
            </div>
          )}

          {Array.isArray(demande.objectifs) && demande.objectifs.length > 0 && (
            <div style={S_MODAL.section}>
              <div style={S_MODAL.label}>Objectifs de formation</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {demande.objectifs.map((o, i) => (
                  <span key={i} style={{ padding: '4px 10px', borderRadius: 20, background: '#EDE9FE', color: '#7C3AED', fontSize: 12, fontWeight: 600 }}>{o}</span>
                ))}
              </div>
            </div>
          )}

          {(demande.format_souhaite || demande.rythme_souhaite || demande.groupe || demande.nb_participants || demande.duree_semaines) && (
            <div style={S_MODAL.section}>
              <div style={S_MODAL.label}>Modalités de formation</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                {demande.format_souhaite && <div style={S_MODAL.carte}><div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700 }}>FORMAT</div>{demande.format_souhaite}</div>}
                {demande.rythme_souhaite && <div style={S_MODAL.carte}><div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700 }}>RYTHME</div>{demande.rythme_souhaite}</div>}
                {demande.groupe && <div style={S_MODAL.carte}><div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700 }}>TYPE DE GROUPE</div>{demande.groupe}</div>}
                {demande.nb_participants && <div style={S_MODAL.carte}><div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700 }}>PARTICIPANTS</div>{demande.nb_participants}</div>}
                {demande.duree_semaines && <div style={S_MODAL.carte}><div style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 700 }}>DURÉE</div>{demande.duree_semaines} semaines</div>}
              </div>
            </div>
          )}

          {demande.centre_nom && (
            <div style={S_MODAL.section}>
              <div style={S_MODAL.label}>Centre présentiel</div>
              <div style={S_MODAL.carte}>{demande.centre_nom} {demande.centre_adresse ? `- ${demande.centre_adresse}` : ''}</div>
            </div>
          )}

          <div style={S_MODAL.section}>
            <div style={S_MODAL.label}>Avancement du dossier</div>
            {demande.statut === 'converti' ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#DCFCE7', border: '1px solid #86EFAC', color: '#166534', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                🔒 ✅ Contrat signé - dossier transmis à l'admin BET pour validation, le statut ne peut plus être modifié ici.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(STATUTS_DEMANDE).map(([k, cfg]) => (
                  <button
                    key={k}
                    disabled={majEnCours}
                    onClick={() => onChangerStatut(k)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, cursor: majEnCours ? 'not-allowed' : 'pointer',
                      border: demande.statut === k ? `2px solid ${cfg.couleur}` : `1px solid ${COULEURS.gris200}`,
                      background: demande.statut === k ? cfg.fond : COULEURS.gris50,
                      color: demande.statut === k ? cfg.couleur : COULEURS.gris600,
                      fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif',
                    }}
                  >
                    {cfg.icone} {cfg.lib}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={S_MODAL.section}>
            <div style={S_MODAL.label}>Notes / suivi</div>
            <textarea style={S_MODAL.textarea} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Ajoutez vos notes de suivi, informations sur l'entreprise, prochaines étapes…" />
            <button
              onClick={() => onSauvegarderNote(note)}
              style={{ marginTop: 8, padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              {noteSauvegarde ? '✓ Note enregistrée' : 'Enregistrer la note'}
            </button>
          </div>
        </div>
        <div style={S_MODAL.footer}>
          <button style={S_MODAL.btnAnn} onClick={onFermer}>Fermer</button>
          {demande.statut === 'converti' ? (
            <span style={{ padding: '9px 16px', fontSize: 12, fontWeight: 700, color: '#166534' }}>✅ Déjà transmis à l'admin BET</span>
          ) : (
            <button style={S_MODAL.btnSauv} onClick={onFinaliser}>🏢 Finaliser l'inscription</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function DashboardAssistantCommercial() {
  const { couleurTheme } = useTheme();
  const { profile } = useAuth();
  const alerte = useAlerte();
  const location = useLocation();
  const [onglet, setOnglet]           = useState('demandes');
  const [contrats, setContrats]       = useState([]);
  const [devis, setDevis]             = useState([]);
  const [demandesRecues, setDemandesRecues] = useState([]);
  const [chargement, setChargement]   = useState(true);
  const [filtreEtape, setFiltreEtape] = useState('tous');
  const [filtreDemande, setFiltreDemande] = useState('tous');
  const [filtreDateDebutDevis, setFiltreDateDebutDevis] = useState('');
  const [filtreDateFinDevis,   setFiltreDateFinDevis]   = useState('');
  const [pageDevis, setPageDevis] = useState(1);
  const [majStatutId, setMajStatutId] = useState(null);
  const [detailDemande, setDetailDemande]     = useState(null);
  const [noteSauvegardeOk, setNoteSauvegardeOk] = useState(false);
  const [finaliserDemande, setFinaliserDemande] = useState(null);
  const [finalisationEnCours, setFinalisationEnCours] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token');
    if (t) chargerPackages(t);
  }, []);

  useEffect(() => {
    setChargement(true);
    Promise.all([
      fetch(`${API_URL}/api/entreprise/admin/contrats`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { contrats: [] }).catch(() => ({ contrats: [] })),
      fetch(`${API_URL}/api/devis/admin/liste`,          { headers: authHeaders() }).then(r => r.ok ? r.json() : { devis: [] }).catch(() => ({ devis: [] })),
      fetch(`${API_URL}/api/entreprise/mes-demandes`,     { headers: authHeaders() }).then(r => r.ok ? r.json() : { demandes: [] }).catch(() => ({ demandes: [] })),
    ]).then(([d1, d2, d3]) => {
      setContrats(d1.contrats || []);
      setDevis(d2.devis || []);
      setDemandesRecues(d3.demandes || []);
    }).finally(() => setChargement(false));
  }, []);

  // Modifie le statut d'une demande reçue - même logique que CommercialDashboard.jsx (dash) :
  // PATCH sur l'assignation si elle existe déjà, sinon PATCH par email sur demandes/suivi.
  async function majStatutDemande(demande, statut) {
    setMajStatutId(demande.email);
    try {
      const r = demande.assignation_id
        ? await fetch(`${API_URL}/api/parcours/assignations/${demande.assignation_id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ statut }),
          })
        : await fetch(`${API_URL}/api/entreprise/demandes/suivi`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ email: demande.email, statut }),
          });
      if (r.ok) {
        setDemandesRecues(prev => prev.map(d => d.email === demande.email ? { ...d, statut } : d));
        setDetailDemande(prev => prev && prev.email === demande.email ? { ...prev, statut } : prev);
      }
    } finally {
      setMajStatutId(null);
    }
  }

  async function sauvegarderNoteDemande(demande, notes) {
    try {
      const r = demande.assignation_id
        ? await fetch(`${API_URL}/api/parcours/assignations/${demande.assignation_id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ notes }),
          })
        : await fetch(`${API_URL}/api/entreprise/demandes/suivi`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ email: demande.email, notes_commercial: notes }),
          });
      if (r.ok) {
        setDemandesRecues(prev => prev.map(d => d.email === demande.email ? { ...d, notes_commercial: notes } : d));
        setNoteSauvegardeOk(true);
        setTimeout(() => setNoteSauvegardeOk(false), 2000);
      }
    } catch {}
  }

  // Soumet l'inscription pré-remplie à l'admin BET pour validation (même route que
  // GestionEntreprises.jsx) - puis marque la demande d'origine comme "convertie".
  async function finaliserInscription(form) {
    if (!form.nom) { await alerte('Le nom de l\'entreprise est requis.', { danger: true }); return; }
    setFinalisationEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/entreprise/admin/soumettre-parcours`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        await alerte(`Erreur ${r.status} : ${err.error || 'Impossible de soumettre l\'inscription'}`, { danger: true });
        return;
      }
      await majStatutDemande(finaliserDemande, 'converti');
      setFinaliserDemande(null);
      setDetailDemande(null);
      await alerte(`Inscription de "${form.nom}" soumise - en attente de validation par l'admin BET (onglet Entreprise Parcours).`);
    } catch {
      await alerte('Impossible de joindre le serveur.', { danger: true });
    } finally {
      setFinalisationEnCours(false);
    }
  }

  // KPIs réels
  const caActif        = contrats.filter(c => c.statut === 'actif').reduce((s, c) => s + (Number(c.montant_ht) || 0), 0);
  const caBrouillon     = contrats.filter(c => c.statut === 'brouillon').reduce((s, c) => s + (Number(c.montant_ht) || 0), 0);
  const nbClientsActifs = contrats.filter(c => c.statut === 'actif').length;
  const devisNouveaux   = devis.filter(d => (d.statut || 'nouveau') === 'nouveau').length;

  const contratsFiltres = filtreEtape === 'tous'
    ? contrats
    : contrats.filter(c => c.statut === filtreEtape);

  const demandesNouvelles = demandesRecues.filter(d => d.statut === 'en_attente').length;
  const demandesFiltrees = filtreDemande === 'tous'
    ? demandesRecues
    : demandesRecues.filter(d => d.statut === filtreDemande);

  const DEVIS_PAR_PAGE = 10;
  const devisFiltres = devis.filter(d => {
    if (!d.created_at) return !filtreDateDebutDevis && !filtreDateFinDevis;
    const jour = d.created_at.slice(0, 10);
    if (filtreDateDebutDevis && jour < filtreDateDebutDevis) return false;
    if (filtreDateFinDevis   && jour > filtreDateFinDevis)   return false;
    return true;
  });
  const devisNbPages  = Math.max(1, Math.ceil(devisFiltres.length / DEVIS_PAR_PAGE));
  const devisPageSafe = Math.min(pageDevis, devisNbPages);
  const devisPage      = devisFiltres.slice((devisPageSafe - 1) * DEVIS_PAR_PAGE, devisPageSafe * DEVIS_PAR_PAGE);

  const stats = [
    { label: 'CA actif',        valeur: formatMontant(caActif),    couleur: VERT },
    { label: 'En négociation',  valeur: formatMontant(caBrouillon), couleur: couleurTheme },
    { label: 'Clients actifs',  valeur: nbClientsActifs,            couleur: '#8B5CF6' },
    { label: 'Nouvelles demandes', valeur: demandesNouvelles,        couleur: ORANGE },
  ];

  // ── Données pour les courbes de la Synthèse commerciale ──
  const demandesParStatut = Object.entries(STATUTS_DEMANDE)
    .map(([k, cfg]) => ({ statut: cfg.lib, couleur: cfg.couleur, valeur: demandesRecues.filter(d => d.statut === k).length }))
    .filter(s => s.valeur > 0);

  const contratsParStatut = Object.entries(STATUTS_CONTRAT)
    .map(([k, cfg]) => ({ statut: cfg.lib, valeur: contrats.filter(c => c.statut === k).length }))
    .filter(s => s.valeur > 0);

  if (location.pathname === '/admin/commercial/entreprises') {
    return (
      <TopNavLayout stats={stats}>
        <div style={{ padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif', minHeight: '100%' }}>
          <OngletEntreprises />
        </div>
      </TopNavLayout>
    );
  }

  const S = {
    page: { padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif', minHeight: '100%' },
    entete: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
    pageTitre: { fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 },
    pageSous:  { fontSize: 13, color: COULEURS.gris400 },
    // Onglets
    onglets: {
      display: 'flex', gap: 4, marginBottom: 28,
      borderBottom: `2px solid ${COULEURS.gris200}`,
    },
    btnOnglet: (actif) => ({
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 18px', border: 'none', background: 'transparent',
      borderBottom: actif ? `2px solid ${VERT}` : '2px solid transparent',
      color: actif ? VERT : COULEURS.gris600,
      fontWeight: actif ? 700 : 500, fontSize: 13,
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      marginBottom: -2, cursor: 'pointer',
    }),
    // Kanban pipeline
    kanban: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 },
    colonneKanban: (couleur) => ({
      background: COULEURS.blanc, borderRadius: 12,
      border: `1px solid ${COULEURS.gris200}`,
      borderTop: `4px solid ${couleur}`,
      overflow: 'hidden',
    }),
    enteteColo: { padding: '12px 16px', borderBottom: `1px solid ${COULEURS.gris100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    coloTitre: { fontSize: 12, fontWeight: 700, color: COULEURS.navy, textTransform: 'uppercase', letterSpacing: '0.05em' },
    coloBadge: (couleur) => ({ background: couleur + '20', color: couleur, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }),
    carteKanban: { margin: '10px 12px', padding: '12px 14px', background: COULEURS.gris50, borderRadius: 10, border: `1px solid ${COULEURS.gris200}` },
    kanbanEntreprise: { fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 2 },
    kanbanContact:    { fontSize: 11, color: COULEURS.gris400, marginBottom: 8 },
    kanbanFooter:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    kanbanMontant:    { fontSize: 12, fontWeight: 700, color: VERT },
    // Tableau
    tableau: { background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}` },
    enteteTab: (cols) => ({
      display: 'grid', gridTemplateColumns: cols,
      padding: '11px 20px', background: COULEURS.gris50,
      borderBottom: `1px solid ${COULEURS.gris200}`,
      fontSize: 11, fontWeight: 700, color: COULEURS.gris600,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }),
    ligneTab: (cols) => ({
      display: 'grid', gridTemplateColumns: cols,
      padding: '14px 20px', borderBottom: `1px solid ${COULEURS.gris100}`,
      fontSize: 13, alignItems: 'center',
    }),
    badge: (c, f) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: f, color: c, fontSize: 11, fontWeight: 700 }),
    // Synthèse (ex-Objectifs)
    grilleObj: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 },
    carteObj: { background: COULEURS.blanc, borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}` },
    objLabel: { fontSize: 12, fontWeight: 600, color: COULEURS.gris600, marginBottom: 8 },
    objValeur: { fontSize: 22, fontWeight: 800, color: COULEURS.navy },
    // Activités
    carteActivite: { background: COULEURS.blanc, borderRadius: 12, padding: '0 0 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${COULEURS.gris200}` },
    ligneAct: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${COULEURS.gris50}` },
    actIcn: { width: 32, height: 32, borderRadius: '50%', background: VERT + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 },
    actTexte: { fontSize: 13, color: COULEURS.navy, flex: 1 },
    actHeure: { fontSize: 11, color: COULEURS.gris400, flexShrink: 0 },
    videEtat: { padding: '40px 20px', textAlign: 'center', color: COULEURS.gris400, fontSize: 13 },
    // Filtres pipeline
    filtrePipeline: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
    btnFiltre: (actif) => ({
      padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: actif ? 700 : 500,
      border: `1.5px solid ${actif ? VERT : COULEURS.gris200}`,
      background: actif ? VERT : COULEURS.blanc,
      color: actif ? '#fff' : COULEURS.gris600,
      cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif',
    }),
  };

  const ONGLETS_DEF = [
    { id: 'demandes',  lib: 'Demandes reçues', icone: '📥', badge: demandesNouvelles || null },
    { id: 'pipeline',  lib: 'Contrats', icone: '📊', badge: contrats.length },
    { id: 'devis',     lib: 'Demandes de devis', icone: '📋', badge: devis.length },
    { id: 'objectifs', lib: 'Synthèse', icone: '🎯' },
  ];

  return (
    <TopNavLayout stats={stats}>
      <div style={S.page}>

        {/* En-tête */}
        <div style={S.entete}>
          <div>
            <div style={S.pageTitre}>💼 Espace Commercial BET</div>
            <div style={S.pageSous}>
              {profile?.prenom} {profile?.nom} · Suivi des contrats & demandes entreprises
            </div>
          </div>
        </div>

        {/* Onglets */}
        <div style={S.onglets}>
          {ONGLETS_DEF.map(o => (
            <button key={o.id} style={S.btnOnglet(onglet === o.id)} onClick={() => setOnglet(o.id)}>
              <span>{o.icone}</span>
              <span>{o.lib}</span>
              {o.badge != null && (
                <span style={{
                  background: onglet === o.id ? VERT + '25' : COULEURS.gris100,
                  color: onglet === o.id ? VERT_FONCE : COULEURS.gris600,
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                }}>{o.badge}</span>
              )}
            </button>
          ))}
        </div>

        {chargement && <div style={S.videEtat}>⏳ Chargement…</div>}

        {/* ── DEMANDES REÇUES ──────────────────────────────────────────────── */}
        {!chargement && onglet === 'demandes' && (
          <>
            <div style={S.filtrePipeline}>
              <button style={S.btnFiltre(filtreDemande === 'tous')} onClick={() => setFiltreDemande('tous')}>
                Tous ({demandesRecues.length})
              </button>
              {Object.entries(STATUTS_DEMANDE).map(([k, v]) => {
                const nb = demandesRecues.filter(d => d.statut === k).length;
                if (!nb) return null;
                return (
                  <button key={k} style={S.btnFiltre(filtreDemande === k)} onClick={() => setFiltreDemande(k)}>
                    {v.icone} {v.lib} ({nb})
                  </button>
                );
              })}
            </div>

            {demandesFiltrees.length === 0 ? (
              <div style={S.videEtat}>Aucune demande entreprise reçue pour le moment.</div>
            ) : (
              <div style={S.tableau}>
                <div style={S.enteteTab('1.8fr 1.8fr 1.2fr 1fr 1fr')}>
                  <span>Entreprise</span>
                  <span>Contact</span>
                  <span>Type</span>
                  <span>Statut</span>
                  <span>Reçue le</span>
                </div>
                {demandesFiltrees.map(d => {
                  const st = STATUTS_DEMANDE[d.statut] || STATUTS_DEMANDE.en_attente;
                  const type = TYPE_DEMANDE[d.type_demande] || TYPE_DEMANDE.web;
                  return (
                    <div key={d.email + d.date_reception} style={{ ...S.ligneTab('1.8fr 1.8fr 1.2fr 1fr 1fr'), cursor: 'pointer' }} onClick={() => setDetailDemande(d)}>
                      <div>
                        <div style={{ fontWeight: 700, color: COULEURS.navy }}>{d.entreprise || '-'}</div>
                        <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{d.secteur || ''}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: COULEURS.navy }}>{d.contact}</div>
                        <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{d.email}</div>
                      </div>
                      <span style={S.badge(type.couleur, type.fond)}>{type.lib}</span>
                      <span style={S.badge(st.couleur, st.fond)}>{st.icone} {st.lib}</span>
                      <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{formatDate(d.date_reception)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CONTRATS ─────────────────────────────────────────────────────── */}
        {!chargement && onglet === 'pipeline' && (
          <>
            <div style={S.filtrePipeline}>
              <button style={S.btnFiltre(filtreEtape === 'tous')} onClick={() => setFiltreEtape('tous')}>
                Tous ({contrats.length})
              </button>
              {Object.entries(STATUTS_CONTRAT).map(([k, v]) => {
                const nb = contrats.filter(c => c.statut === k).length;
                if (!nb) return null;
                return (
                  <button key={k} style={S.btnFiltre(filtreEtape === k)} onClick={() => setFiltreEtape(k)}>
                    {v.lib} ({nb})
                  </button>
                );
              })}
            </div>

            {contratsFiltres.length === 0 ? (
              <div style={S.videEtat}>Aucun contrat pour le moment.</div>
            ) : (
              <>
                <div style={S.tableau}>
                  <div style={S.enteteTab('2fr 1.2fr 1fr 1fr 1fr 1fr')}>
                    <span>Entreprise</span>
                    <span>N° contrat</span>
                    <span>Statut</span>
                    <span>Montant HT</span>
                    <span>Licences</span>
                    <span>Échéance</span>
                  </div>
                  {contratsFiltres.map(c => {
                    const st = STATUTS_CONTRAT[c.statut] || STATUTS_CONTRAT.brouillon;
                    return (
                      <div key={c.id} style={S.ligneTab('2fr 1.2fr 1fr 1fr 1fr 1fr')}>
                        <div style={{ fontWeight: 700, color: COULEURS.navy }}>{c.entreprise?.nom || '-'}</div>
                        <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{c.numero_contrat || '-'}</span>
                        <span style={S.badge(st.couleur, st.fond)}>{st.lib}</span>
                        <span style={{ fontWeight: 700, color: VERT }}>{formatMontant(c.montant_ht)}</span>
                        <span>{c.nb_licences || 0}</span>
                        <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{formatDate(c.date_fin)}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, margin: '32px 0 16px' }}>
                  Vue par statut
                </div>
                <div style={S.kanban}>
                  {Object.entries(STATUTS_CONTRAT).map(([statutKey, cfg]) => {
                    const cartes = contrats.filter(c => c.statut === statutKey);
                    return (
                      <div key={statutKey} style={S.colonneKanban(cfg.couleur)}>
                        <div style={S.enteteColo}>
                          <span style={S.coloTitre}>{cfg.lib}</span>
                          <span style={S.coloBadge(cfg.couleur)}>{cartes.length}</span>
                        </div>
                        {cartes.length === 0 ? (
                          <div style={{ padding: '16px 12px', fontSize: 12, color: COULEURS.gris400, fontStyle: 'italic' }}>
                            Aucun contrat
                          </div>
                        ) : (
                          cartes.map(c => (
                            <div key={c.id} style={S.carteKanban}>
                              <div style={S.kanbanEntreprise}>{c.entreprise?.nom || '-'}</div>
                              <div style={S.kanbanContact}>{c.nb_licences || 0} licences</div>
                              <div style={S.kanbanFooter}>
                                <span style={S.kanbanMontant}>{formatMontant(c.montant_ht)}</span>
                                <span style={{ fontSize: 10, color: COULEURS.gris400 }}>{formatDate(c.date_fin)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── DEMANDES DE DEVIS ────────────────────────────────────────────── */}
        {!chargement && onglet === 'devis' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.gris600 }}>Du</span>
              <input
                type="date"
                value={filtreDateDebutDevis}
                onChange={e => { setFiltreDateDebutDevis(e.target.value); setPageDevis(1); }}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif', color: COULEURS.navy }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.gris600 }}>au</span>
              <input
                type="date"
                value={filtreDateFinDevis}
                onChange={e => { setFiltreDateFinDevis(e.target.value); setPageDevis(1); }}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif', color: COULEURS.navy }}
              />
              {(filtreDateDebutDevis || filtreDateFinDevis) && (
                <button
                  onClick={() => { setFiltreDateDebutDevis(''); setFiltreDateFinDevis(''); setPageDevis(1); }}
                  style={{ ...S.btnFiltre(false), border: 'none', color: COULEURS.gris400 }}
                >✕ Réinitialiser</button>
              )}
              <span style={{ fontSize: 12, color: COULEURS.gris400, marginLeft: 'auto' }}>
                {devisFiltres.length} demande{devisFiltres.length > 1 ? 's' : ''}
              </span>
            </div>

            {devisFiltres.length === 0 ? (
              <div style={S.videEtat}>Aucune demande de devis pour cette période.</div>
            ) : (
              <>
                <div style={S.tableau}>
                  <div style={S.enteteTab('1.5fr 1.5fr 1.5fr 0.8fr 1fr 1fr')}>
                    <span>Nom</span>
                    <span>Entreprise</span>
                    <span>Contact</span>
                    <span>Participants</span>
                    <span>Statut</span>
                    <span>Date</span>
                  </div>
                  {devisPage.map(d => {
                    const st = STATUTS_DEVIS[d.statut] || STATUTS_DEVIS.nouveau;
                    return (
                      <div key={d.id} style={S.ligneTab('1.5fr 1.5fr 1.5fr 0.8fr 1fr 1fr')}>
                        <span style={{ fontWeight: 700, color: COULEURS.navy }}>{d.nom}</span>
                        <span style={{ color: COULEURS.gris600 }}>{d.entreprise || '-'}</span>
                        <div>
                          <div style={{ fontSize: 12, color: COULEURS.navy }}>{d.email}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{d.tel}</div>
                        </div>
                        <span>{d.participants || '-'}</span>
                        <span style={S.badge(st.couleur, st.fond)}>{st.lib}</span>
                        <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{formatDate(d.created_at)}</span>
                      </div>
                    );
                  })}
                </div>

                {devisNbPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16 }}>
                    <button
                      disabled={devisPageSafe <= 1}
                      onClick={() => setPageDevis(devisPageSafe - 1)}
                      style={{ ...S.btnFiltre(false), opacity: devisPageSafe <= 1 ? 0.4 : 1, cursor: devisPageSafe <= 1 ? 'default' : 'pointer' }}
                    >‹ Précédent</button>
                    <span style={{ fontSize: 12, color: COULEURS.gris600 }}>Page {devisPageSafe} / {devisNbPages}</span>
                    <button
                      disabled={devisPageSafe >= devisNbPages}
                      onClick={() => setPageDevis(devisPageSafe + 1)}
                      style={{ ...S.btnFiltre(false), opacity: devisPageSafe >= devisNbPages ? 0.4 : 1, cursor: devisPageSafe >= devisNbPages ? 'default' : 'pointer' }}
                    >Suivant ›</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── SYNTHÈSE (ex-Objectifs) ─────────────────────────────────────── */}
        {!chargement && onglet === 'objectifs' && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 20 }}>
              🎯 Synthèse commerciale
            </div>
            <div style={S.grilleObj}>
              <div style={S.carteObj}>
                <div style={S.objLabel}>CA signé (contrats actifs)</div>
                <div style={{ ...S.objValeur, color: VERT }}>{formatMontant(caActif)}</div>
              </div>
              <div style={S.carteObj}>
                <div style={S.objLabel}>CA en négociation (brouillons)</div>
                <div style={S.objValeur}>{formatMontant(caBrouillon)}</div>
              </div>
              <div style={S.carteObj}>
                <div style={S.objLabel}>Clients actifs</div>
                <div style={S.objValeur}>{nbClientsActifs}</div>
              </div>
              <div style={S.carteObj}>
                <div style={S.objLabel}>Devis nouveaux</div>
                <div style={{ ...S.objValeur, color: ORANGE }}>{devisNouveaux}</div>
              </div>
            </div>

            {/* Courbes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
              <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📋 Répartition des demandes par statut</div>
                {demandesParStatut.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucune demande pour l'instant.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={demandesParStatut} dataKey="valeur" nameKey="statut" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {demandesParStatut.map((s, i) => <Cell key={i} fill={s.couleur} />)}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📄 Contrats par statut</div>
                {contratsParStatut.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucun contrat pour l'instant.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={contratsParStatut} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="statut" width={90} tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Bar dataKey="valeur" fill={couleurTheme} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 16 }}>
              Clients actifs - récapitulatif
            </div>
            {nbClientsActifs === 0 ? (
              <div style={S.videEtat}>Aucun client actif pour le moment.</div>
            ) : (
              <div style={S.tableau}>
                <div style={S.enteteTab('2fr 1fr 1fr 1fr')}>
                  <span>Entreprise</span>
                  <span>Licences</span>
                  <span>Valeur contrat</span>
                  <span>Échéance</span>
                </div>
                {contrats.filter(c => c.statut === 'actif').map(c => (
                  <div key={c.id} style={S.ligneTab('2fr 1fr 1fr 1fr')}>
                    <div style={{ fontWeight: 700, color: COULEURS.navy }}>{c.entreprise?.nom || '-'}</div>
                    <span>{c.nb_licences || 0}</span>
                    <span style={{ fontWeight: 700, color: VERT }}>{formatMontant(c.montant_ht)}</span>
                    <span style={{ fontSize: 12, color: COULEURS.gris600 }}>{formatDate(c.date_fin)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>

      {detailDemande && (
        <ModalDetailDemande
          demande={detailDemande}
          onFermer={() => setDetailDemande(null)}
          onChangerStatut={(statut) => majStatutDemande(detailDemande, statut)}
          majEnCours={majStatutId === detailDemande.email}
          onSauvegarderNote={(notes) => sauvegarderNoteDemande(detailDemande, notes)}
          noteSauvegarde={noteSauvegardeOk}
          onFinaliser={() => setFinaliserDemande(detailDemande)}
        />
      )}

      {finaliserDemande && (
        <ModalSoumissionParcours
          onFermer={() => setFinaliserDemande(null)}
          onSauvegarder={finaliserInscription}
          donneesInitiales={{
            nom: finaliserDemande.entreprise || '',
            ...(finaliserDemande.secteur ? { secteur: finaliserDemande.secteur } : {}),
            referent_rh_nom: finaliserDemande.contact || '',
            referent_rh_email: finaliserDemande.email || '',
            referent_rh_telephone: finaliserDemande.telephone || '',
            nb_licences: finaliserDemande.nb_participants || 10,
            notes: finaliserDemande.besoins || finaliserDemande.notes_commercial || '',
          }}
        />
      )}
    </TopNavLayout>
  );
}
