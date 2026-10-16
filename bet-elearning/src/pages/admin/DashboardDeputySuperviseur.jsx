import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { OngletMesTachesSuperviseur, OngletCahiersCoachs, OngletPlanningsElearning, OngletObserverCours } from './DashboardSuperviseur';

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const VIOLET = '#A855F7';
const VIOLET_CLAIR = '#F3E8FF';
const VIOLET_FONCE = '#6D28D9';

function authHdrs() {
  // admin_token uniquement (comme _authHdrsAdmin) : bet_access_token peut être le token d'une
  // session apprenant/professeur restée en cache dans le même navigateur, ce qui envoyait le
  // mauvais rôle au backend et déclenchait un 403 "Accès réservé aux superviseurs".
  const token = localStorage.getItem('admin_token') || '';
  // dash et bet-elearning partagent le même rôle DB pour le module Superviseur - ce header
  // est l'unique moyen pour le backend de savoir que la requête vient de bet-elearning.
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Plateforme': 'bet-elearning' };
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Composants utilitaires ────────────────────────────────────────────────────

function StatCard({ label, value, color, icon, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: `1.5px solid ${color}25`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function EtoileRating({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: i <= value ? '#F59E0B' : '#D1D5DB', padding: 0, lineHeight: 1 }}>★</button>
      ))}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 18, width: '90vw', height: '90vh', maxWidth: 'none', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: `linear-gradient(135deg,${VIOLET},${VIOLET_FONCE})`, borderRadius: '18px 18px 0 0', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

const STATUT_MISSION = {
  assignée:    { bg: '#DBEAFE', txt: '#1D4ED8', lib: 'Assignée' },
  en_cours:    { bg: '#FEF3C7', txt: '#D97706', lib: 'En cours' },
  terminée:    { bg: '#D1FAE5', txt: '#065F46', lib: 'Terminée' },
  annulée:     { bg: '#FEE2E2', txt: '#991B1B', lib: 'Annulée' },
};

const STATUT_RAPPORT = {
  soumis:        { bg: '#DBEAFE', txt: '#1D4ED8', lib: 'Soumis' },
  lu:            { bg: '#FEF3C7', txt: '#D97706', lib: 'Lu' },
  transmis_pa:   { bg: '#D1FAE5', txt: '#065F46', lib: 'Transmis PA' },
};

const RAPPORT_INIT = {
  coach_id: '', date_observation: '', centre: '', classe: '',
  ponctualite: 0, preparation: 0, pedagogie: 0, gestion_classe: 0, professionnalisme: 0,
  observations: '', recommandations: '',
};

// Déduit automatiquement le lieu de l'observation à partir du type_cours de la classe
// bet-elearning n'a pas de notion de "centre" physique BET : c'est soit en ligne, soit
// dans les locaux de l'entreprise cliente (classes B2B).
function lieuAutoClasse(classe) {
  if (!classe) return '';
  if (classe.type_cours === 'en_ligne') return 'En ligne';
  return classe.entreprise_nom ? `Présentiel - ${classe.entreprise_nom.trim()}` : 'Présentiel';
}

export default function DashboardDeputySuperviseur() {
  const { profile, seDeconnecter } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { couleurTheme } = useTheme();

  /* L'onglet se déduit du chemin. `/taches` et `/cahiers-coachs` sont testés AVANT les
     autres : aucun ne contient `/observer`, `/rapports` ni `/missions`, mais les placer en
     tête évite qu'un futur chemin plus long ne soit capté par une sous-chaîne. */
  const activeTab = location.pathname.includes('/plannings') ? 'plannings'
    : location.pathname.includes('/taches') ? 'taches'
    : location.pathname.includes('/cahiers-coachs') ? 'cahiers'
    : location.pathname.includes('/observer') ? 'observer'
    : location.pathname.includes('/rapports') ? 'rapports'
    : location.pathname.includes('/missions') ? 'missions'
    : 'dashboard';
  const [rapports,      setRapports]      = useState([]);
  const [rapportsLoad,  setRapportsLoad]  = useState(false);
  const [missions,      setMissions]      = useState([]);
  const [missionsLoad,  setMissionsLoad]  = useState(false);
  const [coachs,        setCoachs]        = useState([]);
  const [kpi,           setKpi]           = useState({ rapports_soumis: 0, missions_actives: 0, derniere_observation: null });

  /* La vue de classe observée, ses filtres et son chargement vivent désormais dans
     `OngletObserverCours` (DashboardSuperviseur.jsx), partagé avec le superviseur général.
     Les douze états qui les portaient ici n'avaient plus d'emploi. */

  // Rapports - filtres + pagination
  const [rapDateFrom, setRapDateFrom] = useState('');
  const [rapDateTo,   setRapDateTo]   = useState('');
  const [rapPage,     setRapPage]     = useState(1);
  const RAP_PER_PAGE = 5;

  // Missions - filtres + pagination
  const [misDateFrom, setMisDateFrom] = useState('');
  const [misDateTo,   setMisDateTo]   = useState('');
  const [misStatutFil, setMisStatutFil] = useState('tous');
  const [misPage,     setMisPage]     = useState(1);
  const MIS_PER_PAGE = 5;

  // Rapport form
  const [showRapportForm,  setShowRapportForm]  = useState(false);
  const [rapportForm,      setRapportForm]      = useState(RAPPORT_INIT);
  const [rapportGroupes,   setRapportGroupes]   = useState([]);
  const [rapportClasseFil, setRapportClasseFil] = useState('actif');
  const [rapportSaving,    setRapportSaving]    = useState(false);
  const [updatingMissionId, setUpdatingMissionId] = useState(null); // empêche le double-clic sur Démarrer/Terminer une mission
  const [rapportError,     setRapportError]     = useState('');

  // Flash
  const [flash, setFlash] = useState(null);

  const showFlash = (msg, err = false) => {
    setFlash({ msg, err });
    setTimeout(() => setFlash(null), 4000);
  };

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchRapports = useCallback(async () => {
    setRapportsLoad(true);
    try {
      const r = await fetch(`${_API}/api/superviseur/rapports-deputy`, { headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRapports(d.rapports || []);
      // Calculer KPI depuis les rapports
      const list = d.rapports || [];
      const actifs = list.filter(rp => !['transmis_pa'].includes(rp.statut));
      setKpi(prev => ({
        ...prev,
        rapports_soumis: list.length,
        derniere_observation: list[0]?.date_observation || null,
      }));
    } catch (e) {
      console.error('[fetchRapports]', e.message);
    } finally {
      setRapportsLoad(false);
    }
  }, []);

  const fetchMissions = useCallback(async () => {
    setMissionsLoad(true);
    try {
      const r = await fetch(`${_API}/api/superviseur/mes-missions`, { headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const list = d.missions || [];
      setMissions(list);
      setKpi(prev => ({
        ...prev,
        missions_actives: list.filter(m => ['assignée', 'en_cours'].includes(m.statut)).length,
      }));
    } catch (e) {
      console.error('[fetchMissions]', e.message);
    } finally {
      setMissionsLoad(false);
    }
  }, []);

  const fetchCoachs = useCallback(async () => {
    try {
      const r = await fetch(`${_API}/api/superviseur/coachs-conformite`, { headers: authHdrs() });
      const d = await r.json();
      setCoachs(d.coachs || []);
    } catch (e) {
      console.error('[fetchCoachs]', e.message);
    }
  }, []);

  // Charger les groupes d'un coach pour le formulaire rapport
  async function fetchRapportCoachGroupes(coachId) {
    if (!coachId) { setRapportGroupes([]); return; }
    try {
      const r = await fetch(`${_API}/api/elearning/seances?coach_id=${coachId}`, { headers: authHdrs() });
      const d = await r.json();
      // Extraire les classes uniques depuis les séances
      const classeIds = [...new Set((d.seances || []).map(s => s.classe_id).filter(Boolean))];
      const r2 = await fetch(`${_API}/api/classes-elearning`, { headers: authHdrs() });
      const d2 = await r2.json();
      const coachClasses = (d2.classes || []).filter(c => c.coach_id === coachId || classeIds.includes(c.id));
      setRapportGroupes(coachClasses);
    } catch (e) {
      setRapportGroupes([]);
    }
  }

  // Init
  useEffect(() => {
    fetchRapports();
    fetchMissions();
  }, [fetchRapports, fetchMissions]);

  useEffect(() => {
    if (activeTab === 'rapports') fetchCoachs();
  }, [activeTab, fetchCoachs]);

  // ── Soumettre rapport ────────────────────────────────────────────────────

  async function soumettrRapport() {
    if (!rapportForm.coach_id || !rapportForm.date_observation) {
      setRapportError('Coach et date requis');
      return;
    }
    setRapportSaving(true);
    setRapportError('');
    try {
      const r = await fetch(`${_API}/api/superviseur/rapports-deputy`, {
        method: 'POST',
        headers: authHdrs(),
        body: JSON.stringify(rapportForm),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Soumission refusée');
      showFlash('Rapport soumis avec succès');
      setShowRapportForm(false);
      setRapportForm(RAPPORT_INIT);
      setRapportGroupes([]);
      fetchRapports();
    } catch (e) {
      setRapportError(e.message);
      toast.error(e.message || 'Soumission refusée', { duration: 5000 });
    } finally {
      setRapportSaving(false);
    }
  }

  // ── Mettre à jour statut mission ─────────────────────────────────────────

  async function updateMission(id, statut) {
    if (updatingMissionId) return;
    setUpdatingMissionId(id);
    try {
      const r = await fetch(`${_API}/api/superviseur/missions/${id}`, {
        method: 'PATCH', headers: authHdrs(), body: JSON.stringify({ statut }),
      });
      if (r.ok) {
        showFlash('Mission mise à jour'); fetchMissions();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Modification refusée', { duration: 5000 });
      }
    } catch (e) {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
    } finally {
      setUpdatingMissionId(null);
    }
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  function renderDashboard() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>🏠 Mon tableau de bord</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Vos missions et rapports d'observation</p>
          </div>
          <div style={{ fontSize: 12, color: COULEURS.gris400 }}>Mis à jour : {fmtDate(new Date())}</div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Rapports soumis"      value={kpi.rapports_soumis}    color="#0891b2" icon="📋" onClick={() => navigate('/admin/deputy-superviseur/rapports')} />
          <StatCard label="Missions actives"     value={kpi.missions_actives}   color="#F59E0B" icon="🎯" onClick={() => navigate('/admin/deputy-superviseur/missions')} />
          <StatCard label="Dernière observation" value={kpi.derniere_observation ? fmtDate(kpi.derniere_observation) : '-'} color={VIOLET} icon="📅" sub="date" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Accès rapides */}
          <div style={{ background: COULEURS.gris50, borderRadius: 14, padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: COULEURS.navy }}>⚡ Accès rapides</div>
            {[
              { icon: '👁️',  label: 'Observer un cours en ligne',          path: '/admin/deputy-superviseur/observer' },
              { icon: '📋', label: 'Soumettre un rapport d\'observation',  path: '/admin/deputy-superviseur/rapports', action: 'form' },
              { icon: '🎯', label: 'Voir mes missions assignées',           path: '/admin/deputy-superviseur/missions' },
              { icon: '💬', label: 'Messagerie interne',                   path: '/admin/messages' },
            ].map(a => (
              <button key={a.label}
                onClick={() => { navigate(a.path); if (a.action === 'form') setTimeout(() => setShowRapportForm(true), 200); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: '#fff', border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, cursor: 'pointer', marginBottom: 8, textAlign: 'left', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <span style={{ fontSize: 17 }}>{a.icon}</span>
                <span style={{ color: COULEURS.navy, fontWeight: 500, flex: 1 }}>{a.label}</span>
                <span style={{ color: COULEURS.gris400 }}>›</span>
              </button>
            ))}
          </div>

          {/* Responsabilités */}
          <div style={{ background: COULEURS.gris50, borderRadius: 14, padding: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: COULEURS.navy }}>📌 Mes responsabilités</div>
            {[
              'Effectuer des visites dans les centres et classes en ligne',
              'Évaluer les coachs selon les standards pédagogiques BET',
              'Identifier les points forts et axes d\'amélioration',
              'Rédiger et soumettre des rapports au Superviseur Général',
              'Signaler toute non-conformité détectée lors des observations',
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: COULEURS.gris600, marginBottom: 8, lineHeight: 1.5 }}>
                <span style={{ color: VIOLET, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span>{r}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>🔒 Accès restreint</div>
              {['Données clients et inscriptions', 'Montants des paiements et salaires', 'Modification des cours ou classes'].map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: '#B45309', display: 'flex', gap: 6, marginBottom: 3 }}>
                  <span>✗</span><span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chaîne de supervision */}
        <div style={{ marginTop: 16, background: COULEURS.gris50, borderRadius: 14, padding: 16, border: `1px solid ${COULEURS.gris200}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: COULEURS.navy }}>🔗 Votre position dans la chaîne</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
            {[
              { role: 'Deputy Superviseur', desc: 'Vous - observe & évalue', color: VIOLET, active: true },
              null,
              { role: 'Superviseur Général', desc: 'Centralise les rapports', color: '#0891b2' },
              null,
              { role: 'PA Advisor', desc: 'Supervise la pédagogie', color: '#7c3aed' },
              null,
              { role: 'Direction', desc: 'Décisions finales', color: '#059669' },
            ].map((n, i) => n === null ? (
              <div key={i} style={{ fontSize: 18, color: COULEURS.gris300, padding: '0 8px', flexShrink: 0 }}>→</div>
            ) : (
              <div key={i} style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${n.active ? n.color : COULEURS.gris200}`, background: n.active ? n.color + '12' : '#fff', flexShrink: 0, minWidth: 140 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: n.color }}>{n.role}</div>
                <div style={{ fontSize: 10, color: COULEURS.gris400, marginTop: 2 }}>{n.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderRapports() {
    const rapFiltres = rapports
      .filter(r => {
        if (rapDateFrom && r.date_observation < rapDateFrom) return false;
        if (rapDateTo   && r.date_observation > rapDateTo)   return false;
        return true;
      })
      .sort((a, b) => (b.date_observation || '').localeCompare(a.date_observation || ''));
    const rapTotalPages = Math.max(1, Math.ceil(rapFiltres.length / RAP_PER_PAGE));
    const rapPageSafe   = Math.min(rapPage, rapTotalPages);
    const rapPageItems  = rapFiltres.slice((rapPageSafe - 1) * RAP_PER_PAGE, rapPageSafe * RAP_PER_PAGE);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>📋 Mes rapports d'observation</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Soumettez vos observations terrain</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={rapDateFrom} onChange={e => { setRapDateFrom(e.target.value); setRapPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${rapDateFrom ? VIOLET : COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            <span style={{ fontSize: 11, color: COULEURS.gris400 }}>→</span>
            <input type="date" value={rapDateTo} onChange={e => { setRapDateTo(e.target.value); setRapPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${rapDateTo ? VIOLET : COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            {(rapDateFrom || rapDateTo) && (
              <button onClick={() => { setRapDateFrom(''); setRapDateTo(''); setRapPage(1); }}
                style={{ padding: '4px 9px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            )}
            <button onClick={fetchRapports} style={{ padding: '7px 14px', background: VIOLET_CLAIR, border: `1px solid ${VIOLET}40`, borderRadius: 8, fontSize: 12, color: VIOLET, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>↻ Actualiser</button>
            <button onClick={() => { fetchCoachs(); setShowRapportForm(true); }}
              style={{ padding: '7px 16px', background: VIOLET, border: 'none', borderRadius: 8, fontSize: 12, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Nouveau rapport</button>
          </div>
        </div>

        {rapportsLoad ? (
          <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>
        ) : rapports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 10 }}>Aucun rapport soumis</div>
            <button onClick={() => { fetchCoachs(); setShowRapportForm(true); }}
              style={{ padding: '10px 22px', background: VIOLET, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Soumettre mon premier rapport</button>
          </div>
        ) : rapPageItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
            <div style={{ fontSize: 13, color: COULEURS.gris400 }}>Aucun rapport pour cette période.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: COULEURS.gris400 }}>
                {rapFiltres.length} rapport{rapFiltres.length !== 1 ? 's' : ''}{(rapDateFrom || rapDateTo) ? ' (filtrés)' : ''} · Page {rapPageSafe}/{rapTotalPages}
              </span>
              {rapTotalPages > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{l:'«',v:'first'},{l:'‹',v:-1},{l:'›',v:1},{l:'»',v:'last'}].map(({l,v}) => (
                    <button key={l}
                      onClick={() => setRapPage(v === 'first' ? 1 : v === 'last' ? rapTotalPages : p => Math.min(rapTotalPages, Math.max(1, p + v)))}
                      disabled={(v === 'first' || v === -1) && rapPageSafe === 1 || (v === 'last' || v === 1) && rapPageSafe === rapTotalPages}
                      style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 13, cursor: 'pointer', color: COULEURS.navy, fontWeight: 600, fontFamily: 'inherit' }}>{l}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rapPageItems.map(r => {
                const st = STATUT_RAPPORT[r.statut] || STATUT_RAPPORT.soumis;
                const moy = [r.ponctualite, r.preparation, r.pedagogie, r.gestion_classe, r.professionnalisme, r.respect_programme].filter(Boolean);
                const moyVal = moy.length ? (moy.reduce((a, b) => a + b, 0) / moy.length).toFixed(1) : null;
                return (
                  <div key={r.id} style={{ background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>
                            Coach : {r.coach?.prenom || ''} {r.coach?.nom || ''}
                          </span>
                          <span style={{ background: st.bg, color: st.txt, padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.lib}</span>
                          {moyVal && <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>⭐ {moyVal}/5</span>}
                        </div>
                        <div style={{ fontSize: 12, color: COULEURS.gris400 }}>
                          📅 {fmtDate(r.date_observation)}
                          {r.centre && <> · 📍 {r.centre}</>}
                          {r.classe && <> · 🏫 {r.classe}</>}
                        </div>
                      </div>
                    </div>
                    {r.commentaire_superviseur && (
                      <div style={{ marginTop: 10, background: '#FEF9C3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#854D0E' }}>
                        <strong>💬 Superviseur :</strong> {r.commentaire_superviseur}
                      </div>
                    )}
                    {(r.observations || r.recommandations) && (
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {r.observations && (
                          <div style={{ background: '#F0F9FF', borderRadius: 8, padding: '8px 12px', border: '1px solid #BAE6FD' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369A1', marginBottom: 4 }}>👁 Observations</div>
                            <p style={{ margin: 0, fontSize: 12, color: '#0C4A6E', lineHeight: 1.5 }}>{r.observations}</p>
                          </div>
                        )}
                        {r.recommandations && (
                          <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '8px 12px', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', marginBottom: 4 }}>💡 Recommandations</div>
                            <p style={{ margin: 0, fontSize: 12, color: '#14532D', lineHeight: 1.5 }}>{r.recommandations}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {rapTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 16 }}>
                {[{l:'«',v:'first'},{l:'‹',v:-1},{l:'›',v:1},{l:'»',v:'last'}].map(({l,v}) => (
                  <button key={l}
                    onClick={() => setRapPage(v === 'first' ? 1 : v === 'last' ? rapTotalPages : p => Math.min(rapTotalPages, Math.max(1, p + v)))}
                    disabled={(v === 'first' || v === -1) && rapPageSafe === 1 || (v === 'last' || v === 1) && rapPageSafe === rapTotalPages}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 13, cursor: 'pointer', color: COULEURS.navy, fontWeight: 600, fontFamily: 'inherit' }}>{l}</button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Modal formulaire rapport */}
        {showRapportForm && (
          <Modal title="📋 Soumettre un rapport d'observation" subtitle="Renseignez les critères d'observation du cours" onClose={() => { setShowRapportForm(false); setRapportForm(RAPPORT_INIT); setRapportGroupes([]); setRapportError(''); }} xl>
            {rapportError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#DC2626', fontSize: 13 }}>⚠️ {rapportError}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Coach */}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Coach observé *</label>
                <select value={rapportForm.coach_id}
                  onChange={e => { const id = e.target.value; setRapportForm(f => ({ ...f, coach_id: id, classe: '' })); setRapportClasseFil('actif'); fetchRapportCoachGroupes(id); }}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, background: '#fff', fontFamily: 'inherit' }}>
                  <option value="">-- Sélectionner un coach --</option>
                  {coachs.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </select>
              </div>
              {/* Date */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Date d'observation *</label>
                <input type="date" value={rapportForm.date_observation} onChange={e => setRapportForm(f => ({ ...f, date_observation: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {/* Centre */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>Centre</label>
                <input type="text" value={rapportForm.centre} onChange={e => setRapportForm(f => ({ ...f, centre: e.target.value }))}
                  placeholder="ex: Cocody, En ligne…"
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {/* Classe */}
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: COULEURS.gris600 }}>Classe observée</label>
                  {rapportGroupes.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[{ v: 'actif', l: '🟢 Actives' }, { v: 'termine', l: '⬛ Terminées' }, { v: 'tous', l: 'Toutes' }].map(f => (
                        <button key={f.v} type="button" onClick={() => { setRapportClasseFil(f.v); setRapportForm(fp => ({ ...fp, classe: '' })); }}
                          style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1.5px solid ${rapportClasseFil === f.v ? VIOLET : COULEURS.gris200}`, background: rapportClasseFil === f.v ? VIOLET_CLAIR : '#fff', color: rapportClasseFil === f.v ? VIOLET : COULEURS.gris600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {f.l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {rapportGroupes.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {rapportGroupes.filter(g => rapportClasseFil === 'tous' ? true : rapportClasseFil === 'termine' ? g.statut === 'termine' : g.statut !== 'termine').map(g => {
                      const isSelected = rapportForm.classe === g.nom;
                      return (
                        <button key={g.id} type="button" onClick={() => setRapportForm(f => ({ ...f, classe: g.nom, centre: lieuAutoClasse(g) }))}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${isSelected ? VIOLET : COULEURS.gris200}`, background: isSelected ? VIOLET_CLAIR : '#fff', color: isSelected ? VIOLET : COULEURS.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {g.nom} {g.niveau ? `· ${g.niveau}` : ''}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <input type="text" value={rapportForm.classe} onChange={e => setRapportForm(f => ({ ...f, classe: e.target.value }))}
                  placeholder={rapportForm.coach_id ? 'Ou saisir le nom de la classe…' : 'Sélectionnez d\'abord un coach'}
                  style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
            </div>

            {/* Critères */}
            <div style={{ background: COULEURS.gris50, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COULEURS.gris200}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: COULEURS.navy }}>📊 Critères d'évaluation (1 à 5 étoiles)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'ponctualite',       label: '⏰ Ponctualité' },
                  { key: 'preparation',        label: '📝 Organisation du cours' },
                  { key: 'pedagogie',          label: '🎓 Pédagogie' },
                  { key: 'gestion_classe',     label: '🧑‍🏫 Gestion de classe' },
                  { key: 'professionnalisme',  label: '🤝 Professionnalisme' },
                ].map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 8, padding: '10px 12px', border: `1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize: 12, color: COULEURS.gris600, fontWeight: 600, minWidth: 160 }}>{c.label}</div>
                    <EtoileRating value={rapportForm[c.key] || 0} onChange={v => setRapportForm(f => ({ ...f, [c.key]: v }))} />
                    <span style={{ fontSize: 11, color: COULEURS.gris400, marginLeft: 'auto' }}>{rapportForm[c.key] || 0}/5</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Observations + Recommandations */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                { l: '💬 Observations',   k: 'observations',   ph: 'Points observés pendant le cours…' },
                { l: '✅ Recommandations', k: 'recommandations', ph: 'Suggestions d\'amélioration…' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COULEURS.gris600, marginBottom: 6 }}>{f.l}</label>
                  <textarea rows={5} value={rapportForm[f.k]} onChange={e => setRapportForm(fp => ({ ...fp, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: `1px solid ${COULEURS.gris200}` }}>
              <button onClick={() => { setShowRapportForm(false); setRapportForm(RAPPORT_INIT); setRapportGroupes([]); setRapportError(''); }}
                style={{ padding: '10px 20px', background: COULEURS.gris100, border: 'none', borderRadius: 8, fontSize: 13, color: COULEURS.navy, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={soumettrRapport} disabled={rapportSaving}
                style={{ padding: '10px 24px', background: rapportSaving ? COULEURS.gris300 : VIOLET, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: rapportSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {rapportSaving ? '⏳ Envoi…' : '📤 Soumettre le rapport'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  function renderMissions() {
    const STATUTS_OPTIONS = [
      { v: 'tous', l: 'Tous' },
      { v: 'assignée', l: '📌 Assignée' },
      { v: 'en_cours', l: '▶ En cours' },
      { v: 'terminée', l: '✅ Terminée' },
      { v: 'annulée',  l: '✗ Annulée' },
    ];

    const misFiltrees = missions
      .filter(m => {
        if (misStatutFil !== 'tous' && m.statut !== misStatutFil) return false;
        if (misDateFrom && m.date_debut && m.date_debut < misDateFrom) return false;
        if (misDateTo   && m.date_debut && m.date_debut > misDateTo)   return false;
        return true;
      })
      .sort((a, b) => (b.date_debut || '').localeCompare(a.date_debut || ''));
    const misTotalPages = Math.max(1, Math.ceil(misFiltrees.length / MIS_PER_PAGE));
    const misPageSafe   = Math.min(misPage, misTotalPages);
    const misPageItems  = misFiltrees.slice((misPageSafe - 1) * MIS_PER_PAGE, misPageSafe * MIS_PER_PAGE);

    const MissionCard = ({ m }) => {
      const st = STATUT_MISSION[m.statut] || STATUT_MISSION.assignée;
      return (
        <div style={{ background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>{m.titre}</div>
              <div style={{ fontSize: 11, color: COULEURS.gris400 }}>
                🎯 {m.type_mission?.replace(/_/g, ' ')}
                {m.centre && <> · 📍 {m.centre}</>}
                {m.coach?.prenom && <> · 👨‍🏫 {m.coach.prenom} {m.coach.nom}</>}
              </div>
              {(m.date_debut || m.date_fin) && (
                <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                  📅 {fmtDate(m.date_debut)}{m.date_fin ? ` → ${fmtDate(m.date_fin)}` : ''}
                </div>
              )}
            </div>
            <span style={{ background: st.bg, color: st.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.lib}</span>
          </div>
          {m.description && (
            <div style={{ fontSize: 12, color: COULEURS.gris600, fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5, background: COULEURS.gris50, padding: '8px 12px', borderRadius: 8 }}>
              {m.description}
            </div>
          )}
          {m.statut !== 'terminée' && m.statut !== 'annulée' && (
            <div style={{ display: 'flex', gap: 8 }}>
              {m.statut === 'assignée' && (
                <button onClick={() => updateMission(m.id, 'en_cours')} disabled={updatingMissionId === m.id}
                  style={{ padding: '6px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#D97706', fontWeight: 600, cursor: updatingMissionId === m.id ? 'not-allowed' : 'pointer', opacity: updatingMissionId === m.id ? 0.6 : 1, fontFamily: 'inherit' }}>
                  {updatingMissionId === m.id ? '⏳ …' : '▶ Démarrer'}
                </button>
              )}
              {m.statut === 'en_cours' && (
                <button onClick={() => updateMission(m.id, 'terminée')} disabled={updatingMissionId === m.id}
                  style={{ padding: '6px 14px', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46', fontWeight: 600, cursor: updatingMissionId === m.id ? 'not-allowed' : 'pointer', opacity: updatingMissionId === m.id ? 0.6 : 1, fontFamily: 'inherit' }}>
                  {updatingMissionId === m.id ? '⏳ …' : '✅ Marquer terminée'}
                </button>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div>
        {/* En-tête + filtres */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>🎯 Mes missions</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Missions assignées par votre Superviseur Général</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={misDateFrom} onChange={e => { setMisDateFrom(e.target.value); setMisPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${misDateFrom ? VIOLET : COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            <span style={{ fontSize: 11, color: COULEURS.gris400 }}>→</span>
            <input type="date" value={misDateTo} onChange={e => { setMisDateTo(e.target.value); setMisPage(1); }}
              style={{ padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${misDateTo ? VIOLET : COULEURS.gris200}`, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            {(misDateFrom || misDateTo) && (
              <button onClick={() => { setMisDateFrom(''); setMisDateTo(''); setMisPage(1); }}
                style={{ padding: '4px 9px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            )}
            <button onClick={fetchMissions} style={{ padding: '7px 14px', background: VIOLET_CLAIR, border: `1px solid ${VIOLET}40`, borderRadius: 8, fontSize: 12, color: VIOLET, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>↻ Actualiser</button>
          </div>
        </div>

        {/* Filtre statut */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {STATUTS_OPTIONS.map(o => (
            <button key={o.v} onClick={() => { setMisStatutFil(o.v); setMisPage(1); }}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${misStatutFil === o.v ? VIOLET : COULEURS.gris200}`, background: misStatutFil === o.v ? VIOLET_CLAIR : '#fff', color: misStatutFil === o.v ? VIOLET : COULEURS.gris600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {o.l}
            </button>
          ))}
        </div>

        {missionsLoad ? (
          <div style={{ textAlign: 'center', padding: 60, color: COULEURS.gris400 }}>Chargement…</div>
        ) : missions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.navy, marginBottom: 6 }}>Aucune mission assignée</div>
            <div style={{ fontSize: 13, color: COULEURS.gris400 }}>Votre Superviseur Général n'a pas encore assigné de missions.</div>
          </div>
        ) : misPageItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
            <div style={{ fontSize: 13, color: COULEURS.gris400 }}>Aucune mission pour ces critères.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: COULEURS.gris400 }}>
                {misFiltrees.length} mission{misFiltrees.length !== 1 ? 's' : ''}{misStatutFil !== 'tous' || misDateFrom || misDateTo ? ' (filtrées)' : ''} · Page {misPageSafe}/{misTotalPages}
              </span>
              {misTotalPages > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{l:'«',v:'first'},{l:'‹',v:-1},{l:'›',v:1},{l:'»',v:'last'}].map(({l,v}) => (
                    <button key={l}
                      onClick={() => setMisPage(v === 'first' ? 1 : v === 'last' ? misTotalPages : p => Math.min(misTotalPages, Math.max(1, p + v)))}
                      disabled={(v === 'first' || v === -1) && misPageSafe === 1 || (v === 'last' || v === 1) && misPageSafe === misTotalPages}
                      style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 13, cursor: 'pointer', color: COULEURS.navy, fontWeight: 600, fontFamily: 'inherit' }}>{l}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {misPageItems.map(m => <MissionCard key={m.id} m={m} />)}
            </div>

            {misTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 16 }}>
                {[{l:'«',v:'first'},{l:'‹',v:-1},{l:'›',v:1},{l:'»',v:'last'}].map(({l,v}) => (
                  <button key={l}
                    onClick={() => setMisPage(v === 'first' ? 1 : v === 'last' ? misTotalPages : p => Math.min(misTotalPages, Math.max(1, p + v)))}
                    disabled={(v === 'first' || v === -1) && misPageSafe === 1 || (v === 'last' || v === 1) && misPageSafe === misTotalPages}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: '#fff', fontSize: 13, cursor: 'pointer', color: COULEURS.navy, fontWeight: 600, fontFamily: 'inherit' }}>{l}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderSection() {
    switch (activeTab) {
      // `general={false}` : le Deputy attend qu'on lise SES rapports, le superviseur attend
      // d'en lire. Deux files opposées, d'où le drapeau plutôt qu'un composant par rôle.
      case 'taches':    return <OngletMesTachesSuperviseur general={false} />;
      // Le même écran que chez le superviseur général : le Deputy consulte les mêmes cahiers.
      case 'cahiers':   return <OngletCahiersCoachs />;
      case 'plannings': return <OngletPlanningsElearning />;
      /* ── LE MÊME ÉCRAN D'OBSERVATION QUE LE SUPERVISEUR GÉNÉRAL ──
         Le Deputy avait sa propre version : un tableau à deux actions (Apprenants, Rapport),
         sans le bouton Sessions, et une fiche de classe à deux onglets. Celle du superviseur
         en a cinq — Infos, Apprenants, Planning & séances, Présences, Fichiers — avec filtre
         de dates et pagination sur les trois dernières.
         Les deux rôles observent les MÊMES classes pour la MÊME raison : maintenir deux
         écrans garantissait qu'ils divergent, et c'est déjà ce qui s'était produit.
         `onObserver` garde au Deputy son propre circuit de rapport : c'est la seule chose
         qui lui est propre ici. */
      case 'observer':  return (
        <OngletObserverCours
          onObserver={cl => {
            setRapportForm(fo => ({ ...fo, classe: cl.nom, centre: lieuAutoClasse(cl) }));
            navigate('/admin/deputy-superviseur/rapports');
            setTimeout(() => setShowRapportForm(true), 200);
          }}
        />
      );
      case 'rapports':  return renderRapports();
      case 'missions':  return renderMissions();
      default:          return renderDashboard();
    }
  }

  const prenom    = profile?.prenom || '';
  const nom       = profile?.nom    || '';
  const initiales = [prenom[0], nom[0]].filter(Boolean).join('').toUpperCase() || 'DS';

  return (
    <TopNavLayout
      role="admin_deputy_superviseur"
      titre="Deputy Superviseur"
      initiales={initiales}
      nomComplet={[prenom, nom].filter(Boolean).join(' ') || 'Deputy Superviseur'}
      onDeconnexion={async () => { await seDeconnecter(); navigate('/e-learning-staff-access'); }}
      couleurAccent={VIOLET}
    >
      <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        {/* Flash */}
        {flash && (
          <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 3000, background: flash.err ? '#FEF2F2' : '#F0FDF4', border: `1.5px solid ${flash.err ? '#FECACA' : '#BBF7D0'}`, borderRadius: 12, padding: '12px 20px', fontSize: 13, fontWeight: 600, color: flash.err ? '#DC2626' : '#065F46', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxWidth: 340 }}>
            {flash.err ? '⚠️' : '✅'} {flash.msg}
          </div>
        )}

        {renderSection()}
      </div>
    </TopNavLayout>
  );
}
