// DashboardPaAdvisor.jsx - Module PA Advisor extrait de DashboardAdmin.jsx (profil admin_pa_advisor)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTabState } from '../../hooks/useTabState';
import { useAlerte } from '../../contexts/ConfirmContext';
import { useTheme } from '../../contexts/ThemeContext';
import { COULEURS } from '../../constants/couleurs';
import { genererPDF, fmtDatePDF, exporterExcelStyle } from '../../utils/genererPDF';
import { ModalDetailApprenant } from './DashboardAdminShared';
import { dureeReelleMin } from '../../components/shared/DerouleReel';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}` });
const SUP_COLOR = '#7C3AED'; // dupliqué de DashboardSuperviseur.jsx (couleur de la marque "Superviseur")
// dupliqué de DashboardSuperviseur.jsx - utilisé par OngletRapportsSuperviseurPA (lecture des rapports transmis par le Superviseur)
function supAuthHdrs() {
  const token = localStorage.getItem('admin_token') || '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Plateforme': 'bet-elearning' };
}
function fmtDateSup(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
// type_contrat réel = coach_info.type_contrat (JSON) - type_coach est le rôle, pas le grade
function getTypeContrat(c) { return c?.coach_info?.type_contrat || c?.type_coach || 'Vacataire'; }

export function OngletCoachsPAAdvisor() {
  const [coaches,      setCoaches]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filtreType,   setFiltreType]   = useState('tous');
  const [pageCoachs,   setPageCoachs]   = useState(1);
  const COACHS_PAR_PAGE = 10;
  const [modalCoach,   setModalCoach]   = useState(null);
  const [ongletModal,  setOngletModal]  = useState('infos');

  // Données du modal (chargées à l'ouverture)
  const [profil,       setProfil]       = useState(null);
  const [seances,      setSeances]      = useState([]);
  const [honoraires,   setHonoraires]   = useState([]);
  const [evaluations,  setEvaluations]  = useState([]);
  const [loadModal,    setLoadModal]    = useState(false);

  // Pagination + filtres Sessions
  const [sDateFrom,    setSDateFrom]    = useState('');
  const [sDateTo,      setSDateTo]      = useState('');
  const [sStatut,      setSStatut]      = useState('tous');
  const [sPage,        setSPage]        = useState(0);
  const S_PER_PAGE = 10;

  // Pagination + filtres Évaluations
  const [eDateFrom,    setEDateFrom]    = useState('');
  const [eDateTo,      setEDateTo]      = useState('');
  const [ePage,        setEPage]        = useState(0);
  const [evalOpen,     setEvalOpen]     = useState(new Set());
  const E_PER_PAGE = 8;

  const TYPE_CONTRAT_COULEURS = {
    Vacataire: { bg:'#FEF3C7', c:'#92400E', bord:'#FDE68A' },
    CDD:       { bg:'#DBEAFE', c:'#1E40AF', bord:'#BFDBFE' },
    CDI:       { bg:'#D1FAE5', c:'#065F46', bord:'#A7F3D0' },
    Freelance: { bg:'#EDE9FE', c:'#5B21B6', bord:'#DDD6FE' },
  };
  const STATUT_HON = {
    en_attente: { lib:'En attente',   bg:'#FEF3C7', c:'#B45309' },
    valide:     { lib:'Validé → RH',  bg:'#DBEAFE', c:'#1D4ED8' },
    paye:       { lib:'Payé',         bg:'#D1FAE5', c:'#065F46' },
    litige:     { lib:'Litige',       bg:'#FEE2E2', c:'#991B1B' },
  };
  const STATUT_SEANCE = {
    planifiee:  { lib:'Planifiée',   bg:'#EDE9FE', c:'#5B21B6' },
    realisee:   { lib:'Réalisée',    bg:'#D1FAE5', c:'#065F46' },
    annulee:    { lib:'Annulée',     bg:'#FEE2E2', c:'#991B1B' },
    reportee:   { lib:'Reportée',    bg:'#FEF3C7', c:'#B45309' },
  };
  const _fmtFCFA2 = v => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0)) + ' FCFA';

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setCoaches(d.coaches || [])).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function ouvrirModal(coach) {
    setModalCoach(coach);
    setOngletModal('infos');
    setProfil(null); setSeances([]); setHonoraires([]); setEvaluations([]);
    setSDateFrom(''); setSDateTo(''); setSStatut('tous'); setSPage(0);
    setEDateFrom(''); setEDateTo(''); setEPage(0); setEvalOpen(new Set());
    setLoadModal(true);
    try {
      const [rp, rs, rh, re] = await Promise.all([
        fetch(`${_API_URL_ADMIN}/api/elearning/coaches/${coach.id}/profil`,          { headers: _authHdrsAdmin() }).then(r => r.json()),
        fetch(`${_API_URL_ADMIN}/api/elearning/seances?coach_id=${coach.id}`,        { headers: _authHdrsAdmin() }).then(r => r.json()),
        fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?coach_id=${coach.id}`,     { headers: _authHdrsAdmin() }).then(r => r.json()),
        fetch(`${_API_URL_ADMIN}/api/coachs/${coach.id}/rapports-transmis`, { headers: supAuthHdrs() }).then(r => r.json()),
      ]);
      setProfil(rp.profil || null);
      setSeances(rs.seances || []);
      setHonoraires(rh.honoraires || []);
      // Les évaluations e-learning proviennent des rapports d'observation transmis par le
      // Superviseur/Deputy Superviseur (table rapports_observation, plateforme='bet-elearning') -
      // PAS de la table evaluations_elearning, qui n'a aucun flux de création réel (cf. commentaire
      // sur POST /api/classes-elearning/evaluations, jamais appelé par aucun frontend).
      setEvaluations(re.rapports || []);
    } catch {}
    setLoadModal(false);
  }

  const TYPES = ['tous', 'Vacataire', 'CDD', 'CDI', 'Freelance'];
  const coachesFiltres = coaches.filter(c => {
    const matchSearch = search === '' ||
      `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(search.toLowerCase());
    const matchType = filtreType === 'tous' || getTypeContrat(c) === filtreType;
    return matchSearch && matchType;
  });
  const coachsNbPages  = Math.max(1, Math.ceil(coachesFiltres.length / COACHS_PAR_PAGE));
  const coachsPageSafe = Math.min(pageCoachs, coachsNbPages);
  const coachesPage    = coachesFiltres.slice((coachsPageSafe - 1) * COACHS_PAR_PAGE, coachsPageSafe * COACHS_PAR_PAGE);

  const kpis = [
    { l:'Total coachs',  v: coaches.length,                                              c:'#6366F1', i:'👨‍🏫' },
    { l:'Vacataires',    v: coaches.filter(c=>getTypeContrat(c)==='Vacataire').length,   c:'#F59E0B', i:'📋' },
    { l:'CDD',           v: coaches.filter(c=>getTypeContrat(c)==='CDD').length,         c:'#3B82F6', i:'📄' },
    { l:'CDI',           v: coaches.filter(c=>getTypeContrat(c)==='CDI').length,         c:'#059669', i:'🏅' },
    { l:'Freelance',     v: coaches.filter(c=>getTypeContrat(c)==='Freelance').length,   c:'#7C3AED', i:'💼' },
  ];

  const ONGLETS_MODAL = [
    { id:'infos',        lib:'Infos',       ic:'👤' },
    { id:'sessions',     lib:'Sessions',    ic:'📅' },
    { id:'contrat',      lib:'Contrat',     ic:'📄' },
    { id:'paiements',    lib:'Paiements',   ic:'💰' },
    { id:'evaluations',  lib:'Évaluations', ic:'⭐' },
  ];

  const initiales = c => `${c.prenom?.[0]||''}${c.nom?.[0]||''}`.toUpperCase();
  const typeC = coach => TYPE_CONTRAT_COULEURS[getTypeContrat(coach)] || { bg:'#F1F5F9', c:'#475569', bord:'#E2E8F0' };

  return (
    <div style={{ padding:'28px 32px' }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:28 }}>
        {kpis.map(k => (
          <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'16px', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}` }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{k.i}</div>
            <div style={{ fontSize:26, fontWeight:900, color:k.c }}>{loading ? '…' : k.v}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Barre recherche + filtres */}
      <div style={{ display:'flex', gap:12, marginBottom:24, alignItems:'center', flexWrap:'wrap' }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPageCoachs(1); }}
          placeholder="🔍 Rechercher un coach…"
          style={{ flex:1, minWidth:220, padding:'10px 14px', borderRadius:10, border:'1.5px solid #E5E7EB', fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none' }}
        />
        <div style={{ display:'flex', gap:6 }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => { setFiltreType(t); setPageCoachs(1); }}
              style={{ padding:'8px 14px', borderRadius:20, fontSize:12, fontWeight: filtreType===t ? 700 : 500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:`1.5px solid ${filtreType===t ? '#6366F1' : '#E5E7EB'}`, background: filtreType===t ? '#6366F1' : '#fff', color: filtreType===t ? '#fff' : '#6B7280' }}>
              {t === 'tous' ? 'Tous' : t}
              {t !== 'tous' && <span style={{ marginLeft:5, opacity:0.8 }}>({coaches.filter(c=>c.type_coach===t).length})</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement des coachs…</div>
      ) : coachesFiltres.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', background:'#F9FAFB', borderRadius:16, border:'1px dashed #E5E7EB' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👨‍🏫</div>
          <div style={{ fontWeight:700, color:'#374151', marginBottom:6 }}>Aucun coach trouvé</div>
          <div style={{ fontSize:13 }}>Modifiez vos filtres ou la recherche</div>
        </div>
      ) : (
        <>
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'2.2fr 2fr 1.2fr 1.4fr 1fr', padding:'11px 20px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Coach</span>
              <span>Email</span>
              <span>Contrat</span>
              <span>Rôle</span>
              <span>E-Learning</span>
            </div>
            {coachesPage.map(coach => {
              const tc = typeC(coach);
              return (
                <div key={coach.id}
                  onClick={() => ouvrirModal(coach)}
                  style={{ display:'grid', gridTemplateColumns:'2.2fr 2fr 1.2fr 1.4fr 1fr', padding:'12px 20px', borderBottom:'1px solid #F1F5F9', alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:tc.bg, border:`2px solid ${tc.bord}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:tc.c, flexShrink:0 }}>
                      {coach.avatar_url ? <img src={coach.avatar_url} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} /> : initiales(coach)}
                    </div>
                    <span style={{ fontWeight:700, fontSize:13, color:'#1E293B', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{coach.prenom} {coach.nom}</span>
                  </div>
                  <span style={{ fontSize:12, color:'#6B7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{coach.email}</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:10, background:tc.bg, color:tc.c, justifySelf:'start' }}>
                    {getTypeContrat(coach)}
                  </span>
                  <span style={{ fontSize:12, color:'#6B7280' }}>
                    {coach.role === 'coach' ? '🤝 Coach' : coach.role === 'professeur_titulaire' ? '👨‍🏫 Prof titulaire' : '🔄 Prof remplaçant'}
                  </span>
                  <span style={{ fontSize:10, fontWeight:600, padding:'3px 9px', borderRadius:10, background:'#F0FDF4', color:'#166534', justifySelf:'start' }}>
                    ✅ E-Learning
                  </span>
                </div>
              );
            })}
          </div>

          {coachsNbPages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:10, marginBottom:16 }}>
              <button
                disabled={coachsPageSafe <= 1}
                onClick={() => setPageCoachs(coachsPageSafe - 1)}
                style={{ padding:'7px 16px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#374151', fontSize:12, fontWeight:600, cursor: coachsPageSafe<=1?'default':'pointer', opacity: coachsPageSafe<=1?0.4:1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
              >‹ Précédent</button>
              <span style={{ fontSize:12, color:'#6B7280' }}>Page {coachsPageSafe} / {coachsNbPages}</span>
              <button
                disabled={coachsPageSafe >= coachsNbPages}
                onClick={() => setPageCoachs(coachsPageSafe + 1)}
                style={{ padding:'7px 16px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#374151', fontSize:12, fontWeight:600, cursor: coachsPageSafe>=coachsNbPages?'default':'pointer', opacity: coachsPageSafe>=coachsNbPages?0.4:1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
              >Suivant ›</button>
            </div>
          )}
        </>
      )}

      {/* ── MODAL DÉTAIL COACH ── */}
      {modalCoach && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setModalCoach(null); }}>
          <div style={{ background:'#fff', borderRadius:18, width:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.35)' }}>

            {/* Header modal */}
            <div style={{ background:`linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #6366F1 100%)`, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,255,255,0.15)', border:'2px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff' }}>
                  {modalCoach.avatar_url ? <img src={modalCoach.avatar_url} alt="" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} /> : initiales(modalCoach)}
                </div>
                <div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{modalCoach.prenom} {modalCoach.nom}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{modalCoach.email}</div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:10, background:'rgba(255,255,255,0.18)', color:'#fff', marginTop:4, display:'inline-block' }}>
                    {getTypeContrat(modalCoach)}
                  </span>
                </div>
              </div>
              <button onClick={() => setModalCoach(null)} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, color:'#fff', fontSize:18, cursor:'pointer', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            {/* Onglets modal */}
            <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', background:'#F8FAFC', flexShrink:0, overflowX:'auto' }}>
              {ONGLETS_MODAL.map(o => (
                <button key={o.id} onClick={() => setOngletModal(o.id)}
                  style={{ padding:'13px 20px', border:'none', borderBottom: ongletModal===o.id ? '2.5px solid #6366F1' : '2.5px solid transparent', background:'none', color: ongletModal===o.id ? '#6366F1' : '#6B7280', fontWeight: ongletModal===o.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6, marginBottom:-2 }}>
                  {o.ic} {o.lib}
                  {o.id === 'sessions'    && seances.length > 0    && <span style={{ background:'#6366F1', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{seances.length}</span>}
                  {o.id === 'paiements'   && honoraires.length > 0  && <span style={{ background:'#059669', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{honoraires.length}</span>}
                  {o.id === 'evaluations' && evaluations.length > 0 && <span style={{ background:'#F59E0B', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{evaluations.length}</span>}
                </button>
              ))}
            </div>

            {/* Contenu modal */}
            <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>
              {loadModal ? (
                <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>⏳ Chargement…</div>
              ) : (
                <>
                  {/* ── INFOS ── */}
                  {ongletModal === 'infos' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                      {/* Infos de base */}
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Informations générales</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          {[
                            { l:'Prénom',        v: modalCoach.prenom },
                            { l:'Nom',           v: modalCoach.nom },
                            { l:'Email',         v: modalCoach.email },
                            { l:'Rôle',          v: modalCoach.role === 'coach' ? '🤝 Coach' : modalCoach.role === 'professeur_titulaire' ? '👨‍🏫 Prof titulaire' : '🔄 Prof remplaçant' },
                            { l:'Type contrat',  v: getTypeContrat(modalCoach) },
                            { l:'Accès E-Learn', v: modalCoach.acces_elearning ? '✅ Actif' : '❌ Inactif' },
                          ].map(r => (
                            <div key={r.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{r.l}</div>
                              <div style={{ fontSize:13, fontWeight:600, color:'#1E293B' }}>{r.v || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Profil e-learning */}
                      {profil && (
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Profil E-Learning</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            {[
                              { l:'Tarif horaire',     v: profil.tarif_horaire ? _fmtFCFA2(profil.tarif_horaire) : '-' },
                              { l:'Expérience',        v: profil.experience_annees ? `${profil.experience_annees} ans` : '-' },
                              { l:'Niveaux enseignés', v: (profil.niveaux_enseignes || []).join(', ') || '-' },
                              { l:'Spécialisations',   v: (profil.specialisations || []).join(', ') || '-' },
                              { l:'Certifications',    v: (profil.certifications || []).join(', ') || '-' },
                              { l:'Langues',           v: (profil.langues_enseignees || []).join(', ') || '-' },
                            ].map(r => (
                              <div key={r.l} style={{ background:'#F0F9FF', borderRadius:10, padding:'12px 14px', border:'1px solid #BAE6FD' }}>
                                <div style={{ fontSize:10, color:'#0369A1', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{r.l}</div>
                                <div style={{ fontSize:13, fontWeight:600, color:'#1E293B' }}>{r.v}</div>
                              </div>
                            ))}
                          </div>
                          {profil.bio && (
                            <div style={{ marginTop:10, background:'#FAFAFA', borderRadius:10, padding:'14px', border:'1px solid #E5E7EB' }}>
                              <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Bio</div>
                              <div style={{ fontSize:13, color:'#374151', lineHeight:1.6 }}>{profil.bio}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {!profil && <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:'20px', background:'#F9FAFB', borderRadius:10 }}>Aucun profil e-learning enregistré</div>}
                    </div>
                  )}

                  {/* ── SESSIONS ── */}
                  {ongletModal === 'sessions' && (() => {
                    const seancesTri = seances.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
                    const seancesFilt = seancesTri.filter(s => {
                      if (sStatut !== 'tous' && s.statut !== sStatut) return false;
                      if (sDateFrom && s.date < sDateFrom) return false;
                      if (sDateTo   && s.date > sDateTo)   return false;
                      return true;
                    });
                    const totalPages = Math.ceil(seancesFilt.length / S_PER_PAGE);
                    const seancesPage = seancesFilt.slice(sPage * S_PER_PAGE, (sPage + 1) * S_PER_PAGE);
                    return (
                      <div>
                        {/* KPIs */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                          {[
                            { l:'Total', v: seances.length, c:'#6366F1' },
                            { l:'Réalisées', v: seances.filter(s=>s.statut==='realisee').length, c:'#059669' },
                            { l:'Planifiées', v: seances.filter(s=>s.statut==='planifiee').length, c:'#7C3AED' },
                            { l:'Annulées', v: seances.filter(s=>s.statut==='annulee').length, c:'#DC2626' },
                          ].map(k => (
                            <div key={k.l} style={{ background:'#fff', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'12px', cursor:'pointer' }}
                              onClick={() => { setSStatut(k.l === 'Total' ? 'tous' : k.l === 'Réalisées' ? 'realisee' : k.l === 'Planifiées' ? 'planifiee' : 'annulee'); setSPage(0); }}>
                              <div style={{ fontSize:22, fontWeight:800, color:k.c }}>{k.v}</div>
                              <div style={{ fontSize:11, color:'#6B7280' }}>{k.l}</div>
                            </div>
                          ))}
                        </div>
                        {/* Filtres */}
                        <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap', background:'#F8FAFC', borderRadius:10, padding:'10px 14px', border:'1px solid #E5E7EB' }}>
                          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Du</span>
                            <input type="date" value={sDateFrom} onChange={e => { setSDateFrom(e.target.value); setSPage(0); }}
                              style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                            <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Au</span>
                            <input type="date" value={sDateTo} onChange={e => { setSDateTo(e.target.value); setSPage(0); }}
                              style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                          </div>
                          <div style={{ display:'flex', gap:5 }}>
                            {['tous','planifiee','realisee','annulee','reportee'].map(st => (
                              <button key={st} onClick={() => { setSStatut(st); setSPage(0); }}
                                style={{ padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight: sStatut===st ? 700:500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:`1.5px solid ${sStatut===st ? '#6366F1':'#E5E7EB'}`, background: sStatut===st ? '#6366F1':'#fff', color: sStatut===st ? '#fff':'#6B7280' }}>
                                {st === 'tous' ? 'Tous' : STATUT_SEANCE[st]?.lib || st}
                              </button>
                            ))}
                          </div>
                          {(sDateFrom || sDateTo || sStatut !== 'tous') && (
                            <button onClick={() => { setSDateFrom(''); setSDateTo(''); setSStatut('tous'); setSPage(0); }}
                              style={{ padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                              ✕ Réinitialiser
                            </button>
                          )}
                          <span style={{ marginLeft:'auto', fontSize:11, color:'#9CA3AF' }}>{seancesFilt.length} résultat{seancesFilt.length > 1 ? 's' : ''}</span>
                        </div>

                        {/* Boutons d'export */}
                        {seancesFilt.length > 0 && (
                          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                            <button
                              onClick={() => exporterExcelStyle({
                                nomFichier: `sessions_${(modalCoach?.prenom||'')}_${(modalCoach?.nom||'')}_${new Date().toISOString().slice(0,10)}`,
                                titre: `📅 Sessions coach - ${modalCoach?.prenom||''} ${modalCoach?.nom||''}`,
                                sousTitre: `${seancesFilt.length} session${seancesFilt.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                                couleurEntete: '6366F1',
                                colonnes: [
                                  { label: 'Date', width: 14 }, { label: 'Heure', width: 14 },
                                  { label: 'Durée', width: 12, align: 'center' }, { label: 'Type', width: 14 },
                                  { label: 'Objectifs', width: 30 }, { label: 'Statut', width: 14 },
                                  { label: 'Apprenants', width: 12, align: 'center' },
                                ],
                                lignes: seancesFilt.map(s => {
                                  const st = STATUT_SEANCE[s.statut] || { lib:s.statut };
                                  const toMin = h => { const [hh,mm]=(h||'0:0').split(':').map(Number); return hh*60+(mm||0); };
                                  const dureeMin = s.duree_minutes || (s.heure_debut && s.heure_fin ? Math.max(0, toMin(s.heure_fin) - toMin(s.heure_debut)) : null);
                                  return [
                                    s.date ? new Date(s.date).toLocaleDateString('fr-FR') : '-',
                                    `${s.heure_debut ? s.heure_debut.slice(0,5) : '-'}${s.heure_fin ? `–${s.heure_fin.slice(0,5)}` : ''}`,
                                    dureeMin ? `${dureeMin} min` : '-',
                                    s.type === 'en_ligne' ? 'En ligne' : s.type === 'presentiel' ? 'Présentiel' : s.type || '-',
                                    s.objectifs_session || s.titre || '-',
                                    st.lib, s.nb_presents ?? '-',
                                  ];
                                }),
                              })}
                              style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                            >📊 Exporter Excel</button>
                            <button
                              onClick={() => {
                                const lignesHtml = seancesFilt.map(s => {
                                  const st = STATUT_SEANCE[s.statut] || { lib:s.statut };
                                  return `
                                    <tr>
                                      <td>${s.date ? new Date(s.date).toLocaleDateString('fr-FR') : '-'}</td>
                                      <td>${s.heure_debut ? s.heure_debut.slice(0,5) : '-'}${s.heure_fin ? `–${s.heure_fin.slice(0,5)}` : ''}</td>
                                      <td>${s.type === 'en_ligne' ? 'En ligne' : s.type === 'presentiel' ? 'Présentiel' : s.type || '-'}</td>
                                      <td>${s.objectifs_session || s.titre || '-'}</td>
                                      <td>${st.lib}</td>
                                      <td>${s.nb_presents ?? '-'}</td>
                                    </tr>
                                  `;
                                }).join('');
                                genererPDF(`
                                  <div class="doc-header">
                                    <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Sessions coach</div></div>
                                    <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                                  </div>
                                  <div class="doc-title-band">📅 SESSIONS - ${(modalCoach?.prenom||'').toUpperCase()} ${(modalCoach?.nom||'').toUpperCase()}</div>
                                  <div class="doc-body">
                                    <table>
                                      <thead><tr><th>Date</th><th>Heure</th><th>Type</th><th>Objectifs</th><th>Statut</th><th>Apprenants</th></tr></thead>
                                      <tbody>${lignesHtml}</tbody>
                                    </table>
                                    <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
                                  </div>
                                `, `Sessions_${modalCoach?.prenom||''}_${modalCoach?.nom||''}`);
                              }}
                              style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                            >📥 Exporter PDF</button>
                          </div>
                        )}

                        {seancesFilt.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E5E7EB' }}>Aucune séance pour ces critères</div>
                        ) : (
                          <>
                            <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #E5E7EB' }}>
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                                <thead>
                                  <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E5E7EB' }}>
                                    {['Date','Heure','Durée','Type','Objectifs','Statut','Apprenants'].map(h => (
                                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {seancesPage.map((s, i) => {
                                    const st = STATUT_SEANCE[s.statut] || { lib:s.statut, bg:'#F1F5F9', c:'#475569' };
                                    const dureeMin = s.duree_minutes || (s.heure_debut && s.heure_fin ? Math.max(0, (h => { const [hh,mm]=(h||'0:0').split(':').map(Number); return hh*60+(mm||0); })(s.heure_fin) - (h => { const [hh,mm]=(h||'0:0').split(':').map(Number); return hh*60+(mm||0); })(s.heure_debut)) : null);
                                    return (
                                      <tr key={s.id} style={{ background: i%2===0 ? '#fff' : '#F9FAFB', borderBottom:'1px solid #F1F5F9' }}>
                                        <td style={{ padding:'10px 12px', color:'#1E293B', fontWeight:600, whiteSpace:'nowrap' }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR') : '-'}</td>
                                        <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>{s.heure_debut ? s.heure_debut.slice(0,5) : '-'}{s.heure_fin ? `–${s.heure_fin.slice(0,5)}` : ''}</td>
                                        <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>
                                          {dureeMin ? `${dureeMin} min` : '-'}
                                          {/* Le temps reellement passe en salle, sous la duree
                                              contractuelle : c'est sur celle-ci qu'est calcule
                                              l'honoraire, l'ecart doit se voir au meme endroit. */}
                                          {(() => {
                                            const reel = dureeReelleMin(s); if (reel == null) return null;
                                            const court = dureeMin && reel < dureeMin - 5;
                                            return (
                                              <div title="Temps reellement passe en salle, releve par le chronometre du coach"
                                                style={{ fontSize:10.5, fontWeight:700, color: court ? '#B91C1C' : '#15803D', marginTop:2 }}>
                                                ⏱ {reel} min réel
                                              </div>
                                            );
                                          })()}
                                        </td>
                                        <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>{s.type === 'en_ligne' ? '🌐 En ligne' : s.type === 'presentiel' ? '🏫 Présentiel' : s.type || '-'}</td>
                                        <td style={{ padding:'10px 12px', color:'#475569', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.objectifs_session || s.titre || '-'}</td>
                                        <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:8, background:st.bg, color:st.c, whiteSpace:'nowrap' }}>{st.lib}</span></td>
                                        <td style={{ padding:'10px 12px', color:'#475569', textAlign:'center' }}>{s.nb_presents ?? '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            {totalPages > 1 && (
                              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:14 }}>
                                <button onClick={() => setSPage(p => Math.max(0, p-1))} disabled={sPage === 0}
                                  style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E5E7EB', background: sPage===0 ? '#F9FAFB':'#fff', color: sPage===0 ? '#D1D5DB':'#374151', fontWeight:600, fontSize:12, cursor: sPage===0 ? 'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  ← Préc.
                                </button>
                                {Array.from({ length: totalPages }, (_,i) => i).map(i => (
                                  <button key={i} onClick={() => setSPage(i)}
                                    style={{ width:32, height:32, borderRadius:8, border:`1.5px solid ${sPage===i ? '#6366F1':'#E5E7EB'}`, background: sPage===i ? '#6366F1':'#fff', color: sPage===i ? '#fff':'#374151', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    {i+1}
                                  </button>
                                ))}
                                <button onClick={() => setSPage(p => Math.min(totalPages-1, p+1))} disabled={sPage === totalPages-1}
                                  style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E5E7EB', background: sPage===totalPages-1 ? '#F9FAFB':'#fff', color: sPage===totalPages-1 ? '#D1D5DB':'#374151', fontWeight:600, fontSize:12, cursor: sPage===totalPages-1 ? 'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  Suiv. →
                                </button>
                                <span style={{ fontSize:11, color:'#9CA3AF' }}>Page {sPage+1}/{totalPages}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── CONTRAT ── */}
                  {ongletModal === 'contrat' && (() => {
                    const ci = modalCoach.coach_info || {};
                    const tc = typeC(modalCoach);
                    const contratIcons = { CDI:'🏅', CDD:'📄', Freelance:'💼', Consultant:'🔖', Stagiaire:'🎓', Vacataire:'📋' };
                    const typeContrat = getTypeContrat(modalCoach);
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                        {/* Badge type contrat */}
                        <div style={{ display:'flex', alignItems:'center', gap:16, background:`linear-gradient(135deg, ${tc.bg}, #fff)`, borderRadius:16, padding:'20px 24px', border:`1.5px solid ${tc.bord}` }}>
                          <div style={{ width:64, height:64, borderRadius:16, background:tc.bg, border:`2px solid ${tc.bord}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, flexShrink:0 }}>
                            {contratIcons[typeContrat] || '📋'}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:24, fontWeight:900, color:tc.c }}>{typeContrat}</div>
                            <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>Type de contrat e-learning</div>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:11, color:'#94A3B8', marginBottom:2 }}>Accès plateforme</div>
                            <span style={{ fontSize:13, fontWeight:700, padding:'4px 12px', borderRadius:10, background: modalCoach.acces_elearning ? '#D1FAE5':'#FEE2E2', color: modalCoach.acces_elearning ? '#065F46':'#991B1B' }}>
                              {modalCoach.acces_elearning ? '✅ Actif' : '❌ Inactif'}
                            </span>
                          </div>
                        </div>

                        {/* Infos coach_info */}
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Informations contractuelles</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                            {[
                              { l:'Filière',          v: ci.filiere         || '-', i:'📚' },
                              { l:'Matricule',        v: ci.matricule       || '-', i:'🪪' },
                              { l:'Spécialité',       v: ci.specialite      || '-', i:'🎯' },
                              { l:'Niveaux (BET)',    v: ci.niveaux         || '-', i:'📊' },
                              { l:'Lieu habitation',  v: ci.lieu_habitation || '-', i:'📍' },
                              { l:'Date entrée BET',  v: ci.date_debut_bet ? new Date(ci.date_debut_bet).toLocaleDateString('fr-FR') : '-', i:'📅' },
                            ].map(r => (
                              <div key={r.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                                <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{r.i} {r.l}</div>
                                <div style={{ fontSize:13, fontWeight:600, color:'#1E293B' }}>{r.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Certifications */}
                        {(() => {
                          const certs = Array.isArray(ci.certifications) ? ci.certifications : (typeof ci.certifications === 'string' && ci.certifications ? ci.certifications.split(',').map(s=>s.trim()).filter(Boolean) : []);
                          return certs.length > 0 ? (
                            <div>
                              <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>🏆 Certifications</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                                {certs.map((c,i) => (
                                  <span key={i} style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:20, background:'#EDE9FE', color:'#5B21B6', border:'1px solid #DDD6FE' }}>{typeof c === 'object' ? c.nom : c}</span>
                                ))}
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Profil e-learning */}
                        {profil && (
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Profil E-Learning</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                              {[
                                { l:'Tarif horaire',     v: profil.tarif_horaire ? _fmtFCFA2(profil.tarif_horaire) : '-', i:'💵' },
                                { l:'Expérience',        v: profil.experience_annees ? `${profil.experience_annees} ans` : '-', i:'⏱️' },
                                { l:'Niveaux CECR',      v: (profil.niveaux_enseignes || []).join(', ') || '-', i:'🎓' },
                                { l:'Spécialisations',   v: (profil.specialisations || []).join(', ') || '-', i:'🎯' },
                                { l:'Certifs e-learn',   v: (profil.certifications || []).join(', ') || '-', i:'🏆' },
                                { l:'Langues',           v: (profil.langues_enseignees || []).join(', ') || '-', i:'🌍' },
                              ].map(r => (
                                <div key={r.l} style={{ background:'#F0F9FF', borderRadius:10, padding:'12px 14px', border:'1px solid #BAE6FD' }}>
                                  <div style={{ fontSize:10, color:'#0369A1', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{r.i} {r.l}</div>
                                  <div style={{ fontSize:12, fontWeight:600, color:'#1E293B' }}>{r.v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activité cumulée */}
                        <div style={{ background:'#F0FDF4', borderRadius:12, padding:'16px 20px', border:'1px solid #A7F3D0' }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#065F46', marginBottom:12 }}>📈 Activité E-Learning cumulée</div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                            {[
                              { l:'Séances réalisées', v: seances.filter(s=>s.statut==='realisee').length, c:'#059669' },
                              { l:'Séances planifiées', v: seances.filter(s=>s.statut==='planifiee').length, c:'#7C3AED' },
                              { l:'Heures totales', v: `${(seances.filter(s=>s.statut==='realisee').reduce((t,s)=>t+(s.duree_minutes||0),0)/60).toFixed(1)}h`, c:'#0369A1' },
                              { l:'Honoraires nets', v: _fmtFCFA2(honoraires.reduce((t,h)=>t+(h.montant_net||0),0)), c:'#B45309' },
                            ].map(k => (
                              <div key={k.l} style={{ textAlign:'center', background:'#fff', borderRadius:10, padding:'12px', border:'1px solid #A7F3D0' }}>
                                <div style={{ fontSize:16, fontWeight:900, color:k.c }}>{k.v}</div>
                                <div style={{ fontSize:10, color:'#6B7280', marginTop:3 }}>{k.l}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── PAIEMENTS ── */}
                  {ongletModal === 'paiements' && (
                    <div>
                      {/* KPIs paiements */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
                        {[
                          { l:'Total fiches',   v: honoraires.length,                                       c:'#6366F1' },
                          { l:'Montant total',  v: _fmtFCFA2(honoraires.reduce((t,h)=>t+(h.montant_net||0),0)), c:'#059669' },
                          { l:'En attente',     v: honoraires.filter(h=>h.statut==='en_attente').length,    c:'#F59E0B' },
                        ].map(k => (
                          <div key={k.l} style={{ background:'#fff', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'14px' }}>
                            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>{k.l}</div>
                          </div>
                        ))}
                      </div>

                      {/* Boutons d'export */}
                      {honoraires.length > 0 && (
                        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                          <button
                            onClick={() => {
                              const MOIS_L = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
                              exporterExcelStyle({
                                nomFichier: `paiements_${(modalCoach?.prenom||'')}_${(modalCoach?.nom||'')}_${new Date().toISOString().slice(0,10)}`,
                                titre: `💰 Paiements coach - ${modalCoach?.prenom||''} ${modalCoach?.nom||''}`,
                                sousTitre: `${honoraires.length} mois · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                                couleurEntete: '6366F1',
                                colonnes: [
                                  { label: 'Période', width: 14, bold: true }, { label: 'Séances', width: 10, align: 'center' },
                                  { label: 'Heures', width: 10, align: 'center' }, { label: 'Tarif/h', width: 14, align: 'right' },
                                  { label: 'Montant brut', width: 16, align: 'right' }, { label: 'Retenues', width: 14, align: 'right' },
                                  { label: 'Net', width: 16, align: 'right' }, { label: 'Statut', width: 14 },
                                ],
                                lignes: honoraires.map(h => {
                                  const st = STATUT_HON[h.statut] || { lib:h.statut };
                                  return [
                                    `${MOIS_L[h.mois]} ${h.annee}`, h.nb_seances ?? '-',
                                    h.nb_heures != null ? `${h.nb_heures}h` : '-',
                                    h.tarif_horaire || 0, h.montant_brut || 0, h.retenues || 0, h.montant_net || 0, st.lib,
                                  ];
                                }),
                              });
                            }}
                            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                          >📊 Exporter Excel</button>
                          <button
                            onClick={() => {
                              const MOIS_L = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
                              const lignesHtml = honoraires.map(h => {
                                const st = STATUT_HON[h.statut] || { lib:h.statut };
                                return `
                                  <tr>
                                    <td>${MOIS_L[h.mois]} ${h.annee}</td>
                                    <td>${h.nb_seances ?? '-'}</td>
                                    <td>${h.nb_heures != null ? `${h.nb_heures}h` : '-'}</td>
                                    <td>${_fmtFCFA2(h.montant_brut)}</td>
                                    <td>${h.retenues ? `-${_fmtFCFA2(h.retenues)}` : '-'}</td>
                                    <td style="font-weight:800">${_fmtFCFA2(h.montant_net)}</td>
                                    <td>${st.lib}</td>
                                  </tr>
                                `;
                              }).join('');
                              genererPDF(`
                                <div class="doc-header">
                                  <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Paiements coach</div></div>
                                  <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                                </div>
                                <div class="doc-title-band">💰 PAIEMENTS - ${(modalCoach?.prenom||'').toUpperCase()} ${(modalCoach?.nom||'').toUpperCase()}</div>
                                <div class="doc-body">
                                  <div class="kpi-row">
                                    <div class="kpi-card"><div class="kpi-val">${honoraires.length}</div><div class="kpi-lbl">Fiches</div></div>
                                    <div class="kpi-card"><div class="kpi-val">${_fmtFCFA2(honoraires.reduce((t,h)=>t+(h.montant_net||0),0))}</div><div class="kpi-lbl">Total net</div></div>
                                  </div>
                                  <table>
                                    <thead><tr><th>Période</th><th>Séances</th><th>Heures</th><th>Brut</th><th>Retenues</th><th>Net</th><th>Statut</th></tr></thead>
                                    <tbody>${lignesHtml}</tbody>
                                  </table>
                                  <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
                                </div>
                              `, `Paiements_${modalCoach?.prenom||''}_${modalCoach?.nom||''}`);
                            }}
                            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                          >📥 Exporter PDF</button>
                        </div>
                      )}

                      {honoraires.length === 0 ? (
                        <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E5E7EB' }}>Aucune fiche d'honoraires</div>
                      ) : (
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                            <thead>
                              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E5E7EB' }}>
                                {['Période','Séances','Heures','Tarif/h','Montant brut','Retenues','Net','Statut'].map(h => (
                                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {honoraires.map((h, i) => {
                                const MOIS_L = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
                                const st = STATUT_HON[h.statut] || { lib:h.statut, bg:'#F1F5F9', c:'#475569' };
                                return (
                                  <tr key={h.id} style={{ background: i%2===0 ? '#fff' : '#F9FAFB', borderBottom:'1px solid #F1F5F9' }}>
                                    <td style={{ padding:'10px 12px', fontWeight:700, color:'#1E293B', whiteSpace:'nowrap' }}>{MOIS_L[h.mois]} {h.annee}</td>
                                    <td style={{ padding:'10px 12px', color:'#475569', textAlign:'center' }}>{h.nb_seances ?? '-'}</td>
                                    <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>{h.nb_heures != null ? `${h.nb_heures}h` : '-'}</td>
                                    <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>{h.tarif_horaire ? _fmtFCFA2(h.tarif_horaire) : '-'}</td>
                                    <td style={{ padding:'10px 12px', fontWeight:600, color:'#1E293B', whiteSpace:'nowrap' }}>{_fmtFCFA2(h.montant_brut)}</td>
                                    <td style={{ padding:'10px 12px', color:'#DC2626', whiteSpace:'nowrap' }}>{h.retenues ? `-${_fmtFCFA2(h.retenues)}` : '-'}</td>
                                    <td style={{ padding:'10px 12px', fontWeight:800, color:'#059669', whiteSpace:'nowrap' }}>{_fmtFCFA2(h.montant_net)}</td>
                                    <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:8, background:st.bg, color:st.c, whiteSpace:'nowrap' }}>{st.lib}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background:'#F8FAFC', borderTop:'2px solid #E5E7EB', fontWeight:700 }}>
                                <td colSpan={4} style={{ padding:'10px 12px', color:'#374151' }}>Total - {honoraires.length} mois</td>
                                <td style={{ padding:'10px 12px', color:'#1E293B' }}>{_fmtFCFA2(honoraires.reduce((t,h)=>t+(h.montant_brut||0),0))}</td>
                                <td style={{ padding:'10px 12px', color:'#DC2626' }}>{_fmtFCFA2(honoraires.reduce((t,h)=>t+(h.retenues||0),0))}</td>
                                <td style={{ padding:'10px 12px', color:'#059669', fontSize:14 }}>{_fmtFCFA2(honoraires.reduce((t,h)=>t+(h.montant_net||0),0))}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── ÉVALUATIONS (rapports d'observation transmis par le Superviseur) ── */}
                  {ongletModal === 'evaluations' && (() => {
                    const evalsTri = evaluations.slice().sort((a,b) => new Date(b.date_observation||0) - new Date(a.date_observation||0));
                    const evalsFilt = evalsTri.filter(e => {
                      if (eDateFrom && e.date_observation && e.date_observation < eDateFrom) return false;
                      if (eDateTo   && e.date_observation && e.date_observation > eDateTo)   return false;
                      return true;
                    });
                    const eTotalPages = Math.ceil(evalsFilt.length / E_PER_PAGE);
                    const evalsPage = evalsFilt.slice(ePage * E_PER_PAGE, (ePage + 1) * E_PER_PAGE);
                    const avecNote = evaluations.filter(e => e.note_globale != null);
                    const moy = avecNote.length ? (avecNote.reduce((t,e)=>t+e.note_globale,0)/avecNote.length).toFixed(1) : null;
                    const noteBar = (v) => {
                      const pct = Math.round((v/5)*100);
                      const col = v>=4 ? '#059669' : v>=3 ? '#F59E0B' : '#DC2626';
                      return (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ flex:1, height:6, borderRadius:3, background:'#E5E7EB', overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3 }} />
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color:col, minWidth:24 }}>{v}/5</span>
                        </div>
                      );
                    };
                    return (
                      <div>
                        {evaluations.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E5E7EB' }}>
                            <div style={{ fontSize:36, marginBottom:8 }}>⭐</div>
                            <div style={{ fontWeight:700, color:'#374151', marginBottom:4 }}>Aucune évaluation e-learning</div>
                            <div style={{ fontSize:12 }}>Les évaluations enregistrées dans le module E-Learning apparaîtront ici</div>
                          </div>
                        ) : (
                          <>
                            {/* Résumé + filtre date */}
                            <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'stretch', flexWrap:'wrap' }}>
                              {moy && (
                                <div style={{ background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius:12, padding:'14px 20px', border:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
                                  <div style={{ fontSize:34 }}>⭐</div>
                                  <div>
                                    <div style={{ fontSize:26, fontWeight:900, color:'#92400E' }}>{moy}<span style={{ fontSize:12, color:'#B45309' }}>/5</span></div>
                                    <div style={{ fontSize:11, color:'#B45309' }}>{avecNote.length} évaluation{avecNote.length>1?'s':''}</div>
                                  </div>
                                </div>
                              )}
                              <div style={{ flex:1, background:'#F8FAFC', borderRadius:12, padding:'12px 16px', border:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                                <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Filtrer par date :</span>
                                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                  <span style={{ fontSize:11, color:'#6B7280' }}>Du</span>
                                  <input type="date" value={eDateFrom} onChange={e => { setEDateFrom(e.target.value); setEPage(0); }}
                                    style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                                  <span style={{ fontSize:11, color:'#6B7280' }}>Au</span>
                                  <input type="date" value={eDateTo} onChange={e => { setEDateTo(e.target.value); setEPage(0); }}
                                    style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #E5E7EB', fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                                </div>
                                {(eDateFrom || eDateTo) && (
                                  <button onClick={() => { setEDateFrom(''); setEDateTo(''); setEPage(0); }}
                                    style={{ padding:'4px 10px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    ✕ Réinit.
                                  </button>
                                )}
                                <span style={{ marginLeft:'auto', fontSize:11, color:'#9CA3AF' }}>{evalsFilt.length} résultat{evalsFilt.length > 1 ? 's':''}</span>
                              </div>
                            </div>

                            {/* Boutons d'export */}
                            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                              <button
                                onClick={() => exporterExcelStyle({
                                  nomFichier: `evaluations_${(modalCoach?.prenom||'')}_${(modalCoach?.nom||'')}_${new Date().toISOString().slice(0,10)}`,
                                  titre: `⭐ Évaluations coach - ${modalCoach?.prenom||''} ${modalCoach?.nom||''}`,
                                  sousTitre: `${evalsFilt.length} évaluation${evalsFilt.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                                  couleurEntete: '6366F1',
                                  colonnes: [
                                    { label: 'Date', width: 14 }, { label: 'Classe/Centre', width: 22 },
                                    { label: 'Note /5', width: 10, align: 'center' },
                                    { label: 'Ponctualité', width: 12, align: 'center' },
                                    { label: 'Préparation', width: 12, align: 'center' },
                                    { label: 'Pédagogie', width: 12, align: 'center' },
                                    { label: 'Gestion classe', width: 14, align: 'center' },
                                    { label: 'Respect programme', width: 16, align: 'center' },
                                    { label: 'Transmis par', width: 22 },
                                    { label: 'Observations', width: 30 },
                                    { label: 'Recommandations', width: 30 },
                                  ],
                                  lignes: evalsFilt.map(ev => [
                                    ev.date_observation ? new Date(ev.date_observation).toLocaleDateString('fr-FR') : '-',
                                    ev.classe || ev.centre || '-',
                                    ev.note_globale ?? '-',
                                    ev.ponctualite ?? '-', ev.preparation ?? '-', ev.pedagogie ?? '-',
                                    ev.gestion_classe ?? '-', ev.respect_programme ?? '-',
                                    ev.deputy ? `${ev.deputy.prenom} ${ev.deputy.nom}` : '-',
                                    ev.observations || '', ev.recommandations || '',
                                  ]),
                                })}
                                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                              >📊 Exporter Excel</button>
                              <button
                                onClick={() => {
                                  const lignesHtml = evalsFilt.map(ev => `
                                    <tr>
                                      <td>${ev.date_observation ? new Date(ev.date_observation).toLocaleDateString('fr-FR') : '-'}</td>
                                      <td>${ev.classe || ev.centre || '-'}</td>
                                      <td style="font-weight:800">${ev.note_globale ?? '-'}/5</td>
                                      <td>${ev.deputy ? `${ev.deputy.prenom} ${ev.deputy.nom}` : '-'}</td>
                                      <td>${ev.observations || '-'}</td>
                                      <td>${ev.recommandations || '-'}</td>
                                    </tr>
                                  `).join('');
                                  genererPDF(`
                                    <div class="doc-header">
                                      <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Évaluations coach - Rapports d'observation transmis</div></div>
                                      <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                                    </div>
                                    <div class="doc-title-band">⭐ ÉVALUATIONS - ${(modalCoach?.prenom||'').toUpperCase()} ${(modalCoach?.nom||'').toUpperCase()}</div>
                                    <div class="doc-body">
                                      <div class="kpi-row">
                                        <div class="kpi-card"><div class="kpi-val">${moy || '-'}/5</div><div class="kpi-lbl">Moyenne</div></div>
                                        <div class="kpi-card"><div class="kpi-val">${evalsFilt.length}</div><div class="kpi-lbl">Évaluations</div></div>
                                      </div>
                                      <table>
                                        <thead><tr><th>Date</th><th>Classe/Centre</th><th>Note</th><th>Transmis par</th><th>Observations</th><th>Recommandations</th></tr></thead>
                                        <tbody>${lignesHtml}</tbody>
                                      </table>
                                      <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
                                    </div>
                                  `, `Evaluations_${modalCoach?.prenom||''}_${modalCoach?.nom||''}`);
                                }}
                                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
                              >📥 Exporter PDF</button>
                            </div>

                            {/* Accordéons évaluations */}
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              {evalsPage.map(ev => {
                                const isOpen = evalOpen.has(ev.id);
                                const noteColor = ev.note_globale >= 4 ? '#059669' : ev.note_globale >= 3 ? '#F59E0B' : '#DC2626';
                                const criteres = [
                                  { l:'Ponctualité',        v: ev.ponctualite },
                                  { l:'Préparation',        v: ev.preparation },
                                  { l:'Pédagogie',          v: ev.pedagogie },
                                  { l:'Gestion de classe',  v: ev.gestion_classe },
                                  { l:'Respect programme',  v: ev.respect_programme },
                                ].filter(c => c.v != null);
                                return (
                                  <div key={ev.id} style={{ borderRadius:12, border:`1.5px solid ${isOpen ? '#6366F1' : '#E5E7EB'}`, overflow:'hidden', transition:'border-color 0.15s', background:'#fff' }}>
                                    {/* En-tête accordéon (cliquable) */}
                                    <button onClick={() => setEvalOpen(prev => {
                                      const n = new Set(prev);
                                      isOpen ? n.delete(ev.id) : n.add(ev.id);
                                      return n;
                                    })}
                                      style={{ width:'100%', background: isOpen ? 'linear-gradient(135deg,#EEF2FF,#F8FAFC)' : '#fff', border:'none', padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'"Plus Jakarta Sans",sans-serif', borderBottom: isOpen ? '1px solid #E5E7EB' : 'none' }}>
                                      <div style={{ display:'flex', alignItems:'center', gap:14, flex:1, minWidth:0 }}>
                                        <div style={{ width:36, height:36, borderRadius:10, background: isOpen ? '#EEF2FF':'#F8FAFC', border:`1.5px solid ${isOpen ? '#6366F1':'#E5E7EB'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>⭐</div>
                                        <div style={{ textAlign:'left', flex:1, minWidth:0 }}>
                                          <div style={{ fontWeight:700, fontSize:13, color:'#1E293B' }}>
                                            {ev.classe || ev.centre || '-'}
                                          </div>
                                          <div style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
                                            {ev.date_observation ? new Date(ev.date_observation).toLocaleDateString('fr-FR') : '-'}
                                            {ev.deputy ? ` · Par ${ev.deputy.prenom} ${ev.deputy.nom}` : ''}
                                          </div>
                                        </div>
                                        {ev.note_globale != null && (
                                          <span style={{ fontSize:13, fontWeight:900, padding:'4px 12px', borderRadius:10, background: ev.note_globale>=4 ? '#D1FAE5' : ev.note_globale>=3 ? '#FEF3C7' : '#FEE2E2', color: noteColor, flexShrink:0 }}>
                                            {ev.note_globale}/5
                                          </span>
                                        )}
                                      </div>
                                      <span style={{ fontSize:14, color: isOpen ? '#6366F1':'#9CA3AF', marginLeft:12, transition:'transform 0.2s', display:'inline-block', transform: isOpen ? 'rotate(180deg)':'rotate(0deg)' }}>▼</span>
                                    </button>

                                    {/* Contenu déplié */}
                                    {isOpen && (
                                      <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:14 }}>
                                        {/* Barres de critères */}
                                        {criteres.length > 0 && (
                                          <div>
                                            <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Critères d'évaluation</div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                              {criteres.map(c => (
                                                <div key={c.l} style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 12px', border:'1px solid #E5E7EB' }}>
                                                  <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>{c.l}</div>
                                                  {noteBar(c.v)}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {/* Observations */}
                                        {ev.observations && (
                                          <div style={{ background:'#F0FDF4', borderRadius:10, padding:'12px 14px', border:'1px solid #A7F3D0' }}>
                                            <div style={{ fontSize:11, fontWeight:700, color:'#065F46', marginBottom:5 }}>✅ Observations</div>
                                            <div style={{ fontSize:13, color:'#065F46', lineHeight:1.5 }}>{ev.observations}</div>
                                          </div>
                                        )}
                                        {/* Recommandations */}
                                        {ev.recommandations && (
                                          <div style={{ background:'#FFFBEB', borderRadius:10, padding:'12px 14px', border:'1px solid #FDE68A' }}>
                                            <div style={{ fontSize:11, fontWeight:700, color:'#92400E', marginBottom:5 }}>⚡ Recommandations</div>
                                            <div style={{ fontSize:13, color:'#92400E', lineHeight:1.5 }}>{ev.recommandations}</div>
                                          </div>
                                        )}
                                        {/* Commentaire du Superviseur */}
                                        {ev.commentaire_superviseur && (
                                          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                                            <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:5 }}>📝 Commentaire du Superviseur</div>
                                            <div style={{ fontSize:13, color:'#475569', lineHeight:1.6 }}>{ev.commentaire_superviseur}</div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Pagination évaluations */}
                            {eTotalPages > 1 && (
                              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:16 }}>
                                <button onClick={() => setEPage(p => Math.max(0, p-1))} disabled={ePage === 0}
                                  style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E5E7EB', background: ePage===0 ? '#F9FAFB':'#fff', color: ePage===0 ? '#D1D5DB':'#374151', fontWeight:600, fontSize:12, cursor: ePage===0 ? 'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  ← Préc.
                                </button>
                                {Array.from({ length: eTotalPages }, (_,i) => i).map(i => (
                                  <button key={i} onClick={() => setEPage(i)}
                                    style={{ width:32, height:32, borderRadius:8, border:`1.5px solid ${ePage===i ? '#6366F1':'#E5E7EB'}`, background: ePage===i ? '#6366F1':'#fff', color: ePage===i ? '#fff':'#374151', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                    {i+1}
                                  </button>
                                ))}
                                <button onClick={() => setEPage(p => Math.min(eTotalPages-1, p+1))} disabled={ePage === eTotalPages-1}
                                  style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #E5E7EB', background: ePage===eTotalPages-1 ? '#F9FAFB':'#fff', color: ePage===eTotalPages-1 ? '#D1D5DB':'#374151', fontWeight:600, fontSize:12, cursor: ePage===eTotalPages-1 ? 'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                                  Suiv. →
                                </button>
                                <span style={{ fontSize:11, color:'#9CA3AF' }}>Page {ePage+1}/{eTotalPages}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ONGLET HONORAIRES PA ADVISOR - standalone (route /admin/pa-advisor/honoraires)
// ─────────────────────────────────────────────────────────────────────────────
export function OngletHonorairesPAAdvisor() {
  const now = new Date();
  const [honMois,      setHonMois]      = useState(now.getMonth() + 1);
  const [honAnnee,     setHonAnnee]     = useState(now.getFullYear());
  const [honoraires,   setHonoraires]   = useState([]);
  const [coaches,      setCoaches]      = useState([]);
  const [loadHon,      setLoadHon]      = useState(false);
  const [honModal,     setHonModal]     = useState(null);
  const [honConfirm,   setHonConfirm]   = useState(false);
  const [calcEnCours,  setCalcEnCours]  = useState({});
  const [honActionEnCours, setHonActionEnCours] = useState(false); // empêche le double-clic valider/sauvegarder
  const [grille,       setGrille]       = useState(_PA_GRILLE_DEF);
  const [grilleEdited, setGrilleEdited] = useState(false);
  const [showGrille,   setShowGrille]   = useState(false);
  const [flash,        setFlash]        = useState(null);
  const [honSeances,        setHonSeances]        = useState([]);
  const [honSeancesLoading, setHonSeancesLoading]  = useState(false);
  const [honEdit,           setHonEdit]            = useState({ retenues:'', note_pa:'' });
  const [honRefuseModal,    setHonRefuseModal]      = useState(false);
  const [honSeanceActionEnCours, setHonSeanceActionEnCours] = useState({});
  const [honSeanceConfirm, setHonSeanceConfirm] = useState(null); // { seance, statut }
  const [honTransmisConfirm, setHonTransmisConfirm] = useState(false);

  const STATUT_SEANCE_PA = {
    en_attente: { lib:'En attente', bg:'#FEF3C7', c:'#B45309' },
    valide:     { lib:'Validée',    bg:'#DBEAFE', c:'#1D4ED8' },
    rejete:     { lib:'Rejetée',    bg:'#FEE2E2', c:'#991B1B' },
  };

  const MOIS_LABELS = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const moisLabel   = `${MOIS_LABELS[honMois]} ${honAnnee}`;

  const STATUT_HON = {
    en_attente: { lib:'En attente',      bg:'#FEF3C7', c:'#B45309' },
    valide:     { lib:'Validé (à envoyer)', bg:'#E0E7FF', c:'#4338CA' },
    transmis:   { lib:'Transmis → RH',   bg:'#DBEAFE', c:'#1D4ED8' },
    paye:       { lib:'Payé',            bg:'#D1FAE5', c:'#065F46' },
    litige:     { lib:'Litige',          bg:'#FEE2E2', c:'#991B1B' },
  };

  function fetchHonoraires() {
    setLoadHon(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?mois=${honMois}&annee=${honAnnee}`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setHonoraires(d.honoraires || []))
      .catch(() => setHonoraires([])).finally(() => setLoadHon(false));
  }

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setCoaches(d.coaches || [])).catch(() => {});
    fetch(`${_API_URL_ADMIN}/api/admin/parametres/grille_tarifaire`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => { if (d.valeur) setGrille(d.valeur); }).catch(() => {});
  }, []);

  useEffect(() => { fetchHonoraires(); }, [honMois, honAnnee]); // eslint-disable-line

  useEffect(() => {
    if (!honModal) { setHonSeances([]); return; }
    setHonEdit({ retenues: honModal.hon.retenues || '', note_pa: honModal.hon.note_pa || '' });
    setHonSeancesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${honModal.hon.id}/seances`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setHonSeances(d.seances || []))
      .catch(() => setHonSeances([])).finally(() => setHonSeancesLoading(false));
  }, [honModal?.hon?.id]); // eslint-disable-line

  async function calculerHon(coach) {
    if (calcEnCours[coach.id]) return;
    setCalcEnCours(p => ({ ...p, [coach.id]: true }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/calculer`, {
        method: 'POST',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_id: coach.id, mois: honMois, annee: honAnnee }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur calcul');
      fetchHonoraires();
      setFlash({ type:'ok', msg:`✅ Honoraires de ${coach.prenom||''} ${coach.nom||''} calculés pour ${moisLabel}.` });
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setCalcEnCours(p => ({ ...p, [coach.id]: false }));
      setTimeout(() => setFlash(null), 4000);
    }
  }

  async function validerHon(honId, coachNom, statut = 'valide') {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${honId}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur mise à jour du statut');
      setHonoraires(prev => prev.map(h => h.id === honId ? d.honoraire : h));
      const MSG_STATUT = {
        valide:     `✅ Honoraires de ${coachNom} validés (pas encore transmis à la RH).`,
        transmis:   `📤 Honoraires de ${coachNom} transmis à la RH/Paie.`,
        en_attente: `↩️ Honoraires de ${coachNom} remis en attente.`,
      };
      setFlash({ type:'ok', msg: MSG_STATUT[statut] || `Statut mis à jour pour ${coachNom}.` });
      setHonModal(m => m ? { ...m, hon: d.honoraire } : m);
      setHonConfirm(false); setHonTransmisConfirm(false);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setHonActionEnCours(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  async function refuserHon(honId, coachNom, note) {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${honId}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'litige', note_pa: note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur refus');
      setHonoraires(prev => prev.map(h => h.id === honId ? d.honoraire : h));
      setFlash({ type:'ok', msg:`🚫 Honoraires de ${coachNom} marqués en litige.` });
      setHonModal(null); setHonRefuseModal(false);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setHonActionEnCours(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  async function modifierHon(honId, coachNom) {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const statutActuel = honModal?.hon?.statut || 'en_attente';
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${honId}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: statutActuel, retenues: Number(honEdit.retenues)||0, note_pa: honEdit.note_pa }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur modification');
      setHonoraires(prev => prev.map(h => h.id === honId ? d.honoraire : h));
      setHonModal(m => m ? { ...m, hon: d.honoraire } : m);
      setFlash({ type:'ok', msg:`✏️ Fiche de ${coachNom} mise à jour.` });
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setHonActionEnCours(false);
      setTimeout(() => setFlash(null), 5000);
    }
  }

  async function validerSeanceUnitaire(seanceId, statut) {
    if (honSeanceActionEnCours[seanceId]) return;
    setHonSeanceActionEnCours(p => ({ ...p, [seanceId]: true }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/seance/${seanceId}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur mise à jour de la séance');
      setHonSeances(prev => prev.map(s => s.id === seanceId ? { ...s, honoraire_statut_pa: statut } : s));
      if (d.honoraire) {
        setHonoraires(prev => prev.map(h => h.id === d.honoraire.id ? d.honoraire : h));
        setHonModal(m => m ? { ...m, hon: d.honoraire } : m);
      }
      setHonSeanceConfirm(null);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
      setTimeout(() => setFlash(null), 5000);
    } finally {
      setHonSeanceActionEnCours(p => ({ ...p, [seanceId]: false }));
    }
  }

  async function sauvegarderGrille() {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/admin/parametres/grille_tarifaire`, {
        method: 'PUT', headers: _authHdrsAdmin(), body: JSON.stringify({ valeur: grille }),
      });
      if (!r.ok) throw new Error('Erreur sauvegarde');
    } catch {}
    setGrilleEdited(false);
    setFlash({ type:'ok', msg:'✅ Grille tarifaire sauvegardée.' });
    setTimeout(() => setFlash(null), 3000);
    setHonActionEnCours(false);
  }

  const coachsAvecHon = new Set(honoraires.map(h => h.coach_id));
  const coachsSans    = coaches.filter(co => !coachsAvecHon.has(co.id));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Flash */}
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, background:flash.type==='ok'?'#D1FAE5':'#FEE2E2', color:flash.type==='ok'?'#065F46':'#991B1B', fontSize:13, fontWeight:600 }}>
          {flash.msg}
        </div>
      )}

      {/* En-tête */}
      <div style={{ background:'linear-gradient(135deg,#059669,#047857)', borderRadius:14, padding:'18px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>💰 Honoraires des coachs e-learning</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
              Calcul automatique à partir des séances enregistrées · Validation → transmission RH/Paie
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <button key={m} onClick={() => setHonMois(m)}
                style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:honMois===m?'#fff':'rgba(255,255,255,0.2)', color:honMois===m?'#059669':'#fff' }}>
                {MOIS_LABELS[m]}
              </button>
            ))}
            {[2024,2025,2026,2027].map(y => (
              <button key={y} onClick={() => setHonAnnee(y)}
                style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:honAnnee===y?'#fff':'rgba(255,255,255,0.2)', color:honAnnee===y?'#059669':'#fff' }}>
                {y}
              </button>
            ))}
            <button onClick={() => setShowGrille(v => !v)}
              style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid rgba(255,255,255,0.4)', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              📊 Grille tarifaire
            </button>
          </div>
        </div>
      </div>

      {/* Grille tarifaire */}
      {showGrille && (
        <div style={{ background:COULEURS.blanc, borderRadius:14, border:'1px solid #E5E7EB', padding:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:800, color:COULEURS.navy }}>📊 Grille tarifaire horaire (FCFA)</div>
            <div style={{ display:'flex', gap:8 }}>
              {grilleEdited && (
                <button onClick={sauvegarderGrille}
                  style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#059669', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  💾 Sauvegarder
                </button>
              )}
              <button onClick={() => { setGrille({..._PA_GRILLE_DEF}); setGrilleEdited(true); }}
                style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#F9FAFB', color:COULEURS.gris600, fontSize:12, cursor:'pointer' }}>
                Réinitialiser
              </button>
            </div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:16 }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>Grade / Type contrat</th>
                {_PA_TYPES.map(t => (
                  <th key={t.key} style={{ padding:'8px 12px', textAlign:'center', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{t.lib}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {_PA_GRADES.map(g => (
                <tr key={g} style={{ borderBottom:'1px solid #F1F5F9' }}>
                  <td style={{ padding:'9px 12px', fontWeight:700, color:COULEURS.navy }}>{g}</td>
                  {_PA_TYPES.map(t => (
                    <td key={t.key} style={{ padding:'6px 12px', textAlign:'center' }}>
                      <input type="number" value={grille.tarifs?.[g]?.[t.key] || 0}
                        onChange={e => {
                          const n = parseInt(e.target.value, 10);
                          setGrille(prev => ({ ...prev, tarifs: { ...prev.tarifs, [g]: { ...prev.tarifs[g], [t.key]: isNaN(n)?0:n } } }));
                          setGrilleEdited(true);
                        }}
                        style={{ width:90, padding:'5px 8px', borderRadius:6, border:'1px solid #E5E7EB', fontSize:12, textAlign:'right', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Multiplicateurs par niveau CECR</div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {_PA_NIVEAUX.map(n => (
                <div key={n} style={{ display:'flex', alignItems:'center', gap:8, background:'#F8FAFC', padding:'8px 14px', borderRadius:8, border:'1px solid #E5E7EB' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{n}</span>
                  <span style={{ color:COULEURS.gris400 }}>×</span>
                  <input type="number" step="0.1" min="0.5" max="3"
                    value={grille.multiplicateurs?.[n] || 1}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setGrille(prev => ({ ...prev, multiplicateurs: { ...prev.multiplicateurs, [n]: isNaN(v)?1:v } }));
                      setGrilleEdited(true);
                    }}
                    style={{ width:60, padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB', fontSize:12, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Coaches sans fiche */}
      {!loadHon && coachsSans.length > 0 && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', fontSize:13, color:'#92400E' }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>⚠️ {coachsSans.length} coach{coachsSans.length>1?'s':''} sans fiche d'honoraires pour {moisLabel}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {coachsSans.map(co => (
              <button key={co.id} onClick={() => calculerHon(co)} disabled={calcEnCours[co.id]}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #FDE68A', background:'#FEF3C7', color:'#92400E', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                {calcEnCours[co.id] ? '⏳' : '🔢 Calculer'} {co.prenom} {co.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contenu principal */}
      {loadHon ? (
        <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des honoraires…</div>
      ) : honoraires.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 20px', border:'2px dashed #E5E7EB', borderRadius:14, color:COULEURS.gris400 }}>
          <div style={{ fontSize:44, marginBottom:12 }}>💰</div>
          <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6, fontSize:15 }}>Aucune fiche d'honoraires pour {moisLabel}</div>
          <div style={{ fontSize:12 }}>Utilisez les boutons "🔢 Calculer" ci-dessus pour générer les fiches à partir des séances enregistrées.</div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {[
              { l:'Coachs',        v: honoraires.length,                                                    c:'#6366F1' },
              { l:'Total séances', v: honoraires.reduce((s,h)=>s+(h.nb_seances||0),0),                     c:'#0EA5E9' },
              { l:'Total heures',  v: `${honoraires.reduce((s,h)=>s+(h.nb_heures||0),0).toFixed(1)}h`,     c:'#8B5CF6' },
              { l:'Montant total', v: _fmtFCFA(honoraires.reduce((s,h)=>s+(h.montant_net||0),0)),          c:'#059669' },
              { l:'À valider',     v: honoraires.filter(h=>h.statut==='en_attente').length,                 c:'#F59E0B' },
              { l:'Validés RH',    v: honoraires.filter(h=>h.statut==='valide'||h.statut==='paye').length,  c:'#065F46' },
            ].map(k => (
              <div key={k.l} style={{ flex:1, minWidth:110, background:'#fff', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Tableau */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  {['Coach','Contrat','Séances','Heures','Tarif/h','Montant brut','Retenues','Montant net','Statut','Actions'].map(col => (
                    <th key={col} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB', whiteSpace:'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {honoraires.map((h, i) => {
                  const coachNom = h.coach ? `${h.coach.prenom||''} ${h.coach.nom||''}`.trim() : `Coach #${(h.coach_id||'').slice(0,6)}`;
                  const initiales = coachNom.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || 'CO';
                  const st = STATUT_HON[h.statut] || STATUT_HON.en_attente;
                  const coachObj = coaches.find(c => c.id === h.coach_id);
                  const gradeCoach = getTypeContrat(coachObj);
                  return (
                    <tr key={h.id} onClick={() => setHonModal({ hon:h, coachNom })}
                      style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:i%2===0?'#fff':'#FAFAFA' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0FDF4'}
                      onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#FAFAFA'}>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          {h.coach?.avatar_url ? (
                            <img src={h.coach.avatar_url} alt={coachNom} style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                          ) : (
                            <div style={{ width:32, height:32, borderRadius:'50%', background:'#059669', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>{initiales}</div>
                          )}
                          <div>
                            <div style={{ fontWeight:700, color:COULEURS.navy }}>{coachNom}</div>
                            <div style={{ fontSize:11, color:COULEURS.gris500 }}>{coachObj?.type_coach || coachObj?.role || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:999, background:'#EDE9FE', color:'#6D28D9' }}>{gradeCoach}</span></td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color:'#0EA5E9' }}>{h.nb_seances||0}</td>
                      <td style={{ padding:'12px 14px', color:COULEURS.gris600 }}>{(h.nb_heures||0).toFixed(1)}h</td>
                      <td style={{ padding:'12px 14px', color:COULEURS.gris600 }}>{_fmtFCFA(h.tarif_horaire)}</td>
                      <td style={{ padding:'12px 14px', fontWeight:600, color:COULEURS.navy }}>{_fmtFCFA(h.montant_brut)}</td>
                      <td style={{ padding:'12px 14px', color:'#DC2626' }}>{h.retenues ? `-${_fmtFCFA(h.retenues)}` : '-'}</td>
                      <td style={{ padding:'12px 14px', fontWeight:800, color:'#059669' }}>{_fmtFCFA(h.montant_net)}</td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.c }}>{st.lib}</span>
                      </td>
                      <td style={{ padding:'12px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => calculerHon(coachObj || { id:h.coach_id, prenom:'', nom:'' })}
                            disabled={calcEnCours[h.coach_id] || h.statut === 'transmis' || h.statut === 'paye'}
                            title={h.statut === 'transmis' || h.statut === 'paye' ? 'Déjà transmis à la RH - remettez la fiche en attente pour la recalculer' : 'Recalculer'}
                            style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #E5E7EB', background: (h.statut === 'transmis' || h.statut === 'paye') ? '#F1F5F9' : '#F9FAFB', fontSize:11, fontWeight:600, cursor: (h.statut === 'transmis' || h.statut === 'paye') ? 'not-allowed' : 'pointer', color: (h.statut === 'transmis' || h.statut === 'paye') ? '#CBD5E1' : COULEURS.gris600 }}>
                            {calcEnCours[h.coach_id] ? '⏳' : '🔢'}
                          </button>
                          {h.statut === 'en_attente' && (
                            <button onClick={() => { setHonModal({ hon:h, coachNom }); setHonConfirm(true); }}
                              style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'#059669', fontSize:11, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                              ✅ Valider
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#F0FDF4', borderTop:'2px solid #BBF7D0' }}>
                  <td colSpan={4} style={{ padding:'10px 14px', fontWeight:800, fontSize:13, color:COULEURS.navy }}>Total - {honoraires.length} coach{honoraires.length>1?'s':''}</td>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:COULEURS.navy }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.montant_brut||0),0))}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#DC2626' }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.retenues||0),0))}</td>
                  <td style={{ padding:'10px 14px', fontWeight:900, fontSize:14, color:'#059669' }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.montant_net||0),0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {/* Modal détail coach */}
      {honModal && !honConfirm && !honRefuseModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if(e.target===e.currentTarget) setHonModal(null); }}>
          <div style={{ background:'#fff', borderRadius:16, width:'90vw', maxWidth:1400, height:'90vh', overflow:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', background:'#F0FDF4', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {honModal.hon.coach?.avatar_url ? (
                  <img src={honModal.hon.coach.avatar_url} alt={honModal.coachNom} style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover' }} />
                ) : (
                  <div style={{ width:40, height:40, borderRadius:'50%', background:'#059669', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                    {honModal.coachNom.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)}
                  </div>
                )}
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ fontWeight:800, fontSize:15, color:COULEURS.navy }}>{honModal.coachNom}</div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:999, background:'#EDE9FE', color:'#6D28D9' }}>{getTypeContrat(coaches.find(c => c.id === honModal.hon.coach_id))}</span>
                  </div>
                  <div style={{ fontSize:12, color:COULEURS.gris500 }}>Honoraires {moisLabel} · {honModal.hon.nb_seances||0} séance{(honModal.hon.nb_seances||0)!==1?'s':''}</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:COULEURS.gris400, textTransform:'uppercase', fontWeight:600 }}>Montant net</div>
                  <div style={{ fontSize:20, fontWeight:900, color:'#059669' }}>{_fmtFCFA(honModal.hon.montant_net)}</div>
                </div>
                <button onClick={() => setHonModal(null)}
                  style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#E2E8F0', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>
            </div>
            <div style={{ padding:24, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { l:'Séances',        v: honModal.hon.nb_seances||0,                       c:'#0EA5E9' },
                { l:'Heures',         v: `${(honModal.hon.nb_heures||0).toFixed(1)}h`,     c:'#8B5CF6' },
                { l:'Apprenants',     v: honModal.hon.nb_apprenants||0,                    c:'#F59E0B' },
                { l:'Tarif/h',        v: _fmtFCFA(honModal.hon.tarif_horaire),             c:'#6366F1' },
                { l:'Montant brut',   v: _fmtFCFA(honModal.hon.montant_brut),              c:COULEURS.navy },
                { l:'Retenues',       v: honModal.hon.retenues ? _fmtFCFA(honModal.hon.retenues) : 'Aucune', c:'#DC2626' },
              ].map(k => (
                <div key={k.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', border:'1px solid #E5E7EB' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:4 }}>{k.l}</div>
                  <div style={{ fontWeight:800, fontSize:15, color:k.c }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Détail des séances réalisées ayant servi au calcul */}
            <div style={{ padding:'0 24px 20px' }}>
              <div style={{ fontSize:12, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
                📋 Séances réalisées prises en compte
              </div>
              {honSeancesLoading ? (
                <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:12 }}>⏳ Chargement des séances…</div>
              ) : honSeances.length === 0 ? (
                <div style={{ textAlign:'center', padding:20, color:COULEURS.gris400, fontSize:12, background:'#F8FAFC', borderRadius:10 }}>Aucune séance associée à cette fiche.</div>
              ) : (
                <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#F8FAFC' }}>
                        {['Date','Groupe','Créneau','Durée','Apprenants','Montant','Statut','Action'].map(col => (
                          <th key={col} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {honSeances.map((s, i) => {
                        const stSeance = STATUT_SEANCE_PA[s.honoraire_statut_pa] || STATUT_SEANCE_PA.en_attente;
                        return (
                        <tr key={s.id} style={{ borderBottom:'1px solid #F1F5F9', background:s.honoraire_statut_pa==='rejete'?'#FEF2F2':(i%2===0?'#fff':'#FAFAFA') }}>
                          <td style={{ padding:'8px 12px' }}>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</td>
                          <td style={{ padding:'8px 12px', fontWeight:600, color:COULEURS.navy }}>{s.classe_nom}</td>
                          <td style={{ padding:'8px 12px', color:COULEURS.gris600 }}>{s.heure_debut?.slice(0,5)}–{s.heure_fin?.slice(0,5)}</td>
                          <td style={{ padding:'8px 12px', color:COULEURS.gris600 }}>{s.duree_heures.toFixed(2)}h</td>
                          <td style={{ padding:'8px 12px', color:COULEURS.gris600 }}>{s.nb_presents||0}</td>
                          <td style={{ padding:'8px 12px', fontWeight:700, color: s.honoraire_statut_pa==='rejete'?'#9CA3AF':'#059669', textDecoration: s.honoraire_statut_pa==='rejete'?'line-through':'none' }}>{_fmtFCFA(s.montant)}</td>
                          <td style={{ padding:'8px 12px' }}>
                            <span style={{ padding:'3px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:stSeance.bg, color:stSeance.c }}>{stSeance.lib}</span>
                          </td>
                          <td style={{ padding:'8px 12px' }}>
                            {(honModal.hon.statut === 'transmis' || honModal.hon.statut === 'paye') ? (
                              <span style={{ fontSize:10, color:COULEURS.gris400, fontStyle:'italic' }}>Fiche verrouillée</span>
                            ) : (
                            <div style={{ display:'flex', gap:5 }}>
                              {s.honoraire_statut_pa !== 'valide' && (
                                <button onClick={() => setHonSeanceConfirm({ seance:s, statut:'valide' })} disabled={honSeanceActionEnCours[s.id]}
                                  title="Valider cette séance"
                                  style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #BBF7D0', background:'#F0FDF4', color:'#059669', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                                  ✅
                                </button>
                              )}
                              {s.honoraire_statut_pa !== 'rejete' && (
                                <button onClick={() => setHonSeanceConfirm({ seance:s, statut:'rejete' })} disabled={honSeanceActionEnCours[s.id]}
                                  title="Rejeter cette séance"
                                  style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                                  🚫
                                </button>
                              )}
                              {s.honoraire_statut_pa !== 'en_attente' && (
                                <button onClick={() => setHonSeanceConfirm({ seance:s, statut:'en_attente' })} disabled={honSeanceActionEnCours[s.id]}
                                  title="Remettre en attente"
                                  style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB', background:'#F9FAFB', color:'#6B7280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                                  ↩️
                                </button>
                              )}
                            </div>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modification retenues / note PA */}
            <div style={{ padding:'0 24px 20px' }}>
              <div style={{ fontSize:12, fontWeight:800, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
                ✏️ Ajustements (retenues, note)
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:4 }}>Retenues (FCFA)</div>
                  <input type="number" min="0" value={honEdit.retenues}
                    onChange={e => setHonEdit(f => ({ ...f, retenues: e.target.value }))}
                    style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, width:140 }} />
                </div>
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:4 }}>Note du PA Advisor</div>
                  <input type="text" placeholder="Commentaire, motif de retenue…" value={honEdit.note_pa}
                    onChange={e => setHonEdit(f => ({ ...f, note_pa: e.target.value }))}
                    style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, width:'100%' }} />
                </div>
                <button onClick={() => modifierHon(honModal.hon.id, honModal.coachNom)} disabled={honActionEnCours}
                  style={{ padding:'9px 16px', background:'#6366F1', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                  💾 Enregistrer
                </button>
              </div>
            </div>

            {honModal.hon.statut === 'litige' && honModal.hon.note_pa && (
              <div style={{ margin:'0 24px 16px', background:'#FEE2E2', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#991B1B', fontWeight:600 }}>
                🚫 Litige - {honModal.hon.note_pa}
              </div>
            )}
            {honModal.hon.valide_at && (
              <div style={{ margin:'0 24px 16px', background:'#E0E7FF', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#4338CA', fontWeight:600 }}>
                ✅ Validé par le PA le {new Date(honModal.hon.valide_at).toLocaleDateString('fr-FR')}
                {honModal.hon.statut === 'valide' && " - en attente de transmission à la RH"}
              </div>
            )}
            {honModal.hon.transmis_at && (
              <div style={{ margin:'0 24px 16px', background:'#DBEAFE', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1D4ED8', fontWeight:600 }}>
                📤 Transmis à la RH/Paie le {new Date(honModal.hon.transmis_at).toLocaleDateString('fr-FR')}
              </div>
            )}
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', gap:10, marginTop:'auto', flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {/* Le statut d'une fiche reste modifiable à tout moment - pas d'action à sens
                    unique - et la transmission à la RH est une étape volontaire séparée de la
                    validation, pour laisser le temps au coach de contester avant l'envoi. */}
                {honModal.hon.statut !== 'valide' && honModal.hon.statut !== 'transmis' && honModal.hon.statut !== 'paye' && (
                  <button onClick={() => setHonConfirm(true)}
                    style={{ padding:'10px 22px', background:'#059669', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                    ✅ Valider
                  </button>
                )}
                {honModal.hon.statut === 'valide' && (() => {
                  const nbSeancesEnAttente = honSeances.filter(s => s.honoraire_statut_pa === 'en_attente').length;
                  return (
                    <button onClick={() => nbSeancesEnAttente === 0 && setHonTransmisConfirm(true)} disabled={nbSeancesEnAttente > 0}
                      title={nbSeancesEnAttente > 0 ? `${nbSeancesEnAttente} séance(s) encore en attente - validez ou rejetez-les toutes avant de transmettre` : ''}
                      style={{ padding:'10px 22px', background: nbSeancesEnAttente > 0 ? '#94A3B8' : '#1D4ED8', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor: nbSeancesEnAttente > 0 ? 'not-allowed' : 'pointer', color:'#fff' }}>
                      📤 Transmettre à la RH{nbSeancesEnAttente > 0 ? ` (${nbSeancesEnAttente} en attente)` : ''}
                    </button>
                  );
                })()}
                {honModal.hon.statut !== 'litige' && (
                  <button onClick={() => setHonRefuseModal(true)}
                    style={{ padding:'10px 18px', background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', color:'#991B1B' }}>
                    🚫 Refuser
                  </button>
                )}
                {honModal.hon.statut !== 'en_attente' && (
                  <button onClick={() => validerHon(honModal.hon.id, honModal.coachNom, 'en_attente')} disabled={honActionEnCours}
                    style={{ padding:'10px 18px', background:'#F1F5F9', border:'1px solid #E5E7EB', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', color:COULEURS.gris600 }}>
                    ↩️ Remettre en attente
                  </button>
                )}
              </div>
              <button onClick={() => setHonModal(null)}
                style={{ padding:'10px 20px', background:'#F1F5F9', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal refus (litige) */}
      {honModal && honRefuseModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:440, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'20px 24px 16px', background:'#FEF2F2', borderBottom:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'#991B1B' }}>🚫 Refuser cette fiche d'honoraires</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>La fiche passera en litige et le coach devra être notifié pour correction.</div>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:12, color:COULEURS.gris500 }}>Motif du refus</div>
              <textarea rows={3} value={honEdit.note_pa} onChange={e => setHonEdit(f => ({ ...f, note_pa: e.target.value }))}
                placeholder="Ex : heures à revoir, séance non conforme…"
                style={{ padding:'10px 12px', borderRadius:8, border:'1px solid #E5E7EB', fontSize:13, resize:'vertical' }} />
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setHonRefuseModal(false)}
                style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Annuler
              </button>
              <button onClick={() => refuserHon(honModal.hon.id, honModal.coachNom, honEdit.note_pa)} disabled={honActionEnCours}
                style={{ padding:'9px 22px', background:'#DC2626', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                🚫 Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation validation/rejet/remise en attente d'une séance individuelle */}
      {honSeanceConfirm && (() => {
        const s = honSeanceConfirm.seance;
        const CONF = {
          valide:     { titre:"✅ Valider cette séance ?",          txt:"Cette séance sera comptée dans les honoraires du mois du coach.",     bg:'#F0FDF4', c:'#059669', lib:'✅ Confirmer' },
          rejete:     { titre:"🚫 Rejeter cette séance ?",          txt:"Cette séance sera exclue du montant des honoraires du mois du coach.", bg:'#FEF2F2', c:'#DC2626', lib:'🚫 Confirmer' },
          en_attente: { titre:"↩️ Remettre cette séance en attente ?", txt:"Son statut redeviendra « en attente » - elle reste comptée dans les honoraires jusqu'à nouvelle décision.", bg:'#F9FAFB', c:'#6B7280', lib:'↩️ Confirmer' },
        }[honSeanceConfirm.statut];
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1600, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setHonSeanceConfirm(null); }}>
            <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ padding:'20px 24px 16px', background: CONF.bg, borderBottom:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:15, fontWeight:800, color: CONF.c }}>{CONF.titre}</div>
                <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>{CONF.txt}</div>
              </div>
              <div style={{ padding:'18px 24px', display:'flex', flexDirection:'column', gap:6, fontSize:13 }}>
                <div><span style={{ color:COULEURS.gris500 }}>Date : </span><strong>{s.date ? new Date(s.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '-'}</strong></div>
                <div><span style={{ color:COULEURS.gris500 }}>Groupe : </span><strong>{s.classe_nom}</strong></div>
                <div><span style={{ color:COULEURS.gris500 }}>Durée : </span><strong>{s.duree_heures.toFixed(2)}h</strong></div>
                <div><span style={{ color:COULEURS.gris500 }}>Montant : </span><strong>{_fmtFCFA(s.montant)}</strong></div>
              </div>
              <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setHonSeanceConfirm(null)}
                  style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                  Annuler
                </button>
                <button onClick={() => validerSeanceUnitaire(s.id, honSeanceConfirm.statut)} disabled={honSeanceActionEnCours[s.id]}
                  style={{ padding:'9px 22px', background: CONF.c, border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                  {honSeanceActionEnCours[s.id] ? '⏳…' : CONF.lib}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal confirmation - Valider (étape 1, ne transmet pas encore à la RH) */}
      {honModal && honConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'20px 24px 16px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>✅ Confirmer la validation</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>
                Marque le calcul comme validé par vous. <strong>Pas encore transmis à la RH</strong> - le coach pourra contester et vous pourrez encore modifier avant l'envoi définitif.
              </div>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 18px', border:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:12, color:COULEURS.gris500, marginBottom:4 }}>Coach</div>
                <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy }}>{honModal.coachNom}</div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', border:'1px solid #BBF7D0' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Période</div>
                  <div style={{ fontWeight:800, fontSize:15, color:'#059669' }}>{moisLabel}</div>
                </div>
                <div style={{ flex:1, background:'#EFF6FF', borderRadius:10, padding:'12px 16px', border:'1px solid #BFDBFE' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Montant net</div>
                  <div style={{ fontWeight:800, fontSize:15, color:'#0369A1' }}>{_fmtFCFA(honModal.hon.montant_net)}</div>
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setHonConfirm(false)}
                style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Annuler
              </button>
              <button onClick={() => validerHon(honModal.hon.id, honModal.coachNom, 'valide')} disabled={honActionEnCours}
                style={{ padding:'9px 22px', background:'#059669', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                ✅ Confirmer la validation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation - Transmettre à la RH (étape 2, définitive) */}
      {honModal && honTransmisConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'20px 24px 16px', background:'#EFF6FF', borderBottom:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'#1D4ED8' }}>📤 Confirmer la transmission à la RH</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>Envoi définitif pour paiement. Assurez-vous que le coach n'a plus d'objection avant de transmettre.</div>
            </div>
            <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 18px', border:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:12, color:COULEURS.gris500, marginBottom:4 }}>Coach</div>
                <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy }}>{honModal.coachNom}</div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', border:'1px solid #BBF7D0' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Période</div>
                  <div style={{ fontWeight:800, fontSize:15, color:'#059669' }}>{moisLabel}</div>
                </div>
                <div style={{ flex:1, background:'#EFF6FF', borderRadius:10, padding:'12px 16px', border:'1px solid #BFDBFE' }}>
                  <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Montant net</div>
                  <div style={{ fontWeight:800, fontSize:15, color:'#0369A1' }}>{_fmtFCFA(honModal.hon.montant_net)}</div>
                </div>
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setHonTransmisConfirm(false)}
                style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                Annuler
              </button>
              <button onClick={() => validerHon(honModal.hon.id, honModal.coachNom, 'transmis')} disabled={honActionEnCours}
                style={{ padding:'9px 22px', background:'#1D4ED8', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                📤 Confirmer et transmettre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const _PA_GRADES     = ['Vacataire', 'CDD', 'CDI', 'Freelance'];
const _PA_TYPES      = [{ key:'en_ligne', lib:'💻 En ligne' }, { key:'presentiel', lib:'🏢 Présentiel' }];
const _PA_NIVEAUX    = ['A1-A2', 'B1-B2', 'C1-C2'];
const _PA_GRILLE_DEF = {
  tarifs: {
    Vacataire: { en_ligne:5000, presentiel:6500 },
    CDD:       { en_ligne:6500, presentiel:8000 },
    CDI:       { en_ligne:8000, presentiel:9500 },
    Freelance: { en_ligne:6000, presentiel:7500 },
  },
  multiplicateurs: { 'A1-A2':1.0, 'B1-B2':1.2, 'C1-C2':1.5 },
};
const _fmtFCFA = v => new Intl.NumberFormat('fr-FR').format(Math.round(v || 0)) + ' FCFA';
// ONGLET VUE D'ENSEMBLE PA ADVISOR - standalone (route /admin/pa-advisor/overview)
// Synthèse KPI cross-onglets : classes, coachs, rapports superviseur, remplacements,
// honoraires, apprenants et avis parents. Ne duplique pas les actions (assignation
// coach, validation honoraires...) qui restent dans leurs onglets dédiés respectifs -
// uniquement des chiffres clés + raccourcis pour y accéder rapidement.
// ─────────────────────────────────────────────────────────────────────────────
export function OngletVueEnsemblePAAdvisor() {
  const navigate = useNavigate();
  const [chargement, setChargement] = useState(true);
  const [classes,        setClasses]        = useState([]);
  const [coaches,        setCoaches]        = useState([]);
  const [rapportsSup,    setRapportsSup]    = useState([]);
  const [remplacements,  setRemplacements]  = useState([]);
  const [honoraires,     setHonoraires]     = useState([]);
  const [avisParents,    setAvisParents]    = useState([]);

  useEffect(() => {
    const now = new Date();
    setChargement(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/coachs/rapports-transmis`, { headers: supAuthHdrs() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/remplacements?plateforme=bet-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?mois=${now.getMonth()+1}&annee=${now.getFullYear()}`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
      fetch(`${_API_URL_ADMIN}/api/analytics/evaluations-coach`, { headers: _authHdrsAdmin() }).then(r => r.json()).catch(() => ({})),
    ]).then(([dc, dco, drs, drm, dho, dav]) => {
      setClasses(dc.classes || []);
      setCoaches(dco.coaches || []);
      setRapportsSup(drs.rapports || []);
      setRemplacements(drm.remplacements || []);
      setHonoraires(dho.honoraires || []);
      setAvisParents(dav.evaluations || []);
    }).finally(() => setChargement(false));
  }, []);

  const sansCoach       = classes.filter(c => !c.coach_id);
  const totalApp        = classes.reduce((s,c) => s + (c.nb_apprenants||0), 0);
  const nbEntreprises   = [...new Set(classes.map(c => c.entreprise_id).filter(Boolean))].length;
  const remplacementsAP = remplacements.filter(r => r.statut === 'a_pourvoir');
  const honEnAttente    = honoraires.filter(h => h.statut === 'en_attente');
  const notesRS         = rapportsSup.map(r => Number(r.note_globale)).filter(n => !isNaN(n));
  const moyRS           = notesRS.length ? (notesRS.reduce((a,b)=>a+b,0)/notesRS.length).toFixed(1) : null;
  const notesAvis       = avisParents.map(e => (e.q1+e.q2+e.q3+e.q4+e.q5)/5).filter(n => !isNaN(n));
  const moyAvis         = notesAvis.length ? (notesAvis.reduce((a,b)=>a+b,0)/notesAvis.length).toFixed(1) : null;

  const KPIS = [
    { l:'Classes actives',        v: classes.length,          sub: `${nbEntreprises} entreprise${nbEntreprises>1?'s':''}`,               c:'#6366F1', i:'🏫', chemin:'/admin/pa-advisor/classes' },
    { l:'Classes sans coach',     v: sansCoach.length,        sub: sansCoach.length>0 ? 'À assigner' : 'Tout est couvert',                c: sansCoach.length>0?'#EF4444':'#059669', i: sansCoach.length>0?'⚠️':'✅', chemin:'/admin/pa-advisor/classes' },
    { l:'Coachs E-Learning',      v: coaches.length,          sub: 'Habilités e-learning',                                                c:'#0EA5E9', i:'👨‍🏫', chemin:'/admin/pa-advisor/coachs' },
    { l:'Apprenants',             v: totalApp,                sub: 'Toutes classes confondues',                                           c:'#8B5CF6', i:'👥', chemin:'/admin/pa-advisor/classes' },
    { l:'Rapports Superviseur',   v: rapportsSup.length,      sub: moyRS ? `Moyenne ${moyRS}/5` : 'Aucun rapport reçu',                    c:SUP_COLOR, i:'📋', chemin:'/admin/pa-advisor/rapports-superviseur' },
    { l:'Remplacements à pourvoir', v: remplacementsAP.length, sub: remplacementsAP.length>0 ? 'Action requise' : 'Aucun en attente',       c: remplacementsAP.length>0?'#EF4444':'#059669', i:'🔄', chemin:'/admin/pa-advisor/remplacements' },
    { l:'Honoraires en attente',  v: honEnAttente.length,     sub: 'Ce mois-ci',                                                          c:'#F59E0B', i:'💰', chemin:'/admin/pa-advisor/honoraires' },
    { l:'Avis parents reçus',     v: avisParents.length,      sub: moyAvis ? `Moyenne ${moyAvis}/5` : 'Aucun avis reçu',                    c:'#F97316', i:'⭐', chemin:'/admin/pa-advisor/evaluations' },
  ];

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>📊 Vue d'ensemble</div>
        <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>Synthèse de l'activité PA Advisor - classes, coachs, rapports et honoraires</div>
      </div>

      {chargement ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement…</div>
      ) : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:28 }}>
            {KPIS.map(k => (
              <div key={k.l} onClick={() => navigate(k.chemin)}
                style={{ background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}`, cursor:'pointer', transition:'transform 0.12s, box-shadow 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{k.i}</div>
                <div style={{ fontSize:26, fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:6, fontWeight:600 }}>{k.l}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Alertes rapides */}
          {(sansCoach.length > 0 || remplacementsAP.length > 0 || honEnAttente.length > 0) && (
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:10 }}>🔔 Nécessite votre attention</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {sansCoach.length > 0 && (
                  <div onClick={() => navigate('/admin/pa-advisor/classes')} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:10, cursor:'pointer' }}>
                    <span style={{ fontSize:18 }}>⚠️</span>
                    <span style={{ fontSize:13, color:'#991B1B' }}><strong>{sansCoach.length}</strong> classe{sansCoach.length>1?'s':''} sans coach assigné{sansCoach.length>1?'s':''}</span>
                    <span style={{ marginLeft:'auto', fontSize:12, color:'#991B1B', fontWeight:700 }}>Assigner →</span>
                  </div>
                )}
                {remplacementsAP.length > 0 && (
                  <div onClick={() => navigate('/admin/pa-advisor/remplacements')} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:10, cursor:'pointer' }}>
                    <span style={{ fontSize:18 }}>🔄</span>
                    <span style={{ fontSize:13, color:'#991B1B' }}><strong>{remplacementsAP.length}</strong> remplacement{remplacementsAP.length>1?'s':''} à pourvoir</span>
                    <span style={{ marginLeft:'auto', fontSize:12, color:'#991B1B', fontWeight:700 }}>Voir →</span>
                  </div>
                )}
                {honEnAttente.length > 0 && (
                  <div onClick={() => navigate('/admin/pa-advisor/honoraires')} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, cursor:'pointer' }}>
                    <span style={{ fontSize:18 }}>💰</span>
                    <span style={{ fontSize:13, color:'#92400E' }}><strong>{honEnAttente.length}</strong> fiche{honEnAttente.length>1?'s':''} d'honoraires en attente de validation</span>
                    <span style={{ marginLeft:'auto', fontSize:12, color:'#92400E', fontWeight:700 }}>Valider →</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// ONGLET CLASSES PA ADVISOR - standalone (route /admin/pa-advisor/classes)
// Reprend les sous-onglets "Vue générale" et "Classes sans coach" de l'ancien
// DashboardPAAdvisor monolithique, SANS le sous-onglet Honoraires (qui vit
// désormais dans son propre onglet top-level, OngletHonorairesPAAdvisor).
// ─────────────────────────────────────────────────────────────────────────────
export function OngletClassesPAAdvisor() {
  const { couleurTheme, couleurThemeFonce } = useTheme();
  const [onglet,      setOnglet]      = useTabState('vue-generale', 'onglet_pa_classes');
  const [classes,     setClasses]     = useState([]);
  const [sansCoach,   setSansCoach]   = useState([]);
  const [coaches,     setCoaches]     = useState([]);
  const [chargement,  setChargement]  = useState(true);
  const [coachChoisi, setCoachChoisi] = useState({});
  const [saving,      setSaving]      = useState(null);
  const [flash,       setFlash]       = useState(null);
  const [pageClasses, setPageClasses] = useState(1);
  const [filtreStatutClasse, setFiltreStatutClasse] = useState('tous');
  const CLASSES_PAR_PAGE = 10;

  // ── Détail classe → apprenants → détail (même pattern que OngletSuiviApprenantsPAAdvisor) ──
  const [classeActive,   setClasseActive]   = useState(null);
  const [apprenantsCl,   setApprenantsCl]   = useState([]);
  const [chargApp,       setChargApp]       = useState(false);
  const [modalApprenant, setModalApprenant] = useState(null);
  const [rechercheApp,   setRechercheApp]   = useState('');

  const NIV_C  = { A1:'#6366F1', A2:'#0891B2', B1:'#059669', B2:'#F97316', C1:'#DC2626', C2:'#7C3AED' };
  const STATUT_APP = { actif:{ bg:'#D1FAE5', txt:'#065F46', lib:'Actif' }, suspendu:{ bg:'#FEE2E2', txt:'#991B1B', lib:'Suspendu' }, certifie:{ bg:'#EDE9FE', txt:'#5B21B6', lib:'Certifié' } };

  function ouvrirClasse(classe) {
    setClasseActive(classe);
    setRechercheApp('');
    setChargApp(true);
    setApprenantsCl([]);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}/apprenants`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setApprenantsCl(d.apprenants || []))
      .catch(() => {})
      .finally(() => setChargApp(false));
  }

  const apprenantsClFiltres = apprenantsCl.filter(a =>
    !rechercheApp || (a.nom_complet||'').toLowerCase().includes(rechercheApp.toLowerCase()) || (a.email||'').toLowerCase().includes(rechercheApp.toLowerCase())
  );

  useEffect(() => {
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/sans-coach`, { headers: _authHdrsAdmin() }).then(r => r.json()),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()),
    ]).then(([dc, ds, dco]) => {
      setClasses(dc.classes || []);
      setSansCoach(ds.classes || []);
      setCoaches(dco.coaches || []);
    }).catch(() => {}).finally(() => setChargement(false));
  }, []);

  async function assignerCoach(classeId) {
    if (saving) return;
    const coachId = coachChoisi[classeId];
    if (!coachId) return;
    const coach = coaches.find(c => c.id === coachId);
    setSaving(classeId);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classeId}`, {
        method: 'PATCH',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({ coach_id: coachId, coach_nom: `${coach.prenom} ${coach.nom}` }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setSansCoach(prev => prev.filter(c => c.id !== classeId));
      setClasses(prev => prev.map(c => c.id === classeId ? { ...c, coach_id: coachId, coach_nom: `${coach.prenom} ${coach.nom}` } : c));
      setFlash({ type: 'ok', msg: `✅ Coach ${coach.prenom} ${coach.nom} assigné à la classe "${d.classe?.nom}".` });
      setTimeout(() => setFlash(null), 5000);
    } catch (err) { setFlash({ type: 'err', msg: err.message }); }
    finally { setSaving(null); }
  }

  const avecCoach     = classes.filter(c => c.coach_id);
  const totalApp      = classes.reduce((s, c) => s + (c.nb_apprenants || 0), 0);
  const nbEntreprises = [...new Set(classes.map(c => c.entreprise_id).filter(Boolean))].length;

  const NIV_CL = { A1:'#60A5FA', A2:'#34D399', B1:'#F59E0B', B2:'#8B5CF6', C1:'#EC4899', C2:'#EF4444' };
  const FORMAT = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };

  // classes_elearning n'a que 2 statuts réels en base : "actif" et "clos" (mis à "clos"
  // via la clôture définitive d'une classe) - il n'existe pas de statut "en attente".
  const STATUT_CLASSE = {
    actif: { lib:'Active',   bg:'#D1FAE5', c:'#065F46' },
    clos:  { lib:'Terminée', bg:'#F1F5F9', c:'#475569' },
  };
  const classesFiltrees = filtreStatutClasse === 'tous' ? classes : classes.filter(c => c.statut === filtreStatutClasse);

  const classesNbPages  = Math.max(1, Math.ceil(classesFiltrees.length / CLASSES_PAR_PAGE));
  const classesPageSafe = Math.min(pageClasses, classesNbPages);
  const classesPage     = classesFiltrees.slice((classesPageSafe - 1) * CLASSES_PAR_PAGE, classesPageSafe * CLASSES_PAR_PAGE);

  const fmtHoraires = c => (Array.isArray(c.horaire) ? c.horaire : []).map(h => `${h.jour} ${h.debut}–${h.fin}`).join(', ') || '-';

  const exportClassesExcel = () => exporterExcelStyle({
    nomFichier: `classes_pa_advisor_${new Date().toISOString().slice(0,10)}`,
    titre: '🏫 Classes E-Learning',
    sousTitre: `${classesFiltrees.length} classe${classesFiltrees.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
    couleurEntete: '6366F1',
    colonnes: [
      { label: 'Classe', width: 26, bold: true }, { label: 'Entreprise', width: 22 },
      { label: 'Niveau', width: 10, align: 'center' }, { label: 'Type', width: 14 },
      { label: 'Apprenants', width: 12, align: 'center' }, { label: 'Statut', width: 12 },
      { label: 'Horaires', width: 30 }, { label: 'Coach', width: 22 },
    ],
    lignes: classesFiltrees.map(c => [
      c.nom, c.entreprise_nom || '-', c.niveau || '-',
      FORMAT[c.type_cours] || c.type_cours || '-', c.nb_apprenants || 0,
      STATUT_CLASSE[c.statut]?.lib || c.statut || '-',
      fmtHoraires(c), c.coach_nom || 'Pas de coach assigné',
    ]),
  });

  const exportClassesPDF = () => {
    const lignesHtml = classesFiltrees.map(c => `
      <tr>
        <td>${c.nom}</td>
        <td>${c.entreprise_nom || '-'}</td>
        <td>${c.niveau || '-'}</td>
        <td>${c.nb_apprenants || 0}</td>
        <td>${STATUT_CLASSE[c.statut]?.lib || c.statut || '-'}</td>
        <td>${c.coach_nom || 'Pas de coach assigné'}</td>
      </tr>
    `).join('');
    genererPDF(`
      <div class="doc-header">
        <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Classes E-Learning - PA Advisor</div></div>
        <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
      </div>
      <div class="doc-title-band">🏫 CLASSES E-LEARNING</div>
      <div class="doc-body">
        <div class="kpi-row">
          <div class="kpi-card"><div class="kpi-val">${classesFiltrees.length}</div><div class="kpi-lbl">Classes</div></div>
          <div class="kpi-card"><div class="kpi-val">${avecCoach.length}</div><div class="kpi-lbl">Avec coach</div></div>
          <div class="kpi-card"><div class="kpi-val">${totalApp}</div><div class="kpi-lbl">Apprenants</div></div>
        </div>
        <table>
          <thead><tr><th>Classe</th><th>Entreprise</th><th>Niveau</th><th>Apprenants</th><th>Statut</th><th>Coach</th></tr></thead>
          <tbody>${lignesHtml}</tbody>
        </table>
        <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Classes_PA_Advisor_${new Date().toISOString().slice(0,10)}`);
  };

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, marginBottom:16, background: flash.type==='ok' ? '#D1FAE5' : '#FEE2E2', color: flash.type==='ok' ? '#065F46' : '#991B1B', fontSize:13, fontWeight:600 }}>
          {flash.msg}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { l:'Classes actives',   v: classes.length,       c:'#6366F1', i:'🏫' },
          { l:'Avec coach',        v: avecCoach.length,     c:'#059669', i:'👨‍🏫' },
          { l:'Sans coach',        v: sansCoach.length,     c: sansCoach.length > 0 ? '#EF4444' : '#059669', i: sansCoach.length > 0 ? '⚠️' : '✅' },
          { l:'Apprenants total',  v: totalApp,             c:'#0EA5E9', i:'👥' },
          { l:'Entreprises',       v: nbEntreprises,        c:'#8B5CF6', i:'🏢' },
        ].map(k => (
          <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', border:`1px solid #E5E7EB`, borderTop:`3px solid ${k.c}` }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.i}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.c }}>{chargement ? '…' : k.v}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #E5E7EB', marginBottom:24, overflowX:'auto' }}>
        {[
          { id:'vue-generale',  lib:'Vue générale',      ic:'📊' },
          { id:'sans-coach',    lib:'Classes sans coach', ic:'⚠️',  badge: sansCoach.length },
        ].map(t => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            style={{ padding:'10px 18px', border:'none', borderBottom: onglet===t.id ? '2.5px solid #6366F1' : '2.5px solid transparent', background:'none', color: onglet===t.id ? '#6366F1' : '#6B7280', fontWeight: onglet===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, marginBottom:-2, whiteSpace:'nowrap' }}>
            {t.ic} {t.lib}
            {t.badge > 0 && <span style={{ background:'#EF4444', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Vue générale */}
      {onglet === 'vue-generale' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement…</div>
        ) : classes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏫</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Aucune classe e-learning</div>
            <div style={{ fontSize:13 }}>Les classes créées par l'Onboarding apparaîtront ici.</div>
          </div>
        ) : (
          <>
            {/* Filtre statut + export */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', gap:6 }}>
                {[{ id:'tous', lib:'Toutes' }, { id:'actif', lib:'Actives' }, { id:'clos', lib:'Terminées' }].map(f => (
                  <button key={f.id} onClick={() => { setFiltreStatutClasse(f.id); setPageClasses(1); }}
                    style={{ padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight: filtreStatutClasse===f.id ? 700 : 500, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:`1.5px solid ${filtreStatutClasse===f.id ? '#6366F1' : '#E5E7EB'}`, background: filtreStatutClasse===f.id ? '#6366F1' : '#fff', color: filtreStatutClasse===f.id ? '#fff' : '#6B7280' }}>
                    {f.lib}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={exportClassesExcel} style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>📊 Exporter Excel</button>
                <button onClick={exportClassesPDF} style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>📥 Exporter PDF</button>
              </div>
            </div>

            {classesFiltrees.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>Aucune classe pour ce filtre.</div>
            ) : (
              <>
                <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden', marginBottom:16 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'2fr 1.6fr 0.8fr 1.2fr 1fr 1fr 1.8fr', padding:'11px 20px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span>Classe</span><span>Entreprise</span><span>Niveau</span><span>Type</span><span>Apprenants</span><span>Statut</span><span>Coach</span>
                  </div>
                  {classesPage.map(c => {
                    const st = STATUT_CLASSE[c.statut];
                    return (
                      <div key={c.id} onClick={() => ouvrirClasse(c)}
                        style={{ display:'grid', gridTemplateColumns:'2fr 1.6fr 0.8fr 1.2fr 1fr 1fr 1.8fr', padding:'12px 20px', borderBottom:'1px solid #F1F5F9', alignItems:'center', cursor:'pointer', transition:'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontWeight:700, fontSize:13, color:'#1E293B' }}>{c.nom}</span>
                        <span style={{ fontSize:12, color:'#6B7280' }}>{c.entreprise_nom || '-'}</span>
                        {c.niveau
                          ? <span style={{ background: NIV_CL[c.niveau] || '#E5E7EB', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800, justifySelf:'start' }}>{c.niveau}</span>
                          : <span style={{ fontSize:12, color:'#9CA3AF' }}>-</span>}
                        <span style={{ fontSize:12, color:'#6B7280' }}>{FORMAT[c.type_cours] || c.type_cours || '-'}</span>
                        <span style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{c.nb_apprenants || 0}</span>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:10, background: st?.bg||'#F1F5F9', color: st?.c||'#475569', justifySelf:'start' }}>{st?.lib || c.statut || '-'}</span>
                        {c.coach_id
                          ? <span style={{ fontSize:12, color:'#059669', fontWeight:600 }}>👨‍🏫 {c.coach_nom}</span>
                          : <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>⚠️ Pas de coach assigné</span>}
                      </div>
                    );
                  })}
                </div>

                {classesNbPages > 1 && (
                  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:10 }}>
                    <button
                      disabled={classesPageSafe <= 1}
                      onClick={() => setPageClasses(classesPageSafe - 1)}
                      style={{ padding:'7px 16px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#374151', fontSize:12, fontWeight:600, cursor: classesPageSafe<=1?'default':'pointer', opacity: classesPageSafe<=1?0.4:1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                    >‹ Précédent</button>
                    <span style={{ fontSize:12, color:'#6B7280' }}>Page {classesPageSafe} / {classesNbPages}</span>
                    <button
                      disabled={classesPageSafe >= classesNbPages}
                      onClick={() => setPageClasses(classesPageSafe + 1)}
                      style={{ padding:'7px 16px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#374151', fontSize:12, fontWeight:600, cursor: classesPageSafe>=classesNbPages?'default':'pointer', opacity: classesPageSafe>=classesNbPages?0.4:1, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                    >Suivant ›</button>
                  </div>
                )}
              </>
            )}
          </>
        )
      )}

      {/* Classes sans coach */}
      {onglet === 'sans-coach' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement…</div>
        ) : sansCoach.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Toutes les classes ont un coach</div>
            <div style={{ fontSize:13 }}>Aucune classe en attente d'assignation.</div>
          </div>
        ) : (
          <div>
            <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:13, color:'#92400E' }}>
              ⚠️ <strong>{sansCoach.length} classe{sansCoach.length > 1 ? 's' : ''}</strong> créée{sansCoach.length > 1 ? 's' : ''} par l'Onboarding en attente d'un coach. Assignez un coach habilité e-learning pour chaque classe.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {sansCoach.map(c => {
                const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                const selectedCoach = coachChoisi[c.id] || '';
                const isSaving = saving === c.id;
                return (
                  <div key={c.id} style={{ background:'#fff', borderRadius:14, border:'1.5px solid #FDE68A', padding:'20px 24px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:800, color:'#1E293B', marginBottom:4 }}>{c.nom}</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                          {c.entreprise_nom && <span style={{ fontSize:12, color:'#6B7280' }}>🏢 {c.entreprise_nom}</span>}
                          {c.niveau && <span style={{ background: NIV_CL[c.niveau]||'#E5E7EB', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800 }}>{c.niveau}</span>}
                          {c.type_cours && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{FORMAT[c.type_cours]||c.type_cours}</span>}
                          <span style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>👥 {c.nb_apprenants||0} apprenant{c.nb_apprenants!==1?'s':''}</span>
                        </div>
                        {horaires.length > 0 && (
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:8 }}>
                            {horaires.map((h, i) => (
                              <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:8, padding:'3px 9px', fontSize:11, fontWeight:600 }}>📅 {h.jour} {h.debut}–{h.fin}</span>
                            ))}
                          </div>
                        )}
                        {c.created_by_nom && (
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>Créée par {c.created_by_nom} · {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''}</div>
                        )}
                      </div>
                    </div>

                    {/* Assignation coach - cartes visuelles */}
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:12 }}>
                        👨‍🏫 Sélectionner un coach e-learning *
                      </label>

                      {coaches.length === 0 ? (
                        <div style={{ padding:'16px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:13 }}>
                          ⚠️ Aucun coach habilité e-learning disponible.
                        </div>
                      ) : (() => {
                        const meilleur = coaches[0];
                        const ROLE_LIB = { coach:'Coach', professeur_titulaire:'Titulaire', professeur_remplacant:'Remplaçant' };
                        const TYPE_LIB = { permanent:'Permanent', freelance:'Freelance', consultant:'Consultant', vacataire:'Vacataire' };
                        const initiales = co => `${(co.prenom||'')[0]||''}${(co.nom||'')[0]||''}`.toUpperCase();
                        const COLORS = ['#6366F1','#0891B2','#059669','#F97316','#8B5CF6','#EC4899','#DC2626','#0EA5E9'];
                        const couleurCo = co => COLORS[(co.prenom||'A').charCodeAt(0) % COLORS.length];

                        return (
                          <>
                            {/* Meilleur choix */}
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:800, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:20, padding:'2px 10px' }}>🏆 MEILLEUR CHOIX</span>
                              </div>
                              <div
                                onClick={() => setCoachChoisi(prev => ({ ...prev, [c.id]: meilleur.id }))}
                                style={{ background: selectedCoach === meilleur.id ? 'linear-gradient(135deg,#EEF2FF,#E0E7FF)' : 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border:`2px solid ${selectedCoach === meilleur.id ? '#6366F1' : '#86EFAC'}`, borderRadius:12, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, transition:'all 0.15s' }}>
                                <div style={{ width:46, height:46, borderRadius:'50%', background:couleurCo(meilleur), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', flexShrink:0 }}>
                                  {initiales(meilleur)}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                                    <span style={{ fontSize:14, fontWeight:800, color:'#1E293B' }}>{meilleur.prenom} {meilleur.nom}</span>
                                    <span style={{ background:'#DCFCE7', color:'#15803D', borderRadius:20, padding:'1px 8px', fontSize:10, fontWeight:800 }}>RECOMMANDÉ</span>
                                  </div>
                                  <div style={{ fontSize:12, color:'#475569', marginBottom:5 }}>
                                    {ROLE_LIB[meilleur.role] || meilleur.role}{meilleur.type_coach ? ` · ${TYPE_LIB[meilleur.type_coach] || meilleur.type_coach}` : ''}
                                  </div>
                                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                    <span style={{ background:'#EEF2FF', color:'#4338CA', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>✓ Habilité e-learning</span>
                                    {meilleur.email && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:6, padding:'2px 8px', fontSize:10 }}>{meilleur.email}</span>}
                                  </div>
                                </div>
                                <div style={{ width:22, height:22, borderRadius:'50%', border:`2.5px solid ${selectedCoach === meilleur.id ? '#6366F1' : '#86EFAC'}`, background: selectedCoach === meilleur.id ? '#6366F1' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                  {selectedCoach === meilleur.id && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
                                </div>
                              </div>
                            </div>

                            {/* Tous les coachs */}
                            {coaches.length > 1 && (
                              <div>
                                <div style={{ fontSize:10, fontWeight:800, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                                  📋 TOUS LES COACHS DISPONIBLES ({coaches.length})
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                  {coaches.map((co, idx) => {
                                    const sel = selectedCoach === co.id;
                                    return (
                                      <div key={co.id}
                                        onClick={() => setCoachChoisi(prev => ({ ...prev, [c.id]: co.id }))}
                                        style={{ background: sel ? '#EEF2FF' : '#FAFAFA', border:`1.5px solid ${sel ? '#6366F1' : '#E5E7EB'}`, borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, transition:'all 0.12s' }}
                                        onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor='#A5B4FC'; }}
                                        onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor='#E5E7EB'; }}>
                                        <div style={{ width:38, height:38, borderRadius:'50%', background:couleurCo(co), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                                          {initiales(co)}
                                        </div>
                                        <div style={{ flex:1 }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                            <span style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{co.prenom} {co.nom}</span>
                                            {idx === 0 && <span style={{ background:'#DCFCE7', color:'#15803D', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700 }}>RECOMMANDÉ</span>}
                                          </div>
                                          <div style={{ fontSize:11, color:'#6B7280' }}>
                                            {ROLE_LIB[co.role] || co.role}{co.type_coach ? ` · ${TYPE_LIB[co.type_coach] || co.type_coach}` : ''}
                                          </div>
                                        </div>
                                        <div style={{ width:20, height:20, borderRadius:'50%', border:`2.5px solid ${sel ? '#6366F1' : '#D1D5DB'}`, background: sel ? '#6366F1' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                          {sel && <div style={{ width:7, height:7, borderRadius:'50%', background:'#fff' }} />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Bouton confirmer */}
                            <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                              <button
                                onClick={() => assignerCoach(c.id)}
                                disabled={!selectedCoach || isSaving}
                                style={{ padding:'11px 24px', borderRadius:10, border:'none', background: !selectedCoach || isSaving ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#4F46E5)', color: !selectedCoach || isSaving ? '#9CA3AF' : '#fff', fontWeight:700, fontSize:13, cursor: !selectedCoach || isSaving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', boxShadow: !selectedCoach || isSaving ? 'none' : '0 4px 14px rgba(99,102,241,0.4)', transition:'all 0.15s' }}>
                                {isSaving ? '⏳ Assignation en cours…' : `✅ Confirmer l'assignation${selectedCoach ? ` - ${coaches.find(co=>co.id===selectedCoach)?.prenom||''}` : ''}`}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Modal apprenants de la classe */}
      {classeActive && !modalApprenant && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'24px 16px' }}
          onClick={() => { setClasseActive(null); setApprenantsCl([]); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:'18px 24px', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#0EA5E9', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14 }}>
                {classeActive.niveau || '🏫'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15, color:COULEURS.navy }}>{classeActive.nom}</div>
                <div style={{ fontSize:12, color:COULEURS.gris400 }}>
                  {classeActive.entreprise_nom ? `${classeActive.entreprise_nom} · ` : ''}
                  {classeActive.coach_nom ? `Coach : ${classeActive.coach_nom}` : '⚠️ Pas de coach'} · {apprenantsCl.length} apprenant(s)
                </div>
              </div>
              <button onClick={() => { setClasseActive(null); setApprenantsCl([]); }}
                style={{ width:32, height:32, borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontSize:16, color:COULEURS.gris600, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            {/* KPIs */}
            {!chargApp && apprenantsCl.length > 0 && (() => {
              const nbActifs    = apprenantsCl.filter(a => a.statut === 'actif').length;
              const nbSuspendus = apprenantsCl.filter(a => a.statut === 'suspendu').length;
              const nbCertifies = apprenantsCl.filter(a => a.statut === 'certifie').length;
              const cap         = classeActive.capacite_max || classeActive.nb_places;
              const tauxRempli  = cap ? Math.round((apprenantsCl.length / cap) * 100) : null;
              const kpis = [
                { label:'Inscrits',    val: apprenantsCl.length, couleur:'#0EA5E9', fond:'#EFF6FF' },
                { label:'Actifs',      val: nbActifs,            couleur:'#059669', fond:'#D1FAE5' },
                { label:'Suspendus',   val: nbSuspendus,         couleur:'#DC2626', fond:'#FEE2E2' },
                { label:'Certifiés',   val: nbCertifies,         couleur:'#7C3AED', fond:'#EDE9FE' },
                ...(tauxRempli !== null ? [{ label:'Remplissage', val:`${tauxRempli}%`, couleur: tauxRempli >= 90 ? '#DC2626' : tauxRempli >= 70 ? '#F97316' : '#059669', fond:'#F8FAFC' }] : []),
              ];
              return (
                <div style={{ display:'flex', gap:10, padding:'12px 24px', borderBottom:`1px solid ${COULEURS.gris100}`, flexWrap:'wrap' }}>
                  {kpis.map(k => (
                    <div key={k.label} style={{ background:k.fond, borderRadius:10, padding:'8px 16px', minWidth:80, textAlign:'center', border:`1px solid ${k.couleur}22` }}>
                      <div style={{ fontSize:18, fontWeight:800, color:k.couleur }}>{k.val}</div>
                      <div style={{ fontSize:10, fontWeight:600, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Recherche */}
            <div style={{ padding:'12px 24px', borderBottom:`1px solid ${COULEURS.gris100}` }}>
              <input placeholder="Rechercher un apprenant…" value={rechercheApp} onChange={e => setRechercheApp(e.target.value)}
                style={{ width:'100%', padding:'9px 14px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box' }} />
            </div>
            {/* En-têtes */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr', padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Apprenant</span><span>Email</span><span>Niveau</span><span>Statut</span>
            </div>
            {/* Liste */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {chargApp ? (
                <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
              ) : apprenantsClFiltres.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>Aucun apprenant{rechercheApp ? ' trouvé' : ' dans cette classe'}</div>
              ) : apprenantsClFiltres.map((a, idx) => {
                const st  = STATUT_APP[a.statut] || { bg:COULEURS.gris100, txt:COULEURS.gris600, lib:a.statut||'-' };
                const nvc = NIV_C[a.niveau_cecr] || '#94A3B8';
                const parts = (a.nom_complet||'').trim().split(' ');
                const prenom = parts[0] || '';
                const nom    = parts.slice(1).join(' ') || '';
                return (
                  <div key={a.id}
                    onClick={() => setModalApprenant({ ...a, prenom, nom, groupe: classeActive, entreprise: { nom: classeActive.entreprise_nom } })}
                    style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr', padding:'13px 24px', borderBottom: idx < apprenantsClFiltres.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {a.avatar_url ? (
                        <img src={a.avatar_url} alt="" style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={e => { e.target.style.display='none'; }} />
                      ) : (
                        <div style={{ width:26, height:26, borderRadius:'50%', background:`${couleurTheme}18`, color:couleurThemeFonce, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>
                          {prenom?.[0]}{nom?.[0]}
                        </div>
                      )}
                      <span style={{ fontWeight:700, color:COULEURS.navy }}>{a.nom_complet || '-'}</span>
                    </div>
                    <span style={{ fontSize:12, color:COULEURS.gris600 }}>{a.email || '-'}</span>
                    <span>{a.niveau_cecr
                      ? <span style={{ padding:'3px 9px', borderRadius:20, background:`${nvc}18`, color:nvc, fontWeight:700, fontSize:12 }}>{a.niveau_cecr}</span>
                      : <span style={{ fontSize:12, color:COULEURS.gris400 }}>-</span>}
                    </span>
                    <span style={{ padding:'3px 9px', borderRadius:20, background:st.bg, color:st.txt, fontWeight:600, fontSize:11 }}>{st.lib}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail apprenant */}
      {modalApprenant && (
        <ModalDetailApprenant
          apprenant={modalApprenant}
          groupe={modalApprenant.groupe}
          entreprise={modalApprenant.entreprise}
          onFermer={() => setModalApprenant(null)}
        />
      )}
    </div>
  );
}

export function DashboardPAAdvisor() {
  const [onglet,       setOnglet]       = useTabState('vue-generale', 'onglet_pa');
  const [classes,      setClasses]      = useState([]);
  const [sansCoach,    setSansCoach]    = useState([]);
  const [coaches,      setCoaches]      = useState([]);
  const [chargement,   setChargement]   = useState(true);
  const [coachChoisi,  setCoachChoisi]  = useState({});
  const [saving,       setSaving]       = useState(null);
  const [flash,        setFlash]        = useState(null);

  // ── Honoraires ─────────────────────────────────────────────────────────────
  const now = new Date();
  const [honMois,       setHonMois]       = useState(now.getMonth() + 1);
  const [honAnnee,      setHonAnnee]      = useState(now.getFullYear());
  const [honoraires,    setHonoraires]    = useState([]);
  const [loadHon,       setLoadHon]       = useState(false);
  const [honModal,      setHonModal]      = useState(null);  // { hon, coach }
  const [honConfirm,    setHonConfirm]    = useState(false);
  const [calcEnCours,   setCalcEnCours]   = useState({});   // { coachId: true }
  const [honActionEnCours, setHonActionEnCours] = useState(false); // empêche le double-clic valider/sauvegarder
  const [grille,        setGrille]        = useState(_PA_GRILLE_DEF);
  const [grilleEdited,  setGrilleEdited]  = useState(false);
  const [showGrille,    setShowGrille]    = useState(false);

  const MOIS_LABELS = ['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const moisLabel   = `${MOIS_LABELS[honMois]} ${honAnnee}`;

  function fetchHonoraires() {
    setLoadHon(true);
    const params = `mois=${honMois}&annee=${honAnnee}`;
    fetch(`${_API_URL_ADMIN}/api/elearning/honoraires?${params}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setHonoraires(d.honoraires || []))
      .catch(() => setHonoraires([]))
      .finally(() => setLoadHon(false));
  }

  useEffect(() => {
    if (onglet === 'honoraires') fetchHonoraires();
  }, [onglet, honMois, honAnnee]); // eslint-disable-line

  async function calculerHon(coach) {
    if (calcEnCours[coach.id]) return;
    setCalcEnCours(p => ({ ...p, [coach.id]: true }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/calculer`, {
        method: 'POST',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_id: coach.id, mois: honMois, annee: honAnnee }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur calcul');
      fetchHonoraires();
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setCalcEnCours(p => ({ ...p, [coach.id]: false }));
    }
  }

  async function validerHon(honId, coachNom) {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/honoraires/${honId}/statut`, {
        method: 'PATCH',
        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'valide' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur validation');
      setHonoraires(prev => prev.map(h => h.id === honId ? d.honoraire : h));
      setFlash({ type:'ok', msg: `✅ Honoraires de ${coachNom} validés et transmis à la RH/Paie.` });
      setTimeout(() => setFlash(null), 5000);
      setHonModal(null);
      setHonConfirm(false);
    } catch (e) {
      setFlash({ type:'err', msg: e.message });
    } finally {
      setHonActionEnCours(false);
    }
  }

  async function sauvegarderGrille() {
    if (honActionEnCours) return;
    setHonActionEnCours(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/admin/parametres/grille_tarifaire`, {
        method: 'PUT', headers: _authHdrsAdmin(), body: JSON.stringify({ valeur: grille }),
      });
      if (!r.ok) throw new Error('Erreur sauvegarde');
    } catch {}
    setGrilleEdited(false);
    setFlash({ type:'ok', msg: '✅ Grille tarifaire sauvegardée.' });
    setTimeout(() => setFlash(null), 3000);
    setHonActionEnCours(false);
  }

  const STATUT_HON = {
    en_attente: { lib:'En attente', bg:'#FEF3C7', c:'#B45309' },
    valide:     { lib:'Validé → RH', bg:'#DBEAFE', c:'#1D4ED8' },
    paye:       { lib:'Payé',        bg:'#D1FAE5', c:'#065F46' },
    litige:     { lib:'Litige',      bg:'#FEE2E2', c:'#991B1B' },
  };

  useEffect(() => {
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/sans-coach`, { headers: _authHdrsAdmin() }).then(r => r.json()),
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/coaches-elearning`, { headers: _authHdrsAdmin() }).then(r => r.json()),
    ]).then(([dc, ds, dco]) => {
      setClasses(dc.classes || []);
      setSansCoach(ds.classes || []);
      setCoaches(dco.coaches || []);
    }).catch(() => {}).finally(() => setChargement(false));
    fetch(`${_API_URL_ADMIN}/api/admin/parametres/grille_tarifaire`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => { if (d.valeur) setGrille(d.valeur); }).catch(() => {});
  }, []);

  async function assignerCoach(classeId) {
    if (saving) return;
    const coachId = coachChoisi[classeId];
    if (!coachId) return;
    const coach = coaches.find(c => c.id === coachId);
    setSaving(classeId);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classeId}`, {
        method: 'PATCH',
        headers: _authHdrsAdmin(),
        body: JSON.stringify({ coach_id: coachId, coach_nom: `${coach.prenom} ${coach.nom}` }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erreur');
      setSansCoach(prev => prev.filter(c => c.id !== classeId));
      setClasses(prev => prev.map(c => c.id === classeId ? { ...c, coach_id: coachId, coach_nom: `${coach.prenom} ${coach.nom}` } : c));
      setFlash({ type: 'ok', msg: `✅ Coach ${coach.prenom} ${coach.nom} assigné à la classe "${d.classe?.nom}".` });
      setTimeout(() => setFlash(null), 5000);
    } catch (err) { setFlash({ type: 'err', msg: err.message }); }
    finally { setSaving(null); }
  }

  const avecCoach    = classes.filter(c => c.coach_id);
  const totalApp     = classes.reduce((s, c) => s + (c.nb_apprenants || 0), 0);
  const nbEntreprises = [...new Set(classes.map(c => c.entreprise_id).filter(Boolean))].length;

  const NIV_CL = { A1:'#60A5FA', A2:'#34D399', B1:'#F59E0B', B2:'#8B5CF6', C1:'#EC4899', C2:'#EF4444' };
  const FORMAT  = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };

  return (
    <div>
      {flash && (
        <div style={{ padding:'12px 18px', borderRadius:10, marginBottom:16, background: flash.type==='ok' ? '#D1FAE5' : '#FEE2E2', color: flash.type==='ok' ? '#065F46' : '#991B1B', fontSize:13, fontWeight:600 }}>
          {flash.msg}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { l:'Classes actives',   v: classes.length,       c:'#6366F1', i:'🏫' },
          { l:'Avec coach',        v: avecCoach.length,     c:'#059669', i:'👨‍🏫' },
          { l:'Sans coach',        v: sansCoach.length,     c: sansCoach.length > 0 ? '#EF4444' : '#059669', i: sansCoach.length > 0 ? '⚠️' : '✅' },
          { l:'Apprenants total',  v: totalApp,             c:'#0EA5E9', i:'👥' },
          { l:'Entreprises',       v: nbEntreprises,        c:'#8B5CF6', i:'🏢' },
        ].map(k => (
          <div key={k.l} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', border:`1px solid #E5E7EB`, borderTop:`3px solid ${k.c}` }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.i}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.c }}>{chargement ? '…' : k.v}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #E5E7EB', marginBottom:24, overflowX:'auto' }}>
        {[
          { id:'vue-generale',  lib:'Vue générale',      ic:'📊' },
          { id:'sans-coach',    lib:'Classes sans coach', ic:'⚠️',  badge: sansCoach.length },
          { id:'honoraires',    lib:'Honoraires',         ic:'💰',  badge: honoraires.filter(h=>h.statut==='en_attente').length },
        ].map(t => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            style={{ padding:'10px 18px', border:'none', borderBottom: onglet===t.id ? '2.5px solid #6366F1' : '2.5px solid transparent', background:'none', color: onglet===t.id ? '#6366F1' : '#6B7280', fontWeight: onglet===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, marginBottom:-2, whiteSpace:'nowrap' }}>
            {t.ic} {t.lib}
            {t.badge > 0 && <span style={{ background: t.id==='honoraires' ? '#F59E0B' : '#EF4444', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Vue générale */}
      {onglet === 'vue-generale' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement…</div>
        ) : classes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🏫</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Aucune classe e-learning</div>
            <div style={{ fontSize:13 }}>Les classes créées par l'Onboarding apparaîtront ici.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
            {classes.map(c => {
              const horaires = Array.isArray(c.horaire) ? c.horaire : [];
              return (
                <div key={c.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#1E293B', lineHeight:1.3, flex:1 }}>{c.nom}</div>
                    {c.niveau && <span style={{ background: NIV_CL[c.niveau] || '#E5E7EB', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800, marginLeft:8, flexShrink:0 }}>{c.niveau}</span>}
                  </div>
                  {c.entreprise_nom && <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>🏢 {c.entreprise_nom}</div>}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                    {c.type_cours && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:600 }}>{FORMAT[c.type_cours] || c.type_cours}</span>}
                    <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:600 }}>👥 {c.nb_apprenants || 0} apprenant{c.nb_apprenants!==1?'s':''}</span>
                  </div>
                  {horaires.length > 0 && (
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
                      {horaires.map((h, i) => (
                        <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:8, padding:'2px 8px', fontSize:10, fontWeight:600 }}>📅 {h.jour} {h.debut}–{h.fin}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ paddingTop:10, borderTop:'1px solid #F1F5F9', display:'flex', alignItems:'center', gap:8 }}>
                    {c.coach_id ? (
                      <span style={{ fontSize:12, color:'#059669', fontWeight:600 }}>👨‍🏫 {c.coach_nom}</span>
                    ) : (
                      <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>⚠️ Pas de coach assigné</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── ONGLET HONORAIRES ── */}
      {onglet === 'honoraires' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* En-tête + filtres mois */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy }}>💰 Honoraires des coachs</div>
              <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:2 }}>
                Séances enregistrées · calcul automatique · validation puis transmission RH/Paie
              </div>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
              {/* Sélecteur mois */}
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <button key={m} onClick={() => setHonMois(m)}
                  style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:honMois===m?'#6366F1':'#F1F5F9', color:honMois===m?'#fff':'#6B7280' }}>
                  {MOIS_LABELS[m]}
                </button>
              ))}
              {/* Sélecteur année */}
              {[2024,2025,2026,2027].map(y => (
                <button key={y} onClick={() => setHonAnnee(y)}
                  style={{ padding:'4px 9px', borderRadius:20, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:honAnnee===y?'#6366F1':'#F1F5F9', color:honAnnee===y?'#fff':'#6B7280' }}>
                  {y}
                </button>
              ))}
              <button onClick={() => setShowGrille(v => !v)}
                style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #C4B5FD', background:'#EDE9FE', color:'#6366F1', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                📊 Grille tarifaire
              </button>
            </div>
          </div>

          {/* Grille tarifaire (accordéon) */}
          {showGrille && (
            <div style={{ background:COULEURS.blanc, borderRadius:14, border:'1px solid #E5E7EB', padding:22 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:800, color:COULEURS.navy }}>📊 Grille tarifaire horaire (FCFA)</div>
                <div style={{ display:'flex', gap:8 }}>
                  {grilleEdited && (
                    <button onClick={sauvegarderGrille}
                      style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#6366F1', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      💾 Sauvegarder
                    </button>
                  )}
                  <button onClick={() => { setGrille({..._PA_GRILLE_DEF}); setGrilleEdited(true); }}
                    style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#F9FAFB', color:COULEURS.gris600, fontSize:12, cursor:'pointer' }}>
                    Réinitialiser
                  </button>
                </div>
              </div>
              {/* Tarifs par grade × type */}
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:16 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>Grade</th>
                    {_PA_TYPES.map(t => (
                      <th key={t.key} style={{ padding:'8px 12px', textAlign:'center', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB' }}>{t.lib}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {_PA_GRADES.map(g => (
                    <tr key={g} style={{ borderBottom:'1px solid #F1F5F9' }}>
                      <td style={{ padding:'9px 12px', fontWeight:700, color:COULEURS.navy }}>{g}</td>
                      {_PA_TYPES.map(t => (
                        <td key={t.key} style={{ padding:'6px 12px', textAlign:'center' }}>
                          <input type="number" value={grille.tarifs?.[g]?.[t.key] || 0}
                            onChange={e => {
                              const n = parseInt(e.target.value, 10);
                              setGrille(prev => ({ ...prev, tarifs: { ...prev.tarifs, [g]: { ...prev.tarifs[g], [t.key]: isNaN(n)?0:n } } }));
                              setGrilleEdited(true);
                            }}
                            style={{ width:90, padding:'5px 8px', borderRadius:6, border:'1px solid #E5E7EB', fontSize:12, textAlign:'right', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Multiplicateurs par niveau */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Multiplicateurs par niveau CECR</div>
                <div style={{ display:'flex', gap:12 }}>
                  {_PA_NIVEAUX.map(n => (
                    <div key={n} style={{ display:'flex', alignItems:'center', gap:8, background:'#F8FAFC', padding:'8px 14px', borderRadius:8, border:'1px solid #E5E7EB' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:COULEURS.navy }}>{n}</span>
                      <span style={{ color:COULEURS.gris400 }}>×</span>
                      <input type="number" step="0.1" min="0.5" max="3"
                        value={grille.multiplicateurs?.[n] || 1}
                        onChange={e => {
                          const n2 = parseFloat(e.target.value);
                          setGrille(prev => ({ ...prev, multiplicateurs: { ...prev.multiplicateurs, [n]: isNaN(n2)?1:n2 } }));
                          setGrilleEdited(true);
                        }}
                        style={{ width:60, padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB', fontSize:12, textAlign:'center', fontFamily:'"Plus Jakarta Sans",sans-serif' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tableau des coachs */}
          {loadHon ? (
            <div style={{ textAlign:'center', padding:'48px', color:COULEURS.gris400 }}>⏳ Chargement des honoraires…</div>
          ) : (
            <>
              {/* Coaches sans fiche de ce mois → proposer de calculer */}
              {coaches.length > 0 && (() => {
                const coachsAvecHon = new Set(honoraires.map(h => h.coach_id));
                const coachsSans = coaches.filter(co => !coachsAvecHon.has(co.id));
                if (coachsSans.length === 0) return null;
                return (
                  <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', fontSize:13, color:'#92400E' }}>
                    <div style={{ fontWeight:700, marginBottom:8 }}>⚠️ {coachsSans.length} coach{coachsSans.length>1?'s':''} sans fiche d'honoraires pour {moisLabel}</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {coachsSans.map(co => (
                        <button key={co.id} onClick={() => calculerHon(co)} disabled={calcEnCours[co.id]}
                          style={{ padding:'5px 12px', borderRadius:8, border:'1px solid #FDE68A', background:'#FEF3C7', color:'#92400E', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          {calcEnCours[co.id] ? '⏳' : '🔢'} {co.prenom} {co.nom}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {honoraires.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', border:'2px dashed #E5E7EB', borderRadius:14, color:COULEURS.gris400 }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>💰</div>
                  <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Aucune fiche d'honoraires pour {moisLabel}</div>
                  <div style={{ fontSize:12 }}>Cliquez "🔢 [Nom coach]" ci-dessus pour calculer automatiquement à partir des séances enregistrées.</div>
                </div>
              ) : (
                <>
                  {/* KPIs globaux */}
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                    {[
                      { l:'Coachs',        v: honoraires.length,                                                          c:'#6366F1' },
                      { l:'Total séances', v: honoraires.reduce((s,h) => s+(h.nb_seances||0), 0),                        c:'#0EA5E9' },
                      { l:'Total heures',  v: `${honoraires.reduce((s,h) => s+(h.nb_heures||0), 0).toFixed(1)}h`,        c:'#8B5CF6' },
                      { l:'Montant total', v: _fmtFCFA(honoraires.reduce((s,h) => s+(h.montant_net||0), 0)),              c:'#059669' },
                      { l:'À valider',     v: honoraires.filter(h=>h.statut==='en_attente').length,                       c:'#F59E0B' },
                      { l:'Validés RH',    v: honoraires.filter(h=>h.statut==='valide'||h.statut==='paye').length,        c:'#065F46' },
                    ].map(k => (
                      <div key={k.l} style={{ flex:1, minWidth:120, background:'#fff', border:'1px solid #E5E7EB', borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
                        <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                        <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tableau */}
                  <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background:'#F8FAFC' }}>
                          {['Coach','Contrat','Séances','Heures','Tarif/h','Montant brut','Retenues','Montant net','Statut','Actions'].map(col => (
                            <th key={col} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:COULEURS.gris500, textTransform:'uppercase', borderBottom:'1px solid #E5E7EB', whiteSpace:'nowrap' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {honoraires.map((h, i) => {
                          const coachNom = h.coach ? `${h.coach.prenom||''} ${h.coach.nom||''}`.trim() : `Coach #${h.coach_id?.slice(0,6)}`;
                          const initiales = coachNom.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || 'CO';
                          const st = STATUT_HON[h.statut] || STATUT_HON.en_attente;
                          const coachObj = coaches.find(c => c.id === h.coach_id);
                          const gradeCoach = getTypeContrat(coachObj);
                          return (
                            <tr key={h.id}
                              onClick={() => setHonModal({ hon: h, coachNom })}
                              style={{ borderBottom:'1px solid #F1F5F9', cursor:'pointer', background:i%2===0?'#fff':'#FAFAFA' }}
                              onMouseEnter={e => e.currentTarget.style.background='#EEF2FF'}
                              onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#FAFAFA'}>
                              <td style={{ padding:'12px 14px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                  <div style={{ width:32, height:32, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>{initiales}</div>
                                  <div>
                                    <div style={{ fontWeight:700, color:COULEURS.navy }}>{coachNom}</div>
                                    <div style={{ fontSize:11, color:COULEURS.gris500 }}>{coachObj?.type_coach || coachObj?.role || '-'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding:'12px 14px' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:999, background:'#EDE9FE', color:'#6D28D9' }}>{gradeCoach}</span></td>
                              <td style={{ padding:'12px 14px', fontWeight:700, color:'#0EA5E9' }}>{h.nb_seances||0}</td>
                              <td style={{ padding:'12px 14px', color:COULEURS.gris600 }}>{(h.nb_heures||0).toFixed(1)}h</td>
                              <td style={{ padding:'12px 14px', color:COULEURS.gris600 }}>{_fmtFCFA(h.tarif_horaire)}</td>
                              <td style={{ padding:'12px 14px', fontWeight:600, color:COULEURS.navy }}>{_fmtFCFA(h.montant_brut)}</td>
                              <td style={{ padding:'12px 14px', color:'#DC2626' }}>{h.retenues ? `-${_fmtFCFA(h.retenues)}` : '-'}</td>
                              <td style={{ padding:'12px 14px', fontWeight:800, color:'#059669' }}>{_fmtFCFA(h.montant_net)}</td>
                              <td style={{ padding:'12px 14px' }}>
                                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.c }}>{st.lib}</span>
                              </td>
                              <td style={{ padding:'12px 14px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display:'flex', gap:6 }}>
                                  <button onClick={() => calculerHon(coachObj || { id: h.coach_id })} disabled={calcEnCours[h.coach_id]}
                                    style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#F9FAFB', fontSize:11, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                                    {calcEnCours[h.coach_id] ? '⏳' : '🔢'}
                                  </button>
                                  {h.statut === 'en_attente' && (
                                    <button onClick={() => { setHonModal({ hon:h, coachNom }); setHonConfirm(true); }}
                                      style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'#059669', fontSize:11, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                                      ✅ Valider
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#F0FDF4', borderTop:'2px solid #BBF7D0' }}>
                          <td colSpan={4} style={{ padding:'10px 14px', fontWeight:800, fontSize:13, color:COULEURS.navy }}>Total - {honoraires.length} coach{honoraires.length>1?'s':''}</td>
                          <td style={{ padding:'10px 14px', fontWeight:800, color:COULEURS.navy }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.montant_brut||0),0))}</td>
                          <td style={{ padding:'10px 14px', fontWeight:700, color:'#DC2626' }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.retenues||0),0))}</td>
                          <td style={{ padding:'10px 14px', fontWeight:900, fontSize:14, color:'#059669' }}>{_fmtFCFA(honoraires.reduce((s,h)=>s+(h.montant_net||0),0))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Modal détail coach ── */}
          {honModal && !honConfirm && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
              onClick={e => { if (e.target === e.currentTarget) setHonModal(null); }}>
              <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'90vh', overflow:'auto', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)' }}>
                {/* Header */}
                <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', background:'#EEF2FF', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                      {honModal.coachNom.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)}
                    </div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ fontWeight:800, fontSize:15, color:COULEURS.navy }}>{honModal.coachNom}</div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:999, background:'#EDE9FE', color:'#6D28D9' }}>{getTypeContrat(coaches.find(c => c.id === honModal.hon.coach_id))}</span>
                      </div>
                      <div style={{ fontSize:12, color:COULEURS.gris500 }}>
                        Honoraires {moisLabel} · {honModal.hon.nb_seances||0} séance{(honModal.hon.nb_seances||0)!==1?'s':''} · {(honModal.hon.nb_heures||0).toFixed(1)}h
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:10, color:COULEURS.gris400, textTransform:'uppercase', fontWeight:600 }}>Montant net</div>
                      <div style={{ fontSize:20, fontWeight:900, color:'#059669' }}>{_fmtFCFA(honModal.hon.montant_net)}</div>
                    </div>
                    <button onClick={() => setHonModal(null)}
                      style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#E2E8F0', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                  </div>
                </div>
                {/* Détails */}
                <div style={{ padding:24, display:'flex', flexDirection:'column', gap:16 }}>
                  {/* Grille récap */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    {[
                      { l:'Séances réalisées', v: honModal.hon.nb_seances||0,                       c:'#0EA5E9' },
                      { l:'Heures totales',    v: `${(honModal.hon.nb_heures||0).toFixed(1)}h`,     c:'#8B5CF6' },
                      { l:'Apprenants suivis', v: honModal.hon.nb_apprenants||0,                     c:'#F59E0B' },
                      { l:'Tarif horaire',     v: _fmtFCFA(honModal.hon.tarif_horaire),              c:'#6366F1' },
                      { l:'Montant brut',      v: _fmtFCFA(honModal.hon.montant_brut),               c:COULEURS.navy },
                      { l:'Retenues',          v: honModal.hon.retenues ? _fmtFCFA(honModal.hon.retenues) : 'Aucune', c:'#DC2626' },
                    ].map(k => (
                      <div key={k.l} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', border:'1px solid #E5E7EB' }}>
                        <div style={{ fontSize:12, color:COULEURS.gris500, marginBottom:4 }}>{k.l}</div>
                        <div style={{ fontWeight:800, fontSize:15, color:k.c }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                  {honModal.hon.note_pa && (
                    <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
                      🗒️ Note PA : {honModal.hon.note_pa}
                    </div>
                  )}
                  {honModal.hon.valide_at && (
                    <div style={{ background:'#DBEAFE', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1D4ED8', fontWeight:600 }}>
                      ✅ Validé le {new Date(honModal.hon.valide_at).toLocaleDateString('fr-FR')} - transmis à RH/Paie
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', gap:10 }}>
                  {honModal.hon.statut === 'en_attente' && (
                    <button onClick={() => setHonConfirm(true)}
                      style={{ padding:'10px 22px', background:'#059669', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                      ✅ Valider et transmettre à RH/Paie
                    </button>
                  )}
                  <button onClick={() => setHonModal(null)}
                    style={{ padding:'10px 20px', background:'#F1F5F9', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600, marginLeft:'auto' }}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal confirmation validation ── */}
          {honModal && honConfirm && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
              <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:440, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
                <div style={{ padding:'20px 24px 16px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB' }}>
                  <div style={{ fontSize:15, fontWeight:800, color:COULEURS.navy }}>✅ Confirmer la transmission RH/Paie</div>
                  <div style={{ fontSize:12, color:COULEURS.gris500, marginTop:4 }}>Cette action marque les honoraires comme validés et les envoie à la RH pour paiement.</div>
                </div>
                <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'14px 18px', border:'1px solid #E5E7EB' }}>
                    <div style={{ fontSize:12, color:COULEURS.gris500, marginBottom:4 }}>Coach</div>
                    <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy }}>{honModal.coachNom}</div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <div style={{ flex:1, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', border:'1px solid #BBF7D0' }}>
                      <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Période</div>
                      <div style={{ fontWeight:800, fontSize:15, color:'#059669' }}>{moisLabel}</div>
                    </div>
                    <div style={{ flex:1, background:'#EFF6FF', borderRadius:10, padding:'12px 16px', border:'1px solid #BFDBFE' }}>
                      <div style={{ fontSize:11, color:COULEURS.gris500, marginBottom:2 }}>Montant net</div>
                      <div style={{ fontWeight:800, fontSize:15, color:'#0369A1' }}>{_fmtFCFA(honModal.hon.montant_net)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:COULEURS.gris400, textAlign:'center' }}>
                    {honModal.hon.nb_seances||0} séance{(honModal.hon.nb_seances||0)!==1?'s':''} · {(honModal.hon.nb_heures||0).toFixed(1)}h
                  </div>
                </div>
                <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button onClick={() => setHonConfirm(false)}
                    style={{ padding:'9px 18px', background:'#F1F5F9', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', color:COULEURS.gris600 }}>
                    Annuler
                  </button>
                  <button onClick={() => validerHon(honModal.hon.id, honModal.coachNom)}
                    style={{ padding:'9px 22px', background:'#059669', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#fff' }}>
                    ✅ Confirmer et transmettre
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Classes sans coach */}
      {onglet === 'sans-coach' && (
        chargement ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#9CA3AF', fontSize:13 }}>⏳ Chargement…</div>
        ) : sansCoach.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Toutes les classes ont un coach</div>
            <div style={{ fontSize:13 }}>Aucune classe en attente d'assignation.</div>
          </div>
        ) : (
          <div>
            <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:13, color:'#92400E' }}>
              ⚠️ <strong>{sansCoach.length} classe{sansCoach.length > 1 ? 's' : ''}</strong> créée{sansCoach.length > 1 ? 's' : ''} par l'Onboarding en attente d'un coach. Assignez un coach habilité e-learning pour chaque classe.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {sansCoach.map(c => {
                const horaires = Array.isArray(c.horaire) ? c.horaire : [];
                const selectedCoach = coachChoisi[c.id] || '';
                const isSaving = saving === c.id;
                return (
                  <div key={c.id} style={{ background:'#fff', borderRadius:14, border:'1.5px solid #FDE68A', padding:'20px 24px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:800, color:'#1E293B', marginBottom:4 }}>{c.nom}</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                          {c.entreprise_nom && <span style={{ fontSize:12, color:'#6B7280' }}>🏢 {c.entreprise_nom}</span>}
                          {c.niveau && <span style={{ background: NIV_CL[c.niveau]||'#E5E7EB', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800 }}>{c.niveau}</span>}
                          {c.type_cours && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{FORMAT[c.type_cours]||c.type_cours}</span>}
                          <span style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600 }}>👥 {c.nb_apprenants||0} apprenant{c.nb_apprenants!==1?'s':''}</span>
                        </div>
                        {horaires.length > 0 && (
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:8 }}>
                            {horaires.map((h, i) => (
                              <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:8, padding:'3px 9px', fontSize:11, fontWeight:600 }}>📅 {h.jour} {h.debut}–{h.fin}</span>
                            ))}
                          </div>
                        )}
                        {c.created_by_nom && (
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>Créée par {c.created_by_nom} · {c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''}</div>
                        )}
                      </div>
                    </div>

                    {/* Assignation coach - cartes visuelles */}
                    <div>
                      <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:12 }}>
                        👨‍🏫 Sélectionner un coach e-learning *
                      </label>

                      {coaches.length === 0 ? (
                        <div style={{ padding:'16px', borderRadius:10, background:'#FEF3C7', color:'#92400E', fontSize:13 }}>
                          ⚠️ Aucun coach habilité e-learning disponible.
                        </div>
                      ) : (() => {
                        const meilleur = coaches[0];
                        const ROLE_LIB = { coach:'Coach', professeur_titulaire:'Titulaire', professeur_remplacant:'Remplaçant' };
                        const TYPE_LIB = { permanent:'Permanent', freelance:'Freelance', consultant:'Consultant', vacataire:'Vacataire' };
                        const initiales = co => `${(co.prenom||'')[0]||''}${(co.nom||'')[0]||''}`.toUpperCase();
                        const COLORS = ['#6366F1','#0891B2','#059669','#F97316','#8B5CF6','#EC4899','#DC2626','#0EA5E9'];
                        const couleurCo = co => COLORS[(co.prenom||'A').charCodeAt(0) % COLORS.length];

                        return (
                          <>
                            {/* Meilleur choix */}
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:800, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:20, padding:'2px 10px' }}>🏆 MEILLEUR CHOIX</span>
                              </div>
                              <div
                                onClick={() => setCoachChoisi(prev => ({ ...prev, [c.id]: meilleur.id }))}
                                style={{ background: selectedCoach === meilleur.id ? 'linear-gradient(135deg,#EEF2FF,#E0E7FF)' : 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border:`2px solid ${selectedCoach === meilleur.id ? '#6366F1' : '#86EFAC'}`, borderRadius:12, padding:'14px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, transition:'all 0.15s' }}>
                                <div style={{ width:46, height:46, borderRadius:'50%', background:couleurCo(meilleur), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', flexShrink:0 }}>
                                  {initiales(meilleur)}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                                    <span style={{ fontSize:14, fontWeight:800, color:'#1E293B' }}>{meilleur.prenom} {meilleur.nom}</span>
                                    <span style={{ background:'#DCFCE7', color:'#15803D', borderRadius:20, padding:'1px 8px', fontSize:10, fontWeight:800 }}>RECOMMANDÉ</span>
                                  </div>
                                  <div style={{ fontSize:12, color:'#475569', marginBottom:5 }}>
                                    {ROLE_LIB[meilleur.role] || meilleur.role}{meilleur.type_coach ? ` · ${TYPE_LIB[meilleur.type_coach] || meilleur.type_coach}` : ''}
                                  </div>
                                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                    <span style={{ background:'#EEF2FF', color:'#4338CA', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>✓ Habilité e-learning</span>
                                    {meilleur.email && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:6, padding:'2px 8px', fontSize:10 }}>{meilleur.email}</span>}
                                  </div>
                                </div>
                                <div style={{ width:22, height:22, borderRadius:'50%', border:`2.5px solid ${selectedCoach === meilleur.id ? '#6366F1' : '#86EFAC'}`, background: selectedCoach === meilleur.id ? '#6366F1' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                  {selectedCoach === meilleur.id && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
                                </div>
                              </div>
                            </div>

                            {/* Tous les coachs */}
                            {coaches.length > 1 && (
                              <div>
                                <div style={{ fontSize:10, fontWeight:800, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                                  📋 TOUS LES COACHS DISPONIBLES ({coaches.length})
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                  {coaches.map((co, idx) => {
                                    const sel = selectedCoach === co.id;
                                    return (
                                      <div key={co.id}
                                        onClick={() => setCoachChoisi(prev => ({ ...prev, [c.id]: co.id }))}
                                        style={{ background: sel ? '#EEF2FF' : '#FAFAFA', border:`1.5px solid ${sel ? '#6366F1' : '#E5E7EB'}`, borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, transition:'all 0.12s' }}
                                        onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor='#A5B4FC'; }}
                                        onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor='#E5E7EB'; }}>
                                        <div style={{ width:38, height:38, borderRadius:'50%', background:couleurCo(co), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                                          {initiales(co)}
                                        </div>
                                        <div style={{ flex:1 }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                            <span style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{co.prenom} {co.nom}</span>
                                            {idx === 0 && <span style={{ background:'#DCFCE7', color:'#15803D', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700 }}>RECOMMANDÉ</span>}
                                          </div>
                                          <div style={{ fontSize:11, color:'#6B7280' }}>
                                            {ROLE_LIB[co.role] || co.role}{co.type_coach ? ` · ${TYPE_LIB[co.type_coach] || co.type_coach}` : ''}
                                          </div>
                                        </div>
                                        <div style={{ width:20, height:20, borderRadius:'50%', border:`2.5px solid ${sel ? '#6366F1' : '#D1D5DB'}`, background: sel ? '#6366F1' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                          {sel && <div style={{ width:7, height:7, borderRadius:'50%', background:'#fff' }} />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Bouton confirmer */}
                            <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                              <button
                                onClick={() => assignerCoach(c.id)}
                                disabled={!selectedCoach || isSaving}
                                style={{ padding:'11px 24px', borderRadius:10, border:'none', background: !selectedCoach || isSaving ? '#E5E7EB' : 'linear-gradient(135deg,#6366F1,#4F46E5)', color: !selectedCoach || isSaving ? '#9CA3AF' : '#fff', fontWeight:700, fontSize:13, cursor: !selectedCoach || isSaving ? 'not-allowed' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', boxShadow: !selectedCoach || isSaving ? 'none' : '0 4px 14px rgba(99,102,241,0.4)', transition:'all 0.15s' }}>
                                {isSaving ? '⏳ Assignation en cours…' : `✅ Confirmer l'assignation${selectedCoach ? ` - ${coaches.find(co=>co.id===selectedCoach)?.prenom||''}` : ''}`}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
const CRIT_RP_SUP = {
  ponctualite:       { label: 'Ponctualité',         icon: '⏰' },
  preparation:       { label: 'Organisation du cours', icon: '📝' },
  pedagogie:         { label: 'Pédagogie',            icon: '🎓' },
  gestion_classe:    { label: 'Gestion de classe',    icon: '🧑‍🏫' },
  professionnalisme: { label: 'Professionnalisme',    icon: '🤝' },
  // Plus saisi : portait une autre question. Conserve pour les rapports anterieurs.
  respect_programme: { label: 'Respect du programme', icon: '📋' },
};
const noteCouleurSup = n => !n ? '#9ca3af' : n >= 4.5 ? '#16a34a' : n >= 3.5 ? '#0891b2' : n >= 2.5 ? '#f59e0b' : '#ef4444';
const noteFondSup    = n => !n ? '#f3f4f6' : n >= 4.5 ? '#dcfce7' : n >= 3.5 ? '#e0f2fe' : n >= 2.5 ? '#fef3c7' : '#fee2e2';

export function OngletRapportsSuperviseurPA() {
  const [rapports, setRapports] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [sousOnglet, setSousOnglet] = useState('rapports');
  const [filtreCoach, setFiltreCoach] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [periode,  setPeriode]  = useState('tous');
  const [detailCoachId, setDetailCoachId] = useState(null);
  const [modalDateFrom, setModalDateFrom] = useState('');
  const [modalDateTo,   setModalDateTo]   = useState('');
  const [modalPage,     setModalPage]     = useState(1);
  const [modalExpanded, setModalExpanded] = useState(new Set());
  const MODAL_PER_PAGE = 6;
  const toggleModalRow = (id) => setModalExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const fetchRapports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/coachs/rapports-transmis`, { headers: supAuthHdrs() });
      const d = await r.json();
      setRapports(d.rapports || []);
    } catch { setRapports([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchRapports(); }, [fetchRapports]);

  const toggle = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rapportsFiltres = rapports.filter(rp => {
    const coachNom = rp.coach ? `${rp.coach.prenom || ''} ${rp.coach.nom || ''}`.toLowerCase() : '';
    if (filtreCoach && !coachNom.includes(filtreCoach.toLowerCase())) return false;
    if (dateFrom && rp.date_observation && rp.date_observation < dateFrom) return false;
    if (dateTo   && rp.date_observation && rp.date_observation > dateTo)   return false;
    return true;
  });

  const getDebutPeriode = (p) => {
    const now = new Date();
    if (p === 'semaine') { const d = new Date(now); d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); d.setHours(0,0,0,0); return d; }
    if (p === 'mois') return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
  };
  const debut = getDebutPeriode(periode);
  const rapportsPeriode = debut ? rapports.filter(r => r.date_observation && new Date(r.date_observation) >= debut) : rapports;
  const mapClassement = {};
  rapportsPeriode.forEach(r => {
    if (!r.coach?.id) return;
    const id = r.coach.id;
    if (!mapClassement[id]) mapClassement[id] = { coach: r.coach, notes: [] };
    if (r.note_globale) mapClassement[id].notes.push(Number(r.note_globale));
  });
  const classement = Object.values(mapClassement)
    .map(e => {
      const moyenne  = e.notes.length ? e.notes.reduce((a,b)=>a+b,0)/e.notes.length : null;
      const tendance = e.notes.length >= 2
        ? (e.notes[e.notes.length-1] > e.notes[0] ? 'hausse' : e.notes[e.notes.length-1] < e.notes[0] ? 'baisse' : 'stable')
        : 'stable';
      return { ...e, moyenne, nb_rapports: e.notes.length, tendance };
    })
    .filter(e => e.moyenne !== null)
    .sort((a,b) => b.moyenne - a.moyenne);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COULEURS.navy }}>📋 Rapports Superviseur</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: COULEURS.gris400 }}>Rapports d'observation transmis par le Superviseur Général · {rapports.length} au total</p>
        </div>
        <button onClick={fetchRapports} style={{ padding: '7px 14px', background: SUP_COLOR + '15', border: `1px solid ${SUP_COLOR}40`, borderRadius: 8, fontSize: 12, color: SUP_COLOR, fontWeight: 600, cursor: 'pointer' }}>↻ Actualiser</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: COULEURS.gris50, borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[{ id: 'rapports', l: '📋 Rapports reçus', badge: rapports.length }, { id: 'classement', l: '🏆 Classement', badge: classement.length }].map(st => (
          <button key={st.id} onClick={() => setSousOnglet(st.id)}
            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: sousOnglet === st.id ? '#fff' : 'transparent', color: sousOnglet === st.id ? SUP_COLOR : COULEURS.gris600,
              boxShadow: sousOnglet === st.id ? '0 1px 6px rgba(0,0,0,.08)' : 'none' }}>
            {st.l}
            {st.badge ? <span style={{ background: sousOnglet === st.id ? SUP_COLOR : '#94a3b8', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>{st.badge}</span> : null}
          </button>
        ))}
      </div>

      {sousOnglet === 'rapports' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 12, padding: '12px 16px' }}>
            <input placeholder="🔍 Filtrer par coach…" value={filtreCoach} onChange={e => setFiltreCoach(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: '7px 12px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 13 }} />
            <label style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 600 }}>Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 12 }} />
            <label style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 600 }}>au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 12 }} />
            {(filtreCoach || dateFrom || dateTo) && (
              <button onClick={() => { setFiltreCoach(''); setDateFrom(''); setDateTo(''); }} style={{ fontSize: 12, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Réinitialiser</button>
            )}
          </div>

          {/* Boutons d'export */}
          {rapportsFiltres.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => exporterExcelStyle({
                  nomFichier: `rapports_superviseur_${new Date().toISOString().slice(0,10)}`,
                  titre: '📋 Rapports Superviseur - observations coachs',
                  sousTitre: `${rapportsFiltres.length} rapport${rapportsFiltres.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                  couleurEntete: SUP_COLOR.replace('#',''),
                  colonnes: [
                    { label: 'Date', width: 14 }, { label: 'Coach', width: 22, bold: true },
                    { label: 'Classe/Centre', width: 20 }, { label: 'Note /5', width: 10, align: 'center' },
                    { label: 'Ponctualité', width: 12, align: 'center' }, { label: 'Organisation du cours', width: 18, align: 'center' },
                    { label: 'Pédagogie', width: 12, align: 'center' }, { label: 'Gestion classe', width: 14, align: 'center' },
                    { label: 'Professionnalisme', width: 16, align: 'center' },
                    // Colonne heritee : plus alimentee, remplie seulement sur les rapports anterieurs.
                    { label: 'Respect programme', width: 16, align: 'center' }, { label: 'Observé par', width: 20 },
                    { label: 'Observations', width: 30 }, { label: 'Recommandations', width: 30 },
                  ],
                  lignes: rapportsFiltres.map(rp => [
                    rp.date_observation ? new Date(rp.date_observation).toLocaleDateString('fr-FR') : '-',
                    rp.coach ? `${rp.coach.prenom||''} ${rp.coach.nom||''}`.trim() : 'Coach inconnu',
                    rp.classe || rp.centre || '-',
                    rp.note_globale ?? '-',
                    rp.ponctualite ?? '-', rp.preparation ?? '-', rp.pedagogie ?? '-',
                    rp.gestion_classe ?? '-', rp.professionnalisme ?? '-', rp.respect_programme ?? '-',
                    rp.deputy ? `${rp.deputy.prenom||''} ${rp.deputy.nom||''}`.trim() : '-',
                    rp.observations || '', rp.recommandations || '',
                  ]),
                })}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
              >📊 Exporter Excel</button>
              <button
                onClick={() => {
                  const lignesHtml = rapportsFiltres.map(rp => `
                    <tr>
                      <td>${rp.date_observation ? new Date(rp.date_observation).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>${rp.coach ? `${rp.coach.prenom||''} ${rp.coach.nom||''}`.trim() : 'Coach inconnu'}</td>
                      <td>${rp.classe || rp.centre || '-'}</td>
                      <td style="font-weight:800">${rp.note_globale ?? '-'}/5</td>
                      <td>${rp.deputy ? `${rp.deputy.prenom||''} ${rp.deputy.nom||''}`.trim() : '-'}</td>
                      <td>${rp.observations || '-'}</td>
                    </tr>
                  `).join('');
                  genererPDF(`
                    <div class="doc-header">
                      <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Rapports Superviseur - observations coachs</div></div>
                      <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                    </div>
                    <div class="doc-title-band">📋 RAPPORTS SUPERVISEUR</div>
                    <div class="doc-body">
                      <table>
                        <thead><tr><th>Date</th><th>Coach</th><th>Classe/Centre</th><th>Note</th><th>Observé par</th><th>Observations</th></tr></thead>
                        <tbody>${lignesHtml}</tbody>
                      </table>
                      <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
                    </div>
                  `, `Rapports_superviseur_${new Date().toISOString().slice(0,10)}`);
                }}
                style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
              >📥 Exporter PDF</button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
          ) : rapportsFiltres.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>
              {rapports.length === 0 ? "Le Superviseur Général n'a encore transmis aucun rapport d'observation." : 'Aucun rapport ne correspond aux filtres.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rapportsFiltres.map(rp => {
                const open = expanded.has(rp.id);
                const note = rp.note_globale ? Number(rp.note_globale) : null;
                const coachNom = rp.coach ? `${rp.coach.prenom || ''} ${rp.coach.nom || ''}`.trim() : 'Coach inconnu';
                const depNom = rp.deputy ? `${rp.deputy.prenom || ''} ${rp.deputy.nom || ''}`.trim() : 'Deputy';
                const hasTxt = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                return (
                  <div key={rp.id} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${SUP_COLOR}30`, overflow: 'hidden' }}>
                    <div onClick={() => toggle(rp.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, background: open ? SUP_COLOR + '10' : '#fff' }}>
                      <span style={{ fontSize: 13, color: COULEURS.gris400, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▶</span>
                      {rp.coach?.avatar_url
                        ? <img src={rp.coach.avatar_url} alt={coachNom} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${SUP_COLOR}30` }} />
                        : <div style={{ width: 38, height: 38, borderRadius: '50%', background: SUP_COLOR + '15', color: SUP_COLOR, fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {coachNom.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase()}
                          </div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: COULEURS.navy }}>{coachNom}</div>
                        <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 2 }}>
                          {fmtDateSup(rp.date_observation)}
                          {rp.classe && <span style={{ marginLeft: 8, background: SUP_COLOR + '15', color: SUP_COLOR, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{rp.classe}</span>}
                          {rp.centre && <span style={{ marginLeft: 6 }}>· {rp.centre}</span>}
                          <span style={{ marginLeft: 8 }}>Observé par {depNom}</span>
                          {hasTxt && <span style={{ marginLeft: 6, color: SUP_COLOR }}>📝</span>}
                        </div>
                      </div>
                      {note && (
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: noteFondSup(note), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: noteCouleurSup(note), border: `2px solid ${noteCouleurSup(note)}33` }}>
                          {note.toFixed(1)}
                        </div>
                      )}
                      {rp.transmis_pa_le && (
                        <div style={{ fontSize: 10, color: COULEURS.gris400, textAlign: 'right', lineHeight: 1.3 }}>Transmis<br/>{fmtDateSup(rp.transmis_pa_le)}</div>
                      )}
                    </div>
                    {open && (
                      <div style={{ padding: '16px 20px', background: SUP_COLOR + '08', borderTop: `1px solid ${SUP_COLOR}30` }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: hasTxt ? 14 : 0 }}>
                          {Object.entries(CRIT_RP_SUP).map(([key, meta]) => {
                            const val = rp[key];
                            return (
                              <div key={key} style={{ background: '#fff', borderRadius: 9, padding: '10px 12px', border: `1px solid ${SUP_COLOR}30` }}>
                                <div style={{ fontSize: 11, color: SUP_COLOR, fontWeight: 600, marginBottom: 6 }}>{meta.icon} {meta.label}</div>
                                <div style={{ display: 'flex', gap: 3 }}>
                                  {[1,2,3,4,5].map(n => (
                                    <div key={n} style={{ width: 18, height: 18, borderRadius: 3, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: val >= n ? noteCouleurSup(val) : COULEURS.gris200, color: val >= n ? '#fff' : '#9ca3af' }}>{n}</div>
                                  ))}
                                  {val ? <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 800, color: noteCouleurSup(val), alignSelf: 'center' }}>{val}/5</span> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {hasTxt && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {rp.observations && <div style={{ background: '#F0F9FF', borderRadius: 9, padding: '10px 13px', border: '1px solid #BAE6FD' }}><div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', marginBottom: 5 }}>👁 Observations</div><div style={{ fontSize: 12, color: '#0C4A6E' }}>{rp.observations}</div></div>}
                            {rp.recommandations && <div style={{ background: '#F0FDF4', borderRadius: 9, padding: '10px 13px', border: '1px solid #BBF7D0' }}><div style={{ fontSize: 11, fontWeight: 800, color: '#166534', marginBottom: 5 }}>💡 Recommandations</div><div style={{ fontSize: 12, color: '#14532D' }}>{rp.recommandations}</div></div>}
                            {rp.commentaire_superviseur && <div style={{ gridColumn: '1/-1', background: '#FEF9C3', borderRadius: 9, padding: '10px 13px' }}><div style={{ fontSize: 11, fontWeight: 800, color: '#854D0E', marginBottom: 5 }}>💬 Commentaire du Superviseur</div><div style={{ fontSize: 12, color: '#854D0E' }}>{rp.commentaire_superviseur}</div></div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {sousOnglet === 'classement' && (() => {
        const labelPeriode = periode === 'semaine' ? 'cette semaine' : periode === 'mois' ? 'ce mois' : 'toute période';
        const medalIcon = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
        const trendIcon = t => t === 'hausse' ? '↗' : t === 'baisse' ? '↘' : '→';
        const trendCol  = t => t === 'hausse' ? '#16a34a' : t === 'baisse' ? '#ef4444' : '#94a3b8';

        return (
          <div>
            {/* En-tête + filtre période */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COULEURS.navy }}>🏆 Classement des coachs</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: COULEURS.gris400 }}>Basé sur les notes d'observation du Superviseur · {labelPeriode}</p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ v: 'semaine', l: 'Cette semaine' }, { v: 'mois', l: 'Ce mois' }, { v: 'tous', l: 'Tout' }].map(p => (
                  <button key={p.v} onClick={() => setPeriode(p.v)}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${periode === p.v ? SUP_COLOR : COULEURS.gris200}`, background: periode === p.v ? SUP_COLOR + '15' : '#fff', color: periode === p.v ? SUP_COLOR : COULEURS.gris600 }}>
                    {p.l}
                  </button>
                ))}
              </div>
            </div>

            {/* KPIs */}
            {classement.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: '👨‍🏫', label: 'Coachs évalués', v: classement.length, c: SUP_COLOR },
                  { icon: '⭐',   label: 'Meilleure note', v: classement[0]?.moyenne ? `${classement[0].moyenne.toFixed(1)}/5` : '-', c: '#f59e0b', sub: `${classement[0]?.coach?.prenom || ''} ${classement[0]?.coach?.nom || ''}` },
                  { icon: '📊',   label: 'Note moyenne',   v: classement.length ? (classement.reduce((s,e)=>s+(e.moyenne||0),0)/classement.length).toFixed(1)+'/5' : '-', c: '#0891b2' },
                  { icon: '⚠️',   label: 'Notes < 3',      v: classement.filter(e => e.moyenne !== null && e.moyenne < 3).length, c: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${COULEURS.gris200}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                      {s.sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {classement.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '70px 0', background: '#fff', borderRadius: 16, border: `1.5px dashed ${COULEURS.gris200}` }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>🏆</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Aucune donnée pour cette période</div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Aucun rapport d'observation reçu {labelPeriode}.</div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: `1px solid ${COULEURS.gris200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Classement par note moyenne · {labelPeriode}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{classement.length} coach{classement.length > 1 ? 's' : ''} évalué{classement.length > 1 ? 's' : ''}</span>
                </div>
                {classement.map((entry, i) => {
                  const coach = entry.coach;
                  const initiales = ((coach?.prenom?.[0] || '') + (coach?.nom?.[0] || '')).toUpperCase() || 'CO';
                  const medal = medalIcon(i);
                  const bg = i === 0 ? '#fffbeb' : i === 1 ? '#f8fafc' : i === 2 ? '#fff7ed' : '#fff';
                  return (
                    <div key={coach?.id || i} onClick={() => { setDetailCoachId(coach?.id || null); setModalDateFrom(''); setModalDateTo(''); setModalPage(1); setModalExpanded(new Set()); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < classement.length - 1 ? '1px solid #f1f5f9' : 'none', background: bg, cursor: coach?.id ? 'pointer' : 'default', transition: 'background .15s' }}
                      onMouseEnter={e => { if (coach?.id) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = bg; }}>
                      {/* Rang */}
                      <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
                        {medal ? <span style={{ fontSize: 24 }}>{medal}</span> : <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>#{i + 1}</span>}
                      </div>

                      {/* Photo */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {coach?.avatar_url
                          ? <img src={coach.avatar_url} alt={initiales} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${noteCouleurSup(entry.moyenne)}40` }} />
                          : <div style={{ width: 42, height: 42, borderRadius: '50%', background: SUP_COLOR + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: SUP_COLOR }}>{initiales}</div>}
                        {entry.moyenne && (
                          <div style={{ position: 'absolute', bottom: -4, right: -8, background: noteCouleurSup(entry.moyenne), color: '#fff', borderRadius: 20, padding: '1px 5px', fontSize: 9, fontWeight: 900, border: '2px solid #fff', whiteSpace: 'nowrap' }}>
                            ⭐ {entry.moyenne.toFixed(1)}
                          </div>
                        )}
                      </div>

                      {/* Nom + infos */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{coach?.prenom || ''} {coach?.nom || ''}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{entry.nb_rapports} rapport{entry.nb_rapports > 1 ? 's' : ''} · {labelPeriode}</div>
                      </div>

                      {/* Barre de notes */}
                      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 28, flexShrink: 0 }}>
                        {entry.notes.slice(-5).map((n, ni) => (
                          <div key={ni} title={`Note : ${n}/5`} style={{ width: 8, borderRadius: 3, background: noteCouleurSup(n), height: `${(n/5)*100}%`, minHeight: 4 }} />
                        ))}
                      </div>

                      {/* Note cercle */}
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: noteFondSup(entry.moyenne), border: `2.5px solid ${noteCouleurSup(entry.moyenne)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: noteCouleurSup(entry.moyenne), flexShrink: 0 }}>
                        {entry.moyenne.toFixed(1)}
                      </div>

                      {/* Tendance */}
                      <div style={{ fontSize: 18, fontWeight: 900, color: trendCol(entry.tendance), flexShrink: 0, width: 24, textAlign: 'center' }} title={`Tendance : ${entry.tendance}`}>
                        {trendIcon(entry.tendance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Modal détail coach - notes du classement */}
      {detailCoachId && (() => {
        const rapportsCoachTout = rapports
          .filter(r => r.coach?.id === detailCoachId)
          .sort((a, b) => (b.date_observation || '').localeCompare(a.date_observation || ''));
        const rapportsCoach = rapportsCoachTout.filter(r => {
          if (modalDateFrom && r.date_observation && r.date_observation < modalDateFrom) return false;
          if (modalDateTo   && r.date_observation && r.date_observation > modalDateTo)   return false;
          return true;
        });
        const coachInfo = rapportsCoachTout[0]?.coach || null;
        const initiales = ((coachInfo?.prenom?.[0] || '') + (coachInfo?.nom?.[0] || '')).toUpperCase() || 'CO';
        const moyenne = rapportsCoachTout.length
          ? rapportsCoachTout.reduce((s, r) => s + (Number(r.note_globale) || 0), 0) / rapportsCoachTout.filter(r => r.note_globale).length
          : null;
        const totalPages = Math.max(1, Math.ceil(rapportsCoach.length / MODAL_PER_PAGE));
        const pageSafe    = Math.min(modalPage, totalPages);
        const pageItems   = rapportsCoach.slice((pageSafe - 1) * MODAL_PER_PAGE, pageSafe * MODAL_PER_PAGE);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1600 }} onClick={() => setDetailCoachId(null)}>
            <div style={{ background: '#fff', borderRadius: 18, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
              <div style={{ background: `linear-gradient(135deg,#0f172a,${SUP_COLOR})`, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                {coachInfo?.avatar_url
                  ? <img src={coachInfo.avatar_url} alt={initiales} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }} />
                  : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff' }}>{initiales}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{coachInfo?.prenom} {coachInfo?.nom}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{rapportsCoachTout.length} note{rapportsCoachTout.length > 1 ? 's' : ''} reçue{rapportsCoachTout.length > 1 ? 's' : ''} {moyenne != null && <>· moyenne {moyenne.toFixed(1)}/5</>}</div>
                </div>
                <button onClick={() => setDetailCoachId(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>

              {/* Filtre par date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 24px', borderBottom: `1px solid ${COULEURS.gris100}`, flexShrink: 0 }}>
                <label style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 600 }}>Du</label>
                <input type="date" value={modalDateFrom} onChange={e => { setModalDateFrom(e.target.value); setModalPage(1); }}
                  style={{ padding: '6px 10px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 12 }} />
                <label style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 600 }}>au</label>
                <input type="date" value={modalDateTo} onChange={e => { setModalDateTo(e.target.value); setModalPage(1); }}
                  style={{ padding: '6px 10px', border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 8, fontSize: 12 }} />
                {(modalDateFrom || modalDateTo) && (
                  <button onClick={() => { setModalDateFrom(''); setModalDateTo(''); setModalPage(1); }} style={{ fontSize: 12, color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Réinitialiser</button>
                )}
                {rapportsCoach.length !== rapportsCoachTout.length && (
                  <span style={{ fontSize: 12, color: SUP_COLOR, fontWeight: 600 }}>{rapportsCoach.length} / {rapportsCoachTout.length} affichées</span>
                )}
              </div>

              <div style={{ overflowY: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pageItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: COULEURS.gris400 }}>Aucune note ne correspond aux filtres.</div>
                ) : pageItems.map(rp => {
                  const note = rp.note_globale ? Number(rp.note_globale) : null;
                  const depNom = rp.deputy ? `${rp.deputy.prenom || ''} ${rp.deputy.nom || ''}`.trim() : 'Deputy';
                  const hasTxt = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                  const open = modalExpanded.has(rp.id);
                  return (
                    <div key={rp.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
                      <div onClick={() => toggleModalRow(rp.id)}
                        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: open ? COULEURS.gris50 : '#fff', transition: 'background .15s' }}
                        onMouseEnter={e => { if (!open) e.currentTarget.style.background = COULEURS.gris50; }}
                        onMouseLeave={e => { if (!open) e.currentTarget.style.background = '#fff'; }}>
                        <span style={{ fontSize: 12, color: COULEURS.gris400, flexShrink: 0, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>▶</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy }}>{fmtDateSup(rp.date_observation)}</div>
                          <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                            Observé par {depNom}
                            {rp.classe && <span style={{ marginLeft: 6, background: SUP_COLOR + '15', color: SUP_COLOR, borderRadius: 6, padding: '1px 7px', fontSize: 10, fontWeight: 600 }}>{rp.classe}</span>}
                            {hasTxt && <span style={{ marginLeft: 6, color: SUP_COLOR }}>📝</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 22, flexShrink: 0 }}>
                          {Object.entries(CRIT_RP_SUP).map(([key, meta]) => {
                            const v = rp[key];
                            return <div key={key} title={meta.label} style={{ width: 6, borderRadius: 2, background: v ? noteCouleurSup(v) : '#e5e7eb', height: v ? `${v/5*100}%` : '20%' }} />;
                          })}
                        </div>
                        {note != null && (
                          <div style={{ width: 40, height: 40, borderRadius: 9, background: noteFondSup(note), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: noteCouleurSup(note), flexShrink: 0 }}>
                            {note.toFixed(1)}
                          </div>
                        )}
                      </div>
                      {open && (
                        <div style={{ padding: '14px 16px', background: COULEURS.gris50, borderTop: `1px solid ${COULEURS.gris100}` }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 6, marginBottom: hasTxt ? 12 : 0 }}>
                            {Object.entries(CRIT_RP_SUP).map(([key, meta]) => {
                              const val = rp[key];
                              return (
                                <div key={key} style={{ background: '#fff', borderRadius: 8, padding: '6px 9px', border: `1px solid ${COULEURS.gris200}`, textAlign: 'center' }}>
                                  <div style={{ fontSize: 10, color: COULEURS.gris400, marginBottom: 2 }}>{meta.icon} {meta.label}</div>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: val ? noteCouleurSup(val) : COULEURS.gris400 }}>{val ? `${val}/5` : '-'}</div>
                                </div>
                              );
                            })}
                          </div>
                          {hasTxt && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {rp.observations && <div style={{ fontSize: 12, color: '#0C4A6E', background: '#F0F9FF', borderRadius: 8, padding: '8px 10px' }}><strong>👁 Observations :</strong> {rp.observations}</div>}
                              {rp.recommandations && <div style={{ fontSize: 12, color: '#14532D', background: '#F0FDF4', borderRadius: 8, padding: '8px 10px' }}><strong>💡 Recommandations :</strong> {rp.recommandations}</div>}
                              {rp.commentaire_superviseur && <div style={{ fontSize: 12, color: '#854D0E', background: '#FEF9C3', borderRadius: 8, padding: '8px 10px' }}><strong>💬 Commentaire :</strong> {rp.commentaire_superviseur}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 24px', borderTop: `1px solid ${COULEURS.gris100}`, flexWrap: 'wrap', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 4 }}>Page {pageSafe}/{totalPages} · {rapportsCoach.length} note{rapportsCoach.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setModalPage(p => Math.max(1, p - 1))} disabled={pageSafe === 1}
                    style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${COULEURS.gris200}`, background: pageSafe === 1 ? COULEURS.gris50 : '#fff', fontSize: 12, cursor: pageSafe === 1 ? 'default' : 'pointer', color: pageSafe === 1 ? '#cbd5e1' : '#374151', fontWeight: 600 }}>← Préc.</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => Math.abs(p - pageSafe) <= 2).map(p => (
                    <button key={p} onClick={() => setModalPage(p)}
                      style={{ padding: '4px 9px', borderRadius: 7, border: `1.5px solid ${p === pageSafe ? SUP_COLOR : COULEURS.gris200}`, background: p === pageSafe ? SUP_COLOR : '#fff', fontSize: 12, cursor: 'pointer', color: p === pageSafe ? '#fff' : '#374151', fontWeight: p === pageSafe ? 800 : 400 }}>{p}</button>
                  ))}
                  <button onClick={() => setModalPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages}
                    style={{ padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${COULEURS.gris200}`, background: pageSafe === totalPages ? COULEURS.gris50 : '#fff', fontSize: 12, cursor: pageSafe === totalPages ? 'default' : 'pointer', color: pageSafe === totalPages ? '#cbd5e1' : '#374151', fontWeight: 600 }}>Suiv. →</button>
                </div>
              )}

              <div style={{ padding: '12px 24px', borderTop: `1px solid ${COULEURS.gris100}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => setDetailCoachId(null)} style={{ padding: '9px 20px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: 'transparent', color: COULEURS.gris600, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// ONGLET ÉVALUATIONS PA ADVISOR - lecture seule : avis des parents.
// Les notes de terrain sur les coachs (rapports d'observation Deputy + Superviseur Général)
// sont reçues en lecture seule via l'onglet séparé "Rapports Superviseur"
// (OngletRapportsSuperviseurPA) - le PA Advisor ne saisit jamais lui-même une évaluation.
// ─────────────────────────────────────────────────────────────────────────────
export function OngletEvaluationsPAAdvisor() {
  const [evalsParents,      setEvalsParents]      = useState([]);
  const [evalsParentsLoading, setEvalsParentsLoading] = useState(true);
  const [filtreCoachParent, setFiltreCoachParent] = useState('tous');
  const [modalAvis,         setModalAvis]         = useState(null);

  const PA_COLOR = '#6366F1';

  useEffect(() => {
    setEvalsParentsLoading(true);
    fetch(`${_API_URL_ADMIN}/api/analytics/evaluations-coach`, { headers: _authHdrsAdmin() })
      .then(async r => { const d = await r.json(); return r.ok ? d : { evaluations: [] }; })
      .then(d => setEvalsParents(d.evaluations || []))
      .catch(() => {})
      .finally(() => setEvalsParentsLoading(false));
  }, []);

  const CRITERES_PARENTS = [
    { id:'q1', lbl:'Clarté',        icone:'💡' },
    { id:'q2', lbl:'Disponibilité', icone:'📞' },
    { id:'q3', lbl:'Adaptation',    icone:'🎯' },
    { id:'q4', lbl:'Dynamisme',     icone:'⚡' },
    { id:'q5', lbl:'Progression',   icone:'📈' },
  ];
  const coachesParents = ['tous', ...new Set(evalsParents.map(e => e.coach_nom).filter(Boolean))];
  const evalsParentsFiltrees = filtreCoachParent === 'tous' ? evalsParents : evalsParents.filter(e => e.coach_nom === filtreCoachParent);
  const parCoachParent = {};
  evalsParentsFiltrees.forEach(e => {
    const nom = e.coach_nom || 'Coach inconnu';
    if (!parCoachParent[nom]) parCoachParent[nom] = [];
    parCoachParent[nom].push(e);
  });

  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>👨‍👩‍👧 Avis des parents sur les coachs</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>Satisfaction mensuelle transmise depuis l'espace parent</div>
        </div>
        {coachesParents.length > 1 && (
          <select value={filtreCoachParent} onChange={e => setFiltreCoachParent(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
            {coachesParents.map(c => <option key={c} value={c}>{c === 'tous' ? 'Tous les coachs' : c}</option>)}
          </select>
        )}
      </div>

      {/* Boutons d'export */}
      {evalsParentsFiltrees.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          <button
            onClick={() => exporterExcelStyle({
              nomFichier: `avis_parents_coachs_${new Date().toISOString().slice(0,10)}`,
              titre: '👨‍👩‍👧 Avis des parents sur les coachs',
              sousTitre: `${evalsParentsFiltrees.length} avis · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
              couleurEntete: PA_COLOR.replace('#',''),
              colonnes: [
                { label: 'Mois', width: 16 }, { label: 'Coach', width: 22, bold: true },
                { label: 'Enfant', width: 20 }, { label: 'Classe', width: 20 }, { label: 'Parent', width: 24 },
                { label: 'Clarté', width: 10, align: 'center' }, { label: 'Disponibilité', width: 12, align: 'center' },
                { label: 'Adaptation', width: 12, align: 'center' }, { label: 'Dynamisme', width: 12, align: 'center' },
                { label: 'Progression', width: 12, align: 'center' }, { label: 'Moyenne', width: 10, align: 'center' },
                { label: 'Commentaire', width: 34 },
              ],
              lignes: evalsParentsFiltrees.map(e => [
                new Date(e.mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),
                e.coach_nom || 'Coach inconnu',
                e.enfant_nom || '-', e.classe_nom || '-', e.parent_nom || e.parent_email || '-',
                e.q1 ?? '-', e.q2 ?? '-', e.q3 ?? '-', e.q4 ?? '-', e.q5 ?? '-',
                ((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1),
                e.commentaire || '',
              ]),
            })}
            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#217346', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
          >📊 Exporter Excel</button>
          <button
            onClick={() => {
              const lignesHtml = evalsParentsFiltrees.map(e => `
                <tr>
                  <td>${new Date(e.mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</td>
                  <td>${e.coach_nom || 'Coach inconnu'}</td>
                  <td>${e.enfant_nom || '-'}</td>
                  <td>${e.classe_nom || '-'}</td>
                  <td>${e.parent_nom || e.parent_email || '-'}</td>
                  <td style="font-weight:800">${((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1)}/5</td>
                  <td>${e.commentaire || '-'}</td>
                </tr>
              `).join('');
              genererPDF(`
                <div class="doc-header">
                  <div><div class="doc-header-logo">BET E-Learning</div><div class="doc-header-sub">Avis des parents sur les coachs</div></div>
                  <div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div>
                </div>
                <div class="doc-title-band">👨‍👩‍👧 AVIS DES PARENTS SUR LES COACHS</div>
                <div class="doc-body">
                  <table>
                    <thead><tr><th>Mois</th><th>Coach</th><th>Enfant</th><th>Classe</th><th>Parent</th><th>Moyenne</th><th>Commentaire</th></tr></thead>
                    <tbody>${lignesHtml}</tbody>
                  </table>
                  <div class="doc-footer"><span>BET E-Learning · Confidentiel</span><span>${fmtDatePDF(new Date().toISOString())}</span></div>
                </div>
              `, `Avis_parents_coachs_${new Date().toISOString().slice(0,10)}`);
            }}
            style={{ padding:'8px 16px', borderRadius:9, border:'none', background:'#003087', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}
          >📥 Exporter PDF</button>
        </div>
      )}

      {evalsParentsLoading ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Chargement…</div>
      ) : evalsParentsFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'#94a3b8', background:'#f8fafc', borderRadius:12, border:'1px dashed #e2e8f0' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>⭐</div>
          <div style={{ fontWeight:600, color:'#64748b', marginBottom:4 }}>Aucun avis parent reçu</div>
          <div style={{ fontSize:12 }}>Les parents évaluent le coach depuis leur espace chaque mois.</div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginBottom:24 }}>
            {[
              { val: evalsParentsFiltrees.length, lbl:'Évaluations reçues', acc:'#F59E0B' },
              { val: evalsParentsFiltrees.length > 0 ? `${(evalsParentsFiltrees.reduce((s,e)=>(s+(e.q1+e.q2+e.q3+e.q4+e.q5)/5),0)/evalsParentsFiltrees.length).toFixed(1)}/5` : '-', lbl:'Moyenne globale', acc:PA_COLOR },
              { val: Object.keys(parCoachParent).length, lbl:'Coachs évalués', acc:'#059669' },
              { val: new Set(evalsParentsFiltrees.map(e=>e.mois)).size, lbl:'Mois couverts', acc:'#0891b2' },
            ].map(k => (
              <div key={k.lbl} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.acc}` }}>
                <div style={{ fontSize:26, fontWeight:800, color:'#0f172a', lineHeight:1, marginBottom:4 }}>{k.val}</div>
                <div style={{ fontSize:12, color:COULEURS.gris600 }}>{k.lbl}</div>
              </div>
            ))}
          </div>

          {/* Par coach */}
          {Object.entries(parCoachParent).map(([nom, liste]) => {
            const nb = liste.length;
            const moy = (liste.reduce((s,e)=>s+(e.q1+e.q2+e.q3+e.q4+e.q5)/5,0)/nb).toFixed(1);
            const bgM  = moy>=4?'#D1FAE5':moy>=3?'#FEF9C3':'#FEE2E2';
            const txM  = moy>=4?'#065F46':moy>=3?'#92400E':'#991B1B';
            const totals = {};
            CRITERES_PARENTS.forEach(c => { totals[c.id] = liste.reduce((s,e)=>s+(e[c.id]||0),0); });
            return (
              <div key={nom} style={{ background:COULEURS.blanc, borderRadius:14, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:20, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, flexWrap:'wrap', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'#4338CA20', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#4338CA' }}>
                      {nom.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:'#0f172a' }}>{nom}</div>
                      <div style={{ fontSize:11, color:'#94a3b8' }}>{nb} avis parent{nb>1?'s':''}</div>
                    </div>
                  </div>
                  <span style={{ padding:'4px 14px', borderRadius:20, background:bgM, color:txM, fontWeight:800, fontSize:15 }}>⭐ {moy}/5</span>
                </div>
                {/* Moyennes critères */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                  {CRITERES_PARENTS.map((c,i) => (
                    <div key={c.id} style={{ textAlign:'center', padding:'10px 6px', borderRight: i<4?`1px solid ${COULEURS.gris100}`:'none' }}>
                      <div style={{ fontSize:16, marginBottom:2 }}>{c.icone}</div>
                      <div style={{ fontSize:17, fontWeight:800, color:'#F59E0B' }}>{(totals[c.id]/nb).toFixed(1)}</div>
                      <div style={{ fontSize:10, color:'#94a3b8' }}>{c.lbl}</div>
                    </div>
                  ))}
                </div>
                {/* Détail */}
                <div style={{ padding:'12px 20px', display:'flex', flexDirection:'column', gap:8 }}>
                  {liste.map((e,i) => {
                    const moisLib = new Date(e.mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
                    const me = ((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1);
                    return (
                      <div key={i} onClick={() => setModalAvis(e)}
                        style={{ display:'flex', flexDirection:'column', gap:4, padding:'8px 12px', background:'#f8fafc', borderRadius:8, border:`1px solid ${COULEURS.gris100}`, cursor:'pointer', transition:'background 0.12s' }}
                        onMouseEnter={ev => ev.currentTarget.style.background = '#EEF2FF'}
                        onMouseLeave={ev => ev.currentTarget.style.background = '#f8fafc'}>
                        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'#475569', minWidth:100, textTransform:'capitalize' }}>{moisLib}</span>
                          <div style={{ display:'flex', gap:5, flex:1, flexWrap:'wrap' }}>
                            {CRITERES_PARENTS.map(c => (
                              <span key={c.id} style={{ fontSize:11, padding:'2px 7px', borderRadius:10, background:e[c.id]>=4?'#D1FAE5':e[c.id]>=3?'#FEF9C3':'#FEE2E2', color:e[c.id]>=4?'#065F46':e[c.id]>=3?'#92400E':'#991B1B', fontWeight:600 }}>
                                {c.icone} {e[c.id]}/5
                              </span>
                            ))}
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color:'#F59E0B' }}>⭐ {me}/5</span>
                          <span style={{ fontSize:13, color:'#94a3b8' }}>›</span>
                        </div>
                        <div style={{ fontSize:11, color:'#94a3b8', display:'flex', gap:12, flexWrap:'wrap' }}>
                          <span>👶 {e.enfant_nom || 'Enfant inconnu'}</span>
                          <span>🏫 {e.classe_nom || 'Classe inconnue'}</span>
                          <span>👨‍👩‍👧 {e.parent_nom || e.parent_email || 'Parent inconnu'}</span>
                        </div>
                      </div>
                    );
                  })}
                  {liste.filter(e=>e.commentaire).map((e,i) => (
                    <div key={'c'+i} style={{ padding:'8px 12px', background:'#eff6ff', borderRadius:8, borderLeft:`3px solid ${PA_COLOR}`, fontSize:12, color:'#3730a3', fontStyle:'italic' }}>
                      <span style={{ fontWeight:600 }}>{new Date(e.mois+'-01').toLocaleDateString('fr-FR',{month:'short',year:'numeric'})} - {e.parent_nom || e.parent_email || 'Parent'} ({e.enfant_nom || 'enfant'}) : </span>
                      "{e.commentaire}"
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── MODAL DÉTAIL AVIS PARENT ── */}
      {modalAvis && (() => {
        const moyModal = ((modalAvis.q1+modalAvis.q2+modalAvis.q3+modalAvis.q4+modalAvis.q5)/5).toFixed(1);
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={e => { if (e.target === e.currentTarget) setModalAvis(null); }}>
            <div style={{ background:'#fff', borderRadius:18, width:520, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,0.35)' }}>
              <div style={{ background:`linear-gradient(135deg, #0F172A 0%, #1E293B 60%, ${PA_COLOR} 100%)`, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>⭐ Détail de l'avis parent</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:2, textTransform:'capitalize' }}>{new Date(modalAvis.mois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</div>
                </div>
                <button onClick={() => setModalAvis(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                    <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>👨‍🏫 Coach</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{modalAvis.coach_nom || 'Coach inconnu'}</div>
                  </div>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                    <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>🏫 Classe</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{modalAvis.classe_nom || 'Classe inconnue'}</div>
                  </div>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                    <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>👶 Enfant</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{modalAvis.enfant_nom || 'Enfant inconnu'}</div>
                  </div>
                  <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
                    <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>👨‍👩‍👧 Parent</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1E293B' }}>{modalAvis.parent_nom || '-'}</div>
                    {modalAvis.parent_email && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{modalAvis.parent_email}</div>}
                  </div>
                </div>

                <div style={{ background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius:12, padding:'14px 20px', border:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ fontSize:34 }}>⭐</div>
                  <div>
                    <div style={{ fontSize:26, fontWeight:900, color:'#92400E' }}>{moyModal}<span style={{ fontSize:12, color:'#B45309' }}>/5</span></div>
                    <div style={{ fontSize:11, color:'#B45309' }}>Note moyenne</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Critères d'évaluation</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {CRITERES_PARENTS.map(c => {
                      const v = modalAvis[c.id];
                      const col = v>=4?'#059669':v>=3?'#F59E0B':'#DC2626';
                      const pct = Math.round((v/5)*100);
                      return (
                        <div key={c.id} style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 12px', border:'1px solid #E5E7EB' }}>
                          <div style={{ fontSize:10, color:'#94A3B8', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>{c.icone} {c.lbl}</div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, height:6, borderRadius:3, background:'#E5E7EB', overflow:'hidden' }}>
                              <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color:col, minWidth:24 }}>{v}/5</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {modalAvis.commentaire && (
                  <div style={{ background:'#eff6ff', borderRadius:10, padding:'12px 14px', borderLeft:`3px solid ${PA_COLOR}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#3730a3', marginBottom:5 }}>💬 Commentaire</div>
                    <div style={{ fontSize:13, color:'#3730a3', fontStyle:'italic', lineHeight:1.5 }}>"{modalAvis.commentaire}"</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
export function OngletSuiviApprenantsPAAdvisor() {
  const { couleurTheme, couleurThemeFonce } = useTheme();
  const alerte = useAlerte();
  const [classes,        setClasses]        = useState([]);
  const [chargement,     setChargement]     = useState(true);
  const [classeActive,   setClasseActive]   = useState(null);
  const [apprenants,     setApprenants]     = useState([]);
  const [chargApp,       setChargApp]       = useState(false);
  const [modalApprenant, setModalApprenant] = useState(null);
  const [recherche,      setRecherche]      = useState('');
  const [rechercheClasses, setRechercheClasses] = useState('');
  const [pageClasses,      setPageClasses]      = useState(1);
  const CLASSES_PAR_PAGE = 10;

  const NIV_C   = { A1:'#6366F1', A2:'#0891B2', B1:'#059669', B2:'#F97316', C1:'#DC2626', C2:'#7C3AED' };
  const STATUT  = { actif:{ bg:'#D1FAE5', txt:'#065F46', lib:'Actif' }, suspendu:{ bg:'#FEE2E2', txt:'#991B1B', lib:'Suspendu' }, certifie:{ bg:'#EDE9FE', txt:'#5B21B6', lib:'Certifié' } };
  const FORMAT  = { en_ligne:'🌐 En ligne', presentiel:'🏢 Présentiel', hybride:'🔀 Hybride' };

  useEffect(() => {
    fetch(`${_API_URL_ADMIN}/api/classes-elearning`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  function ouvrirClasse(classe) {
    setClasseActive(classe);
    setRecherche('');
    setChargApp(true);
    setApprenants([]);
    fetch(`${_API_URL_ADMIN}/api/classes-elearning/${classe.id}/apprenants`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => setApprenants(d.apprenants || []))
      .catch(() => {})
      .finally(() => setChargApp(false));
  }

  const apprenantsFiltres = apprenants.filter(a =>
    !recherche || (a.nom_complet||'').toLowerCase().includes(recherche.toLowerCase()) || (a.email||'').toLowerCase().includes(recherche.toLowerCase())
  );

  const classesFiltrees = classes.filter(c =>
    !rechercheClasses ||
    (c.nom||'').toLowerCase().includes(rechercheClasses.toLowerCase()) ||
    (c.entreprise_nom||'').toLowerCase().includes(rechercheClasses.toLowerCase()) ||
    (c.coach_nom||'').toLowerCase().includes(rechercheClasses.toLowerCase())
  );
  const totalPagesClasses = Math.max(1, Math.ceil(classesFiltrees.length / CLASSES_PAR_PAGE));
  const pageClassesSafe   = Math.min(pageClasses, totalPagesClasses);
  const classesPage       = classesFiltrees.slice((pageClassesSafe-1)*CLASSES_PAR_PAGE, pageClassesSafe*CLASSES_PAR_PAGE);

  return (
    <div>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#0EA5E9,#0891B2)', borderRadius:14, padding:'18px 24px', marginBottom:24 }}>
        <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:3 }}>👩‍🎓 Suivi des apprenants e-learning</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>Classe → Apprenants → Détail</div>
      </div>

      {/* Recherche */}
      {!chargement && classes.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <input
            placeholder="Rechercher une classe, une entreprise, un coach…"
            value={rechercheClasses}
            onChange={e => { setRechercheClasses(e.target.value); setPageClasses(1); }}
            style={{ width:'100%', maxWidth:420, padding:'9px 14px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box' }}
          />
        </div>
      )}

      {/* Tableau classes */}
      {chargement ? (
        <div style={{ textAlign:'center', padding:'60px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
      ) : classes.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏫</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy }}>Aucune classe e-learning</div>
        </div>
      ) : classesFiltrees.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:COULEURS.gris400 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy }}>Aucune classe trouvée</div>
        </div>
      ) : (
        <div style={{ background:COULEURS.blanc, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:`1px solid ${COULEURS.gris200}` }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1.4fr 0.8fr 1.3fr 1fr 1.4fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            <span>Classe</span><span>Entreprise</span><span>Niveau</span><span>Format</span><span>Apprenants</span><span>Coach</span>
          </div>
          {classesPage.map((c, idx) => {
            const horaires = Array.isArray(c.horaire) ? c.horaire : [];
            return (
              <div key={c.id} onClick={() => ouvrirClasse(c)}
                style={{ display:'grid', gridTemplateColumns:'2fr 1.4fr 0.8fr 1.3fr 1fr 1.4fr', padding:'13px 20px', borderBottom: idx < classesPage.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div>
                  <div style={{ fontWeight:700, color:COULEURS.navy }}>{c.nom}</div>
                  {horaires.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                      {horaires.map((h,i) => <span key={i} style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:6, padding:'1px 6px', fontSize:10, fontWeight:600 }}>📅 {h.jour} {h.debut}–{h.fin}</span>)}
                    </div>
                  )}
                </div>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{c.entreprise_nom || '-'}</span>
                <span>{c.niveau
                  ? <span style={{ background:NIV_C[c.niveau]||'#94A3B8', color:'#fff', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:800 }}>{c.niveau}</span>
                  : <span style={{ fontSize:12, color:COULEURS.gris400 }}>-</span>}
                </span>
                <span style={{ fontSize:12, color:COULEURS.gris600 }}>{c.type_cours ? (FORMAT[c.type_cours]||c.type_cours) : '-'}</span>
                <span style={{ background:'#EFF6FF', color:'#1D4ED8', borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:600, justifySelf:'start' }}>👥 {c.nb_apprenants||0}</span>
                {c.coach_nom
                  ? <span style={{ fontSize:12, color:COULEURS.succes, fontWeight:600 }}>👨‍🏫 {c.coach_nom}</span>
                  : <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>⚠️ Pas de coach</span>}
              </div>
            );
          })}
          {totalPagesClasses > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderTop:`1px solid ${COULEURS.gris100}` }}>
              <span style={{ fontSize:12, color:COULEURS.gris600 }}>
                {(pageClassesSafe-1)*CLASSES_PAR_PAGE+1}–{Math.min(pageClassesSafe*CLASSES_PAR_PAGE, classesFiltrees.length)} sur {classesFiltrees.length}
              </span>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button onClick={() => setPageClasses(p => Math.max(1, p-1))} disabled={pageClassesSafe===1}
                  style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:pageClassesSafe===1?'not-allowed':'pointer', color:pageClassesSafe===1?COULEURS.gris300:COULEURS.gris600 }}>‹</button>
                {Array.from({ length: totalPagesClasses }, (_, i) => i+1).filter(p => Math.abs(p-pageClassesSafe) <= 2).map(p => (
                  <button key={p} onClick={() => setPageClasses(p)}
                    style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${p===pageClassesSafe?'#0EA5E9':COULEURS.gris200}`, background:p===pageClassesSafe?'#0EA5E9':COULEURS.blanc, fontSize:12, fontWeight:600, cursor:'pointer', color:p===pageClassesSafe?'#fff':COULEURS.gris600 }}>{p}</button>
                ))}
                <button onClick={() => setPageClasses(p => Math.min(totalPagesClasses, p+1))} disabled={pageClassesSafe===totalPagesClasses}
                  style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:pageClassesSafe===totalPagesClasses?'not-allowed':'pointer', color:pageClassesSafe===totalPagesClasses?COULEURS.gris300:COULEURS.gris600 }}>›</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal apprenants de la classe */}
      {classeActive && !modalApprenant && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'24px 16px' }}
          onClick={() => { setClasseActive(null); setApprenants([]); }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:'18px 24px', borderBottom:`1px solid ${COULEURS.gris200}`, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#0EA5E9', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14 }}>
                {classeActive.niveau || '🏫'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15, color:COULEURS.navy }}>{classeActive.nom}</div>
                <div style={{ fontSize:12, color:COULEURS.gris400 }}>
                  {classeActive.entreprise_nom ? `${classeActive.entreprise_nom} · ` : ''}
                  {classeActive.coach_nom ? `Coach : ${classeActive.coach_nom}` : '⚠️ Pas de coach'} · {apprenants.length} apprenant(s)
                </div>
              </div>
              <button onClick={() => { setClasseActive(null); setApprenants([]); }}
                style={{ width:32, height:32, borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, cursor:'pointer', fontSize:16, color:COULEURS.gris600, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>
            {/* KPIs */}
            {!chargApp && apprenants.length > 0 && (() => {
              const nbActifs    = apprenants.filter(a => a.statut === 'actif').length;
              const nbSuspendus = apprenants.filter(a => a.statut === 'suspendu').length;
              const nbCertifies = apprenants.filter(a => a.statut === 'certifie').length;
              const cap         = classeActive.capacite_max || classeActive.nb_places;
              const tauxRempli  = cap ? Math.round((apprenants.length / cap) * 100) : null;
              const kpis = [
                { label:'Inscrits',    val: apprenants.length, couleur:'#0EA5E9', fond:'#EFF6FF' },
                { label:'Actifs',      val: nbActifs,          couleur:'#059669', fond:'#D1FAE5' },
                { label:'Suspendus',   val: nbSuspendus,       couleur:'#DC2626', fond:'#FEE2E2' },
                { label:'Certifiés',   val: nbCertifies,       couleur:'#7C3AED', fond:'#EDE9FE' },
                ...(tauxRempli !== null ? [{ label:'Remplissage', val:`${tauxRempli}%`, couleur: tauxRempli >= 90 ? '#DC2626' : tauxRempli >= 70 ? '#F97316' : '#059669', fond:'#F8FAFC' }] : []),
              ];
              return (
                <div style={{ display:'flex', gap:10, padding:'12px 24px', borderBottom:`1px solid ${COULEURS.gris100}`, flexWrap:'wrap' }}>
                  {kpis.map(k => (
                    <div key={k.label} style={{ background:k.fond, borderRadius:10, padding:'8px 16px', minWidth:80, textAlign:'center', border:`1px solid ${k.couleur}22` }}>
                      <div style={{ fontSize:18, fontWeight:800, color:k.couleur }}>{k.val}</div>
                      <div style={{ fontSize:10, fontWeight:600, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Recherche */}
            <div style={{ padding:'12px 24px', borderBottom:`1px solid ${COULEURS.gris100}` }}>
              <input placeholder="Rechercher un apprenant…" value={recherche} onChange={e => setRecherche(e.target.value)}
                style={{ width:'100%', padding:'9px 14px', borderRadius:9, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', boxSizing:'border-box' }} />
            </div>
            {/* En-têtes */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr', padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>Apprenant</span><span>Email</span><span>Niveau</span><span>Statut</span>
            </div>
            {/* Liste */}
            <div style={{ overflowY:'auto', flex:1 }}>
              {chargApp ? (
                <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>⏳ Chargement…</div>
              ) : apprenantsFiltres.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:COULEURS.gris400 }}>Aucun apprenant{recherche ? ' trouvé' : ' dans cette classe'}</div>
              ) : apprenantsFiltres.map((a, idx) => {
                const st  = STATUT[a.statut] || { bg:COULEURS.gris100, txt:COULEURS.gris600, lib:a.statut||'-' };
                const nvc = NIV_C[a.niveau_cecr] || '#94A3B8';
                const parts = (a.nom_complet||'').trim().split(' ');
                const prenom = parts[0] || '';
                const nom    = parts.slice(1).join(' ') || '';
                return (
                  <div key={a.id}
                    onClick={() => setModalApprenant({ ...a, prenom, nom, groupe: classeActive, entreprise: { nom: classeActive.entreprise_nom } })}
                    style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr', padding:'13px 24px', borderBottom: idx < apprenantsFiltres.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {a.avatar_url ? (
                        <img src={a.avatar_url} alt="" style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={e => { e.target.style.display='none'; }} />
                      ) : (
                        <div style={{ width:26, height:26, borderRadius:'50%', background:`${couleurTheme}18`, color:couleurThemeFonce, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0 }}>
                          {prenom?.[0]}{nom?.[0]}
                        </div>
                      )}
                      <span style={{ fontWeight:700, color:COULEURS.navy }}>{a.nom_complet || '-'}</span>
                    </div>
                    <span style={{ fontSize:12, color:COULEURS.gris600 }}>{a.email || '-'}</span>
                    <span>{a.niveau_cecr
                      ? <span style={{ padding:'3px 9px', borderRadius:20, background:`${nvc}18`, color:nvc, fontWeight:700, fontSize:12 }}>{a.niveau_cecr}</span>
                      : <span style={{ fontSize:12, color:COULEURS.gris400 }}>-</span>}
                    </span>
                    <span style={{ padding:'3px 9px', borderRadius:20, background:st.bg, color:st.txt, fontWeight:600, fontSize:11 }}>{st.lib}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal détail apprenant */}
      {modalApprenant && (
        <ModalDetailApprenant
          apprenant={modalApprenant}
          groupe={modalApprenant.groupe}
          entreprise={modalApprenant.entreprise}
          onFermer={() => setModalApprenant(null)}
        />
      )}
    </div>
  );
}
