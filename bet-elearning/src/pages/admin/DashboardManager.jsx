// DashboardManager.jsx - Module Manager BET extrait de DashboardAdmin.jsx (profil admin_manager)
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabState } from '../../hooks/useTabState';
import { useTheme } from '../../contexts/ThemeContext';
import { COULEURS } from '../../constants/couleurs';
import { LIBELLES_ROLES as LIBELLES_ROLES_VUE_ENSEMBLE, estRole, ROLE_MAP_BET } from '../../constants/roles';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import ModalProfSuivi from './ModalProfesseur';
import { useMessagerie } from '../../contexts/MessagerieContext';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });
function joursRestants(dateFin) {
  return Math.ceil((new Date(dateFin) - new Date()) / (1000 * 60 * 60 * 24));
}

const MOCK_PROFESSEURS = [
  { id: 'teacher-001', prenom: 'Marie',   nom: 'Dupont',  role: 'professeur_titulaire',   email: 'marie.dupont@bet.ci',   est_actif: true,  nb_groupes: 2, contrat: 'Permanent',  debut: '2024-01-15', niveaux: 'A1 → B1', sessions_mois: 12, evaluation: 4.5, specialite: 'General English' },
  { id: 'teacher-002', prenom: 'Pierre',  nom: 'Martin',  role: 'professeur_titulaire',   email: 'pierre.martin@bet.ci',  est_actif: true,  nb_groupes: 1, contrat: 'Consultant', debut: '2025-06-01', niveaux: 'B1 → C1', sessions_mois: 6,  evaluation: 4.2, specialite: 'Business English' },
  { id: 'teacher-004', prenom: 'Aurélie', nom: 'Bernard', role: 'professeur_titulaire',   email: 'aurelie.bernard@bet.ci',est_actif: true,  nb_groupes: 3, contrat: 'Permanent',  debut: '2023-09-01', niveaux: 'A1 → A2', sessions_mois: 15, evaluation: 4.8, specialite: 'Kids English (6-12 ans)' },
  { id: 'teacher-005', prenom: 'Kwame',   nom: 'Asare',   role: 'professeur_titulaire',   email: 'kwame.asare@bet.ci',    est_actif: false, nb_groupes: 0, contrat: 'Consultant', debut: '2024-03-01', niveaux: 'B2 → C2', sessions_mois: 0,  evaluation: 3.9, specialite: 'IELTS Prep' },
  { id: 'teacher-003', prenom: 'Sophie',  nom: 'Leclerc', role: 'professeur_remplacant',  email: 'sophie.leclerc@bet.ci', est_actif: true,  nb_groupes: 1, contrat: 'Freelance',  debut: '2025-09-01', niveaux: 'A1 → B1', sessions_mois: 4,  evaluation: 4.0, specialite: 'General English' },
  { id: 'teacher-006', prenom: 'Issouf',  nom: 'Koné',    role: 'professeur_remplacant',  email: 'issouf.kone@bet.ci',    est_actif: true,  nb_groupes: 0, contrat: 'Stagiaire',  debut: '2026-02-01', niveaux: 'A2 → B2', sessions_mois: 0,  evaluation: null, specialite: 'Business English' },
];

// ── Audit Logs - config d'affichage ───────────────────────────────────────────
// Les logs eux-mêmes viennent de GET /api/audit/logs (table réelle audit_logs,
// alimentée par logAudit() dans les routes backend) - plus de données mock ici.

const STATUT_CONFIG = {
  success: { lib:'Succès', bg:'#D1FAE5', txt:'#065F46' },
  warning: { lib:'Alerte', bg:'#FEF9C3', txt:'#92400E' },
  danger:  { lib:'Erreur', bg:'#FEE2E2', txt:'#991B1B' },
  info:    { lib:'Info',   bg:'#F3F4F6', txt:'#374151' },
};

const MODULES_AUDIT = [
  { id:'contenus',          lib:'Contenus' },
  { id:'onboarding',        lib:'Onboarding' },
  { id:'classes',           lib:'Classes' },
  { id:'coachs',            lib:'Coachs' },
  { id:'presences',         lib:'Présences' },
  { id:'presences_privees', lib:'Présences privées' },
  { id:'parcours',          lib:'Parcours' },
  { id:'boutique',          lib:'Boutique' },
  { id:'paiements',         lib:'Paiements' },
  { id:'apprenants',        lib:'Apprenants' },
  { id:'users',             lib:'Utilisateurs' },
  { id:'auth',              lib:'Authentification' },
  { id:'audit',             lib:'Audit' },
];

const ROLE_LIB = {
  admin_manager:       'Manager',
  admin_superviseur:         'Superviseur',
  admin_deputy_superviseur:  'Deputy Superviseur',
  admin_responsable:         'Responsable',
  admin_gestionnaire:  'Gestionnaire',
  admin_placement:     'Placement',
  admin_onboarding:    'Onboarding',
  admin_elearning:     'E-Learning',
  admin_customer_care: 'Customer Care',
  admin_pa_advisor:    'PA Advisor',
  admin_rh_paie:       'RH / Paie',
  admin_comptable:     'Comptable',
  admin_commercial:    'Corporate',
  admin_observateur:   'Observateur',
  super_admin:         'Super Admin',
  admin:               'Admin',
  manager:             'Manager',
  onboarding:          'Onboarding',
  coach:               'Coach',
  system:              'Système',
};

const ROLE_COULEURS = {
  admin_manager:       '#0891B2',
  admin_superviseur:         '#7C3AED',
  admin_deputy_superviseur:  '#A855F7',
  admin_responsable:         '#6D28D9',
  admin_gestionnaire:  '#0369A1',
  admin_placement:     '#059669',
  admin_onboarding:    '#F97316',
  admin_elearning:     '#0D9488',
  admin_customer_care: '#EC4899',
  admin_pa_advisor:    '#6366F1',
  admin_rh_paie:       '#D97706',
  admin_comptable:     '#16A34A',
  admin_commercial:    '#10B981',
  admin_observateur:   '#94A3B8',
  super_admin:         '#0F172A',
  admin:               '#0F172A',
  onboarding:          '#F97316',
  coach:               '#059669',
  system:              '#64748B',
};

function roleLabel(role) {
  if (!role) return '-';
  return ROLE_LIB[role] || role.replace(/^admin_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function moduleLabel(mod) {
  return MODULES_AUDIT.find(m => m.id === mod)?.lib || (mod || '-').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Icône + libellé déduits du action_type réel (ex: "CONTENU_SUPPRIME", "CLASSE_CREEE"…)
// - pas de table fixe car les modules ajoutent librement de nouveaux types d'action.
function actionConfig(actionType) {
  const t = actionType || '';
  if (/CREE|CREATE|AJOUT/.test(t))              return { icone:'➕', bg:'#D1FAE5', txt:'#065F46' };
  if (/SUPPRIM|DELETE|ARCHIVE|RETIRE|PURGE/.test(t)) return { icone:'🗑️', bg:'#FEE2E2', txt:'#991B1B' };
  if (/PUBLIE/.test(t))                          return { icone:'👁️', bg:'#D1FAE5', txt:'#065F46' };
  if (/MASQUE|SUSPEND|BLOQU/.test(t))            return { icone:'🔒', bg:'#FEF9C3', txt:'#92400E' };
  if (/ASSIGN/.test(t))                          return { icone:'🎯', bg:'#DBEAFE', txt:'#1D4ED8' };
  if (/MODIF|UPDATE/.test(t))                    return { icone:'✏️', bg:'#DBEAFE', txt:'#1D4ED8' };
  if (/LOGIN|CONNEX/.test(t))                    return { icone:'🔐', bg:'#FEF9C3', txt:'#92400E' };
  if (/VIEW|CONSULT/.test(t))                    return { icone:'👁️', bg:'#F3F4F6', txt:'#374151' };
  return { icone:'•', bg:'#F3F4F6', txt:'#374151' };
}

function actionLabel(actionType) {
  if (!actionType) return '-';
  return actionType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

const AL_PAR_PAGE = 15;

export function OngletAuditLogs() {
  const { couleurTheme } = useTheme();
  const [logs,         setLogs]         = useState([]);
  const [total,        setTotal]        = useState(0);
  const [nbPages,      setNbPages]      = useState(1);
  const [chargement,   setChargement]   = useState(true);
  const [filtreModule, setFiltreModule] = useState('tous');
  const [filtreRole,   setFiltreRole]   = useState('tous');
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [dateDebut,    setDateDebut]    = useState('');
  const [dateFin,      setDateFin]      = useState('');
  const [recherche,    setRecherche]    = useState('');
  const [rechercheInput, setRechercheInput] = useState('');
  const [page,          setPage]        = useState(1);
  const [detail,        setDetail]      = useState(null);

  const fetchLogs = useCallback(async () => {
    setChargement(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(AL_PAR_PAGE), plateforme: 'bet-elearning' });
      if (filtreModule !== 'tous') params.set('module', filtreModule);
      if (filtreRole   !== 'tous') params.set('acteur_role', filtreRole);
      if (filtreStatut !== 'tous') params.set('statut', filtreStatut);
      if (dateDebut)               params.set('date_debut', dateDebut);
      if (dateFin)                 params.set('date_fin', dateFin);
      if (recherche)                params.set('search', recherche);

      const r = await fetch(`${_API_URL_ADMIN}/api/audit/logs?${params.toString()}`, { headers: _authHdrsAdmin() });
      const d = await r.json();
      if (r.ok) {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
        setNbPages(Math.max(1, d.pages || 1));
      }
    } catch {}
    setChargement(false);
  }, [page, filtreModule, filtreRole, filtreStatut, dateDebut, dateFin, recherche]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Debounce recherche texte - évite une requête à chaque frappe
  useEffect(() => {
    const t = setTimeout(() => { setRecherche(rechercheInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [rechercheInput]);

  const [stats, setStats] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${_API_URL_ADMIN}/api/audit/stats?plateforme=bet-elearning`, { headers: _authHdrsAdmin() });
        const d = await r.json();
        if (r.ok) setStats(d);
      } catch {}
    })();
  }, []);

  function filtrer(fn) { fn(); setPage(1); }

  function formaterDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  }

  const btnPage = (actif) => ({
    width:32, height:32, borderRadius:6,
    border:`1px solid ${actif ? couleurTheme : COULEURS.gris200}`,
    background: actif ? couleurTheme : COULEURS.blanc,
    color: actif ? COULEURS.blanc : COULEURS.navy,
    fontSize:13, fontWeight: actif ? 700 : 400, cursor:'pointer',
    fontFamily:'"Plus Jakarta Sans", sans-serif',
    display:'flex', alignItems:'center', justifyContent:'center',
  });

  return (
    <>
      {/* ── Bandeau titre ── */}
      <div style={{ background:'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)', borderRadius:16, padding:'20px 28px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>🔍 Audit Logs - Traçabilité des actions</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>Toutes les actions administratives effectuées sur la plateforme BET</div>
        </div>
        <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 16px', textAlign:'center' }}>
          <div style={{ fontSize:22, fontWeight:800, color:'#38BDF8' }}>{total}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>action{total>1?'s':''} enregistrée{total>1?'s':''}</div>
        </div>
      </div>

      {/* ── KPIs ── */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:16, marginBottom:24 }}>
          {[
            { l:"Aujourd'hui",        v:stats.total_today,    c:couleurTheme,      i:'📅' },
            { l:'7 derniers jours',   v:stats.total_7j,       c:COULEURS.succes,   i:'📈' },
            { l:'30 derniers jours',  v:stats.total_30j,      c:'#0891B2',         i:'🗓️' },
            { l:"Alertes aujourd'hui",v:stats.alertes_today,  c:COULEURS.rouge,    i:'🚨' },
          ].map(k => (
            <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 20px', border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{k.i}</div>
              <div style={{ fontSize:26, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 }}>{k.v ?? 0}</div>
              <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Répartition par module (aujourd'hui) ── */}
      {stats?.par_module?.length > 0 && (
        <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:24 }}>
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:16 }}>📊 Modules les plus actifs - aujourd'hui</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
            {stats.par_module.slice(0, 6).map(({ module, count }) => {
              const pct = Math.round((count / stats.total_today) * 100) || 0;
              return (
                <div key={module} style={{ padding:'10px 14px', borderRadius:10, background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                    <span style={{ fontWeight:700, color:COULEURS.navy }}>{moduleLabel(module)}</span>
                    <span style={{ color:COULEURS.gris600, fontWeight:600 }}>{count} action{count>1?'s':''}</span>
                  </div>
                  <div style={{ height:5, background:COULEURS.gris200, borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, width:`${pct}%`, background:couleurTheme, transition:'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={rechercheInput} onChange={e => setRechercheInput(e.target.value)}
          placeholder="🔍 Rechercher admin, détail, action…"
          style={{ flex:1, minWidth:220, padding:'9px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy }} />
        <select value={filtreModule} onChange={e => filtrer(() => setFiltreModule(e.target.value))}
          style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}>
          <option value="tous">Tous les modules</option>
          {MODULES_AUDIT.map(m => <option key={m.id} value={m.id}>{m.lib}</option>)}
        </select>
        <select value={filtreRole} onChange={e => filtrer(() => setFiltreRole(e.target.value))}
          style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}>
          <option value="tous">Tous les rôles</option>
          {Object.keys(ROLE_LIB).map(r => <option key={r} value={r}>{ROLE_LIB[r]}</option>)}
        </select>
        <select value={filtreStatut} onChange={e => filtrer(() => setFiltreStatut(e.target.value))}
          style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}>
          <option value="tous">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.lib}</option>)}
        </select>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:COULEURS.gris600, fontWeight:600 }}>Du</span>
          <input type="date" value={dateDebut} onChange={e => filtrer(() => setDateDebut(e.target.value))}
            style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }} />
          <span style={{ fontSize:11, color:COULEURS.gris600, fontWeight:600 }}>au</span>
          <input type="date" value={dateFin} onChange={e => filtrer(() => setDateFin(e.target.value))}
            style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }} />
          {(dateDebut || dateFin) && (
            <button onClick={() => filtrer(() => { setDateDebut(''); setDateFin(''); })}
              style={{ background:'none', border:'none', color:COULEURS.gris400, fontSize:12, cursor:'pointer', padding:'4px 6px' }}>✕</button>
          )}
        </div>
        <span style={{ fontSize:12, color:COULEURS.gris600 }}>{total} entrée{total>1?'s':''}</span>
      </div>

      {/* ── Tableau ── */}
      <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}`, marginBottom:20 }}>
        {/* En-tête */}
        <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.2fr 0.9fr 1fr 2fr 0.7fr', padding:'11px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
          <span>Date / Heure</span><span>Administrateur</span><span>Module</span><span>Action</span><span>Détail</span><span>Statut</span>
        </div>

        {chargement && (
          <div style={{ padding:48, textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>Chargement…</div>
        )}

        {!chargement && logs.length === 0 && (
          <div style={{ padding:48, textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>
            Aucune action ne correspond aux filtres sélectionnés.
          </div>
        )}

        {!chargement && logs.map((log, idx) => {
          const ac = actionConfig(log.action_type);
          const st = STATUT_CONFIG[log.statut] || STATUT_CONFIG.info;
          const rc = ROLE_COULEURS[log.acteur_role] || COULEURS.gris400;
          return (
            <div key={log.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.2fr 0.9fr 1fr 2fr 0.7fr', padding:'13px 20px', borderBottom: idx < logs.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: log.statut === 'danger' ? '#FFF5F5' : log.statut === 'warning' ? '#FFFBEB' : COULEURS.blanc, cursor:'pointer' }}
              onClick={() => setDetail(log)}>
              <div>
                <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:11 }}>{formaterDate(log.created_at)}</div>
              </div>
              <div>
                <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:12 }}>{log.acteur_nom || log.acteur_email || 'Système'}</div>
                <span style={{ display:'inline-block', marginTop:3, padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:700, background:rc + '18', color:rc }}>
                  {roleLabel(log.acteur_role)}
                </span>
              </div>
              <span style={{ fontSize:11, fontWeight:600, color:COULEURS.gris600 }}>{moduleLabel(log.module)}</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:ac.bg, color:ac.txt, width:'fit-content' }}>
                <span>{ac.icone}</span>{actionLabel(log.action_type)}
              </span>
              <div style={{ fontSize:11, color:COULEURS.gris600, lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{log.detail}</div>
              <div>
                <span style={{ padding:'3px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:st.bg, color:st.txt }}>{st.lib}</span>
              </div>
            </div>
          );
        })}

        {/* Pagination */}
        {nbPages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderTop:`1px solid ${COULEURS.gris100}` }}>
            <span style={{ fontSize:12, color:COULEURS.gris600 }}>
              Page {page} sur {nbPages} · {total} entrée{total>1?'s':''}
            </span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ ...btnPage(false), opacity:page===1?0.35:1 }}>‹</button>
              {Array.from({ length:nbPages }, (_, i) => i+1).filter(p => Math.abs(p-page) <= 2 || p===1 || p===nbPages).map((p, i, arr) => (
                <Fragment key={p}>
                  {i > 0 && arr[i-1] !== p-1 && <span style={{ color:COULEURS.gris400, fontSize:12 }}>…</span>}
                  <button onClick={() => setPage(p)} style={btnPage(p===page)}>{p}</button>
                </Fragment>
              ))}
              <button onClick={() => setPage(p => Math.min(nbPages, p+1))} disabled={page===nbPages} style={{ ...btnPage(false), opacity:page===nbPages?0.35:1 }}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal détail ── */}
      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }} onClick={() => setDetail(null)}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            {/* En-tête modal */}
            <div style={{ background:'linear-gradient(135deg, #0F172A, #1E3A5F)', borderRadius:'18px 18px 0 0', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>🔍 Détail de l'action</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', marginTop:2 }}>#{String(detail.id).slice(0, 8)}</div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
            </div>
            {/* Corps modal */}
            <div style={{ padding:'24px' }}>
              {[
                ['Date / Heure',   formaterDate(detail.created_at)],
                ['Administrateur', detail.acteur_nom || detail.acteur_email || 'Système'],
                ['Rôle',           roleLabel(detail.acteur_role)],
                ['Module',         moduleLabel(detail.module)],
                ['Action',         actionConfig(detail.action_type).icone + ' ' + actionLabel(detail.action_type)],
                ['Entité',         detail.entite_nom || (detail.entite_id ? `ID technique : ${detail.entite_id}` : '-')],
                ['Détail',         detail.detail || '-'],
                ['Adresse IP',     detail.ip_address || '-'],
                ['Statut',         STATUT_CONFIG[detail.statut]?.lib || detail.statut],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 0', borderBottom:`1px solid ${COULEURS.gris100}`, gap:16 }}>
                  <span style={{ fontSize:12, color:COULEURS.gris600, fontWeight:600, flexShrink:0 }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, textAlign:'right' }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris100}`, display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setDetail(null)} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ── Équipe pédagogique avec sous-onglets ─────────────────────────────────────
export function EquipePedagogique() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [onglet, setOnglet] = useTabState('tous', 'onglet_equipe');
  const [detail, setDetail] = useState(null);

  const titulaires   = MOCK_PROFESSEURS.filter(p => estRole(p.role, 'professeur_titulaire'));
  const remplacants  = MOCK_PROFESSEURS.filter(p => estRole(p.role, 'professeur_remplacant'));
  const liste        = onglet === 'titulaires' ? titulaires : onglet === 'remplacants' ? remplacants : MOCK_PROFESSEURS;

  const TABS = [
    { id: 'tous',        lib: 'Tous',         count: MOCK_PROFESSEURS.length,  accent: COULEURS.navy    },
    { id: 'titulaires',  lib: 'Titulaires',   count: titulaires.length,        accent: couleurTheme    },
    { id: 'remplacants', lib: 'Remplaçants',  count: remplacants.length,       accent: '#8B5CF6'        },
  ];

  const CONTRAT_STYLE = {
    CDI:     { bg:'#D1FAE5', txt:'#065F46' },
    CDD:     { bg:'#FEF9C3', txt:'#92400E' },
    Vacation:{ bg:'#EDE9FE', txt:'#5B21B6' },
  };

  function etoiles(note) {
    if (note === null) return <span style={{ fontSize:11, color:COULEURS.gris400, fontStyle:'italic' }}>-</span>;
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:2 }}>
        {'★★★★★'.split('').map((_, i) => (
          <span key={i} style={{ fontSize:13, color: i < Math.round(note) ? '#F59E0B' : COULEURS.gris200 }}>★</span>
        ))}
        <span style={{ fontSize:11, color:COULEURS.gris600, marginLeft:4, fontWeight:600 }}>{note.toFixed(1)}</span>
      </span>
    );
  }

  return (
    <div style={{ marginBottom:32 }}>
      {/* ── Titre + KPIs rapides ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy }}>👨‍🏫 Équipe pédagogique</div>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { l:'Actifs',    v: MOCK_PROFESSEURS.filter(p => p.est_actif).length,             c: COULEURS.succes   },
            { l:'Inactifs',  v: MOCK_PROFESSEURS.filter(p => !p.est_actif).length,            c: COULEURS.rouge    },
            { l:'Sessions/mois', v: MOCK_PROFESSEURS.reduce((s,p) => s + p.sessions_mois, 0), c: couleurTheme     },
          ].map(k => (
            <div key={k.l} style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:10, padding:'8px 14px', textAlign:'center', minWidth:80 }}>
              <div style={{ fontSize:18, fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
              <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sous-onglets ── */}
      <div style={{ display:'flex', gap:0, marginBottom:0, background:COULEURS.blanc, borderRadius:'12px 12px 0 0', border:`1px solid ${COULEURS.gris200}`, borderBottom:'none', overflow:'hidden' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setOnglet(t.id)}
            style={{
              flex:1, padding:'12px 16px', border:'none', cursor:'pointer',
              background: onglet === t.id ? COULEURS.blanc : COULEURS.gris50,
              borderBottom: onglet === t.id ? `3px solid ${t.accent}` : `3px solid transparent`,
              borderRight: `1px solid ${COULEURS.gris200}`,
              fontFamily:'"Plus Jakarta Sans", sans-serif',
              fontWeight: onglet === t.id ? 700 : 500,
              fontSize: 13,
              color: onglet === t.id ? t.accent : COULEURS.gris600,
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all 0.15s',
            }}
          >
            {t.lib}
            <span style={{ background: onglet === t.id ? t.accent : COULEURS.gris200, color: onglet === t.id ? '#fff' : COULEURS.gris600, borderRadius:20, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Tableau ── */}
      <div style={{ background:COULEURS.blanc, borderRadius:'0 0 12px 12px', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:`1px solid ${COULEURS.gris200}`, borderTop:'none' }}>
        {/* En-tête */}
        <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr 2fr 1fr 0.8fr 1fr 1fr 0.9fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
          <span>Professeur</span>
          <span>Contrat</span>
          <span>Spécialité</span>
          <span>Niveaux</span>
          <span>Groupes</span>
          <span>Sessions/mois</span>
          <span>Évaluation</span>
          <span>Statut</span>
        </div>

        {liste.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>
            Aucun professeur dans cette catégorie.
          </div>
        )}

        {liste.map((p, idx) => {
          const cs = CONTRAT_STYLE[p.contrat] || { bg:COULEURS.gris100, txt:COULEURS.gris600 };
          const estRempl = estRole(p.role, 'professeur_remplacant');
          return (
            <div
              key={p.id}
              style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr 2fr 1fr 0.8fr 1fr 1fr 0.9fr', padding:'14px 20px', borderBottom: idx < liste.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => setDetail(p)}
            >
              {/* Nom */}
              <div>
                <div style={{ fontWeight:700, color:COULEURS.navy }}>{p.prenom} {p.nom}</div>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background: estRempl ? '#EDE9FE' : '#E0F2FE', color: estRempl ? '#5B21B6' : couleurThemeFonce }}>
                    {estRempl ? '🔄 Remplaçant' : '🎓 Titulaire'}
                  </span>
                </div>
              </div>
              {/* Contrat */}
              <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:cs.bg, color:cs.txt, width:'fit-content' }}>
                {p.contrat}
              </span>
              {/* Spécialité */}
              <span style={{ color:COULEURS.gris600, fontSize:12 }}>{p.specialite}</span>
              {/* Niveaux */}
              <span style={{ fontSize:11, fontWeight:600, color:couleurThemeFonce, background:couleurThemeClair, padding:'2px 8px', borderRadius:6, width:'fit-content' }}>
                {p.niveaux}
              </span>
              {/* Groupes */}
              <span style={{ fontWeight:700, color: p.nb_groupes > 0 ? COULEURS.navy : COULEURS.gris400, textAlign:'center' }}>
                {p.nb_groupes}
              </span>
              {/* Sessions */}
              <span style={{ fontWeight:600, color: p.sessions_mois > 0 ? couleurTheme : COULEURS.gris400, textAlign:'center' }}>
                {p.sessions_mois > 0 ? p.sessions_mois : '-'}
              </span>
              {/* Évaluation */}
              <div>{etoiles(p.evaluation)}</div>
              {/* Statut */}
              <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, background: p.est_actif ? '#D1FAE5' : '#FEE2E2', color: p.est_actif ? '#065F46' : '#991B1B' }}>
                {p.est_actif ? '● Actif' : '● Inactif'}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Modal détail professeur (avec onglets) ── */}
      {detail && <ModalProfSuivi prof={detail} onFermer={() => setDetail(null)} />}
    </div>
  );
}


// ── Composant Administration BET ──────────────────────────────────────────────

const ROLES_BET = [
  { id:'admin_manager',        lib:'Manager BET',         couleur:'#1E40AF', fond:'#DBEAFE', icone:'👑' },
  { id:'admin_superviseur',        lib:'Superviseur',        couleur:'#065F46', fond:'#D1FAE5', icone:'👁️' },
  { id:'admin_deputy_superviseur', lib:'Deputy Superviseur', couleur:'#6D28D9', fond:'#F3E8FF', icone:'🔎' },
  { id:'admin_responsable',        lib:'Responsable',        couleur:'#6D28D9', fond:'#EDE9FE', icone:'🎯' },
  { id:'admin_gestionnaire',   lib:'Gestionnaire',         couleur:'#0369A1', fond:'#E0F2FE', icone:'⚙️' },
  { id:'admin_placement',      lib:'Agent Placement',      couleur:'#92400E', fond:'#FEF3C7', icone:'📋' },
  { id:'admin_onboarding',     lib:'Agent Onboarding',     couleur:'#5B21B6', fond:'#EDE9FE', icone:'🎓' },
  { id:'admin_elearning',      lib:'Assistant E-Learning', couleur:'#0D9488', fond:'#CCFBF1', icone:'💻' },
  { id:'admin_customer_care',  lib:'Customer Care',        couleur:'#9D174D', fond:'#FCE7F3', icone:'🎧' },
  { id:'admin_rh_paie',        lib:'RH / Paie',            couleur:'#7C3AED', fond:'#EDE9FE', icone:'💼' },
  { id:'admin_comptable',      lib:'Comptable',            couleur:'#B45309', fond:'#FEF3C7', icone:'💰' },
  { id:'admin_pa_advisor',     lib:'PA Advisor',           couleur:'#1D4ED8', fond:'#DBEAFE', icone:'🤝' },
  { id:'professeur_titulaire', lib:'Prof. Titulaire',      couleur:'#0891B2', fond:'#E0F2FE', icone:'👨‍🏫' },
];

export function OngletAdministrationBET() {
  const C = { navy:'#0F172A', gris50:'#F8FAFC', gris100:'#F1F5F9', gris200:'#E2E8F0', gris400:'#94A3B8', gris600:'#475569', blanc:'#FFFFFF' };

  const [ongletRole,    setOngletRole]    = useState(ROLES_BET[0].id);
  const [recherche,     setRecherche]     = useState('');
  const [selectionne,   setSelectionne]   = useState(null);
  const [usersReels,    setUsersReels]    = useState(null); // null = pas encore chargé
  const [chargement,    setChargement]    = useState(false);

  const chargerUsers = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/admin/utilisateurs`, { headers: _authHdrsAdmin() });
      if (r.ok) {
        const d = await r.json();
        setUsersReels((d.utilisateurs || []).map(_mapUserAdmin));
      } else {
        setUsersReels([]);
      }
    } catch {
      setUsersReels([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { chargerUsers(); }, [chargerUsers]);

  // Uniquement les profils ayant accès e-learning (accordé depuis BET) ou créés directement ici
  const allUsers = (usersReels ?? []).filter(u => u.acces_elearning === true);

  const roleActif = ROLES_BET.find(r => r.id === ongletRole);

  const membresRole = allUsers.filter(u => u.role === ongletRole);
  const membresFiltres = recherche.trim()
    ? membresRole.filter(u => `${u.prenom} ${u.nom} ${u.email} ${u.description}`.toLowerCase().includes(recherche.toLowerCase()))
    : membresRole;

  // ── Modal détail ──
  function ModalDetail({ user, onClose }) {
    const role = ROLES_BET.find(r => r.id === user.role) || { lib: user.role, couleur:'#475569', fond:'#F1F5F9', icone:'👤' };
    const initiales = `${(user.prenom||'')[0]}${(user.nom||'')[0]}`.toUpperCase();

    function Ligne({ l, v, accent, rouge, vert }) {
      return (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${C.gris100}`, fontSize:13 }}>
          <span style={{ color:C.gris600, flexShrink:0 }}>{l}</span>
          <span style={{ fontWeight:600, color: rouge?'#DC2626':vert?'#059669':accent?role.couleur:C.navy, textAlign:'right', marginLeft:12 }}>{v ?? '-'}</span>
        </div>
      );
    }

    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2100, padding:16 }} onClick={onClose}>
        <div style={{ background:C.blanc, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>

          {/* ── Header ── */}
          <div style={{ background:`linear-gradient(135deg, ${role.couleur}, ${role.couleur}BB)`, padding:'22px 26px', color:'#fff', display:'flex', gap:16, alignItems:'center' }}>
            <div style={{ width:56, height:56, borderRadius:16, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, flexShrink:0 }}>
              {role.icone}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:2 }}>{user.prenom} {user.nom}</div>
              <div style={{ fontSize:12, opacity:0.85 }}>{role.lib}</div>
              <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>{user.email}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
              <span style={{ background: user.est_actif?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.2)', padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                {user.est_actif ? '✅ Actif' : '🔴 Inactif'}
              </span>
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:'4px 10px', color:'#fff', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>✕</button>
            </div>
          </div>

          {/* ── Corps ── */}
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>

            {/* Informations générales */}
            <div style={{ background:C.gris50, borderRadius:12, padding:'4px 16px', marginBottom:20, border:`1px solid ${C.gris200}` }}>
              <Ligne l="Description"        v={user.description} />
              <Ligne l="Rôle"               v={role.lib} accent />
              <Ligne l="Email"              v={user.email} />
              <Ligne l="Authentification 2FA" v={user.deux_facteurs ? '🔐 Activée' : '✗ Non activée'} vert={user.deux_facteurs} rouge={!user.deux_facteurs} />
              <Ligne l="Compte créé le"     v={user.date_creation} />
              <Ligne l="Dernière connexion" v={user.derniere_connexion} />
            </div>

            {/* Permissions */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                🛡️ Permissions attribuées
                <span style={{ background:C.gris100, color:C.gris600, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>
                  {(user.permissions || []).length === 1 && user.permissions[0] === 'all' ? 'Accès complet' : `${(user.permissions||[]).length} permission(s)`}
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                {(user.permissions || []).includes('all') ? (
                  <span style={{ padding:'6px 14px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:12, fontWeight:700 }}>
                    ⭐ Accès total - toutes permissions
                  </span>
                ) : (user.permissions || []).map(p => (
                  <span key={p} style={{ padding:'5px 12px', borderRadius:20, background:role.fond, color:role.couleur, fontSize:11, fontWeight:600 }}>{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* En-tête */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:20, fontWeight:800, color:C.navy, marginBottom:4 }}>🗂️ Administration BET</div>
        <div style={{ fontSize:13, color:C.gris400 }}>
          {chargement ? '⏳ Chargement des profils…' : `${allUsers.length} profil(s) avec accès E-Learning - ajoutés depuis BET ou créés directement`}
        </div>
      </div>

      {/* Sous-onglets par rôle */}
      <div style={{ display:'flex', gap:8, marginBottom:22, flexWrap:'wrap' }}>
        {ROLES_BET.map(r => {
          const nb = allUsers.filter(u => u.role === r.id).length;
          const actif = ongletRole === r.id;
          return (
            <button key={r.id} onClick={() => { setOngletRole(r.id); setRecherche(''); setSelectionne(null); }}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:22, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border: actif ? 'none' : `1.5px solid ${C.gris200}`, transition:'all 0.15s',
                background: actif ? r.couleur : C.blanc,
                color:      actif ? '#fff' : C.gris600,
                boxShadow:  actif ? `0 4px 14px ${r.couleur}55` : 'none',
              }}>
              <span>{r.icone}</span>
              <span>{r.lib}</span>
              {nb > 0 && <span style={{ background: actif?'rgba(255,255,255,0.3)':C.gris100, color: actif?'#fff':C.gris600, fontSize:10, fontWeight:800, padding:'1px 7px', borderRadius:20 }}>{nb}</span>}
            </button>
          );
        })}
      </div>

      {/* Bandeau rôle actif */}
      {roleActif && (
        <div style={{ background: roleActif.fond, border:`1px solid ${roleActif.couleur}40`, borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:28 }}>{roleActif.icone}</span>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:roleActif.couleur }}>{roleActif.lib}</div>
            <div style={{ fontSize:12, color:C.gris600, marginTop:2 }}>
              {membresRole.length} membre{membresRole.length > 1 ? 's' : ''} · {membresRole.filter(u => u.est_actif).length} actif{membresRole.filter(u=>u.est_actif).length>1?'s':''}
            </div>
          </div>
        </div>
      )}

      {/* Recherche */}
      {membresRole.length > 0 && (
        <div style={{ position:'relative', marginBottom:16 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:C.gris400 }}>🔍</span>
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder={`Rechercher dans ${roleActif?.lib || ''}…`}
            style={{ width:'100%', padding:'10px 14px 10px 36px', borderRadius:10, border:`1.5px solid ${C.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box' }} />
          {recherche && <button onClick={() => setRecherche('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', fontSize:15, cursor:'pointer', color:C.gris400 }}>✕</button>}
        </div>
      )}

      {/* Liste des membres */}
      {membresRole.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', color:C.gris400, background:C.gris50, borderRadius:12, border:`1px dashed ${C.gris200}` }}>
          <div style={{ fontSize:36, marginBottom:8 }}>{roleActif?.icone}</div>
          <div style={{ fontWeight:600, marginBottom:4 }}>Aucun membre pour ce rôle</div>
          <div style={{ fontSize:12 }}>Ce profil n'a pas encore de membres assignés.</div>
        </div>
      ) : membresFiltres.length === 0 ? (
        <div style={{ textAlign:'center', padding:24, color:C.gris400 }}>Aucun résultat pour "{recherche}"</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:12 }}>
          {membresFiltres.map(user => {
            const role = ROLES_BET.find(r => r.id === user.role);
            return (
              <div key={user.id}
                onClick={() => setSelectionne(user)}
                style={{ background:C.blanc, borderRadius:14, border:`1px solid ${C.gris200}`, borderLeft:`4px solid ${role?.couleur || C.gris200}`, padding:'16px 18px', cursor:'pointer', transition:'box-shadow 0.15s', display:'flex', gap:14, alignItems:'center' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                {/* Avatar */}
                <div style={{ width:46, height:46, borderRadius:12, background:role?.fond, color:role?.couleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, flexShrink:0 }}>
                  {`${(user.prenom||'')[0]}${(user.nom||'')[0]}`.toUpperCase()}
                </div>
                {/* Infos */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:2 }}>{user.prenom} {user.nom}</div>
                  <div style={{ fontSize:12, color:C.gris400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{user.email}</div>
                  <div style={{ fontSize:11, color:C.gris600 }}>{user.description}</div>
                </div>
                {/* Statut */}
                <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                  <span style={{ padding:'3px 9px', borderRadius:20, background:user.est_actif?'#D1FAE5':'#F1F5F9', color:user.est_actif?'#065F46':'#64748B', fontSize:10, fontWeight:700 }}>
                    {user.est_actif ? '● Actif' : '● Inactif'}
                  </span>
                  {user.deux_facteurs && <span style={{ fontSize:10, color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:20, fontWeight:700 }}>🔐 2FA</span>}
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background: user.source === 'bet_elearning' ? '#EDE9FE' : '#E0F2FE', color: user.source === 'bet_elearning' ? '#6D28D9' : '#0369A1' }}>
                    {user.source === 'bet_elearning' ? '✦ Créé ici' : '↗ Via BET'}
                  </span>
                  <span style={{ color:C.gris400, fontSize:16 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectionne && <ModalDetail user={selectionne} onClose={() => setSelectionne(null)} />}
    </>
  );
}
function fmtFCFAVueEnsemble(v) {
  const n = Number(v) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

const MODULE_LABELS_VUE_ENSEMBLE = {
  auth: 'Authentification', entreprise: 'Entreprise', crm_entreprises: 'CRM Entreprises',
  contrat: 'Contrats', finances: 'Finances', roles: 'Rôles & permissions',
  crm_beneficiaires: 'Bénéficiaires', crm_comptes_acces: 'Comptes & accès',
  classes: 'Classes', inscriptions: 'Inscriptions', rapports: 'Rapports',
  configuration: 'Configuration', system: 'Système',
};

// ONGLET VUE D'ENSEMBLE MANAGER BET - standalone (route /admin/manager)
// Remplace l'ancien contenu 100% factice (MOCK_APPRENANTS/MOCK_PROFESSEURS/MOCK_GROUPES,
// "Calendrier des évaluations" statique, "Facturation en attente" sur MOCK_FACTURES) par une
// vraie synthèse chiffrée de chaque onglet réel du menu Manager BET (Professeurs, Entreprises,
// Gestion des droits, Audit logs, Notifications, Messages) - chaque carte renvoie vers l'onglet
// correspondant, sans dupliquer les actions qui y vivent déjà.
export function OngletVueEnsembleManager() {
  const navigate = useNavigate();
  const { nbNonLus } = useMessagerie() || {};
  const [chargement, setChargement] = useState(true);
  const [stats, setStats] = useState({
    professeurs: null,
    entreprisesActives: null,
    entreprisesEnAttente: null,
    entreprisesRefusees: null,
    utilisateurs: null,
    actionsAujourdhui: null,
    notifsNonLues: null,
    montantContrats: null,
    totalEncaisse: null,
    soldeRestant: null,
    contratsExpirentBientot: 0,
  });
  const [parModule, setParModule] = useState([]);
  const [parHeure, setParHeure]   = useState([]);
  const [parRole, setParRole]     = useState([]);
  const [encaisseParMois, setEncaisseParMois] = useState([]);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [entR, usersR, auditR, notifsR, paieR] = await Promise.all([
          fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          // Même route que l'onglet "Professeurs" réel (?role=coach) - /api/coachs pointe vers
          // une autre table, sans rapport, qui renvoyait toujours 0 ici.
          fetch(`${_API_URL_ADMIN}/api/admin/utilisateurs`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/audit/stats?plateforme=bet-elearning`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/notifications/mes-notifs?limit=50`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`${_API_URL_ADMIN}/api/entreprise/admin/paiements`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (annule) return;
        const entreprises = entR?.entreprises || [];
        const utilisateurs = usersR?.utilisateurs || [];
        const paiements = paieR?.paiements || [];
        /* `acces_elearning` est le seul marqueur dont dispose la table `utilisateurs` : elle
           n'a pas de colonne `plateforme`, les comptes étant communs aux deux plateformes.
           C'est donc lui qui distingue « a accès à BET E-Learning » de « existe chez BET ». */
        const utilisateursElearning = utilisateurs.filter(u => u.acces_elearning);
        const montantContrats = entreprises.reduce((s, e) => s + (e.montant_contrat || 0), 0);
        const totalEncaisse = paiements.reduce((s, p) => s + (p.montant || 0), 0);
        setStats({
          // Même filtre que l'onglet réel (GestionProfesseurs.jsx) : seuls les coachs habilités
          // à la plateforme e-learning comptent, pas tous les comptes role='coach'.
          professeurs:           utilisateurs.filter(u => u.role === 'coach' && u.acces_elearning).length,
          entreprisesActives:    entreprises.filter(e => e.statut === 'actif').length,
          entreprisesEnAttente:  entreprises.filter(e => e.statut === 'en_attente').length,
          entreprisesRefusees:   entreprises.filter(e => e.statut === 'refuse').length,
          /* MÊME FILTRE QUE « Professeurs » JUSTE AU-DESSUS, et pour la même raison.
             `utilisateurs.length` comptait TOUS les comptes de la base — 343, dont 189 coachs
             de dash, 85 apprenants et 19 parents — alors que 4 seulement sont habilités à
             BET E-Learning. Le chiffre était faux d'un facteur quatre-vingt-cinq et décrivait
             l'effectif de dash sur le tableau de bord de l'e-learning. */
          utilisateurs:          utilisateursElearning.length,
          actionsAujourdhui:     auditR?.total_today ?? null,
          notifsNonLues:         (notifsR?.notifications || []).filter(n => !n.lu).length,
          montantContrats,
          totalEncaisse,
          soldeRestant:          Math.max(0, montantContrats - totalEncaisse),
          contratsExpirentBientot: entreprises.filter(e => e.statut === 'actif' && e.date_fin_contrat && joursRestants(e.date_fin_contrat) >= 0 && joursRestants(e.date_fin_contrat) <= 30).length,
        });
        setParModule((auditR?.par_module || []).slice(0, 8).map(m => ({ nom: MODULE_LABELS_VUE_ENSEMBLE[m.module] || m.module, actions: m.count })));
        setParHeure(auditR?.par_heure || []);
        /* La répartition par rôle souffrait du même défaut : elle dessinait la pyramide des
           rôles de dash. Elle ne décrit plus que les comptes habilités ici. */
        const roleMap = {};
        for (const u of utilisateursElearning) { const r = LIBELLES_ROLES_VUE_ENSEMBLE[u.role] || u.role; roleMap[r] = (roleMap[r] || 0) + 1; }
        setParRole(Object.entries(roleMap).map(([nom, valeur]) => ({ nom, valeur })).sort((a, b) => b.valeur - a.valeur).slice(0, 8));

        // Encaissement des 6 derniers mois (pour la courbe financière)
        const moisMap = {};
        const maintenant = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
          const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          moisMap[cle] = { cle, mois: d.toLocaleDateString('fr-FR', { month: 'short' }), montant: 0 };
        }
        for (const p of paiements) {
          if (!p.date) continue;
          const cle = p.date.slice(0, 7);
          if (moisMap[cle]) moisMap[cle].montant += (p.montant || 0);
        }
        setEncaisseParMois(Object.values(moisMap));
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, []);

  // Même ordre thématique que le menu : opérationnel (Entreprises → Professeurs) →
  // administration système (Droits, Audit) → communication (Notifications, Messages).
  const cartes = [
    { titre: 'Entreprises actives',sousTitre: 'contrats en cours',        icone: '🏢', valeur: stats.entreprisesActives,   chemin: '/admin/entreprises',           couleur: '#059669' },
    { titre: 'En attente',         sousTitre: 'inscriptions à valider',   icone: '⏳', valeur: stats.entreprisesEnAttente, chemin: '/admin/entreprises',           couleur: '#F59E0B' },
    { titre: 'Refusées',           sousTitre: 'entreprises',              icone: '❌', valeur: stats.entreprisesRefusees,  chemin: '/admin/entreprises',           couleur: '#DC2626' },
    { titre: 'Encaissé',           sousTitre: 'tous contrats confondus',  icone: '💰', valeur: stats.totalEncaisse != null ? fmtFCFAVueEnsemble(stats.totalEncaisse) : null, chemin: '/admin/entreprises', couleur: '#059669' },
    { titre: 'Solde restant dû',   sousTitre: 'tous contrats confondus',  icone: '⚖️', valeur: stats.soldeRestant != null ? fmtFCFAVueEnsemble(stats.soldeRestant) : null,   chemin: '/admin/entreprises', couleur: stats.soldeRestant > 0 ? '#DC2626' : '#059669' },
    { titre: 'Professeurs',        sousTitre: 'actifs sur la plateforme', icone: '👨‍🏫', valeur: stats.professeurs,          chemin: '/admin/manager/professeurs',   couleur: COULEURS.cyan },
    { titre: 'Gestion des droits', sousTitre: 'utilisateurs internes',    icone: '🛡️', valeur: stats.utilisateurs,         chemin: '/admin/droits',                couleur: '#7C3AED' },
    { titre: 'Audit logs',         sousTitre: "actions aujourd'hui",      icone: '🕵️', valeur: stats.actionsAujourdhui,    chemin: '/admin/audit-logs',            couleur: '#0F172A' },
    { titre: 'Notifications',      sousTitre: 'non lues',                 icone: '🔔', valeur: stats.notifsNonLues,        chemin: '/admin/notifications',         couleur: '#EA580C' },
    { titre: 'Messages',           sousTitre: 'non lus',                  icone: '💬', valeur: nbNonLus ?? 0,              chemin: '/admin/messages',              couleur: '#0891B2' },
  ];

  return (
    <div>
      <div style={{ fontSize: 13, color: COULEURS.gris600, marginBottom: 20 }}>
        Vue d'ensemble - un coup d'œil sur chaque module de la plateforme. Cliquez sur une carte pour l'ouvrir.
      </div>

      {!chargement && stats.contratsExpirentBientot > 0 && (
        <div onClick={() => navigate('/admin/entreprises')} style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#92400E' }}>
            <strong>{stats.contratsExpirentBientot} contrat{stats.contratsExpirentBientot > 1 ? 's' : ''}</strong> expire{stats.contratsExpirentBientot > 1 ? 'nt' : ''} dans moins de 30 jours. Pensez à contacter les entreprises concernées pour le renouvellement.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        {cartes.map(c => (
          <div key={c.titre} onClick={() => navigate(c.chemin)}
            style={{ background: COULEURS.blanc, borderRadius: 14, padding: '20px', border: `1px solid ${COULEURS.gris200}`, borderTop: `4px solid ${c.couleur}`, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}
          >
            <div style={{ fontSize: 26, marginBottom: 8 }}>{c.icone}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.couleur }}>{chargement ? '…' : (c.valeur ?? '-')}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginTop: 6 }}>{c.titre}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>{c.sousTitre}</div>
          </div>
        ))}
      </div>

      {/* ── Courbes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 28 }}>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>🏢 Répartition des entreprises</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { nom: 'Actives',    valeur: stats.entreprisesActives,   couleur: '#059669' },
                    { nom: 'En attente', valeur: stats.entreprisesEnAttente, couleur: '#F59E0B' },
                    { nom: 'Refusées',   valeur: stats.entreprisesRefusees,  couleur: '#DC2626' },
                  ]}
                  dataKey="valeur" nameKey="nom" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}
                >
                  {[
                    { couleur: '#059669' }, { couleur: '#F59E0B' }, { couleur: '#DC2626' },
                  ].map((s, i) => <Cell key={i} fill={s.couleur} />)}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>🕵️ Activité par module (aujourd'hui)</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : parModule.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucune action aujourd'hui.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={parModule} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nom" width={110} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="actions" fill={COULEURS.cyan} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>📈 Activité par heure (aujourd'hui)</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : parHeure.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucune action aujourd'hui.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={parHeure}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="heure" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Line type="monotone" dataKey="count" stroke="#7C3AED" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>🛡️ Utilisateurs internes par rôle</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : parRole.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Aucune donnée.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={parRole}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nom" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="valeur" fill="#7C3AED" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: COULEURS.blanc, borderRadius: 14, padding: 20, border: `1px solid ${COULEURS.gris200}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, marginBottom: 14 }}>💰 Encaissement - 6 derniers mois</div>
          {chargement ? (
            <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400, fontSize: 12 }}>Chargement…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={encaisseParMois}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtFCFAVueEnsemble} />
                <RTooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} FCFA`} />
                <Bar dataKey="montant" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

      </div>
    </div>
  );
}

/* Table centrale : cette copie rejouait l'ancienne fusion et affichait un Super Admin
   comme « Manager BET » dans la liste des administrateurs. */
const _ROLE_MAP_ADMIN = ROLE_MAP_BET;

function _mapUserAdmin(u) {
  const info = u.coach_info || {};
  return {
    id:              u.id,
    prenom:          u.prenom || '',
    nom:             u.nom || '',
    email:           u.email || '',
    initiales:       `${(u.prenom||'')[0]||''}${(u.nom||'')[0]||''}`.toUpperCase() || '?',
    role:            _ROLE_MAP_ADMIN[u.role] || 'admin_elearning',
    description:     u.departement || info.filiere || '',
    est_actif:       u.actif !== false,
    deux_facteurs:   u.twofa_active === true,
    photo:           u.avatar_url || info.photo_url || null,
    permissions:     u.permissions || [],
    date_creation:   u.createdAt || u.created_at || '',
    derniere_connexion: u.derniere_connexion
      ? new Date(u.derniere_connexion).toLocaleString('fr-FR')
      : 'Jamais',
    acces_elearning: u.acces_elearning === true,
    source:          u.source || 'bet_system',
  };
}
