// DashboardCustomerCare.jsx - Module Customer Care extrait de DashboardAdmin.jsx (profil admin_customer_care)
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAlerte } from '../../contexts/ConfirmContext';
import { useMessagerie } from '../../contexts/MessagerieContext';
import { COULEURS } from '../../constants/couleurs';
import { PaginationSimple } from './DashboardAdminShared';

const _API_URL_ADMIN = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _authHdrsAdmin = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('admin_token')||''}`, 'X-Plateforme': 'bet-elearning' });

const SOURCE_LIB = {
  portail:  { lib: 'Portail client', bg: '#EFF6FF', txt: '#1D4ED8' },
  csv:      { lib: 'Import CSV',     bg: '#F0FDF4', txt: '#15803D' },
  excel:    { lib: 'Import Excel',   bg: '#F0FDF4', txt: '#15803D' },
  site_web: { lib: 'Site web',       bg: '#FDF4FF', txt: '#7E22CE' },
};
const STATUT_ENT = {
  actif:          { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  expire_bientot: { bg: '#FEF3C7', txt: '#92400E', lib: 'Expire bientôt' },
  prospect:       { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Prospect' },
  suspendu:       { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
  en_attente:     { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente de validation' },
  refuse:         { bg: '#FEE2E2', txt: '#991B1B', lib: 'Refusé' },
};
const STATUT_BEN = {
  actif:               { bg: '#D1FAE5', txt: '#065F46', lib: 'Actif' },
  certifie:            { bg: '#EDE9FE', txt: '#5B21B6', lib: 'Certifié' },
  en_attente:          { bg: '#FEF3C7', txt: '#92400E', lib: 'En attente' },
  test_niveau_pending: { bg: '#FEF3C7', txt: '#92400E', lib: 'Test en cours' },
  suspendu:            { bg: '#FEE2E2', txt: '#991B1B', lib: 'Suspendu' },
};
const NIV_COULEUR = {
  A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316',
};
function genererEmailApprenant(prenom, nom) {
  const p = prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  const n = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
  return `${p}.${n}@betlearning.ci`;
}
function mapTicketApi(t) {
  return {
    _uuid: t.id,
    id: `TC-${String(t.numero || 0).padStart(3, '0')}`,
    sujet: t.sujet,
    canal: t.canal,
    priorite: t.priorite,
    statut: t.statut,
    prenomC: t.contact_prenom || '',
    nomC: t.contact_nom || '',
    emailC: t.contact_email || '',
    apprenant: t.apprenant_nom || '',
    entreprise: t.entreprise_nom || '',
    dateCreation: (t.created_at || '').slice(0, 10),
    dateResolution: t.date_resolution,
    description: t.description,
    reponseTexte: t.reponse_texte,
  };
}

export function OngletCustomerCare({ ongletActif = 'overview' }) {
  const CC_COLOR = '#EC4899';
  const navigate   = useNavigate();
  const alerte = useAlerte();
  const { ouvrirOuCreerConversation } = useMessagerie();
  const [tickets,        setTickets]        = useState([]);
  const [ticketsLoading, setTicketsLoading]  = useState(false);
  const [filtreStatut,  setFiltreStatut]  = useState('tous');
  const [filtreCanal,   setFiltreCanal]   = useState('tous');
  const [filtrePriorite,setFiltrePriorite]= useState('tous');
  const [recherche,     setRecherche]     = useState('');
  const [rechercheP,    setRechercheP]    = useState('');
  const [ticketDetail,  setTicketDetail]  = useState(null);
  const [modalReponse,  setModalReponse]  = useState(null);
  const [reponseText,   setReponseText]   = useState('');
  const [modalNouveauTicket, setModalNouveauTicket] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false); // empêche le double-clic création ticket
  const [ticketsEnCours, setTicketsEnCours] = useState(new Set()); // empêche le double-clic changement de statut ticket
  const [nouveauTicket, setNouveauTicket] = useState({ sujet:'', canal:'email', priorite:'normale', contact_prenom:'', contact_nom:'', contact_email:'', apprenant_nom:'', entreprise_nom:'', description:'' });
  const [ongletProfil,      setOngletProfil]      = useState('apprenants');
  const [profilSelectionne, setProfilSelectionne] = useState(null);
  const [modalMessage,  setModalMessage]  = useState(null); // { destinataire, email, sujet }
  const [messageTexte,  setMessageTexte]  = useState('');
  const [messageSent,   setMessageSent]   = useState(false);
  const [pageTickets,       setPageTickets]       = useState(1);
  const [pageApprenants,    setPageApprenants]    = useState(1);
  const [pageParents,       setPageParents]       = useState(1);
  const [pageEntreprises,   setPageEntreprises]   = useState(1);
  const PP_TICKETS  = 8;
  const PP_PROFILS  = 20;

  const [filtreTypeApp,      setFiltreTypeApp]      = useState('tous');
  const [filtreNiveauApp,    setFiltreNiveauApp]    = useState('tous');
  const [filtreStatutApp,    setFiltreStatutApp]    = useState('tous');
  const [filtreAppPeriode,   setFiltreAppPeriode]   = useState('tous');
  const [filtreAppDateDebut, setFiltreAppDateDebut] = useState('');
  const [filtreAppDateFin,   setFiltreAppDateFin]   = useState('');

  // ── Tickets (API réelle) ──
  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/tickets`, { headers: _authHdrsAdmin() });
      if (!r.ok) throw new Error();
      const { tickets: data } = await r.json();
      setTickets((data || []).map(mapTicketApi));
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  async function creerTicket() {
    if (!nouveauTicket.sujet.trim() || creatingTicket) return;
    setCreatingTicket(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/tickets`, {
        method: 'POST', headers: _authHdrsAdmin(), body: JSON.stringify(nouveauTicket),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Erreur lors de la création du ticket");
      }
      setModalNouveauTicket(false);
      setNouveauTicket({ sujet:'', canal:'email', priorite:'normale', contact_prenom:'', contact_nom:'', contact_email:'', apprenant_nom:'', entreprise_nom:'', description:'' });
      fetchTickets();
    } catch (e) {
      await alerte(e.message || "Erreur lors de la création du ticket", { danger: true });
    } finally {
      setCreatingTicket(false);
    }
  }

  // ── Profils réels (apprenants / parents / entreprises) ──
  const [apprenantsApi,    setApprenantsApi]    = useState([]);
  const [entreprisesApi,   setEntreprisesApi]   = useState([]);
  const [beneficiairesApi, setBeneficiairesApi] = useState([]);
  const [inscriptionsApi,  setInscriptionsApi]  = useState([]);
  const [profilsLoading,   setProfilsLoading]   = useState(false);

  useEffect(() => {
    setProfilsLoading(true);
    Promise.all([
      fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/tous`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : { apprenants: [] }).catch(() => ({ apprenants: [] })),
      fetch(`${_API_URL_ADMIN}/api/entreprise/admin/liste`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : { entreprises: [], beneficiaires: [] }).catch(() => ({ entreprises: [], beneficiaires: [] })),
      fetch(`${_API_URL_ADMIN}/api/inscriptions-elearning`, { headers: _authHdrsAdmin() }).then(r => r.ok ? r.json() : { inscriptions: [] }).catch(() => ({ inscriptions: [] })),
    ]).then(([a, e, i]) => {
      setApprenantsApi(a.apprenants || []);
      setEntreprisesApi(e.entreprises || []);
      setBeneficiairesApi(e.beneficiaires || []);
      setInscriptionsApi(i.inscriptions || []);
    }).finally(() => setProfilsLoading(false));
  }, []);

  // ── Blocages absences (dérivés des apprenants suspendus, absences chargées par apprenant) ──
  const [absencesParId,  setAbsencesParId]  = useState({}); // { [inscriptionId]: nb_absences }
  const [modalDeblocage, setModalDeblocage] = useState(null);
  const [motifDeblocage, setMotifDeblocage] = useState('');
  const [fichierJustif,  setFichierJustif]  = useState(null); // { name, size, url }
  const [deblocageLoad,  setDeblocageLoad]  = useState(false);

  const apprenantsBloques = apprenantsApi.filter(a => a.statut === 'suspendu');

  useEffect(() => {
    if (ongletActif !== 'blocages' || apprenantsBloques.length === 0) return;
    apprenantsBloques.forEach(a => {
      if (absencesParId[a.id] !== undefined) return;
      fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${a.id}/acces-status`, { headers: _authHdrsAdmin() })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setAbsencesParId(prev => ({ ...prev, [a.id]: d.nb_absences ?? 0 })); })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongletActif, apprenantsApi]);

  async function selectionnerFichier(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { await alerte('Seuls les fichiers PDF sont acceptés.', { danger: true }); return; }
    if (f.size > 5 * 1024 * 1024) { await alerte('Fichier trop lourd (max 5 Mo).', { danger: true }); return; }
    setFichierJustif({ name: f.name, size: (f.size / 1024).toFixed(0) + ' Ko', url: URL.createObjectURL(f) });
  }

  async function debloquerApprenant() {
    if (!modalDeblocage || deblocageLoad) return;
    setDeblocageLoad(true);
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${modalDeblocage.id}/suspension`, {
        method: 'PATCH', headers: _authHdrsAdmin(), body: JSON.stringify({ bloque: false }),
      });
      if (!r.ok) throw new Error();
      setApprenantsApi(prev => prev.map(a => a.id === modalDeblocage.id ? { ...a, statut: 'actif' } : a));
      setModalDeblocage(null);
      setMotifDeblocage('');
      setFichierJustif(null);
    } catch {
      await alerte('Erreur lors du déblocage. Réessayez.', { danger: true });
    } finally {
      setDeblocageLoad(false);
    }
  }

  const nbOuverts  = tickets.filter(t => t.statut === 'ouvert').length;
  const nbEnCours  = tickets.filter(t => t.statut === 'en_cours').length;
  const nbResolus  = tickets.filter(t => t.statut === 'resolu').length;
  const tauxResol  = tickets.length > 0 ? Math.round((nbResolus / tickets.length) * 100) : 0;

  const parCanal = ['email','whatsapp','chat'].map(c => ({
    canal: c,
    nb: tickets.filter(t => t.canal === c).length,
    lib: c === 'email' ? '📧 Email' : c === 'whatsapp' ? '💬 WhatsApp' : '🖥️ Chat',
    bg:  c === 'email' ? '#EFF6FF' : c === 'whatsapp' ? '#F0FDF4' : '#FDF4FF',
    txt: c === 'email' ? '#1D4ED8' : c === 'whatsapp' ? '#15803D' : '#7E22CE',
  }));

  const listeTickets = tickets.filter(t => {
    if (filtreStatut  !== 'tous' && t.statut   !== filtreStatut)   return false;
    if (filtreCanal   !== 'tous' && t.canal    !== filtreCanal)    return false;
    if (filtrePriorite!== 'tous' && t.priorite !== filtrePriorite) return false;
    if (recherche) {
      const q = recherche.toLowerCase();
      if (!`${t.sujet} ${t.prenomC} ${t.nomC} ${t.entreprise} ${t.apprenant}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const ticketsPage = listeTickets.slice((pageTickets - 1) * PP_TICKETS, pageTickets * PP_TICKETS);

  async function changerStatut(ticket, statut) {
    if (ticketsEnCours.has(ticket._uuid)) return;
    setTicketsEnCours(prev => new Set(prev).add(ticket._uuid));
    const ancien = ticket;
    const dateResolution = statut === 'resolu' ? new Date().toISOString().slice(0,10) : ticket.dateResolution;
    setTickets(prev => prev.map(t => t._uuid === ticket._uuid ? { ...t, statut, dateResolution } : t));
    if (ticketDetail?._uuid === ticket._uuid) setTicketDetail(t => ({ ...t, statut, dateResolution }));
    try {
      const r = await fetch(`${_API_URL_ADMIN}/api/tickets/${ticket._uuid}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut, date_resolution: dateResolution || null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Modification refusée', { duration: 5000 });
        setTickets(prev => prev.map(t => t._uuid === ticket._uuid ? ancien : t));
        if (ticketDetail?._uuid === ticket._uuid) setTicketDetail(ancien);
      }
    } catch {
      toast.error('Impossible de joindre le serveur', { duration: 5000 });
      setTickets(prev => prev.map(t => t._uuid === ticket._uuid ? ancien : t));
    } finally {
      setTicketsEnCours(prev => { const n = new Set(prev); n.delete(ticket._uuid); return n; });
    }
  }
  async function envoyerReponse() {
    if (!reponseText.trim()) return;
    const ticket = modalReponse;
    setModalReponse(null);
    setReponseText('');
    setTickets(prev => prev.map(t => t._uuid === ticket._uuid ? { ...t, statut:'en_cours', reponseTexte: reponseText } : t));
    try {
      await fetch(`${_API_URL_ADMIN}/api/tickets/${ticket._uuid}`, {
        method: 'PATCH', headers: _authHdrsAdmin(),
        body: JSON.stringify({ statut:'en_cours', reponse_texte: reponseText }),
      });
    } catch {}
  }

  const STATUT_CC = {
    ouvert:   { bg:'#FEF3C7', txt:'#92400E', lib:'🟡 Ouvert'   },
    en_cours: { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours' },
    resolu:   { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Résolu'   },
  };
  const PRIO_CC = {
    haute:   { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 Haute' },
    normale: { bg:'#FEF9C3', txt:'#92400E', lib:'🟡 Normale' },
    basse:   { bg:'#F0FDF4', txt:'#15803D', lib:'🟢 Basse' },
  };
  const CANAL_CC = {
    email:    { ic:'📧', lib:'Email',    bg:'#EFF6FF', txt:'#1D4ED8' },
    whatsapp: { ic:'💬', lib:'WhatsApp', bg:'#F0FDF4', txt:'#15803D' },
    chat:     { ic:'🖥️', lib:'Chat',     bg:'#FDF4FF', txt:'#7E22CE' },
  };


  const NIV_C = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };

  function matchPeriodeApp(dateStr) {
    if (filtreAppPeriode === 'tous' || !dateStr) return true;
    const d = new Date(dateStr); const now = new Date();
    if (filtreAppPeriode === 'mois')         return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filtreAppPeriode === 'mois_dernier') { const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); }
    if (filtreAppPeriode === '3mois')        { const ref = new Date(now); ref.setMonth(ref.getMonth() - 3); return d >= ref; }
    if (filtreAppPeriode === 'annee')        return d.getFullYear() === now.getFullYear();
    if (filtreAppPeriode === 'custom') {
      if (filtreAppDateDebut && d < new Date(filtreAppDateDebut)) return false;
      if (filtreAppDateFin   && d > new Date(filtreAppDateFin + 'T23:59:59')) return false;
      return true;
    }
    return true;
  }
  const apprenantsNormalises = apprenantsApi.map(a => {
    const parts = (a.nom_complet || '').trim().split(' ');
    return {
      id: a.id,
      prenom: parts[0] || '',
      nom: parts.slice(1).join(' ') || '',
      age: null,
      niveau_cecr: a.niveau_cecr || a.niveau_classe || null,
      points_gamif: 0,
      client_id: a.entreprise_id || null,
      groupe_id: a.classe_nom || a.classe_id || null,
      statut: a.statut || 'actif',
      date_inscription: a.date_inscription,
    };
  });
  const listeApprenants  = apprenantsNormalises.filter(a => {
    if (filtreTypeApp === 'particulier' && a.client_id !== null) return false;
    if (filtreTypeApp === 'entreprise'  && a.client_id === null)  return false;
    if (filtreNiveauApp !== 'tous' && a.niveau_cecr !== filtreNiveauApp) return false;
    if (filtreStatutApp !== 'tous' && a.statut !== filtreStatutApp)       return false;
    if (!matchPeriodeApp(a.date_inscription)) return false;
    if (rechercheP) {
      const q = rechercheP.toLowerCase();
      if (!`${a.prenom} ${a.nom} ${a.niveau_cecr || ''} ${a.id}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const parentsNormalises = inscriptionsApi
    .filter(i => i.email_parent)
    .map(i => {
      const parts = (i.nom_complet || '').trim().split(' ');
      return {
        id: i.id,
        prenomParent: i.prenom_parent || '',
        nomParent: i.nom_parent || '',
        emailParent: i.email_parent,
        telParent: i.telephone_parent || '',
        prenom: parts[0] || '',
        nom: parts.slice(1).join(' ') || '',
        entreprise: i.entreprise_nom || '-',
        source: i.source === 'commercial' ? 'portail' : 'site_web',
      };
    });
  const listeParents     = parentsNormalises.filter(i => !rechercheP ||
    `${i.prenomParent} ${i.nomParent} ${i.emailParent} ${i.entreprise}`.toLowerCase().includes(rechercheP.toLowerCase()));
  const entreprisesNormalisees = entreprisesApi.map(e => ({
    id: e.id,
    nom: e.nom,
    secteur: e.secteur || '-',
    responsable: e.referent_rh_nom || '-',
    email_contact: e.referent_rh_email || '-',
    telephone: e.referent_rh_telephone || '-',
    adresse: e.adresse || '-',
    ville: e.ville || '-',
    couleur: e.couleur || CC_COLOR,
    initiales: e.initiales || (e.nom || '??').slice(0, 2).toUpperCase(),
    package: e.package_elearning || '-',
    nb_beneficiaires_actifs: beneficiairesApi.filter(b => b.entreprise_id === e.id && b.statut === 'actif').length,
    nb_beneficiaires_contrat: e.nb_licences || 0,
    date_debut_contrat: e.date_debut_contrat,
    date_fin_contrat: e.date_fin_contrat,
    renouvellement_auto: false,
    statut: e.statut || 'actif',
  }));
  const listeEntreprises = entreprisesNormalisees.filter(e => !rechercheP ||
    `${e.nom} ${e.secteur} ${e.responsable}`.toLowerCase().includes(rechercheP.toLowerCase()));

  const appPage  = listeApprenants.slice((pageApprenants  - 1) * PP_PROFILS, pageApprenants  * PP_PROFILS);
  const parPage  = listeParents.slice((pageParents     - 1) * PP_PROFILS, pageParents     * PP_PROFILS);
  const entPage2 = listeEntreprises.slice((pageEntreprises - 1) * PP_PROFILS, pageEntreprises * PP_PROFILS);

  return (
    <>
      {/* ══ VUE D'ENSEMBLE ══ */}
      {ongletActif === 'overview' && (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:16, marginBottom:24 }}>
            {[
              { l:'Tickets ouverts',  v:nbOuverts,  c:'#F59E0B', i:'🟡', sub:'à traiter' },
              { l:'En cours',         v:nbEnCours,  c:'#3B82F6', i:'🔵', sub:'en traitement' },
              { l:'Résolus',          v:nbResolus,  c:COULEURS.succes, i:'✅', sub:'ce mois' },
              { l:'Taux résolution',  v:`${tauxResol}%`, c:CC_COLOR, i:'📈', sub:'global' },
              { l:'Total tickets',    v:tickets.length, c:COULEURS.navy, i:'🎧', sub:'toutes sources' },
            ].map(k => (
              <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`4px solid ${k.c}`, boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{k.i}</div>
                <div style={{ fontSize:26, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 }}>{k.v}</div>
                <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
                <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Répartition canal + tickets urgents */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:20, marginBottom:24 }}>
            <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16 }}>📡 Répartition par canal</div>
              {parCanal.map(c => {
                const pct = tickets.length > 0 ? Math.round((c.nb / tickets.length) * 100) : 0;
                return (
                  <div key={c.canal} style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5 }}>
                      <span style={{ background:c.bg, color:c.txt, padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>{c.lib}</span>
                      <span style={{ fontWeight:700, color:COULEURS.navy }}>{c.nb} ticket{c.nb>1?'s':''} · {pct}%</span>
                    </div>
                    <div style={{ height:6, background:COULEURS.gris100, borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, borderRadius:3, background:c.txt, transition:'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🔴 Tickets urgents / ouverts</div>
              {tickets.filter(t => t.statut !== 'resolu').slice(0,5).map(t => {
                const pr = PRIO_CC[t.priorite] || PRIO_CC.normale;
                const ca = CANAL_CC[t.canal]   || CANAL_CC.email;
                return (
                  <div key={t.id} onClick={() => { setTicketDetail(t); navigate('/admin/support/tickets'); }}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${COULEURS.gris100}`, cursor:'pointer' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy, marginBottom:2 }}>{t.sujet}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris600 }}>{t.prenomC} {t.nomC} · {t.entreprise}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <span style={{ background:ca.bg, color:ca.txt, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600 }}>{ca.ic}</span>
                      <span style={{ background:pr.bg, color:pr.txt, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600 }}>{pr.lib}</span>
                    </div>
                  </div>
                );
              })}
              {tickets.filter(t => t.statut !== 'resolu').length === 0 && (
                <div style={{ textAlign:'center', padding:24, color:COULEURS.gris400, fontSize:13 }}>✅ Aucun ticket en attente</div>
              )}
            </div>
          </div>

          {/* Activité récente */}
          <div style={{ background:COULEURS.blanc, borderRadius:14, padding:20, border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16 }}>🕐 Activité récente</div>
            {tickets.slice(0,6).map((t, i) => {
              const st = STATUT_CC[t.statut];
              const ca = CANAL_CC[t.canal];
              return (
                <div key={t.id} style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'10px 0', borderBottom: i < 5 ? `1px solid ${COULEURS.gris100}` : 'none' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:`${CC_COLOR}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>{ca.ic}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy, marginBottom:2 }}>{t.sujet}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600 }}>{t.prenomC} {t.nomC} · {t.entreprise} · {t.dateCreation}</div>
                  </div>
                  <span style={{ background:st.bg, color:st.txt, padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:700, flexShrink:0 }}>{st.lib}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══ TICKETS ══ */}
      {ongletActif === 'tickets' && (
        <>
          {/* Filtres */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <input value={recherche} onChange={e => { setRecherche(e.target.value); setPageTickets(1); }}
              placeholder="🔍 Rechercher un ticket, contact, entreprise…"
              style={{ flex:1, minWidth:220, padding:'9px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy }} />
            {[['statut',filtreStatut,setFiltreStatut,[['tous','Tous statuts'],['ouvert','Ouvert'],['en_cours','En cours'],['resolu','Résolu']]],
              ['canal',filtreCanal,setFiltreCanal,[['tous','Tous canaux'],['email','Email'],['whatsapp','WhatsApp'],['chat','Chat']]],
              ['prio',filtrePriorite,setFiltrePriorite,[['tous','Toutes priorités'],['haute','Haute'],['normale','Normale'],['basse','Basse']]],
            ].map(([k,val,setter,opts]) => (
              <select key={k} value={val} onChange={e => { setter(e.target.value); setPageTickets(1); }}
                style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc }}>
                {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <span style={{ fontSize:12, color:COULEURS.gris600 }}>{listeTickets.length} ticket{listeTickets.length>1?'s':''}</span>
            <button onClick={() => setModalNouveauTicket(true)} style={{ marginLeft:'auto', background:CC_COLOR, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              + Nouveau ticket
            </button>
          </div>

          {/* Tableau */}
          <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'0.5fr 2fr 1fr 1.2fr 0.8fr 0.8fr 1.2fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              <span>ID</span><span>Sujet</span><span>Canal</span><span>Contact</span><span>Priorité</span><span>Date</span><span>Action</span>
            </div>
            {ticketsLoading && (
              <div style={{ padding:40, textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>Chargement des tickets…</div>
            )}
            {!ticketsLoading && listeTickets.length === 0 && (
              <div style={{ padding:40, textAlign:'center', color:COULEURS.gris400, fontSize:14 }}>Aucun ticket ne correspond aux filtres.</div>
            )}
            {ticketsPage.map(t => {
              const st = STATUT_CC[t.statut]  || STATUT_CC.ouvert;
              const pr = PRIO_CC[t.priorite]  || PRIO_CC.normale;
              const ca = CANAL_CC[t.canal]    || CANAL_CC.email;
              return (
                <div key={t.id} style={{ display:'grid', gridTemplateColumns:'0.5fr 2fr 1fr 1.2fr 0.8fr 0.8fr 1.2fr', padding:'13px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center' }}>
                  <span style={{ fontFamily:'monospace', fontSize:11, color:COULEURS.gris600 }}>#{t.id}</span>
                  <div>
                    <div style={{ fontWeight:600, color:COULEURS.navy, fontSize:13 }}>{t.sujet}</div>
                    <span style={{ background:st.bg, color:st.txt, padding:'1px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>{st.lib}</span>
                  </div>
                  <span style={{ background:ca.bg, color:ca.txt, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, width:'fit-content' }}>{ca.ic} {ca.lib}</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{t.prenomC} {t.nomC}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris400 }}>{t.entreprise}</div>
                  </div>
                  <span style={{ background:pr.bg, color:pr.txt, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, width:'fit-content' }}>{pr.lib}</span>
                  <span style={{ fontSize:11, color:COULEURS.gris600 }}>{t.dateCreation}</span>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button onClick={() => setTicketDetail(t)} style={{ background:'#EFF6FF', color:'#1D4ED8', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Voir</button>
                    {t.statut !== 'resolu' && (
                      <button onClick={() => { setModalReponse(t); setReponseText(''); }} style={{ background:CC_COLOR, color:'#fff', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Répondre</button>
                    )}
                    {t.statut !== 'resolu' && (
                      <button onClick={() => changerStatut(t, 'resolu')} style={{ background:COULEURS.succes, color:'#fff', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✓ Résoudre</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <PaginationSimple total={listeTickets.length} parPage={PP_TICKETS} page={pageTickets} onChange={setPageTickets} />

          {/* Modal détail ticket */}
          {ticketDetail && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100 }}>
              <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflowY:'auto' }}>
                <div style={{ background:`linear-gradient(135deg, ${CC_COLOR}CC, ${CC_COLOR})`, padding:'18px 24px', borderRadius:'18px 18px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>🎧 Ticket #{ticketDetail.id}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>{ticketDetail.sujet}</div>
                  </div>
                  <button onClick={() => setTicketDetail(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:30, height:30, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
                <div style={{ padding:24 }}>
                  {[['ID',`#${ticketDetail.id}`],['Statut',STATUT_CC[ticketDetail.statut]?.lib||ticketDetail.statut],['Priorité',PRIO_CC[ticketDetail.priorite]?.lib||ticketDetail.priorite],['Canal',CANAL_CC[ticketDetail.canal]?.lib||ticketDetail.canal],['Contact',`${ticketDetail.prenomC} ${ticketDetail.nomC}`],['Email',ticketDetail.emailC],['Apprenant',ticketDetail.apprenant],['Entreprise',ticketDetail.entreprise],['Date création',ticketDetail.dateCreation],['Date résolution',ticketDetail.dateResolution||'-']].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
                      <span style={{ color:COULEURS.gris600 }}>{l}</span>
                      <span style={{ fontWeight:600, color:COULEURS.navy }}>{v}</span>
                    </div>
                  ))}
                  {ticketDetail.description && (
                    <div style={{ marginTop:16, background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', marginBottom:6 }}>Description</div>
                      <div style={{ fontSize:13, color:COULEURS.navy, lineHeight:1.6 }}>{ticketDetail.description}</div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:10, marginTop:20 }}>
                    {ticketDetail.statut !== 'resolu' && (
                      <button onClick={() => { setModalReponse(ticketDetail); setTicketDetail(null); setReponseText(''); }} style={{ flex:1, background:CC_COLOR, color:'#fff', border:'none', borderRadius:8, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Répondre →
                      </button>
                    )}
                    {ticketDetail.statut !== 'resolu' && (
                      <button onClick={() => { changerStatut(ticketDetail,'resolu'); setTicketDetail(null); }} style={{ flex:1, background:COULEURS.succes, color:'#fff', border:'none', borderRadius:8, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        ✅ Marquer résolu
                      </button>
                    )}
                    <button onClick={() => setTicketDetail(null)} style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'10px 0', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal réponse */}
          {modalReponse && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }}>
              <div style={{ background:COULEURS.blanc, borderRadius:16, maxWidth:500, width:'92%', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
                <div style={{ background:`linear-gradient(135deg, ${CC_COLOR}CC, ${CC_COLOR})`, padding:'16px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{CANAL_CC[modalReponse.canal]?.ic} Répondre via {CANAL_CC[modalReponse.canal]?.lib}</div>
                  <button onClick={() => setModalReponse(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:28, height:28, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
                <div style={{ padding:24 }}>
                  <div style={{ fontSize:12, color:COULEURS.gris600, marginBottom:4 }}>À : <strong style={{ color:COULEURS.navy }}>{modalReponse.prenomC} {modalReponse.nomC}</strong> - {modalReponse.emailC}</div>
                  <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:12 }}>Ticket #{modalReponse.id} · {modalReponse.sujet}</div>
                  <textarea value={reponseText} onChange={e => setReponseText(e.target.value)} rows={5}
                    placeholder="Rédigez votre réponse ici…"
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, resize:'vertical', boxSizing:'border-box', outline:'none' }} />
                  <div style={{ display:'flex', gap:10, marginTop:14 }}>
                    <button onClick={envoyerReponse} style={{ flex:2, background:CC_COLOR, color:'#fff', border:'none', borderRadius:8, padding:'11px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      Envoyer la réponse →
                    </button>
                    <button onClick={() => setModalReponse(null)} style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'11px 0', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal nouveau ticket */}
          {modalNouveauTicket && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }}>
              <div style={{ background:COULEURS.blanc, borderRadius:16, maxWidth:560, width:'92%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
                <div style={{ background:`linear-gradient(135deg, ${CC_COLOR}CC, ${CC_COLOR})`, padding:'16px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>🎧 Nouveau ticket</div>
                  <button onClick={() => setModalNouveauTicket(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:28, height:28, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                </div>
                <div style={{ padding:24 }}>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Sujet *</div>
                    <input value={nouveauTicket.sujet} onChange={e => setNouveauTicket({ ...nouveauTicket, sujet:e.target.value })}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Canal</div>
                      <select value={nouveauTicket.canal} onChange={e => setNouveauTicket({ ...nouveauTicket, canal:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        <option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="chat">Chat</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Priorité</div>
                      <select value={nouveauTicket.priorite} onChange={e => setNouveauTicket({ ...nouveauTicket, priorite:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        <option value="basse">Basse</option><option value="normale">Normale</option><option value="haute">Haute</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Prénom contact</div>
                      <input value={nouveauTicket.contact_prenom} onChange={e => setNouveauTicket({ ...nouveauTicket, contact_prenom:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Nom contact</div>
                      <input value={nouveauTicket.contact_nom} onChange={e => setNouveauTicket({ ...nouveauTicket, contact_nom:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Email contact</div>
                    <input value={nouveauTicket.contact_email} onChange={e => setNouveauTicket({ ...nouveauTicket, contact_email:e.target.value })}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Apprenant concerné</div>
                      <input value={nouveauTicket.apprenant_nom} onChange={e => setNouveauTicket({ ...nouveauTicket, apprenant_nom:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Entreprise</div>
                      <input value={nouveauTicket.entreprise_nom} onChange={e => setNouveauTicket({ ...nouveauTicket, entreprise_nom:e.target.value })}
                        style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', boxSizing:'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:5 }}>Description</div>
                    <textarea value={nouveauTicket.description} onChange={e => setNouveauTicket({ ...nouveauTicket, description:e.target.value })} rows={4}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', resize:'vertical', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={creerTicket} disabled={!nouveauTicket.sujet.trim()} style={{ flex:2, background: nouveauTicket.sujet.trim() ? CC_COLOR : COULEURS.gris200, color:'#fff', border:'none', borderRadius:8, padding:'11px 0', fontSize:13, fontWeight:700, cursor: nouveauTicket.sujet.trim() ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      Créer le ticket →
                    </button>
                    <button onClick={() => setModalNouveauTicket(false)} style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'11px 0', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Annuler</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ PROFILS ══ */}
      {ongletActif === 'profils' && (
        <>
          {/* Toggle Apprenants / Parents / Entreprises */}
          <div style={{ display:'flex', gap:0, background:COULEURS.gris100, borderRadius:10, padding:4, marginBottom:20, width:'fit-content' }}>
            {[['apprenants','🎓 Apprenants', listeApprenants.length],['parents','👨‍👩‍👧 Parents', listeParents.length],['entreprises','🏢 Entreprises', listeEntreprises.length]].map(([id,lib,nb]) => (
              <button key={id} onClick={() => { setOngletProfil(id); setRechercheP(''); setProfilSelectionne(null); setPageApprenants(1); setPageParents(1); setPageEntreprises(1); }}
                style={{ padding:'9px 20px', borderRadius:8, border:'none', background:ongletProfil===id?COULEURS.blanc:'transparent', color:ongletProfil===id?COULEURS.navy:COULEURS.gris600, fontWeight:ongletProfil===id?700:500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', boxShadow:ongletProfil===id?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all 0.15s', display:'flex', alignItems:'center', gap:6 }}>
                {lib}
                <span style={{ background: ongletProfil===id ? `${CC_COLOR}20` : COULEURS.gris200, color: ongletProfil===id ? CC_COLOR : COULEURS.gris600, fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20 }}>{nb}</span>
              </button>
            ))}
          </div>

          <input value={rechercheP} onChange={e => { setRechercheP(e.target.value); setPageApprenants(1); setPageParents(1); setPageEntreprises(1); }}
            placeholder={ongletProfil==='apprenants' ? '🔍 Rechercher un apprenant, niveau…' : ongletProfil==='parents' ? '🔍 Rechercher un parent, email…' : '🔍 Rechercher une entreprise, secteur…'}
            style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, marginBottom:16, boxSizing:'border-box' }} />

          {/* ── Liste Apprenants ── */}
          {ongletProfil === 'apprenants' && (
            <div>
              {/* Filtres avancés */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
                {/* Type de cours */}
                <div style={{ display:'flex', gap:0, background:COULEURS.gris100, borderRadius:8, padding:3 }}>
                  {[['tous','Tous'],['entreprise','🏢 Entreprise'],['particulier','👤 Particulier']].map(([v,l]) => (
                    <button key={v} onClick={() => { setFiltreTypeApp(v); setPageApprenants(1); }}
                      style={{ padding:'5px 12px', borderRadius:6, border:'none', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', background:filtreTypeApp===v?COULEURS.blanc:'transparent', color:filtreTypeApp===v?CC_COLOR:COULEURS.gris600, fontWeight:filtreTypeApp===v?700:500, boxShadow:filtreTypeApp===v?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                      {l}
                    </button>
                  ))}
                </div>
                {/* Niveau CECR */}
                <select value={filtreNiveauApp} onChange={e => { setFiltreNiveauApp(e.target.value); setPageApprenants(1); }}
                  style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, cursor:'pointer' }}>
                  <option value="tous">🎯 Tous niveaux</option>
                  {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="">- Non testé</option>
                </select>
                {/* Statut */}
                <select value={filtreStatutApp} onChange={e => { setFiltreStatutApp(e.target.value); setPageApprenants(1); }}
                  style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, cursor:'pointer' }}>
                  <option value="tous">📋 Tous statuts</option>
                  <option value="actif">✅ Actif</option>
                  <option value="suspendu">🔒 Suspendu</option>
                </select>
                {/* Reset */}
                {(filtreTypeApp !== 'tous' || filtreNiveauApp !== 'tous' || filtreStatutApp !== 'tous') && (
                  <button onClick={() => { setFiltreTypeApp('tous'); setFiltreNiveauApp('tous'); setFiltreStatutApp('tous'); setPageApprenants(1); }}
                    style={{ padding:'6px 12px', borderRadius:8, border:`1.5px solid ${CC_COLOR}40`, background:`${CC_COLOR}10`, color:CC_COLOR, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    ✕ Réinitialiser
                  </button>
                )}
                <span style={{ marginLeft:'auto', fontSize:12, color:COULEURS.gris400 }}>{listeApprenants.length} apprenant{listeApprenants.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2.2fr 0.7fr 0.7fr 1.1fr 1fr 1fr 0.6fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  <span>Apprenant</span><span>Âge</span><span>Niveau</span><span>Type cours</span><span>Groupe / Client</span><span>Statut</span><span></span>
                </div>
                {listeApprenants.length === 0 && <div style={{ padding:32, textAlign:'center', color:COULEURS.gris400 }}>Aucun apprenant trouvé.</div>}
                {appPage.map(a => {
                  const niv = a.niveau_cecr;
                  const stB = STATUT_BEN[a.statut] || STATUT_BEN.en_attente;
                  const estParticulier = a.client_id === null;
                  const nomClient = estParticulier ? null : entreprisesApi.find(e => e.id === a.client_id)?.nom || a.groupe_id;
                  return (
                    <div key={a.id} onClick={() => setProfilSelectionne({ type:'apprenant', data:a })}
                      style={{ display:'grid', gridTemplateColumns:'2.2fr 0.7fr 0.7fr 1.1fr 1fr 1fr 0.6fr', padding:'13px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                      onMouseLeave={e => e.currentTarget.style.background = COULEURS.blanc}>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <div style={{ width:34, height:34, borderRadius:8, background: estParticulier ? '#F0FDF4' : `${CC_COLOR}15`, border:`2px solid ${estParticulier ? '#BBF7D0' : CC_COLOR+'30'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color: estParticulier ? '#15803D' : CC_COLOR, flexShrink:0 }}>
                          {a.prenom[0]}{a.nom[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, color:COULEURS.navy }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:10, color:COULEURS.gris400 }}>🎯 {a.points_gamif || 0} pts · {a.id}</div>
                        </div>
                      </div>
                      <span style={{ color:COULEURS.gris600 }}>{a.age ? `${a.age} ans` : '-'}</span>
                      <span style={{ background:niv ? (NIV_C[niv]||'#94A3B8') : COULEURS.gris200, color: niv ? '#fff' : COULEURS.gris600, padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, width:'fit-content' }}>{niv||'-'}</span>
                      <span style={{ background: estParticulier ? '#F0FDF4' : `${CC_COLOR}15`, color: estParticulier ? '#15803D' : CC_COLOR, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, width:'fit-content' }}>
                        {estParticulier ? '👤 Particulier' : '🏢 Entreprise'}
                      </span>
                      <span style={{ fontSize:11, color:COULEURS.gris600 }}>{nomClient || (a.groupe_id ? a.groupe_id : '-')}</span>
                      <span style={{ background:stB.bg, color:stB.txt, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, width:'fit-content' }}>{stB.lib}</span>
                      <span style={{ fontSize:12, color:CC_COLOR, fontWeight:600 }}>Voir →</span>
                    </div>
                  );
                })}
              </div>
              <PaginationSimple total={listeApprenants.length} parPage={PP_PROFILS} page={pageApprenants} onChange={setPageApprenants} />
            </div>
          )}

          {/* ── Liste Parents ── */}
          {ongletProfil === 'parents' && (
            <div>
              <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1.8fr 1.5fr 1fr 0.8fr 0.6fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  <span>Parent</span><span>Email</span><span>Apprenant lié</span><span>Entreprise</span><span>Statut</span><span></span>
                </div>
                {listeParents.length === 0 && <div style={{ padding:32, textAlign:'center', color:COULEURS.gris400 }}>Aucun parent trouvé.</div>}
                {parPage.map(p => (
                  <div key={p.id} onClick={() => setProfilSelectionne({ type:'parent', data:p })}
                    style={{ display:'grid', gridTemplateColumns:'2fr 1.8fr 1.5fr 1fr 0.8fr 0.6fr', padding:'13px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                    onMouseLeave={e => e.currentTarget.style.background = COULEURS.blanc}>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <div style={{ width:34, height:34, borderRadius:8, background:'#F0FDF4', border:'2px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#15803D', flexShrink:0 }}>
                        {p.prenomParent?.[0]}{p.nomParent?.[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight:700, color:COULEURS.navy }}>{p.prenomParent} {p.nomParent}</div>
                        <div style={{ fontSize:10, color:COULEURS.gris400 }}>{p.telParent || '-'}</div>
                      </div>
                    </div>
                    <span style={{ fontSize:12, color:COULEURS.gris600 }}>{p.emailParent}</span>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>{p.prenom} {p.nom}</span>
                    <span style={{ fontSize:11, color:COULEURS.gris600 }}>{p.entreprise}</span>
                    <span style={{ background:'#D1FAE5', color:'#065F46', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>✅ Actif</span>
                    <span style={{ fontSize:12, color:CC_COLOR, fontWeight:600 }}>Voir →</span>
                  </div>
                ))}
              </div>
              <PaginationSimple total={listeParents.length} parPage={PP_PROFILS} page={pageParents} onChange={setPageParents} />
            </div>
          )}

          {/* ── Liste Entreprises ── */}
          {ongletProfil === 'entreprises' && (
            <div>
              <div style={{ background:COULEURS.blanc, borderRadius:14, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1fr 1fr 1fr 1fr 0.6fr', padding:'10px 20px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  <span>Entreprise</span><span>Secteur</span><span>Responsable</span><span>Package</span><span>Bénéficiaires</span><span>Statut</span><span></span>
                </div>
                {listeEntreprises.length === 0 && <div style={{ padding:32, textAlign:'center', color:COULEURS.gris400 }}>Aucune entreprise trouvée.</div>}
                {entPage2.map(e => {
                  const stE = STATUT_ENT[e.statut] || STATUT_ENT.actif;
                  const ticketsEnt = tickets.filter(t => t.entreprise === e.nom);
                  return (
                    <div key={e.id} onClick={() => setProfilSelectionne({ type:'entreprise', data:e })}
                      style={{ display:'grid', gridTemplateColumns:'2.2fr 1.2fr 1fr 1fr 1fr 1fr 0.6fr', padding:'13px 20px', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13, alignItems:'center', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = COULEURS.gris50}
                      onMouseLeave={ev => ev.currentTarget.style.background = COULEURS.blanc}>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <div style={{ width:36, height:36, borderRadius:9, background:`${e.couleur}20`, border:`2px solid ${e.couleur}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:e.couleur, flexShrink:0 }}>
                          {e.initiales}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, color:COULEURS.navy }}>{e.nom}</div>
                          {ticketsEnt.filter(t=>t.statut!=='resolu').length > 0 && (
                            <div style={{ fontSize:10, color:'#991B1B' }}>⚠️ {ticketsEnt.filter(t=>t.statut!=='resolu').length} ticket{ticketsEnt.filter(t=>t.statut!=='resolu').length>1?'s':''} ouvert{ticketsEnt.filter(t=>t.statut!=='resolu').length>1?'s':''}</div>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize:12, color:COULEURS.gris600 }}>{e.secteur}</span>
                      <span style={{ fontSize:12, color:COULEURS.navy }}>{e.responsable}</span>
                      <span style={{ background:`${e.couleur}15`, color:e.couleur, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, width:'fit-content' }}>{e.package}</span>
                      <span style={{ fontWeight:700, color:COULEURS.navy }}>{e.nb_beneficiaires_actifs}<span style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400 }}>/{e.nb_beneficiaires_contrat}</span></span>
                      <span style={{ background:stE.bg, color:stE.txt, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, width:'fit-content' }}>{stE.lib}</span>
                      <span style={{ fontSize:12, color:CC_COLOR, fontWeight:600 }}>Voir →</span>
                    </div>
                  );
                })}
              </div>
              <PaginationSimple total={listeEntreprises.length} parPage={PP_PROFILS} page={pageEntreprises} onChange={setPageEntreprises} />
            </div>
          )}

          {/* ── Modal détail profil ── */}
          {profilSelectionne && (() => {
            const { type, data: d } = profilSelectionne;
            const ticketsLies = type === 'apprenant'
              ? tickets.filter(t => t.apprenant === `${d.prenom} ${d.nom}`)
              : type === 'parent'
              ? tickets.filter(t => t.prenomC === d.prenomParent && t.nomC === d.nomParent)
              : tickets.filter(t => t.entreprise === d.nom);

            const headerBg = type === 'apprenant'
              ? `linear-gradient(135deg, ${CC_COLOR}CC, ${CC_COLOR})`
              : type === 'parent'
              ? 'linear-gradient(135deg, #15803DCC, #15803D)'
              : `linear-gradient(135deg, ${d.couleur}CC, ${d.couleur})`;

            const initiales = type === 'apprenant'
              ? `${d.prenom[0]}${d.nom[0]}`
              : type === 'parent'
              ? `${d.prenomParent?.[0] || ''}${d.nomParent?.[0] || ''}`
              : d.initiales;

            const titreModal = type === 'apprenant'
              ? `🎓 ${d.prenom} ${d.nom}`
              : type === 'parent'
              ? `👨‍👩‍👧 ${d.prenomParent} ${d.nomParent}`
              : `🏢 ${d.nom}`;

            const infos = type === 'apprenant' ? [
              ['Prénom', d.prenom], ['Nom', d.nom],
              ['Âge', d.age ? `${d.age} ans` : '-'],
              ['Niveau CECR', d.niveau_cecr || '-'],
              ['Tranche', d.tranche_age || '-'],
              ['Groupe', d.groupe_id || '-'],
              ['Statut', STATUT_BEN[d.statut]?.lib || d.statut],
              ['Points gamif.', `🎯 ${d.points_gamif || 0} pts`],
              ['ID', d.id],
            ] : type === 'parent' ? [
              ['Prénom', d.prenomParent], ['Nom', d.nomParent],
              ['Email', d.emailParent],
              ['Téléphone', d.telParent || '-'],
              ['Apprenant lié', `${d.prenom} ${d.nom}`],
              ['Entreprise', d.entreprise],
              ['Canal', SOURCE_LIB[d.source]?.lib || d.source],
              ['Compte', '✅ Actif'],
            ] : [
              ['Nom', d.nom], ['Secteur', d.secteur],
              ['Responsable', d.responsable],
              ['Email contact', d.email_contact],
              ['Téléphone', d.telephone],
              ['Adresse', `${d.adresse}, ${d.ville}`],
              ['Package', d.package],
              ['Bénéficiaires', `${d.nb_beneficiaires_actifs} / ${d.nb_beneficiaires_contrat}`],
              ['Contrat début', d.date_debut_contrat],
              ['Contrat fin', d.date_fin_contrat],
              ['Renouvellement', d.renouvellement_auto ? '🔄 Auto' : 'Manuel'],
              ['Statut', STATUT_ENT[d.statut]?.lib || d.statut],
            ];

            return (
              <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, backdropFilter:'blur(2px)' }}>
                <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>

                  {/* Header */}
                  <div style={{ background:headerBg, padding:'20px 24px', flexShrink:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                        <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff' }}>
                          {initiales}
                        </div>
                        <div>
                          <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{titreModal}</div>
                          <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>
                            {type === 'apprenant' && (d.niveau_cecr ? `Niveau ${d.niveau_cecr}` : 'Niveau non évalué')}
                            {type === 'parent' && d.entreprise}
                            {type === 'entreprise' && `${d.secteur} · ${d.ville}`}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setProfilSelectionne(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                    </div>
                  </div>

                  {/* Corps scrollable */}
                  <div style={{ flex:1, overflowY:'auto', padding:24 }}>

                    {/* Infos */}
                    <div style={{ marginBottom:20 }}>
                      {infos.map(([l, v]) => (
                        <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
                          <span style={{ color:COULEURS.gris600, fontWeight:500 }}>{l}</span>
                          <span style={{ fontWeight:600, color:COULEURS.navy, textAlign:'right', maxWidth:'60%', wordBreak:'break-word' }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tickets liés */}
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>
                      🎧 Tickets liés ({ticketsLies.length})
                    </div>
                    {ticketsLies.length === 0 ? (
                      <div style={{ padding:'14px 16px', background:COULEURS.gris50, borderRadius:10, fontSize:13, color:COULEURS.gris400, textAlign:'center' }}>Aucun ticket associé</div>
                    ) : (
                      ticketsLies.map(t => {
                        const st = STATUT_CC[t.statut];
                        const ca = CANAL_CC[t.canal];
                        return (
                          <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:COULEURS.gris50, borderRadius:10, marginBottom:8, border:`1px solid ${COULEURS.gris200}` }}>
                            <div>
                              <div style={{ fontSize:12, fontWeight:600, color:COULEURS.navy }}>{t.sujet}</div>
                              <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>#{t.id} · {t.dateCreation} · {ca.ic} {ca.lib}</div>
                            </div>
                            <span style={{ background:st.bg, color:st.txt, padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, flexShrink:0 }}>{st.lib}</span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                    <div style={{ display:'flex', gap:8 }}>
                      {/* Bouton Chat - ouvre directement la messagerie */}
                      <button
                        onClick={() => {
                          const prenom = type === 'apprenant' ? d.prenom : type === 'parent' ? d.prenomParent : d.nom;
                          const nom2   = type === 'apprenant' ? d.nom    : type === 'parent' ? d.nomParent    : '';
                          const init   = `${prenom?.[0]||'?'}${nom2?.[0]||'?'}`;
                          const role2  = type === 'apprenant' ? 'apprenant' : type === 'parent' ? 'parent' : 'client_entreprise';
                          const id2    = type === 'apprenant' ? d.id : type === 'parent' ? `par-${d.id}` : d.id;
                          ouvrirOuCreerConversation({ id: id2, prenom, nom: nom2, role: role2, initiales: init });
                          setProfilSelectionne(null);
                          navigate('/admin/messages');
                        }}
                        style={{ background:CC_COLOR, color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:7 }}
                      >
                        💬 Message
                      </button>
                      {/* Bouton Email - ouvre le modal de composition */}
                      <button
                        onClick={() => {
                          const email = type === 'apprenant' ? genererEmailApprenant(d.prenom, d.nom) : type === 'parent' ? d.emailParent : d.email_contact;
                          const dest  = type === 'apprenant' ? `${d.prenom} ${d.nom}` : type === 'parent' ? `${d.prenomParent} ${d.nomParent}` : `${d.nom} - ${d.responsable}`;
                          const sujet = type === 'entreprise' ? `Contact BET - ${d.nom}` : `Message Customer Care - ${dest}`;
                          setModalMessage({ destinataire: dest, email, sujet });
                          setMessageTexte('');
                          setMessageSent(false);
                        }}
                        style={{ background:'#fff', color:COULEURS.navy, border:`1.5px solid ${COULEURS.gris200}`, borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:7 }}
                      >
                        📧 Email
                      </button>
                    </div>
                    <button onClick={() => setProfilSelectionne(null)} style={{ padding:'9px 22px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── Modal composition email ── */}
      {modalMessage && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, backdropFilter:'blur(2px)' }}>
          <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', boxShadow:'0 32px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>
            <div style={{ background:'linear-gradient(135deg, #2563EBCC, #1D4ED8)', padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>📧 Envoyer un email</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:2 }}>À : <strong>{modalMessage.destinataire}</strong></div>
              </div>
              <button onClick={() => setModalMessage(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, width:30, height:30, color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              {!messageSent ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:5 }}>Destinataire</div>
                      <div style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, color:COULEURS.navy, background:COULEURS.gris50 }}>{modalMessage.destinataire}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:5 }}>Adresse email</div>
                      <div style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:12, color:COULEURS.gris600, background:COULEURS.gris50, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{modalMessage.email}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:5 }}>Objet</div>
                    <div style={{ padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, color:COULEURS.navy, background:COULEURS.gris50 }}>{modalMessage.sujet}</div>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:5 }}>Corps du message *</div>
                    <textarea
                      value={messageTexte}
                      onChange={e => setMessageTexte(e.target.value)}
                      rows={5}
                      placeholder="Rédigez votre email ici…"
                      style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, resize:'vertical', boxSizing:'border-box', outline:'none', lineHeight:1.6 }}
                    />
                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                      📧 Sera envoyé à <strong>{modalMessage.email}</strong> depuis l'adresse Customer Care BET.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button
                      onClick={() => { if (messageTexte.trim()) setMessageSent(true); }}
                      disabled={!messageTexte.trim()}
                      style={{ flex:2, background: messageTexte.trim() ? '#1D4ED8' : COULEURS.gris200, color: messageTexte.trim() ? '#fff' : COULEURS.gris400, border:'none', borderRadius:9, padding:'11px 0', fontSize:13, fontWeight:700, cursor: messageTexte.trim() ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif', transition:'background 0.15s' }}
                    >
                      📧 Envoyer l'email →
                    </button>
                    <button onClick={() => setModalMessage(null)} style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:9, padding:'11px 0', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      Annuler
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📧</div>
                  <div style={{ fontSize:16, fontWeight:800, color:COULEURS.navy, marginBottom:6 }}>Email envoyé !</div>
                  <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:4 }}>Transmis à <strong>{modalMessage.email}</strong></div>
                  <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:24 }}>Objet : {modalMessage.sujet}</div>
                  <button onClick={() => setModalMessage(null)} style={{ background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'10px 24px', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>Fermer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ BLOCAGES ABSENCES ══ */}
      {ongletActif === 'blocages' && (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
            {[
              { i:'🚫', l:'Apprenants bloqués', v:apprenantsBloques.length, c:'#DC2626' },
              { i:'⚠️', l:'Seuil de blocage',   v:'4 absences',             c:'#7C3AED' },
            ].map(k => (
              <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}` }}>
                <div style={{ fontSize:22, marginBottom:5 }}>{k.i}</div>
                <div style={{ fontSize:22, fontWeight:800, color:k.c, lineHeight:1, marginBottom:3 }}>{k.v}</div>
                <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Règle affichée */}
          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontSize:20 }}>📌</span>
            <div style={{ fontSize:13, color:'#991B1B' }}>
              <strong>Règle de blocage automatique :</strong> Tout apprenant ayant atteint <strong>4 absences non justifiées</strong> est bloqué immédiatement par le système. Le Customer Care ou l'Onboarding peut débloquer après justification.
            </div>
          </div>

          {/* Liste des blocages */}
          <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14 }}>🚫 Apprenants bloqués ({apprenantsBloques.length})</div>

          {profilsLoading ? (
            <div style={{ textAlign:'center', padding:32, color:COULEURS.gris400 }}>Chargement…</div>
          ) : apprenantsBloques.length === 0 ? (
            <div style={{ background:COULEURS.gris50, borderRadius:12, padding:32, textAlign:'center', color:COULEURS.gris400, border:`1px dashed ${COULEURS.gris200}`, marginBottom:24 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
              <div style={{ fontWeight:600 }}>Aucun apprenant bloqué en ce moment</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
              {apprenantsBloques.map(a => {
                const parts  = (a.nom_complet || '').trim().split(' ');
                const prenom = parts[0] || a.nom_complet || '?';
                const nom    = parts.slice(1).join(' ') || '';
                const nbAbs  = absencesParId[a.id];
                return (
                  <div key={a.id} style={{ background:COULEURS.blanc, borderRadius:14, border:'2px solid #FECACA', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>
                        {prenom[0]}{nom[0] || ''}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>{prenom} {nom}</div>
                        <div style={{ fontSize:12, color:COULEURS.gris600 }}>
                          Niveau {a.niveau_cecr || a.niveau_classe || '-'} · {a.classe_nom || a.entreprise_nom || '-'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ background:'#FEE2E2', color:'#DC2626', fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20 }}>
                        🚫 {nbAbs !== undefined ? `${nbAbs} absences` : '…'}
                      </span>
                      <button
                        onClick={() => { setModalDeblocage(a); setMotifDeblocage(''); }}
                        style={{ background:'#DC2626', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                      >
                        Débloquer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal déblocage */}
          {modalDeblocage && (() => {
            const parts  = (modalDeblocage.nom_complet || '').trim().split(' ');
            const prenom = parts[0] || modalDeblocage.nom_complet || '?';
            const nom    = parts.slice(1).join(' ') || '';
            return (
            <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}
              onClick={() => setModalDeblocage(null)}>
              <div style={{ background:COULEURS.blanc, borderRadius:16, width:'92%', maxWidth:480, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ background:'linear-gradient(135deg,#DC2626,#B91C1C)', padding:'20px 24px', color:'#fff' }}>
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>🔓 Débloquer l'apprenant</div>
                  <div style={{ fontSize:13, opacity:0.85 }}>{prenom} {nom} - {absencesParId[modalDeblocage.id] ?? '…'} absences</div>
                </div>
                <div style={{ padding:24 }}>
                  <div style={{ background:'#FEF2F2', borderRadius:10, padding:14, marginBottom:18, fontSize:13, color:'#991B1B', border:'1px solid #FECACA' }}>
                    ⚠️ En débloquant cet apprenant, vous attestez avoir reçu et validé une justification valable pour ses absences.
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>Motif du déblocage / Justification reçue (optionnel)</div>
                    <textarea
                      value={motifDeblocage}
                      onChange={e => setMotifDeblocage(e.target.value)}
                      placeholder="Ex : Certificat médical fourni pour les 4 absences. Reprise autorisée."
                      style={{ width:'100%', minHeight:90, padding:'10px 12px', borderRadius:8, border:`1.5px solid ${motifDeblocage.trim() ? COULEURS.succes : COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }}
                    />
                  </div>

                  {/* ── Uploader PDF ── */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:8 }}>
                      📎 Justificatif PDF <span style={{ fontWeight:400, color:COULEURS.gris400 }}>(optionnel - max 5 Mo)</span>
                    </div>
                    {!fichierJustif ? (
                      <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'14px 20px', borderRadius:10, border:`2px dashed ${COULEURS.gris200}`, background:COULEURS.gris50, cursor:'pointer', transition:'border-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#0891B2'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = COULEURS.gris200}>
                        <span style={{ fontSize:22 }}>📄</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Cliquez pour sélectionner un PDF</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>Certificat médical, courrier, etc.</div>
                        </div>
                        <input type="file" accept="application/pdf" style={{ display:'none' }} onChange={selectionnerFichier} />
                      </label>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10, border:`1.5px solid #6EE7B7`, background:'#F0FDF4' }}>
                        <span style={{ fontSize:24 }}>📄</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#065F46', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fichierJustif.name}</div>
                          <div style={{ fontSize:11, color:'#059669', marginTop:2 }}>{fichierJustif.size} · PDF</div>
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <a href={fichierJustif.url} target="_blank" rel="noreferrer"
                            style={{ padding:'5px 10px', borderRadius:6, background:'#059669', color:'#fff', fontSize:11, fontWeight:700, textDecoration:'none' }}>
                            Voir
                          </a>
                          <button onClick={() => setFichierJustif(null)}
                            style={{ padding:'5px 10px', borderRadius:6, border:'none', background:'#FEE2E2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button onClick={() => setModalDeblocage(null)} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      Annuler
                    </button>
                    <button
                      onClick={debloquerApprenant}
                      disabled={deblocageLoad}
                      style={{ padding:'9px 20px', borderRadius:8, border:'none', background: deblocageLoad ? COULEURS.gris200 : '#059669', color:'#fff', cursor: deblocageLoad ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                      {deblocageLoad ? '⏳ Déblocage…' : '✅ Confirmer le déblocage'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}
        </>
      )}
    </>
  );
}

// ── Modal détail apprenant complet (PA Advisor) ──────────────────────────────

function ModalDetailApprenant({ apprenant, groupe, entreprise, onFermer, canCreateParent = false }) {
  const PAGE_SIZE = 10;

  const [tab,          setTab]         = useState('infos');
  const [noteInterne,  setNote]        = useState(apprenant.notes_internes || '');
  const [noteSauvee,   setNoteSauvee]  = useState(false);
  const [noteSaving,   setNoteSaving]  = useState(false);
  const [noteErr,      setNoteErr]     = useState('');

  // Parent account creation state
  const [parentAcces,       setParentAcces]       = useState(null);
  const [parentAccesLoading, setParentAccesLoading] = useState(false);
  const [parentAccesErr,    setParentAccesErr]    = useState('');

  // Edit mode for infos
  const [editMode,   setEditMode]   = useState(false);
  const [editForm,   setEditForm]   = useState({
    date_naissance:   apprenant.date_naissance   || '',
    profil_type:      apprenant.profil_type      || 'adulte',
    prenom_parent:    apprenant.prenom_parent    || '',
    nom_parent:       apprenant.nom_parent       || '',
    email_parent:     apprenant.email_parent     || '',
    telephone_parent: apprenant.telephone_parent || '',
    classe:           apprenant.classe           || '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editFlash,  setEditFlash]  = useState(null);
  const [localApp,   setLocalApp]   = useState(apprenant);

  // Données brutes
  const [presences,   setPresences]   = useState([]);
  const [loadPres,    setLoadPres]    = useState(false);
  const [seances,     setSeances]     = useState([]);
  const [loadSeances, setLoadSeances] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [loadEvals,   setLoadEvals]   = useState(false);

  // Filtres dates
  const [presDeb,  setPresDeb]  = useState('');
  const [presFin,  setPresFin]  = useState('');
  const [seaDeb,   setSeaDeb]   = useState('');
  const [seaFin,   setSeaFin]   = useState('');
  const [evalDeb,  setEvalDeb]  = useState('');
  const [evalFin,  setEvalFin]  = useState('');

  // Pages
  const [presPage,  setPresPage]  = useState(1);
  const [seaPage,   setSeaPage]   = useState(1);
  const [evalPage,  setEvalPage]  = useState(1);

  const inscriptionId = apprenant.id;
  const classeId      = groupe?.id || apprenant.classe_id;
  const niv           = apprenant.niveau_cecr;
  const nvc           = NIV_COULEUR[niv] || '#6366F1';

  const STATUT_CFG = {
    actif:               { bg:'#D1FAE5', txt:'#065F46', lib:'Actif' },
    suspendu:            { bg:'#FEE2E2', txt:'#991B1B', lib:'Suspendu' },
    bloque:              { bg:'#FEE2E2', txt:'#991B1B', lib:'Bloqué' },
    certifie:            { bg:'#EDE9FE', txt:'#5B21B6', lib:'Certifié' },
    en_attente:          { bg:'#FEF3C7', txt:'#92400E', lib:'En attente' },
    test_niveau_pending: { bg:'#F3E8FF', txt:'#6B21A8', lib:'Test en attente' },
  };
  const cfg = STATUT_CFG[apprenant.statut] || STATUT_CFG.en_attente;

  const ageApprenant = apprenant.date_naissance
    ? Math.floor((Date.now() - new Date(apprenant.date_naissance)) / (365.25*24*3600*1000))
    : null;
  const trancheApprenant = apprenant.profil_type && apprenant.profil_type !== 'adulte'
    ? apprenant.profil_type
    : (ageApprenant !== null ? (ageApprenant <= 12 ? 'enfant' : ageApprenant <= 17 ? 'adolescent' : 'adulte') : 'adulte');
  const hasParentData = localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent;
  const showParentTab = trancheApprenant === 'enfant' || trancheApprenant === 'adolescent';

  const TABS = [
    { id:'infos',       lib:'Infos',          icone:'👤' },
    ...(showParentTab ? [{ id:'parent', lib:'Parent', icone:'👨‍👩‍👧' }] : []),
    { id:'presences',   lib:'Présences',      icone:'✅' },
    { id:'sessions',    lib:'Sessions',       icone:'📅' },
    { id:'evaluations', lib:'Évaluations',    icone:'📊' },
    { id:'notes',       lib:'Notes internes', icone:'🗒️' },
  ];

  const TYPE_SEANCE    = { cours:'Cours', evaluation:'Évaluation', rattrapage:'Rattrapage', decouverte:'Découverte', presentiel:'Présentiel' };
  const STATUT_SEANCE  = { planifiee:{ c:'#0EA5E9', bg:'#EFF6FF' }, en_cours:{ c:'#F97316', bg:'#FFF7ED' }, terminee:{ c:'#059669', bg:'#D1FAE5' }, annulee:{ c:'#DC2626', bg:'#FEE2E2' } };
  const MENTION_C      = { Excellent:'#059669', Bien:'#0EA5E9', 'Assez Bien':'#6366F1', Passable:'#F59E0B', Insuffisant:'#EF4444' };

  // Charger le compte parent existant quand on ouvre l'onglet parent
  useEffect(() => {
    if (tab !== 'parent' || parentAcces || parentAccesLoading) return;
    const emailParent = localApp.email_parent;
    if (!emailParent) return;
    setParentAccesLoading(true);
    fetch(`${_API_URL_ADMIN}/api/apprenants/acces-parent?email=${encodeURIComponent(emailParent)}`, { headers: _authHdrsAdmin() })
      .then(r => r.json())
      .then(d => { if (d.existe) setParentAcces(d); })
      .catch(() => {})
      .finally(() => setParentAccesLoading(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'presences' || !inscriptionId) return;
    setLoadPres(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${inscriptionId}/presences`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setPresences(d.presences || []))
      .catch(() => setPresences([])).finally(() => setLoadPres(false));
  }, [tab, inscriptionId]);

  useEffect(() => {
    if (tab !== 'sessions' || !classeId) return;
    setLoadSeances(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/seances?classe_id=${classeId}`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setSeances(d.seances || []))
      .catch(() => setSeances([])).finally(() => setLoadSeances(false));
  }, [tab, classeId]);

  useEffect(() => {
    if (tab !== 'evaluations' || !inscriptionId) return;
    setLoadEvals(true);
    fetch(`${_API_URL_ADMIN}/api/elearning/apprenants/${inscriptionId}/evaluations`, { headers: _authHdrsAdmin() })
      .then(r => r.json()).then(d => setEvaluations(d.evaluations || []))
      .catch(() => setEvaluations([])).finally(() => setLoadEvals(false));
  }, [tab, inscriptionId]);

  // Helper filtrage par date
  function filterByDate(items, getDate, deb, fin) {
    return items.filter(item => {
      const d = getDate(item);
      if (!d) return true;
      const t = new Date(d).getTime();
      if (deb && t < new Date(deb).getTime()) return false;
      if (fin && t > new Date(fin + 'T23:59:59').getTime()) return false;
      return true;
    });
  }

  // Filtres appliqués (toujours sur les données complètes pour les stats)
  const presencesFiltrees  = filterByDate(presences,   p => p.seance?.date,      presDeb, presFin);
  const seancesFiltrees    = filterByDate(seances,     s => s.date,              seaDeb,  seaFin);
  const evaluationsFiltrees = filterByDate(evaluations, e => e.date_evaluation,   evalDeb, evalFin);

  // Pagination
  const paginate = (items, page) => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const presPage_items  = paginate(presencesFiltrees,   presPage);
  const seaPage_items   = paginate(seancesFiltrees,     seaPage);
  const evalPage_items  = paginate(evaluationsFiltrees, evalPage);

  // Stats globales (sans filtre de date)
  const nbPresent  = presences.filter(p => p.statut === 'present').length;
  const nbAbsent   = presences.filter(p => p.statut === 'absent').length;
  const tauxP      = presences.length > 0 ? Math.round(nbPresent / presences.length * 100) : null;
  const presenceParSeance = Object.fromEntries(presences.map(p => [p.seance_id, p.statut]));

  const nomComplet = apprenant.nom_complet || `${apprenant.prenom||''} ${apprenant.nom||''}`.trim() || '-';

  // Composants helpers inline
  const row = (l, v) => (
    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${COULEURS.gris100}`, fontSize:13 }}>
      <span style={{ color:COULEURS.gris600 }}>{l}</span>
      <span style={{ fontWeight:600, color:COULEURS.navy }}>{v || '-'}</span>
    </div>
  );

  const KpiBar = ({ items }) => (
    <div style={{ display:'flex', gap:12, marginBottom:16 }}>
      {items.map(k => (
        <div key={k.l} style={{ flex:1, background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${k.c}`, borderRadius:10, padding:'10px', textAlign:'center' }}>
          <div style={{ fontSize:19, fontWeight:800, color:k.c }}>{k.v}</div>
          <div style={{ fontSize:10, color:COULEURS.gris600, marginTop:2 }}>{k.l}</div>
        </div>
      ))}
    </div>
  );

  const FiltreDate = ({ deb, fin, setDeb, setFin, onReset, couleur }) => (
    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
      <span style={{ fontSize:12, fontWeight:600, color:COULEURS.gris600 }}>📅 Période :</span>
      <input type="date" value={deb} onChange={e => { setDeb(e.target.value); }}
        style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
      <span style={{ fontSize:12, color:COULEURS.gris400 }}>→</span>
      <input type="date" value={fin} onChange={e => { setFin(e.target.value); }}
        style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, fontSize:12, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy }} />
      {(deb || fin) && (
        <button onClick={onReset}
          style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:11, fontWeight:600, color:COULEURS.gris600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          ✕ Réinitialiser
        </button>
      )}
      {(deb || fin) && (
        <span style={{ fontSize:11, color:couleur, fontWeight:600, background:`${couleur}15`, padding:'4px 10px', borderRadius:20 }}>
          {presencesFiltrees.length !== presences.length || seancesFiltrees.length !== seances.length || evaluationsFiltrees.length !== evaluations.length
            ? 'Filtre actif' : 'Filtre actif'}
        </span>
      )}
    </div>
  );

  const Pagination = ({ total, page, setPage, couleur }) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, padding:'10px 14px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
        <span style={{ fontSize:12, color:COULEURS.gris500 }}>
          {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} sur {total}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => setPage(1)} disabled={page===1}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===1?'not-allowed':'pointer', color:page===1?COULEURS.gris300:COULEURS.gris600 }}>«</button>
          <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===1?'not-allowed':'pointer', color:page===1?COULEURS.gris300:COULEURS.gris600 }}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i+1).filter(p => Math.abs(p-page) <= 2).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${p===page ? couleur : COULEURS.gris200}`, background: p===page ? couleur : COULEURS.blanc, fontSize:12, cursor:'pointer', fontWeight: p===page ? 700 : 400, color: p===page ? '#fff' : COULEURS.gris600 }}>{p}</button>
          ))}
          <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===totalPages?'not-allowed':'pointer', color:page===totalPages?COULEURS.gris300:COULEURS.gris600 }}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page===totalPages}
            style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, cursor:page===totalPages?'not-allowed':'pointer', color:page===totalPages?COULEURS.gris300:COULEURS.gris600 }}>»</button>
        </div>
      </div>
    );
  };

  const Vide = ({ icone, texte, sous }) => (
    <div style={{ textAlign:'center', padding:'40px 20px', border:`2px dashed ${COULEURS.gris200}`, borderRadius:14, color:COULEURS.gris400 }}>
      <div style={{ fontSize:36, marginBottom:10 }}>{icone}</div>
      <div style={{ fontWeight:600, color:COULEURS.navy }}>{texte}</div>
      {sous && <div style={{ fontSize:12, marginTop:6 }}>{sous}</div>}
    </div>
  );

  const THead = ({ cols }) => (
    <div style={{ display:'grid', gridTemplateColumns:cols, padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {Array.isArray(cols) ? null : null}
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.70)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, backdropFilter:'blur(3px)', padding:'16px' }}
      onClick={onFermer}>
      <div style={{ background:COULEURS.blanc, borderRadius:18, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header gradient */}
        <div style={{ background:`linear-gradient(135deg,${nvc}DD,${nvc})`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:50, height:50, borderRadius:14, overflow:'hidden', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {(localApp.avatar_url || apprenant.avatar_url) ? (
                  <img src={localApp.avatar_url || apprenant.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                ) : nomComplet.split(' ').map(p=>p[0]||'').slice(0,2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{nomComplet}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
                  {groupe?.nom || '-'}{entreprise?.nom ? ` · ${entreprise.nom}` : ''}
                </div>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
          <div style={{ display:'flex', gap:24, marginTop:16, flexWrap:'wrap' }}>
            {[
              { l:'Niveau',      v: niv ? <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', padding:'2px 10px', borderRadius:6, fontSize:12, fontWeight:800 }}>{niv}</span> : '-' },
              { l:'Présence',    v: tauxP !== null ? `${tauxP}%` : '-' },
              { l:'Séances',     v: presences.length > 0 ? `${nbPresent}/${presences.length}` : '-' },
              { l:'Évaluations', v: evaluations.length > 0 ? evaluations.length : '-' },
              { l:'Statut',      v: <span style={{ background:cfg.bg, color:cfg.txt, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700 }}>{cfg.lib}</span> },
              { l:'Inscription', v: apprenant.date_inscription ? new Date(apprenant.date_inscription).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '-' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{s.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:COULEURS.blanc, borderBottom:`1px solid ${COULEURS.gris200}`, padding:'0 8px', flexShrink:0, overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:'11px 16px', border:'none', background:'transparent', borderBottom: tab===t.id ? `2.5px solid ${nvc}` : '2.5px solid transparent', color: tab===t.id ? nvc : COULEURS.gris600, fontWeight: tab===t.id ? 700 : 500, fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', transition:'all 0.15s' }}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>

          {/* ── INFOS ── */}
          {tab === 'infos' && (() => {
            const fmtDN = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : null;
            const age   = localApp.date_naissance ? Math.floor((Date.now() - new Date(localApp.date_naissance)) / (365.25*24*3600*1000)) : null;
            const hasParent = localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent;

            async function sauvegarderProfil() {
              if (editSaving) return;
              setEditSaving(true);
              setEditFlash(null);
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${apprenant.id}`, {
                  method: 'PATCH',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    date_naissance:   editForm.date_naissance   || null,
                    profil_type:      editForm.profil_type      || null,
                    prenom_parent:    editForm.prenom_parent    || null,
                    nom_parent:       editForm.nom_parent       || null,
                    email_parent:     editForm.email_parent     || null,
                    telephone_parent: editForm.telephone_parent || null,
                    classe:           editForm.classe           || null,
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Erreur serveur');
                setLocalApp(prev => ({ ...prev, ...d.apprenant }));
                setEditMode(false);
                setEditFlash({ ok: true, msg: '✅ Profil mis à jour.' });
                setTimeout(() => setEditFlash(null), 3500);
              } catch (e) {
                setEditFlash({ ok: false, msg: e.message });
              } finally {
                setEditSaving(false);
              }
            }

            const inpSt = { padding:'8px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', color:COULEURS.navy, width:'100%', boxSizing:'border-box' };
            const fld = (lbl, key, type = 'text') => (
              <div key={key} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{lbl}</label>
                <input type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inpSt} />
              </div>
            );

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* Bouton modifier / annuler */}
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                  {editFlash && (
                    <span style={{ fontSize:12, padding:'6px 14px', borderRadius:20, background: editFlash.ok ? '#D1FAE5' : '#FEE2E2', color: editFlash.ok ? '#065F46' : '#DC2626', fontWeight:600, display:'flex', alignItems:'center' }}>
                      {editFlash.msg}
                    </span>
                  )}
                  {editMode ? (
                    <>
                      <button onClick={() => { setEditMode(false); setEditFlash(null); }}
                        style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, fontSize:12, fontWeight:600, cursor:'pointer', color:COULEURS.gris600, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        Annuler
                      </button>
                      <button onClick={sauvegarderProfil} disabled={editSaving}
                        style={{ padding:'7px 16px', borderRadius:8, border:'none', background:nvc, fontSize:12, fontWeight:700, cursor:'pointer', color:'#fff', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                        {editSaving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditMode(true)}
                      style={{ padding:'7px 16px', borderRadius:8, border:`1px solid ${nvc}`, background:COULEURS.blanc, fontSize:12, fontWeight:700, cursor:'pointer', color:nvc, fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                      ✏️ Modifier
                    </button>
                  )}
                </div>

                {editMode ? (
                  /* ── Formulaire d'édition ── */
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👤 Informations personnelles</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                        {fld('Date de naissance', 'date_naissance', 'date')}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Profil</label>
                          <select value={editForm.profil_type} onChange={e => setEditForm(f => ({ ...f, profil_type: e.target.value }))} style={inpSt}>
                            <option value="adulte">🧑 Adulte</option>
                            <option value="adolescent">🧑 Adolescent (13–17 ans)</option>
                            <option value="enfant">🧒 Enfant (≤ 12 ans)</option>
                          </select>
                        </div>
                        {fld('Classe scolaire (ex: CM1, 6ème…)', 'classe')}
                      </div>
                    </div>
                    <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#0369A1', marginBottom:16, paddingBottom:8, borderBottom:'1px solid #BAE6FD' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                        {fld('Prénom parent', 'prenom_parent')}
                        {fld('Nom parent', 'nom_parent')}
                        {fld('Email parent', 'email_parent', 'email')}
                        {fld('Téléphone parent', 'telephone_parent', 'tel')}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Vue lecture ── */
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>👤 Informations</div>
                        {row('Nom complet',        nomComplet)}
                        {row('Email',              localApp.email)}
                        {row('Téléphone',          localApp.telephone)}
                        {row('Date de naissance',  fmtDN(localApp.date_naissance))}
                        {age !== null && row('Âge', `${age} ans`)}
                        {row('Date inscription',   localApp.date_inscription ? new Date(localApp.date_inscription).toLocaleDateString('fr-FR') : null)}
                      </div>
                      <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${COULEURS.gris100}` }}>🎓 Scolarité</div>
                        {row('Niveau CECR',    niv || 'Non évalué')}
                        {row('Statut',         cfg.lib)}
                        {row('Classe e-learn', groupe?.nom)}
                        {localApp.classe && row('Classe scolaire', localApp.classe)}
                        {row('Entreprise',     entreprise?.nom)}
                        {row('Compte créé',    localApp.apprenant_id ? '✅ Oui' : '⏳ Non')}
                        {localApp.profil_type && localApp.profil_type !== 'adulte' && row('Profil', localApp.profil_type === 'enfant' ? '🧒 Enfant' : '🧑 Ado')}
                      </div>
                    </div>
                    {hasParent && (
                      <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'18px 22px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0369A1', marginBottom:12, paddingBottom:8, borderBottom:'1px solid #BAE6FD' }}>👨‍👩‍👧 Contact parent / tuteur</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                          {[
                            ['Prénom parent',  localApp.prenom_parent],
                            ['Nom parent',     localApp.nom_parent],
                            ['Email parent',   localApp.email_parent],
                            ['Tél. parent',    localApp.telephone_parent],
                          ].map(([l, v]) => v ? (
                            <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #E0F2FE', fontSize:13 }}>
                              <span style={{ color:'#0369A1' }}>{l}</span>
                              <span style={{ fontWeight:600, color:COULEURS.navy }}>{v}</span>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── PARENT ── */}
          {tab === 'parent' && (() => {
            async function creerAccesParent() {
              if (parentAccesLoading) return;
              if (!localApp.email_parent && !localApp.telephone_parent) {
                setParentAccesErr('Aucun email ni téléphone parent disponible. Ajoutez-les d\'abord dans l\'onglet Infos.');
                return;
              }
              setParentAccesLoading(true);
              setParentAccesErr('');
              try {
                const r = await fetch(`${_API_URL_ADMIN}/api/apprenants/creer-acces-parent`, {
                  method: 'POST',
                  headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prenom_parent: localApp.prenom_parent,
                    nom_parent:    localApp.nom_parent,
                    email_parent:  localApp.email_parent,
                    telephone_parent: localApp.telephone_parent,
                    inscription_id: apprenant.id,
                    enfant_nom: apprenant.nom_complet,
                  }),
                });
                const d = await r.json();
                if (!r.ok) { setParentAccesErr(d.error || 'Erreur serveur'); return; }
                setParentAcces(d);
              } catch (e) {
                setParentAccesErr(e.message);
              } finally {
                setParentAccesLoading(false);
              }
            }

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {/* Infos parent */}
                <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:14, padding:'20px 24px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#0369A1', marginBottom:14, paddingBottom:10, borderBottom:'1px solid #BAE6FD', display:'flex', alignItems:'center', gap:8 }}>
                    👨‍👩‍👧 Contact parent / tuteur
                  </div>
                  {(localApp.email_parent || localApp.prenom_parent || localApp.nom_parent || localApp.telephone_parent) ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[
                        ['Prénom', localApp.prenom_parent],
                        ['Nom',    localApp.nom_parent],
                        ['Email',  localApp.email_parent],
                        ['Tél.',   localApp.telephone_parent],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background:COULEURS.blanc, border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#0369A1', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:14, fontWeight:600, color:COULEURS.navy }}>{v || '-'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'20px', color:COULEURS.gris400, fontSize:13 }}>
                      Aucune information parent enregistrée pour cet apprenant.
                    </div>
                  )}
                </div>

                {/* Accès parent - réservé à l'Onboarding */}
                {canCreateParent && (
                  <div style={{ background:COULEURS.blanc, border:`1px solid ${COULEURS.gris200}`, borderRadius:14, padding:'20px 24px' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${COULEURS.gris100}` }}>
                      🔐 Créer un accès Dashboard Parent
                    </div>

                    {parentAccesLoading ? (
                      <div style={{ textAlign:'center', padding:'16px', color:COULEURS.gris400, fontSize:13 }}>⏳ Vérification du compte parent…</div>
                    ) : parentAcces ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'16px 20px' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#166534', marginBottom:10 }}>✅ Accès parent actif</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {[
                            ['Identifiant', parentAcces.login_email],
                            parentAcces.mdp_initial ? ['Mot de passe temporaire', parentAcces.mdp_initial] : null,
                          ].filter(Boolean).map(([l, v]) => (
                            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #BBF7D0' }}>
                              <span style={{ color:'#166534' }}>{l}</span>
                              <span style={{ fontWeight:700, color:COULEURS.navy, fontFamily:'monospace' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize:11, color:'#166534', marginTop:10 }}>
                          {parentAcces.mdp_initial
                            ? 'Le parent devra changer son mot de passe à la première connexion sur le portail parent.'
                            : '✅ Le parent a déjà changé son mot de passe temporaire - compte actif.'}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:14, lineHeight:'1.6' }}>
                          Crée un compte pour que le parent puisse suivre la progression de son enfant sur le portail parent BET E-Learning.
                          {!(localApp.email_parent || localApp.telephone_parent) && (
                            <span style={{ display:'block', marginTop:6, color:'#DC2626', fontWeight:600 }}>
                              ⚠️ Aucune coordonnée parent renseignée - allez dans l'onglet Infos pour les ajouter d'abord.
                            </span>
                          )}
                        </div>
                        {parentAccesErr && (
                          <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#DC2626', marginBottom:12 }}>
                            {parentAccesErr}
                          </div>
                        )}
                        {(() => {
                          const canCreate = !!(localApp.email_parent || localApp.telephone_parent);
                          return (
                            <button
                              onClick={creerAccesParent}
                              disabled={parentAccesLoading || !canCreate}
                              style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 20px', borderRadius:10, border:'none', background: canCreate ? nvc : COULEURS.gris200, color: canCreate ? '#fff' : COULEURS.gris400, fontWeight:700, fontSize:13, cursor: canCreate ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans",sans-serif' }}
                            >
                              {parentAccesLoading ? '⏳ Création en cours…' : '🔑 Créer accès parent'}
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Message informatif côté PA Advisor (pas de création) */}
                {!canCreateParent && (
                  <div style={{ background:COULEURS.gris50, border:`1px solid ${COULEURS.gris200}`, borderRadius:12, padding:'14px 18px', fontSize:12, color:COULEURS.gris500, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>ℹ️</span>
                    La création des accès parents est gérée par l'équipe Onboarding.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── PRÉSENCES ── */}
          {tab === 'presences' && (
            loadPres ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des présences…</div>
            ) : (
              <>
                <KpiBar items={[
                  { l:'Présent', v:nbPresent,        c:COULEURS.succes },
                  { l:'Absent',  v:nbAbsent,         c:'#EF4444' },
                  { l:'Total',   v:presences.length, c:COULEURS.navy },
                  { l:'Taux',    v: tauxP !== null ? `${tauxP}%` : '-', c: tauxP === null ? COULEURS.gris400 : tauxP >= 80 ? COULEURS.succes : tauxP >= 60 ? '#F59E0B' : '#EF4444' },
                ]} />
                <FiltreDate deb={presDeb} fin={presFin} setDeb={v=>{ setPresDeb(v); setPresPage(1); }} setFin={v=>{ setPresFin(v); setPresPage(1); }} onReset={()=>{ setPresDeb(''); setPresFin(''); setPresPage(1); }} couleur={nvc} />
                {presencesFiltrees.length === 0 ? (
                  <Vide icone="📋" texte="Aucune présence" sous={presDeb||presFin ? 'Aucun résultat pour cette période.' : 'Les présences sont saisies par le coach lors des séances.'} />
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Date</span><span>Objectifs / Session</span><span>Horaire</span><span>Type</span><span>Statut</span>
                      </div>
                      {presPage_items.map((p, i) => {
                        const est    = p.statut === 'present';
                        const seance = p.seance || {};
                        const dateStr = seance.date ? new Date(seance.date).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }) : '-';
                        const horaire = seance.heure_debut ? `${seance.heure_debut}–${seance.heure_fin||''}` : '-';
                        return (
                          <div key={p.id||i} style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'10px 16px', borderBottom: i < presPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center' }}>
                            <span style={{ color:COULEURS.navy, fontWeight:600 }}>{dateStr}</span>
                            <span style={{ color:COULEURS.gris600 }}>{seance.objectifs_session || '-'}</span>
                            <span style={{ color:COULEURS.gris500 }}>{horaire}</span>
                            <span style={{ color:COULEURS.gris500 }}>{TYPE_SEANCE[seance.type] || seance.type || '-'}</span>
                            <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:est?'#D1FAE5':'#FEE2E2', color:est?'#065F46':'#991B1B', display:'inline-block' }}>
                              {est ? '✓ Présent' : '✗ Absent'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination total={presencesFiltrees.length} page={presPage} setPage={setPresPage} couleur={nvc} />
                  </>
                )}
              </>
            )
          )}

          {/* ── SESSIONS ── */}
          {tab === 'sessions' && (
            loadSeances ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des sessions…</div>
            ) : (
              <>
                <KpiBar items={[
                  { l:'Total séances', v: seances.length,                                    c:COULEURS.navy },
                  { l:'Terminées',     v: seances.filter(s=>s.statut==='terminee').length,   c:'#059669' },
                  { l:'Planifiées',    v: seances.filter(s=>s.statut==='planifiee').length,  c:'#0EA5E9' },
                  { l:'Ma présence',   v: `${nbPresent}/${presences.length}`,                c:nvc },
                ]} />
                <FiltreDate deb={seaDeb} fin={seaFin} setDeb={v=>{ setSeaDeb(v); setSeaPage(1); }} setFin={v=>{ setSeaFin(v); setSeaPage(1); }} onReset={()=>{ setSeaDeb(''); setSeaFin(''); setSeaPage(1); }} couleur={nvc} />
                {seancesFiltrees.length === 0 ? (
                  <Vide icone="📅" texte="Aucune session" sous={seaDeb||seaFin ? 'Aucun résultat pour cette période.' : 'Aucune session planifiée dans cette classe.'} />
                ) : (
                  <>
                    <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        <span>Date</span><span>Objectifs</span><span>Horaire</span><span>Type</span><span>Présence</span>
                      </div>
                      {seaPage_items.map((s, i) => {
                        const sts = STATUT_SEANCE[s.statut] || { c:COULEURS.gris400, bg:COULEURS.gris50 };
                        const presenceSt = presenceParSeance[s.id];
                        const dateStr = s.date ? new Date(s.date).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' }) : '-';
                        return (
                          <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1.5fr 2fr 1fr 1fr 1fr', padding:'10px 16px', borderBottom: i < seaPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: presenceSt === 'absent' ? '#FFF5F5' : 'transparent' }}>
                            <span style={{ color:COULEURS.navy, fontWeight:600 }}>{dateStr}</span>
                            <span style={{ color:COULEURS.gris600 }}>{s.objectifs_session || '-'}</span>
                            <span style={{ color:COULEURS.gris500 }}>{s.heure_debut ? `${s.heure_debut}–${s.heure_fin||''}` : '-'}</span>
                            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:sts.bg, color:sts.c, display:'inline-block' }}>{TYPE_SEANCE[s.type] || s.type || '-'}</span>
                            <span>
                              {!presenceSt
                                ? <span style={{ color:COULEURS.gris400, fontSize:11 }}>-</span>
                                : presenceSt === 'present'
                                  ? <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:'#D1FAE5', color:'#065F46' }}>✓ Présent</span>
                                  : <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:'#FEE2E2', color:'#991B1B' }}>✗ Absent</span>
                              }
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination total={seancesFiltrees.length} page={seaPage} setPage={setSeaPage} couleur={nvc} />
                  </>
                )}
              </>
            )
          )}

          {/* ── ÉVALUATIONS ── */}
          {tab === 'evaluations' && (
            loadEvals ? (
              <div style={{ textAlign:'center', padding:48, color:COULEURS.gris400 }}>⏳ Chargement des évaluations…</div>
            ) : (() => {
              const avecNote = evaluations.filter(e => e.note != null);
              const moy = avecNote.length > 0 ? avecNote.reduce((acc, e) => acc + (e.note / (e.note_max || 20)) * 100, 0) / avecNote.length : 0;
              return (
                <>
                  <KpiBar items={[
                    { l:'Total',      v: evaluations.length,                                  c:COULEURS.navy },
                    { l:'Moyenne',    v: avecNote.length > 0 ? `${moy.toFixed(0)}%` : '-',   c: moy >= 75 ? '#059669' : moy >= 50 ? '#F59E0B' : '#EF4444' },
                    { l:'Manuelles',  v: evaluations.filter(e=>e.source==='manuel').length,   c:'#6366F1' },
                    { l:'Devoirs',    v: evaluations.filter(e=>e.source==='devoir').length,   c:'#0EA5E9' },
                  ]} />
                  <FiltreDate deb={evalDeb} fin={evalFin} setDeb={v=>{ setEvalDeb(v); setEvalPage(1); }} setFin={v=>{ setEvalFin(v); setEvalPage(1); }} onReset={()=>{ setEvalDeb(''); setEvalFin(''); setEvalPage(1); }} couleur={nvc} />
                  {evaluationsFiltrees.length === 0 ? (
                    <Vide icone="📊" texte="Aucune évaluation" sous={evalDeb||evalFin ? 'Aucun résultat pour cette période.' : 'Les notes manuelles et devoirs corrigés apparaîtront ici.'} />
                  ) : (
                    <>
                      <div style={{ background:COULEURS.blanc, borderRadius:10, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 2fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                          <span>Titre</span><span>Note</span><span>Mention</span><span>Source</span><span>Commentaire</span>
                        </div>
                        {evalPage_items.map((e, i) => {
                          const pct = e.note != null ? Math.round((e.note / (e.note_max || 20)) * 100) : null;
                          const mc  = MENTION_C[e.mention] || COULEURS.gris400;
                          const dateStr = e.date_evaluation ? new Date(e.date_evaluation).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) : '';
                          return (
                            <div key={e.id||i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 2fr', padding:'10px 16px', borderBottom: i < evalPage_items.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center' }}>
                              <div>
                                <div style={{ fontWeight:600, color:COULEURS.navy }}>{e.titre || '-'}</div>
                                {dateStr && <div style={{ fontSize:11, color:COULEURS.gris400 }}>{dateStr}</div>}
                              </div>
                              <span style={{ fontWeight:800, color: pct==null?COULEURS.gris400:pct>=75?'#059669':pct>=50?'#F59E0B':'#EF4444' }}>
                                {e.note != null ? `${e.note}/${e.note_max||20}` : '-'}
                              </span>
                              <span>
                                {e.mention ? <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:`${mc}18`, color:mc }}>{e.mention}</span> : '-'}
                              </span>
                              <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background:e.source==='devoir'?'#EFF6FF':'#EDE9FE', color:e.source==='devoir'?'#1D4ED8':'#5B21B6' }}>
                                {e.source === 'devoir' ? 'Devoir' : 'Manuel'}
                              </span>
                              <span style={{ fontSize:11, color:COULEURS.gris600 }}>{e.commentaire_coach || '-'}</span>
                            </div>
                          );
                        })}
                      </div>
                      <Pagination total={evaluationsFiltrees.length} page={evalPage} setPage={setEvalPage} couleur={nvc} />
                    </>
                  )}
                </>
              );
            })()
          )}

          {/* ── NOTES INTERNES ── */}
          {tab === 'notes' && (
            <>
              <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'12px 16px', marginBottom:20, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16 }}>🔒</span>
                <div style={{ fontSize:12, color:'#92400E' }}>Ces notes sont visibles uniquement par les PA Advisors et administrateurs. Elles ne sont pas communiquées à l'apprenant.</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>Ajouter une note</div>
              <textarea
                value={noteInterne}
                onChange={e => { setNote(e.target.value); setNoteSauvee(false); setNoteErr(''); }}
                placeholder={`Observations sur ${nomComplet}, recommandations pédagogiques, points d'attention...`}
                rows={6}
                style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans",sans-serif', outline:'none', resize:'vertical', boxSizing:'border-box', color:COULEURS.navy, lineHeight:1.6 }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10, marginTop:10 }}>
                {noteErr && <span style={{ fontSize:12, color:'#DC2626', fontWeight:600 }}>{noteErr}</span>}
                <button
                  disabled={noteSaving}
                  onClick={async () => {
                    setNoteSaving(true);
                    setNoteErr('');
                    try {
                      const r = await fetch(`${_API_URL_ADMIN}/api/classes-elearning/apprenants/${apprenant.id}`, {
                        method: 'PATCH',
                        headers: { ..._authHdrsAdmin(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes_internes: noteInterne }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error || 'Erreur serveur');
                      setLocalApp(prev => ({ ...prev, notes_internes: noteInterne }));
                      setNoteSauvee(true);
                    } catch (e) {
                      setNoteErr(e.message);
                    } finally {
                      setNoteSaving(false);
                    }
                  }}
                  style={{ padding:'9px 22px', borderRadius:9, border:'none', background: noteSauvee ? COULEURS.succes : nvc, color:'#fff', cursor: noteSaving ? 'default' : 'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:13, fontWeight:700, transition:'background 0.2s' }}>
                  {noteSaving ? '⏳ Enregistrement…' : noteSauvee ? '✓ Sauvegardé' : '💾 Sauvegarder'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Mapping entreprise.id → client_id utilisé dans MOCK_GROUPES / MOCK_APPRENANTS
const ENT_TO_CLIENT = {
  'ent-001': 'tlg-001',
  'ent-002': 'oc-001',
  'ent-003': 'sg-001',
  'ent-004': 'ca-001',
  'ent-005': 'nsia-001',
};

// ── Dashboard PA Advisor ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ONGLET COACHS PA ADVISOR - standalone (route /admin/pa-advisor/coachs)
// ─────────────────────────────────────────────────────────────────────────────
