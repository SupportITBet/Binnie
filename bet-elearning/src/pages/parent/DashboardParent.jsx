import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';
import { urlOuvrir, urlTelecharger } from '../../utils/fichierUrl';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { supabase } from '../../services/supabase';
import SalleVirtuelle from '../../components/shared/SalleVirtuelle';
import { MODE_DEV } from '../../utils/genererSalleVirtuelle';
import { useTheme } from '../../contexts/ThemeContext';

/* OUVERTURE DE LA SALLE VIRTUELLE - le même délai pour le coach, l'apprenant et le parent.
   Il vivait en clair dans chaque écran (`15*60*1000`), ce qui obligeait à le retrouver à la
   main dans quatre fichiers pour le changer d'une minute : nommé ici, il se relit et se
   corrige d'un seul endroit par application. */
const MINUTES_OUVERTURE_SALLE = 10;
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const authHdrsParent = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('bet_access_token') || ''}`, 'X-Plateforme': 'bet-elearning' });

// ── Mapping URL → section ────────────────────────────────────────────────────
const CHEMIN_SECTION = {
  '/parent/dashboard':       'dashboard',
  '/parent/cours':           'cours',
  '/parent/bilan':           'bilan',
  '/parent/suivi':           'bilan',
  '/parent/rapport-mensuel': 'bilan',
  '/parent/bulletins':       'bilan',
  '/parent/presences':       'presences',
  '/parent/devoirs':         'devoirs',
  '/parent/communication':   'communication',
  '/parent/evaluation':      'evaluation',
  '/parent/profil':          'profil',
  '/parent/support':         'support',
  '/parent/live':            'live',
};


// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Puce({ label, fond, texte }) {
  return (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:fond, color:texte, fontSize:11, fontWeight:700 }}>
      {label}
    </span>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function DashboardParent() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const { profile, activer2FA } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  const section = CHEMIN_SECTION[location.pathname] || 'dashboard';

  const [enfants, setEnfants]         = useState([]);
  const [enfantActif, setEnfantActif] = useState(null);
  const [evalForm, setEvalForm]       = useState({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:'' });
  const [evalEnvoye, setEvalEnvoye]   = useState(false);
  const [evaluations,   setEvaluations]   = useState([]);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalSaving,    setEvalSaving]    = useState(false);
  const [ticketForm, setTicketForm]   = useState({ sujet:'', message:'' });
  const [ticketEnvoye, setTicketEnvoye] = useState(false);
  const [ticketEnvoi, setTicketEnvoi] = useState(false);
  const [ticketErreur, setTicketErreur] = useState('');
  const [mesTickets, setMesTickets]   = useState([]);
  const [profil, setProfil]           = useState({ telephone_urgence:'', email_urgence:'', photo:null });
  const [absenceJustif, setAbsenceJustif] = useState({});
  const [msgProf, setMsgProf]         = useState('');
  const [msgEnvoye, setMsgEnvoye]     = useState(false);
  // ── Live ──
  const [sessionRejointe, setSessionRejointe] = useState(null);
  const [presentielInfoModal, setPresentielInfoModal] = useState(null);
  const [sessionDetail,   setSessionDetail]   = useState(null);
  const [coursOuvertLive, setCoursOuvertLive] = useState(null);
  const [reponsesQuizLive, setReponsesQuizLive] = useState({});
  const [quizSoumisLive,  setQuizSoumisLive]  = useState({});
  const [terminesLive,    setTerminesLive]     = useState({});
  // ── Données réelles ──
  const [notes,     setNotes]     = useState([]);
  const [presences, setPresences] = useState([]);
  const [devoirs,   setDevoirs]   = useState([]);
  const [seances,   setSeances]   = useState([]);
  const [cours,     setCours]     = useState([]);
  // ── Panneau cours ──
  const [coursOuvert, setCoursOuvert] = useState(null); // contenu sélectionné
  // ── Sous-onglet Bilan ──
  const [ssBilan,   setSsBilan]   = useState('suivi');

  useEffect(() => {
    if (!profile?.email || !supabase) return;
    (async () => {
      // Étape 1 : récupérer les inscriptions liées à l'email parent
      const { data: apps, error: appsErr } = await supabase
        .from('classes_elearning_apprenants')
        .select('*')
        .eq('email_parent', profile.email.toLowerCase().trim())
        .neq('statut', 'suspendu');

      if (appsErr) {
        console.error('[DashboardParent] erreur chargement enfants:', appsErr.message);
        return;
      }

      const rows = apps || [];

      // Étape 2 : noms des classes (id + nom uniquement - niveau_cecr n'est pas dans classes_elearning)
      const classeIds = [...new Set(rows.map(a => a.classe_id).filter(Boolean))];
      let classesMap = {};
      if (classeIds.length > 0) {
        const { data: classes, error: clErr } = await supabase
          .from('classes_elearning')
          .select('id, nom, coach_nom')
          .in('id', classeIds);
        if (clErr) console.warn('[DashboardParent] classes_elearning:', clErr.message);
        (classes || []).forEach(c => { classesMap[c.id] = c; });

      }

      // Étape 3 : photo de profil - classes_elearning_apprenants n'a pas de colonne avatar_url,
      // elle vit sur utilisateurs (une fois le compte de l'enfant créé). Best-effort : si la
      // policy RLS bloque cette lecture, on retombe simplement sur les initiales.
      const apprenantIds = [...new Set(rows.map(a => a.apprenant_id).filter(Boolean))];
      let avatarsMap = {};
      let accesMap = {};
      if (apprenantIds.length > 0) {
        const { data: comptes } = await supabase.from('utilisateurs').select('id, avatar_url, email, actif, mdp_temporaire').in('id', apprenantIds);
        (comptes || []).forEach(c => {
          if (c.avatar_url) avatarsMap[c.id] = c.avatar_url;
          accesMap[c.id] = { compte_cree: true, identifiant: c.email || null, actif: c.actif !== false, mdp_temporaire: !!c.mdp_temporaire };
        });
      }

      const liste = rows.map(a => {
        const parts = (a.nom_complet || '').trim().split(' ');
        return {
          ...a,
          // niveau_cecr vient de classes_elearning_apprenants directement
          classe:  classesMap[a.classe_id] ? { id: a.classe_id, nom: classesMap[a.classe_id].nom, niveau_cecr: a.niveau_cecr } : null,
          coach_nom: classesMap[a.classe_id]?.coach_nom || null,
          avatar_url: a.apprenant_id ? avatarsMap[a.apprenant_id] || null : null,
          acces: a.apprenant_id
            ? (accesMap[a.apprenant_id] || { compte_cree: true, identifiant: a.email || null, actif: true, mdp_temporaire: false })
            : { compte_cree: false, identifiant: a.email || null, actif: false, mdp_temporaire: false },
          prenom:  parts.slice(0, -1).join(' ') || a.nom_complet || '',
          nom:     parts[parts.length - 1] || '',
        };
      });
      setEnfants(liste);
      setEnfantActif(liste[0] || null);
    })();
  }, [profile]);

  useEffect(() => {
    if (!enfantActif?.id || !supabase) return;
    (async () => {
      const classeId = enfantActif.classe_id;

      const [{ data: pres }, { data: res }, { data: devs }, { data: rendus }, { data: sess }, { data: crs }] = await Promise.all([
        supabase.from('presences_elearning').select('*').eq('inscription_id', enfantActif.id),
        supabase.from('resultats_elearning').select('*').eq('inscription_id', enfantActif.id).order('date_evaluation', { ascending: false }),
        classeId ? supabase.from('devoirs_elearning').select('*').eq('classe_id', classeId).eq('statut', 'publie').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
        // Rendus de l'enfant : note + statut réel par devoir
        supabase.from('devoirs_rendus_elearning').select('devoir_id, statut, note, note_max, commentaire_coach, rendu_at, corrige_at').eq('inscription_id', enfantActif.id),
        classeId ? supabase.from('seances_elearning').select('*').eq('classe_id', classeId).order('date', { ascending: false }) : Promise.resolve({ data: [] }),
        /* `contains` et non `eq` : le coach diffuse un même contenu vers plusieurs
           classes, et `classe_id` ne porte plus que la première. Le parent voyait
           donc moins de cours que son enfant, sans rien qui l'explique. */
        classeId ? supabase.from('contenus_classes_elearning').select('*').contains('classe_ids', [classeId]).eq('est_visible', true).order('semaine', { ascending: true }).order('ordre', { ascending: true }) : Promise.resolve({ data: [] }),
      ]);

      // Enrichir les présences avec les données de séance (split FK)
      const presRows = pres || [];
      if (presRows.length > 0) {
        const seanceIds = [...new Set(presRows.map(p => p.seance_id).filter(Boolean))];
        let seancesMap = {};
        if (seanceIds.length > 0) {
          const { data: seancesData } = await supabase
            .from('seances_elearning')
            .select('id, date, heure_debut, heure_fin, type, objectifs_session, statut')
            .in('id', seanceIds);
          (seancesData || []).forEach(s => { seancesMap[s.id] = s; });
        }
        setPresences(presRows.map(p => ({ ...p, seance: seancesMap[p.seance_id] || null })));
      } else {
        setPresences([]);
      }

      // Croiser devoirs avec les rendus de l'enfant
      const rendusMap = {};
      (rendus || []).forEach(r => { rendusMap[r.devoir_id] = r; });

      // Croiser aussi avec resultats_elearning par titre (cas "Saisir une note" sans rendu)
      const resultatsParTitre = {};
      (res || []).forEach(n => { if (n.titre) resultatsParTitre[n.titre.trim().toLowerCase()] = n; });

      const devoirsAvecRendu = (devs || []).map(d => ({
        ...d,
        rendu:    rendusMap[d.id] || null,
        resultat: resultatsParTitre[(d.titre || '').trim().toLowerCase()] || null,
      }));

      setNotes(res  || []);
      setDevoirs(devoirsAvecRendu);
      setSeances(sess || []);
      setCours(crs  || []);

      // Chargement des évaluations coach
      const { data: evals } = await supabase
        .from('avis_parents_coach')
        .select('*')
        .eq('inscription_id', enfantActif.id)
        .order('created_at', { ascending: false });
      setEvaluations(evals || []);
    })();
  }, [enfantActif?.id]);

  // Réinitialise les formulaires/confirmations ponctuels quand on change d'enfant,
  // pour ne pas laisser un état "envoyé" ou un brouillon affiché sur le mauvais enfant.
  useEffect(() => {
    setMsgProf(''); setMsgEnvoye(false);
    setEvalEnvoye(false); setShowEvalModal(false);
    setEvalForm({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:'' });
    setTicketForm({ sujet:'', message:'' }); setTicketEnvoye(false); setTicketErreur('');
    setCoursOuvert(null);
    setSessionRejointe(null); setPresentielInfoModal(null);
  }, [enfantActif?.id]);

  const groupe           = enfantActif?.classe || null;
  const prochainCours    = seances.find(s => s.statut === 'planifiee');
  const sessionsRealisees= seances.filter(s => s.statut === 'realisee');
  const ageEnfant        = enfantActif?.date_naissance
    ? Math.floor((Date.now() - new Date(enfantActif.date_naissance)) / (365.25 * 24 * 3600 * 1000))
    : null;

  const moy = notes.length > 0
    ? (notes.reduce((s, n) => s + ((n.note || 0) / (n.note_max || 20)) * 20, 0) / notes.length).toFixed(1)
    : '--';
  const tauxPres = presences.length > 0
    ? Math.round(presences.filter(p => p.statut === 'present').length / presences.length * 100)
    : 0;

  const stats = [
    { label: 'Moyenne générale', valeur: `${moy}/20`, couleur: couleurTheme },
    { label: 'Taux de présence', valeur: `${tauxPres}%`, couleur: tauxPres >= 75 ? COULEURS.succes : COULEURS.attention },
    { label: 'Niveau CECR',      valeur: enfantActif?.niveau_cecr || '--', couleur: '#A78BFA' },
    { label: 'Points gagnés',    valeur: enfantActif?.points_gamif || 0, couleur: COULEURS.jauneEnfant },
  ];

  const fetchMesTickets = async () => {
    try {
      const r = await fetch(`${API_URL}/api/tickets/mes-tickets`, { headers: authHdrsParent() });
      if (!r.ok) return;
      const { tickets } = await r.json();
      setMesTickets(tickets || []);
    } catch {}
  };
  useEffect(() => { if (profile?.id) fetchMesTickets(); }, [profile?.id]);

  const envoyerTicket = async () => {
    if (!(ticketForm.sujet && ticketForm.message)) return;
    setTicketEnvoi(true);
    setTicketErreur('');
    try {
      const r = await fetch(`${API_URL}/api/tickets/moi`, {
        method: 'POST',
        headers: authHdrsParent(),
        body: JSON.stringify({
          sujet:          ticketForm.sujet,
          description:    ticketForm.message,
          canal:          'email',
          apprenant_nom:  enfantActif ? `${enfantActif.prenom} ${enfantActif.nom}`.trim() : null,
          entreprise_nom: groupe?.nom || null,
        }),
      });
      if (!r.ok) throw new Error();
      setTicketEnvoye(true);
      setTicketForm({ sujet:'', message:'' });
      fetchMesTickets();
    } catch {
      setTicketErreur("Erreur lors de l'envoi du ticket. Réessayez.");
    } finally {
      setTicketEnvoi(false);
    }
  };

  const moisCourant = new Date().toISOString().slice(0, 7);
  const dejaEvalueCeMois = evaluations.some(e => e.mois === moisCourant);

  const soumettreEval = async () => {
    if (!(evalForm.q1 && evalForm.q2 && evalForm.q3 && evalForm.q4 && evalForm.q5)) return;
    setEvalSaving(true);
    const payload = {
      inscription_id: enfantActif?.id ? String(enfantActif.id) : null,
      parent_email:   profile?.email || null,
      coach_nom:      enfantActif?.coach_nom || null,
      classe_id:      enfantActif?.classe_id ? String(enfantActif.classe_id) : null,
      mois:           moisCourant,
      q1: evalForm.q1, q2: evalForm.q2, q3: evalForm.q3, q4: evalForm.q4, q5: evalForm.q5,
      commentaire:    evalForm.commentaire || null,
    };
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
    const r = await fetch(`${API_URL}/api/analytics/avis-parent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const error = r.ok ? null : await r.json();
    setEvalSaving(false);
    if (!error) {
      const nouvelleEval = { ...evalForm, mois: moisCourant, created_at: new Date().toISOString(), coach_nom: enfantActif?.coach_nom || null };
      setEvaluations(prev => [nouvelleEval, ...prev]);
      setShowEvalModal(false);
      setEvalForm({ q1:0, q2:0, q3:0, q4:0, q5:0, commentaire:'' });
      setEvalEnvoye(true);
      setTimeout(() => setEvalEnvoye(false), 4000);
    }
  };

  // ── Styles communs ────────────────────────────────────────────────────────
  const S = {
    corps:    { flex:1, overflowY:'auto', padding:'24px 32px' },
    grille:   (cols='repeat(auto-fit,minmax(180px,1fr))') => ({ display:'grid', gridTemplateColumns:cols, gap:16, marginBottom:24 }),
    carte:    (acc=couleurTheme, extra={}) => ({ background:COULEURS.blanc, borderRadius:14, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', border:`1px solid ${COULEURS.gris200}`, borderTop:`3px solid ${acc}`, ...extra }),
    kpiVal:   { fontSize:32, fontWeight:800, color:COULEURS.navy, lineHeight:1, marginBottom:4 },
    kpiLbl:   { fontSize:13, color:COULEURS.gris600 },
    titreSec: { fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:14 },
    liste:    { display:'flex', flexDirection:'column', gap:10 },
    tableau:  { background:COULEURS.blanc, borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}`, boxShadow:'0 2px 8px rgba(0,0,0,0.05)', marginBottom:24 },
    thead:    (cols) => ({ display:'grid', gridTemplateColumns:cols, padding:'11px 18px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }),
    trow:     (cols) => ({ display:'grid', gridTemplateColumns:cols, padding:'13px 18px', borderBottom:`1px solid ${COULEURS.gris100}`, alignItems:'center', fontSize:13 }),
    btn:      (bg=couleurTheme, sm=false) => ({ background:bg, color:'#fff', border:'none', borderRadius:8, padding:sm?'6px 13px':'9px 18px', fontSize:sm?12:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }),
    btnGhost: { background:'transparent', color:couleurTheme, border:`1.5px solid ${couleurTheme}`, borderRadius:8, padding:'7px 15px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' },
    input:    { padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none' },
    select:   { padding:'9px 13px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', background:COULEURS.blanc, color:COULEURS.navy, outline:'none', cursor:'pointer', width:'100%' },
    label:    { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 },
    vide:     { textAlign:'center', padding:40, color:COULEURS.gris400, fontSize:13, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}`, marginBottom:24 },
    infoBox:  (bg='#EFF6FF') => ({ background:bg, borderRadius:10, padding:'12px 16px', fontSize:12, lineHeight:1.7, marginBottom:20, color:'#1e40af' }),
  };

  // Sélecteur enfant si plusieurs
  const selecteurEnfant = enfants.length > 1 && (
    <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
      {enfants.map(e => (
        <button key={e.id} onClick={() => setEnfantActif(e)} style={{
          padding:'6px 20px 6px 8px', borderRadius:24, border:`2px solid ${enfantActif?.id===e.id?couleurTheme:COULEURS.gris200}`,
          background:enfantActif?.id===e.id?couleurTheme:COULEURS.blanc, color:enfantActif?.id===e.id?'#fff':COULEURS.navy,
          fontWeight:enfantActif?.id===e.id?700:400, fontSize:14, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <span style={{ width:24, height:24, borderRadius:'50%', overflow:'hidden', flexShrink:0, background:(enfantActif?.id===e.id?'rgba(255,255,255,0.25)':couleurTheme+'20'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:enfantActif?.id===e.id?'#fff':couleurTheme }}>
            {e.avatar_url
              ? <img src={e.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={ev => { ev.target.style.display='none'; }} />
              : <>{e.prenom?.[0]}{e.nom?.[0]}</>}
          </span>
          {e.prenom} {e.nom}
        </button>
      ))}
    </div>
  );

  // ============================================================
  return (
    <>
    <TopNavLayout stats={stats}>
      <div style={S.corps}>
        {selecteurEnfant}


        {/* ══ TABLEAU DE BORD ══ */}
        {section === 'dashboard' && (
          <div>
            {/* Banner enfant */}
            <div style={{ ...S.carte(couleurTheme, { marginBottom:24, padding:'20px 24px' }) }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:52, height:52, borderRadius:'50%', overflow:'hidden', background:couleurTheme+'20', border:`3px solid ${couleurTheme}40`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:couleurTheme }}>
                    {enfantActif?.avatar_url
                      ? <img src={enfantActif.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                      : <>{enfantActif?.prenom?.[0]}{enfantActif?.nom?.[0]}</>}
                  </div>
                  <div>
                    <div style={{ fontSize:20, fontWeight:800, color:COULEURS.navy }}>{enfantActif?.prenom} {enfantActif?.nom}</div>
                    <div style={{ fontSize:13, color:COULEURS.gris600, marginTop:3 }}>
                      {groupe?.nom} · Niveau {enfantActif?.niveau_cecr}{ageEnfant !== null ? ` · ${ageEnfant} ans` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:24 }}>
                  {[
                    { val:`${moy}/20`, lbl:'Moyenne', couleur:couleurTheme },
                    { val:`${tauxPres}%`, lbl:'Présence', couleur:tauxPres>=75?COULEURS.succes:COULEURS.attention },
                    { val:`${enfantActif?.points_gamif||0}`, lbl:'Points', couleur:'#F97316' },
                  ].map(k => (
                    <div key={k.lbl} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:22, fontWeight:800, color:k.couleur }}>{k.val}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2 }}>{k.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={S.grille()}>
              {[
                { val:`${moy}/20`, lbl:'Moyenne générale', acc:couleurTheme },
                { val:`${tauxPres}%`, lbl:'Taux de présence', acc:tauxPres>=75?COULEURS.succes:COULEURS.attention },
                { val:enfantActif?.niveau_cecr||'--', lbl:'Niveau CECR', acc:'#8B5CF6' },
                { val:`${enfantActif?.points_gamif||0} pts`, lbl:'Points gamification', acc:'#F97316' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={S.kpiVal}>{k.val}</div>
                  <div style={S.kpiLbl}>{k.lbl}</div>
                </div>
              ))}
            </div>

            <div style={S.grille('1fr 1fr')}>
              {/* Prochain cours */}
              <div>
                <div style={S.titreSec}>📅 Prochain cours</div>
                {prochainCours ? (
                  <div style={{ background:`linear-gradient(135deg,${COULEURS.navy},${couleurThemeFonce})`, borderRadius:14, padding:'20px 22px', color:'#fff' }}>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Session planifiée</div>
                    <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>{prochainCours.titre}</div>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>
                      {fmtDate(prochainCours.date)} · {prochainCours.heure_debut} – {prochainCours.heure_fin}
                    </div>
                  </div>
                ) : <div style={S.vide}>Aucun cours planifié</div>}
              </div>

              {/* Dernières notes */}
              <div>
                <div style={S.titreSec}>🏅 Dernières notes</div>
                <div style={S.liste}>
                  {notes.slice(0,3).map(n => {
                    const typeLabel = { controle:'Contrôle', devoir:'Devoir', oral:'Oral', examen:'Examen', participation:'Participation' };
                    const label = n.titre || typeLabel[n.type] || n.type || 'Évaluation';
                    const compArr = Array.isArray(n.competences) ? n.competences : [];
                    const ratio = n.note_max ? (n.note||0)/n.note_max : 0;
                    return (
                      <div key={n.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:COULEURS.blanc, borderRadius:10, border:`1px solid ${COULEURS.gris200}` }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13, color:COULEURS.navy }}>{label}</div>
                          <div style={{ fontSize:11, color:COULEURS.gris400 }}>
                            {compArr.length > 0 ? compArr.join(', ') + ' · ' : ''}{fmtDate(n.date_evaluation || n.created_at)}
                          </div>
                        </div>
                        <Puce
                          label={n.note != null ? `${n.note}/${n.note_max||20}` : '-'}
                          fond={ratio>=0.7?'#D1FAE5':ratio>=0.5?'#FEF9C3':'#FEE2E2'}
                          texte={ratio>=0.7?'#065F46':ratio>=0.5?'#92400E':'#991B1B'}
                        />
                      </div>
                    );
                  })}
                  {notes.length===0 && <div style={S.vide}>Aucune note disponible</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ SUIVI PROGRESSION ══ */}

        {/* ══ MES COURS ══ */}
        {section === 'cours' && (
          <div>
            <div style={S.titreSec}>📚 Mes cours - {enfantActif?.prenom}</div>
            <div style={S.infoBox()}>
              📌 Voici les cours publiés par le coach pour la classe de votre enfant. Vous pouvez consulter le contenu en lecture seule.
            </div>

            {cours.length === 0 ? (
              <div style={S.vide}>
                <div style={{ fontSize:40, marginBottom:12 }}>📚</div>
                <div style={{ fontWeight:600, marginBottom:4, color:COULEURS.gris600 }}>Aucun cours publié pour l'instant</div>
                <div style={{ fontSize:12 }}>Les cours apparaîtront ici dès que le coach les rendra visibles.</div>
              </div>
            ) : (
              (() => {
                const TYPE_STYLE = {
                  lecon:    { fond:'#EFF6FF', texte:'#1E40AF', lib:'Leçon',    icone:'📖' },
                  exercice: { fond:'#F0FDF4', texte:'#065F46', lib:'Exercice', icone:'✏️' },
                  video:    { fond:'#FDF4FF', texte:'#7E22CE', lib:'Vidéo',    icone:'🎬' },
                  quiz:     { fond:'#FEF9C3', texte:'#92400E', lib:'Quiz',     icone:'🧠' },
                };
                const parSemaine = {};
                cours.forEach(c => {
                  const s = c.semaine || 1;
                  if (!parSemaine[s]) parSemaine[s] = [];
                  parSemaine[s].push(c);
                });
                return Object.entries(parSemaine).sort(([a],[b]) => +a - +b).map(([sem, items]) => (
                  <div key={sem} style={{ marginBottom:28 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ background:COULEURS.gris100, borderRadius:6, padding:'2px 10px' }}>Semaine {sem}</span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      {items.map(c => {
                        const ts = TYPE_STYLE[c.type_contenu] || TYPE_STYLE.lecon;
                        const ouvert = coursOuvert?.id === c.id;
                        return (
                          <div key={c.id}
                            onClick={() => setCoursOuvert(ouvert ? null : c)}
                            style={{ background:COULEURS.blanc, borderRadius:12, border:`1.5px solid ${ouvert ? couleurTheme : COULEURS.gris200}`, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:14, boxShadow: ouvert ? `0 2px 12px ${couleurTheme}20` : '0 1px 4px rgba(0,0,0,0.05)', cursor:'pointer', transition:'border-color .15s,box-shadow .15s' }}>
                            <div style={{ width:42, height:42, borderRadius:10, background:ts.fond, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{ts.icone}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                                <span style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>{c.titre}</span>
                                <span style={{ padding:'2px 8px', borderRadius:20, background:ts.fond, color:ts.texte, fontSize:10, fontWeight:700 }}>{ts.lib}</span>
                                {c.duree_estimee && <span style={{ fontSize:11, color:COULEURS.gris400 }}>⏱ {c.duree_estimee} min</span>}
                              </div>
                              {c.objectifs && <div style={{ fontSize:12, color:COULEURS.gris600, fontStyle:'italic' }}>🎯 {c.objectifs}</div>}
                            </div>
                            <span style={{ fontSize:12, color: ouvert ? couleurTheme : COULEURS.gris400, fontWeight:600, flexShrink:0 }}>
                              {ouvert ? '▲ Fermer' : '▼ Ouvrir'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        )}

        {/* ══ BILAN & SUIVI (fusionné : Suivi progression + Bulletins + Rapport mensuel) ══ */}
        {section === 'bilan' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
              <div style={S.titreSec}>📊 Bilan & Suivi - {enfantActif?.prenom}</div>
            </div>

            {/* Boutons de sous-onglets */}
            <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
              {[
                { id:'suivi',    icone:'📈', lib:'Suivi de progression' },
                { id:'bulletins',icone:'📋', lib:'Bulletins scolaires' },
                { id:'rapport',  icone:'📊', lib:'Rapport mensuel' },
              ].map(t => (
                <button key={t.id} onClick={() => setSsBilan(t.id)} style={{
                  padding:'9px 18px', borderRadius:24, border:`2px solid ${ssBilan===t.id ? couleurTheme : COULEURS.gris200}`,
                  background: ssBilan===t.id ? couleurTheme : COULEURS.blanc,
                  color: ssBilan===t.id ? '#fff' : COULEURS.navy,
                  fontWeight: ssBilan===t.id ? 700 : 500, fontSize:13, cursor:'pointer',
                  fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6,
                  boxShadow: ssBilan===t.id ? `0 2px 8px ${couleurTheme}40` : 'none',
                  transition:'all 0.15s',
                }}>
                  {t.icone} {t.lib}
                </button>
              ))}
            </div>

            {/* ── Sous-onglet : Suivi de progression ── */}
            {ssBilan === 'suivi' && (() => {
              const COMP_COULEURS = ['#0891B2','#8B5CF6','#F97316','#059669','#F59E0B','#EF4444'];
              const parComp = {};
              notes.forEach(n => {
                if (!n.competence) return;
                if (!parComp[n.competence]) parComp[n.competence] = { total:0, count:0, max: n.note_max||20 };
                parComp[n.competence].total += (n.note||0);
                parComp[n.competence].count++;
                if (n.note_max) parComp[n.competence].max = Math.max(parComp[n.competence].max, n.note_max);
              });
              const comps = Object.entries(parComp).map(([comp, d], i) => ({
                comp, val: +(d.total/d.count).toFixed(1), max: d.max, couleur: COMP_COULEURS[i % COMP_COULEURS.length],
              }));
              return (
                <div>
                  {comps.length === 0 ? (
                    <div style={{ ...S.vide, marginBottom:24 }}>
                      <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                      <div style={{ fontWeight:600, color:COULEURS.gris600 }}>Aucune compétence évaluée pour l'instant</div>
                      <div style={{ fontSize:12, marginTop:4 }}>Les résultats apparaîtront ici après les premières évaluations.</div>
                    </div>
                  ) : (
                    <div style={{ ...S.carte(couleurTheme, { marginBottom:24, padding:'20px 24px' }) }}>
                      <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:16 }}>Niveau par compétence</div>
                      {comps.map(c => (
                        <div key={c.comp} style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                            <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{c.comp}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:c.couleur }}>{c.val}/{c.max}</span>
                          </div>
                          <div style={{ height:8, background:COULEURS.gris100, borderRadius:4, overflow:'hidden' }}>
                            <div style={{ width:`${(c.val/c.max)*100}%`, height:'100%', background:c.couleur, borderRadius:4, transition:'width 0.6s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={S.titreSec}>Historique des évaluations</div>
                  <div style={S.tableau}>
                    <div style={S.thead('2fr 1fr 1fr 2fr 1fr')}>
                      <span>Évaluation</span><span>Note</span><span>Compétences</span><span>Commentaire coach</span><span>Date</span>
                    </div>
                    {notes.length>0 ? notes.map(n => {
                      const typeLabel = { controle:'Contrôle', devoir:'Devoir', oral:'Oral', examen:'Examen', participation:'Participation' };
                      const label = n.titre || typeLabel[n.type] || n.type || '-';
                      const compArr = Array.isArray(n.competences) ? n.competences : (n.competences ? [n.competences] : []);
                      const ratio = n.note_max ? (n.note||0)/n.note_max : 0;
                      const noteFond  = ratio >= 0.7 ? '#D1FAE5' : ratio >= 0.5 ? '#FEF9C3' : '#FEE2E2';
                      const noteTexte = ratio >= 0.7 ? '#065F46' : ratio >= 0.5 ? '#92400E' : '#991B1B';
                      return (
                        <div key={n.id} style={S.trow('2fr 1fr 1fr 2fr 1fr')}>
                          <div>
                            <span style={{ fontWeight:600, color:COULEURS.navy }}>{label}</span>
                            {n.mention && <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{n.mention}</div>}
                          </div>
                          <Puce label={n.note != null ? `${n.note}/${n.note_max||20}` : '-'} fond={noteFond} texte={noteTexte} />
                          <span style={{ fontSize:11, color:'#6D28D9' }}>
                            {compArr.length > 0 ? compArr.join(', ') : '-'}
                          </span>
                          <span style={{ fontSize:12, color:COULEURS.gris600, fontStyle:'italic' }}>{n.commentaire_coach || '-'}</span>
                          <span style={{ fontSize:11, color:COULEURS.gris400 }}>{fmtDate(n.date_evaluation||n.created_at)}</span>
                        </div>
                      );
                    }) : (
                      <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400 }}>Aucune note disponible</div>
                    )}
                  </div>

                  {notes.length > 0 && (() => {
                    const parMois = {};
                    notes.forEach(n => {
                      const d = new Date(n.date_evaluation || n.created_at);
                      if (isNaN(d)) return;
                      const clé = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                      const lib = d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
                      if (!parMois[clé]) parMois[clé] = { lib, total:0, count:0 };
                      parMois[clé].total += (n.note||0)/(n.note_max||20)*20;
                      parMois[clé].count++;
                    });
                    const mois = Object.entries(parMois).sort(([a],[b])=>a.localeCompare(b)).map(([,d]) => ({ ...d, moy: +(d.total/d.count).toFixed(1) }));
                    const COLS = ['#6366F1','#0891B2','#059669','#F97316','#8B5CF6','#EF4444'];
                    return (
                      <>
                        <div style={S.titreSec}>Évolution mensuelle</div>
                        <div style={S.grille(`repeat(${Math.min(mois.length,3)},1fr)`)}>
                          {mois.map((m,i) => (
                            <div key={m.lib} style={S.carte(COLS[i%COLS.length],{textAlign:'center'})}>
                              <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, marginBottom:8, textTransform:'capitalize' }}>{m.lib}</div>
                              <div style={{ fontSize:24, fontWeight:800, color:COLS[i%COLS.length] }}>{m.moy}/20</div>
                              <div style={{ fontSize:11, color:COULEURS.gris400 }}>{m.count} évaluation{m.count>1?'s':''}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ── Sous-onglet : Bulletins ── */}
            {ssBilan === 'bulletins' && (
              <div>
                <div style={S.infoBox()}>
                  📌 Les bulletins sont générés à la fin de chaque trimestre par l'équipe BET. Téléchargez-les en PDF pour vos archives.
                </div>
                <div style={S.vide}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                  <div style={{ fontWeight:600, marginBottom:4, color:COULEURS.gris600 }}>Aucun bulletin disponible</div>
                  <div style={{ fontSize:12 }}>Les bulletins sont générés à la fin de chaque trimestre par l'équipe BET.</div>
                </div>
              </div>
            )}

            {/* ── Sous-onglet : Rapport mensuel ── */}
            {ssBilan === 'rapport' && (
              <div>
                <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:12, color:'#1E40AF' }}>
                  📌 Ces rapports sont générés chaque fin de mois par le professeur. Ils détaillent la progression de votre enfant compétence par compétence.
                </div>
                <div style={S.vide}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
                  <div style={{ fontWeight:600, marginBottom:4, color:COULEURS.gris600 }}>Aucun rapport disponible</div>
                  <div style={{ fontSize:12 }}>Les rapports mensuels sont générés par le professeur en fin de mois.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'presences' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={S.titreSec}>✅ Présences - {enfantActif?.prenom}</div>
            </div>

            {/* Récap */}
            <div style={S.grille('1fr 1fr 1fr 1fr')}>
              {[
                { val:presences.filter(p=>p.statut==='present').length, lbl:'Présences', fond:'#D1FAE5', texte:'#065F46', acc:COULEURS.succes },
                { val:presences.filter(p=>p.statut==='absent').length,  lbl:'Absences',  fond:'#FEE2E2', texte:'#991B1B', acc:'#EF4444' },
                { val:presences.filter(p=>p.statut==='retard').length,  lbl:'Retards',   fond:'#FEF9C3', texte:'#92400E', acc:COULEURS.attention },
                { val:`${tauxPres}%`, lbl:'Taux présence', fond:tauxPres>=75?'#D1FAE5':'#FEF9C3', texte:tauxPres>=75?'#065F46':'#92400E', acc:tauxPres>=75?COULEURS.succes:COULEURS.attention },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={{ fontSize:28, fontWeight:800, color:k.texte }}>{k.val}</div>
                  <div style={S.kpiLbl}>{k.lbl}</div>
                </div>
              ))}
            </div>

            {/* Barre de progression */}
            <div style={{ ...S.carte(couleurTheme, { marginBottom:24, padding:'16px 20px' }) }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Taux de présence global</span>
                <span style={{ fontSize:16, fontWeight:800, color:tauxPres>=75?COULEURS.succes:COULEURS.attention }}>{tauxPres}%</span>
              </div>
              <div style={{ height:10, background:COULEURS.gris100, borderRadius:5, overflow:'hidden' }}>
                <div style={{ width:`${tauxPres}%`, height:'100%', background:tauxPres>=75?COULEURS.succes:COULEURS.attention, borderRadius:5 }} />
              </div>
              <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:6 }}>Objectif BET : 80% minimum</div>
            </div>

            {/* Liste sessions */}
            <div style={S.titreSec}>Détail par session</div>
            <div style={S.tableau}>
              <div style={S.thead('2fr 1fr 1fr 2fr')}>
                <span>Session</span><span>Date</span><span>Statut</span><span>Justification</span>
              </div>
              {presences.length > 0 ? presences.map(p => {
                const sess = p.seance || {};
                const statut = p.statut || 'non_renseigné';
                const stMap = { present:{ fond:'#D1FAE5', texte:'#065F46', lib:'Présent' }, absent:{ fond:'#FEE2E2', texte:'#991B1B', lib:'Absent' }, retard:{ fond:'#FEF9C3', texte:'#92400E', lib:'Retard' }, excuse:{ fond:'#DBEAFE', texte:'#1E40AF', lib:'Excusé' }, non_renseigné:{ fond:COULEURS.gris100, texte:COULEURS.gris400, lib:'N/R' } };
                const st = stMap[statut] || stMap.non_renseigné;
                const typeLabel = { cours:'Cours', evaluation:'Évaluation', rattrapage:'Rattrapage', decouverte:'Découverte', presentiel:'Présentiel' };
                const sessLabel = sess.objectifs_session
                  ? sess.objectifs_session.slice(0, 50) + (sess.objectifs_session.length > 50 ? '…' : '')
                  : (typeLabel[sess.type] || 'Session');
                const sessHeure = sess.heure_debut ? ` · ${sess.heure_debut}–${sess.heure_fin || ''}` : '';
                return (
                  <div key={p.id} style={S.trow('2fr 1fr 1fr 2fr')}>
                    <span style={{ fontWeight:600, color:COULEURS.navy }}>
                      {sessLabel}
                      {sess.heure_debut && <span style={{ fontSize:11, color:COULEURS.gris400, fontWeight:400 }}>{sessHeure}</span>}
                    </span>
                    <span style={{ fontSize:12, color:COULEURS.gris600 }}>{sess.date ? fmtDate(sess.date) : '-'}</span>
                    <Puce label={st.lib} fond={st.fond} texte={st.texte} />
                    {statut==='absent' ? (
                      absenceJustif[p.id] ? (
                        <span style={{ fontSize:12, color:COULEURS.succes, fontWeight:600 }}>✅ Justifiée</span>
                      ) : (
                        <button style={S.btn(COULEURS.attention, true)} onClick={() => setAbsenceJustif(prev=>({...prev,[p.id]:true}))}>
                          Justifier l'absence
                        </button>
                      )
                    ) : (
                      <span style={{ fontSize:12, color:COULEURS.gris400 }}>-</span>
                    )}
                  </div>
                );
              }) : (
                <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400 }}>Aucune présence enregistrée</div>
              )}
            </div>
          </div>
        )}

        {/* ══ DEVOIRS ══ */}
        {section === 'devoirs' && (
          <div>
            <div style={S.titreSec}>📝 Devoirs - {enfantActif?.prenom}</div>
            <div style={S.infoBox()}>
              📌 Vue en lecture seule des devoirs assignés à votre enfant. Contactez le professeur pour toute question.
            </div>
            <div style={S.grille('1fr 1fr 1fr 1fr')}>
              {[
                { val: devoirs.length, lbl:'Total', acc:COULEURS.attention },
                { val: devoirs.filter(d=>d.rendu?.statut==='corrige'||(d.resultat?.note!=null&&!d.rendu)).length, lbl:'Évalués', acc:COULEURS.succes },
                { val: devoirs.filter(d=>d.rendu?.statut==='rendu').length, lbl:'Rendus', acc:'#0891B2' },
                { val: devoirs.filter(d=>!d.rendu && d.resultat?.note==null && d.date_limite && new Date(d.date_limite)<new Date()).length, lbl:'Non rendus', acc:'#EF4444' },
              ].map(k => (
                <div key={k.lbl} style={S.carte(k.acc)}>
                  <div style={S.kpiVal}>{k.val}</div>
                  <div style={S.kpiLbl}>{k.lbl}</div>
                </div>
              ))}
            </div>
            <div style={S.tableau}>
              <div style={S.thead('2fr 1fr 1fr 1fr')}>
                <span>Devoir</span><span>Date limite</span><span>Statut</span><span>Note</span>
              </div>
              {devoirs.length>0 ? devoirs.map(d => {
                const rendu    = d.rendu;
                const resultat = d.resultat;
                const depasse  = d.date_limite && new Date(d.date_limite) < new Date();
                // Note : priorité rendu → resultat (note saisie manuellement)
                const noteVal  = rendu?.note != null ? rendu.note : resultat?.note ?? null;
                const noteMax  = rendu?.note_max || resultat?.note_max || 20;
                const ratio    = noteVal != null ? noteVal / noteMax : null;
                const commentaire = rendu?.commentaire_coach || resultat?.commentaire_coach || null;
                // Statut : si une note existe mais pas de rendu → "Évalué"
                const stMap = {
                  corrige:   { fond:'#D1FAE5', texte:'#065F46', lib:'✅ Corrigé' },
                  rendu:     { fond:'#DBEAFE', texte:'#1E40AF', lib:'📤 Rendu' },
                  en_retard: { fond:'#FEE2E2', texte:'#991B1B', lib:'⏰ En retard' },
                  a_rendre:  { fond:'#FEF9C3', texte:'#92400E', lib:'📋 À rendre' },
                };
                const stInfo = rendu
                  ? (stMap[rendu.statut] || { fond:'#F1F5F9', texte:'#64748B', lib: rendu.statut })
                  : noteVal != null
                    ? { fond:'#D1FAE5', texte:'#065F46', lib:'✅ Évalué' }
                    : depasse
                      ? { fond:'#FEE2E2', texte:'#991B1B', lib:'❌ Non rendu' }
                      : { fond:'#FEF9C3', texte:'#92400E', lib:'📋 À rendre' };
                return (
                  <div key={d.id} style={S.trow('2fr 1fr 1fr 1fr')}>
                    <div>
                      <span style={{ fontWeight:600, color:COULEURS.navy }}>{d.titre || '-'}</span>
                      {commentaire && (
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:2, fontStyle:'italic' }}>
                          💬 {commentaire.slice(0,60)}{commentaire.length>60?'…':''}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize:12, color: depasse && !rendu && noteVal==null ? '#EF4444' : COULEURS.gris600 }}>
                      {fmtDate(d.date_limite)}
                    </span>
                    <Puce label={stInfo.lib} fond={stInfo.fond} texte={stInfo.texte} />
                    {noteVal != null
                      ? <Puce label={`${noteVal}/${noteMax}`} fond={ratio>=0.7?'#D1FAE5':ratio>=0.5?'#FEF9C3':'#FEE2E2'} texte={ratio>=0.7?'#065F46':ratio>=0.5?'#92400E':'#991B1B'} />
                      : <span style={{ fontSize:12, color:COULEURS.gris400 }}>-</span>
                    }
                  </div>
                );
              }) : (
                <div style={{ padding:24, textAlign:'center', color:COULEURS.gris400 }}>Aucun devoir assigné</div>
              )}
            </div>
          </div>
        )}

        {/* ══ COMMUNICATION PROF ══ */}
        {section === 'communication' && (
          <div>
            <div style={S.titreSec}>💬 Communication avec le professeur</div>
            <div style={S.infoBox()}>
              📌 Laissez un message au professeur de votre enfant. La réponse vous sera transmise dans les 24h ouvrées. Pour les urgences, utilisez le Support BET.
            </div>

            {/* Infos professeur */}
            <div style={{ ...S.carte(couleurThemeFonce, { marginBottom:24, padding:'16px 20px' }) }}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:couleurTheme+'20', border:`2px solid ${couleurTheme}40`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:couleurTheme }}>
                  {(enfantActif?.coach_nom || '?').split(' ').map(p=>p[0]).filter(Boolean).slice(0,2).join('').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15, color:COULEURS.navy }}>{enfantActif?.coach_nom || 'Coach non assigné'}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600 }}>Professeur de {enfantActif?.prenom} · {groupe?.nom || '-'}</div>
                  <Puce label="Professeur titulaire" fond="#E0F2FE" texte="#0E7490" />
                </div>
              </div>
            </div>

            {/* Formulaire message */}
            {!msgEnvoye ? (
              <div>
                <div style={S.titreSec}>Envoyer un message</div>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <label style={S.label}>Sujet</label>
                    <input style={S.input} placeholder="ex: Question sur le devoir de la semaine..." />
                  </div>
                  <div>
                    <label style={S.label}>Message</label>
                    <textarea
                      value={msgProf}
                      onChange={e => setMsgProf(e.target.value)}
                      style={{ ...S.input, minHeight:120, resize:'vertical', lineHeight:1.6 }}
                      placeholder={`Bonjour ${enfantActif?.coach_nom || ''}, je souhaitais vous contacter au sujet de...`}
                    />
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                    <button style={S.btnGhost}>Annuler</button>
                    <button
                      style={{ ...S.btn(couleurTheme), opacity:msgProf.trim()?1:0.5 }}
                      disabled={!msgProf.trim()}
                      onClick={() => setMsgEnvoye(true)}
                    >
                      ✉️ Envoyer le message
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...S.carte(COULEURS.succes, { padding:'20px 24px', textAlign:'center' }) }}>
                <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:16, fontWeight:700, color:COULEURS.navy, marginBottom:6 }}>Message envoyé !</div>
                <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:16 }}>{enfantActif?.coach_nom || 'Le professeur'} vous répondra dans les 24h ouvrées.</div>
                <button style={S.btn(COULEURS.navy)} onClick={() => { setMsgProf(''); setMsgEnvoye(false); }}>Envoyer un autre message</button>
              </div>
            )}

            {/* Messagerie complète */}
            <div style={{ marginTop:28, padding:'14px 16px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>Messagerie complète</div>
                <div style={{ fontSize:12, color:COULEURS.gris400 }}>Consultez l'historique de tous vos échanges</div>
              </div>
              <button style={S.btn(COULEURS.navy)} onClick={() => navigate('/parent/messages')}>
                💬 Ouvrir la messagerie
              </button>
            </div>
          </div>
        )}

        {/* ══ ÉVALUATION DU COACH ══ */}
        {section === 'evaluation' && (() => {
          const CRITERES = [
            { id:'q1', lbl:'Clarté des explications', icone:'💡' },
            { id:'q2', lbl:'Disponibilité et réactivité', icone:'📞' },
            { id:'q3', lbl:'Adaptation au niveau', icone:'🎯' },
            { id:'q4', lbl:'Ambiance et dynamisme', icone:'⚡' },
            { id:'q5', lbl:'Progression visible', icone:'📈' },
          ];
          const moyGlobale = evaluations.length > 0
            ? (evaluations.reduce((s, e) => s + ((e.q1+e.q2+e.q3+e.q4+e.q5)/5), 0) / evaluations.length).toFixed(1)
            : null;
          const derniereEval = evaluations[0] || null;
          return (
            <div>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={S.titreSec}>⭐ Évaluation du coach - {enfantActif?.prenom}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:2 }}>Transmise à votre PA Advisor · 1 évaluation/mois minimum recommandée</div>
                </div>
                <button
                  onClick={() => { if (!dejaEvalueCeMois) setShowEvalModal(true); }}
                  style={{
                    ...S.btn(dejaEvalueCeMois ? COULEURS.gris400 : '#F59E0B'),
                    cursor: dejaEvalueCeMois ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', gap:8, opacity: dejaEvalueCeMois ? 0.65 : 1,
                  }}
                  title={dejaEvalueCeMois ? 'Déjà évalué ce mois-ci' : 'Évaluer le coach'}
                >
                  ⭐ Évaluer le coach
                  {dejaEvalueCeMois && <span style={{ fontSize:10, background:'rgba(255,255,255,0.25)', padding:'2px 6px', borderRadius:10 }}>Fait ce mois ✓</span>}
                </button>
              </div>

              {/* Confirmation flash */}
              {evalEnvoye && (
                <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#065F46', fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
                  ✅ Évaluation envoyée ! Votre PA Advisor en a été notifié.
                </div>
              )}

              {/* KPIs */}
              <div style={S.grille('1fr 1fr 1fr')}>
                <div style={S.carte('#F59E0B')}>
                  <div style={S.kpiVal}>{evaluations.length}</div>
                  <div style={S.kpiLbl}>Évaluations envoyées</div>
                </div>
                <div style={S.carte('#8B5CF6')}>
                  <div style={S.kpiVal}>{moyGlobale ? `${moyGlobale}/5` : '-'}</div>
                  <div style={S.kpiLbl}>Moyenne globale</div>
                </div>
                <div style={S.carte(couleurTheme)}>
                  <div style={{ ...S.kpiVal, fontSize:18 }}>
                    {derniereEval
                      ? new Date(derniereEval.mois + '-01').toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
                      : '-'}
                  </div>
                  <div style={S.kpiLbl}>Dernière évaluation</div>
                </div>
              </div>

              {/* Historique */}
              <div style={S.titreSec}>Historique des évaluations</div>
              {evaluations.length === 0 ? (
                <div style={S.vide}>
                  <div style={{ fontSize:40, marginBottom:12 }}>⭐</div>
                  <div style={{ fontWeight:600, color:COULEURS.gris600, marginBottom:6 }}>Aucune évaluation envoyée</div>
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginBottom:16 }}>
                    Évaluez le coach chaque mois pour suivre la qualité de l'enseignement.
                  </div>
                  <button onClick={() => setShowEvalModal(true)} style={S.btn('#F59E0B')}>⭐ Évaluer maintenant</button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {evaluations.map((e, i) => {
                    const moy = ((e.q1+e.q2+e.q3+e.q4+e.q5)/5).toFixed(1);
                    const couleurMoy = moy >= 4 ? '#065F46' : moy >= 3 ? '#92400E' : '#991B1B';
                    const bgMoy     = moy >= 4 ? '#D1FAE5' : moy >= 3 ? '#FEF9C3' : '#FEE2E2';
                    return (
                      <div key={i} style={{ ...S.carte('#F59E0B', { padding:'18px 22px' }) }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:14 }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:14, color:COULEURS.navy }}>
                              {new Date(e.mois + '-01').toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
                            </div>
                            {e.coach_nom && <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:2 }}>Coach : {e.coach_nom}</div>}
                          </div>
                          <span style={{ padding:'4px 12px', borderRadius:20, background:bgMoy, color:couleurMoy, fontWeight:800, fontSize:15 }}>
                            ⭐ {moy}/5
                          </span>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
                          {CRITERES.map(c => (
                            <div key={c.id} style={{ textAlign:'center', background:COULEURS.gris50, borderRadius:8, padding:'8px 4px' }}>
                              <div style={{ fontSize:16, marginBottom:2 }}>{c.icone}</div>
                              <div style={{ fontSize:18, fontWeight:800, color:'#F59E0B' }}>{e[c.id]}</div>
                              <div style={{ fontSize:9, color:COULEURS.gris400, lineHeight:1.2 }}>{c.lbl}</div>
                            </div>
                          ))}
                        </div>
                        {e.commentaire && (
                          <div style={{ marginTop:12, padding:'10px 14px', background:COULEURS.gris50, borderRadius:8, fontSize:12, color:COULEURS.gris600, fontStyle:'italic', borderLeft:`3px solid #F59E0B` }}>
                            "{e.commentaire}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ PROFIL ENFANT ══ */}
        {section === 'profil' && (
          <div>
            <div style={S.titreSec}>👧 Profil de {enfantActif?.prenom || enfantActif?.nom_complet || '-'}</div>
            <div style={S.infoBox('#FEF9C3')}>
              ℹ️ Le niveau CECR et le groupe de votre enfant sont gérés par l'équipe BET. Pour toute demande de modification, contactez le Customer Care.
            </div>

            {!enfantActif ? (
              <div style={S.vide}>
                <div style={{ fontSize:40, marginBottom:12 }}>👧</div>
                <div style={{ fontWeight:600, marginBottom:4, color:COULEURS.gris600 }}>Aucun apprenant associé</div>
                <div style={{ fontSize:12 }}>Votre compte n'est pas encore lié à un apprenant. Contactez l'équipe BET.</div>
              </div>
            ) : (
            <div style={S.grille('1fr 1fr')}>
              {/* Infos modifiables */}
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:14 }}>Informations de l'enfant</div>
                <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'20px', border:`1px solid ${COULEURS.gris200}`, display:'flex', flexDirection:'column', gap:14 }}>
                  {[
                    { lbl:'Nom complet', val: enfantActif?.nom_complet || '-' },
                    { lbl:'Date de naissance', val: fmtDate(enfantActif?.date_naissance) },
                    { lbl:'Âge', val: ageEnfant !== null ? `${ageEnfant} ans` : '-' },
                    { lbl:'Email', val: enfantActif?.email || '-' },
                  ].map(f => (
                    <div key={f.lbl}>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:3, textTransform:'uppercase' }}>{f.lbl}</div>
                      <div style={{ fontWeight:700, color:COULEURS.navy }}>{f.val}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', margin:'20px 0 14px' }}>Contacts d'urgence</div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div>
                    <label style={S.label}>Téléphone d'urgence</label>
                    <input style={S.input} placeholder="+225 07 XX XX XX"
                      value={profil.telephone_urgence}
                      onChange={e => setProfil(p=>({...p,telephone_urgence:e.target.value}))}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Email d'urgence</label>
                    <input style={S.input} placeholder="contact@email.com"
                      value={profil.email_urgence}
                      onChange={e => setProfil(p=>({...p,email_urgence:e.target.value}))}
                    />
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end' }}>
                    <button style={S.btn(COULEURS.succes)}>💾 Enregistrer</button>
                  </div>
                </div>
              </div>

              {/* Sécurité compte parent */}
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:14 }}>Sécurité du compte</div>

                {/* 2FA */}
                <div style={{ background: COULEURS.blanc, borderRadius:12, border:`1px solid ${COULEURS.gris200}`, overflow:'hidden', marginBottom:14 }}>
                  <div style={{ padding:'14px 16px', borderBottom:`1px solid ${COULEURS.gris100}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:36, height:36, borderRadius:10, background: profile?.deux_facteurs ? '#D1FAE5' : '#FEF9C3', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                        {profile?.deux_facteurs ? '🔐' : '🔓'}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Authentification 2 facteurs</div>
                        <div style={{ fontSize:11, color: profile?.deux_facteurs ? COULEURS.succes : COULEURS.attention }}>
                          {profile?.deux_facteurs ? '● Activée - Compte protégé' : '● Désactivée - Recommandé de l\'activer'}
                        </div>
                      </div>
                    </div>
                    {/* Toggle 2FA */}
                    <button onClick={() => activer2FA(!profile?.deux_facteurs)}
                      style={{ width:48, height:26, borderRadius:13, border:'none', background: profile?.deux_facteurs ? COULEURS.succes : COULEURS.gris200, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:3, left: profile?.deux_facteurs ? 24 : 3, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,0.2)', transition:'left 0.2s' }} />
                    </button>
                  </div>
                  {profile?.deux_facteurs && (
                    <div style={{ padding:'12px 16px', background:'#F0FDF4', fontSize:12, color:'#065F46' }}>
                      🔑 Lors de chaque connexion, un code à 6 chiffres vous sera demandé via votre application d'authentification.
                    </div>
                  )}
                  {!profile?.deux_facteurs && (
                    <div style={{ padding:'12px 16px', background:'#FFFBEB', fontSize:12, color:'#92400E' }}>
                      ⚠️ Sans 2FA, votre compte est moins protégé. En tant que responsable du compte de votre enfant, nous recommandons fortement de l'activer.
                    </div>
                  )}
                </div>

                {/* Infos gérées par BET */}
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:14 }}>Géré par BET</div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { lbl:'Groupe', val:groupe?.nom||'-', acc:couleurTheme },
                    { lbl:'Niveau CECR', val:enfantActif?.niveau_cecr||'-', acc:'#8B5CF6' },
                    { lbl:'Profil', val:enfantActif?.profil_type||'-', acc:'#F97316' },
                    { lbl:'Statut', val:enfantActif?.statut||'-', acc:COULEURS.succes },
                    { lbl:'Points gamification', val:`${enfantActif?.points_gamif||0} pts`, acc:'#F59E0B' },
                  ].map(f => (
                    <div key={f.lbl} style={{ padding:'12px 16px', background:COULEURS.gris50, borderRadius:10, border:`1px solid ${COULEURS.gris200}`, borderLeft:`4px solid ${f.acc}` }}>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:3, textTransform:'uppercase' }}>{f.lbl}</div>
                      <div style={{ fontWeight:700, color:COULEURS.navy }}>{f.val}</div>
                    </div>
                  ))}
                </div>

                {/* Accès au compte de l'enfant - identifiant et statut uniquement, jamais le mot de passe */}
                <div style={{ fontSize:13, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em', margin:'20px 0 14px' }}>Accès de {enfantActif?.prenom || "l'enfant"}</div>
                {enfantActif?.acces?.compte_cree ? (
                  <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, display:'flex', flexDirection:'column', gap:10 }}>
                    <div>
                      <div style={{ fontSize:11, color:COULEURS.gris400, marginBottom:3, textTransform:'uppercase' }}>Identifiant de connexion</div>
                      <div style={{ fontWeight:700, color:COULEURS.navy }}>{enfantActif.acces.identifiant || '-'}</div>
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <Puce label={enfantActif.acces.actif ? '✅ Compte actif' : '🔒 Compte suspendu'} fond={enfantActif.acces.actif ? '#D1FAE5' : '#FEE2E2'} texte={enfantActif.acces.actif ? '#16A34A' : '#DC2626'} />
                      {enfantActif.acces.mdp_temporaire && (
                        <Puce label="⚠️ Mot de passe temporaire - à changer" fond="#FEF3C7" texte="#92400E" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ background:COULEURS.gris50, borderRadius:12, padding:'16px 18px', border:`1px dashed ${COULEURS.gris200}`, fontSize:12, color:COULEURS.gris400 }}>
                    Le compte de {enfantActif?.prenom || "votre enfant"} n'a pas encore été créé - contactez BET pour recevoir ses accès.
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* ══ SUPPORT / CUSTOMER CARE ══ */}
        {section === 'support' && (
          <div>
            <div style={S.titreSec}>🎧 Support / Customer Care BET</div>
            <div style={S.infoBox()}>
              📌 Pour toute question urgente, utilisez ce formulaire. L'équipe BET vous répondra dans les 4h ouvrées.
            </div>

            {/* CTA rapides */}
            <div style={S.grille('1fr 1fr 1fr')}>
              {[
                { icone:'💬', titre:'Chat en direct', desc:'Réponse immédiate pendant les heures ouvrées', couleur:couleurTheme },
                { icone:'📧', titre:'Email', desc:'contact@bet-elearning.ci', couleur:'#8B5CF6' },
                { icone:'📞', titre:'Téléphone', desc:'+225 27 21 XX XX XX', couleur:COULEURS.succes },
              ].map(c => (
                <div key={c.titre} style={{ ...S.carte(c.couleur, { textAlign:'center', padding:'20px', cursor:'pointer' }) }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>{c.icone}</div>
                  <div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{c.titre}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris600 }}>{c.desc}</div>
                </div>
              ))}
            </div>

            {/* Formulaire ticket */}
            {!ticketEnvoye ? (
              <div>
                <div style={S.titreSec}>Ouvrir un ticket</div>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <label style={S.label}>Sujet *</label>
                    <select style={S.select} value={ticketForm.sujet} onChange={e=>setTicketForm(p=>({...p,sujet:e.target.value}))}>
                      <option value="">- Choisir un sujet -</option>
                      <option>Problème de connexion à la session</option>
                      <option>Question sur le programme</option>
                      <option>Demande de changement d'horaire</option>
                      <option>Problème de facturation</option>
                      <option>Autre</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Description *</label>
                    <textarea
                      value={ticketForm.message}
                      onChange={e=>setTicketForm(p=>({...p,message:e.target.value}))}
                      style={{ ...S.input, minHeight:100, resize:'vertical', lineHeight:1.6 }}
                      placeholder="Décrivez votre problème ou votre demande..."
                    />
                  </div>
                  {ticketErreur && (
                    <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#991B1B' }}>
                      ⚠️ {ticketErreur}
                    </div>
                  )}
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                    <button style={S.btnGhost} onClick={() => setTicketForm({ sujet:'', message:'' })}>Annuler</button>
                    <button
                      style={{ ...S.btn(couleurTheme), opacity:(ticketForm.sujet&&ticketForm.message&&!ticketEnvoi)?1:0.5 }}
                      disabled={!(ticketForm.sujet&&ticketForm.message)||ticketEnvoi}
                      onClick={envoyerTicket}
                    >
                      {ticketEnvoi ? 'Envoi…' : '🎧 Envoyer le ticket'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...S.carte(COULEURS.succes, { padding:'24px', textAlign:'center' }) }}>
                <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                <div style={{ fontWeight:700, fontSize:16, color:COULEURS.navy, marginBottom:6 }}>Ticket envoyé !</div>
                <div style={{ fontSize:13, color:COULEURS.gris600 }}>L'équipe BET vous répondra dans les 4h ouvrées.</div>
                <button style={{ ...S.btnGhost, marginTop:14 }} onClick={() => setTicketEnvoye(false)}>Ouvrir un autre ticket</button>
              </div>
            )}

            {/* Historique des tickets */}
            {mesTickets.length > 0 && (
              <div style={{ marginTop:28 }}>
                <div style={S.titreSec}>Mes tickets précédents</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {mesTickets.map(t => {
                    const STATUT_T = {
                      ouvert:   { bg:'#FEF3C7', txt:'#92400E', lib:'🟡 Ouvert' },
                      en_cours: { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours' },
                      resolu:   { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Résolu' },
                    };
                    const st = STATUT_T[t.statut] || STATUT_T.ouvert;
                    return (
                      <div key={t.id} style={{ ...S.carte(couleurTheme, { padding:'14px 18px' }) }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                          <div>
                            <div style={{ fontWeight:700, color:COULEURS.navy, fontSize:13 }}>{t.sujet}</div>
                            <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{t.description}</div>
                            {t.reponse_texte && (
                              <div style={{ marginTop:8, padding:'8px 12px', background:COULEURS.gris50, borderRadius:8, fontSize:12, color:COULEURS.navy }}>
                                💬 Réponse BET : {t.reponse_texte}
                              </div>
                            )}
                          </div>
                          <span style={{ background:st.bg, color:st.txt, padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:700, flexShrink:0 }}>{st.lib}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}


        {/* ══ MON LIVE ══ */}
        {section === 'live' && (() => {
          const sessionsEnfant = seances;
          const enCours = sessionsEnfant.filter(s => s.statut === 'en_cours');
          const aVenir  = sessionsEnfant.filter(s => s.statut === 'planifiee');

          const TYPE_INFO_L = {
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

          function scoreQuizL(bloc) {
            const q = bloc.questions || [];
            const bonnes = q.filter(q => reponsesQuizLive[`${bloc.id}_${q.id}`] === q.correct).length;
            return { bonnes, total: q.length, pct: q.length > 0 ? Math.round(bonnes/q.length*100) : 0 };
          }

          function rejoindreSession(s) {
            const lien = s.lien_zoom || s.lien_meet || s.lien_teams || null;
            if (lien) {
              const w = Math.min(1280, window.screen.width - 40);
              const h = Math.min(800,  window.screen.height - 80);
              const left = Math.round((window.screen.width  - w) / 2);
              const top  = Math.round((window.screen.height - h) / 2);
              window.open(lien, 'bet_session_live',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
            }
            setSessionRejointe(s.id);
          }

          return (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={S.titreSec}>🎥 Mon Live - {enfantActif?.prenom}</div>
                  <div style={{ fontSize:12, color:COULEURS.gris400, marginTop:-10 }}>
                    Suivez les sessions en direct ou consultez le programme des prochains cours
                  </div>
                </div>
              </div>

              {/* Salle rejointe */}
              {sessionRejointe && (() => {
                const s = sessionsEnfant.find(x => x.id === sessionRejointe);
                if (!s) return null;
                const lien = s.lien_zoom || s.lien_meet || s.lien_teams || null;
                const nomService = lien
                  ? (lien.includes('meet.google') ? 'Google Meet' : lien.includes('zoom') ? 'Zoom' : lien.includes('teams') ? 'Teams' : 'Salle virtuelle')
                  : 'Salle virtuelle';
                return (
                  <div style={{ marginBottom:24 }}>
                    <div style={{ background:'linear-gradient(135deg,#064E3B,#065F46)', borderRadius:'14px 14px 0 0', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginBottom:2 }}>{s.titre}</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>⏰ {s.heure_debut} – {s.heure_fin} · {nomService} · 👤 {enfantActif?.prenom} suit ce cours</div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {lien && (
                          <button onClick={() => rejoindreSession(s)} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'#fff', color:'#064E3B', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                            ↗ Rouvrir
                          </button>
                        )}
                        <button onClick={() => setSessionRejointe(null)} style={{ padding:'7px 16px', borderRadius:8, border:'1px solid rgba(255,255,255,0.3)', background:'rgba(239,68,68,0.2)', color:'#FCA5A5', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          ⏹ Quitter
                        </button>
                      </div>
                    </div>
                    {lien ? (
                      <div style={{ background:'#F0FDF4', border:'1px solid #6EE7B7', borderRadius:'0 0 14px 14px', padding:'32px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:16, textAlign:'center' }}>
                        <div style={{ fontSize:48 }}>🎥</div>
                        <div style={{ fontSize:16, fontWeight:800, color:'#065F46' }}>Session en cours</div>
                        <div style={{ fontSize:13, color:'#047857', maxWidth:400 }}>
                          <strong>{nomService}</strong> a été ouvert dans une fenêtre flottante.<br/>
                          Si elle s'est fermée, cliquez sur <strong>Rouvrir</strong>.
                        </div>
                        <button onClick={() => rejoindreSession(s)} style={{ padding:'12px 32px', borderRadius:10, background:'#059669', color:'#fff', fontWeight:800, fontSize:14, border:'none', cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                          ↗ Rouvrir {nomService}
                        </button>
                      </div>
                    ) : (
                      <SalleVirtuelle session={s} profil={profile} role="parent" hauteur={480} onQuitter={() => setSessionRejointe(null)} />
                    )}
                  </div>
                );
              })()}

              {/* Session en cours */}
              {!sessionRejointe && enCours.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:10, height:10, borderRadius:'50%', background:'#DC2626', display:'inline-block', boxShadow:'0 0 6px #DC2626' }} />
                    En cours maintenant
                  </div>
                  {enCours.map(s => {
                    const estPresentiel = s.type === 'presentiel';
                    return (
                      <div key={s.id} style={{ background:'linear-gradient(135deg,#064E3B,#065F46)', borderRadius:14, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, marginBottom:10, flexWrap:'wrap' }}>
                        <div>
                          <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>{s.titre} {estPresentiel && <span style={{ fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.2)', padding:'2px 8px', borderRadius:10 }}>🏢 Présentiel</span>}</div>
                          <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)' }}>🕐 {s.heure_debut} – {s.heure_fin} · 👥 {groupe?.nom}</div>
                        </div>
                        {estPresentiel ? (
                          <button onClick={() => setPresentielInfoModal(s)} style={{ background:'#fff', color:'#064E3B', border:'none', borderRadius:10, padding:'12px 24px', fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:14 }}>
                            🏢 Voir les détails
                          </button>
                        ) : (
                          <button onClick={() => rejoindreSession(s)} style={{ background:'#fff', color:'#064E3B', border:'none', borderRadius:10, padding:'12px 24px', fontWeight:800, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', fontSize:14 }}>
                            🚀 Rejoindre avec {enfantActif?.prenom}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sessions à venir */}
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>📅 Sessions à venir</div>
                {aVenir.length === 0 ? (
                  <div style={S.vide}>Aucune session planifiée pour {enfantActif?.prenom}</div>
                ) : aVenir.map(s => {
                  const estPresentiel = s.type === 'presentiel';
                  const debutISO     = `${s.date}T${s.heure_debut}:00`;
                  const debut        = new Date(debutISO);
                  const debutMoins15 = new Date(debut.getTime() - MS_OUVERTURE_SALLE);
                  const maintenant   = new Date();
                  const joignable    = !estPresentiel && (MODE_DEV || maintenant >= debutMoins15);
                  const enCoursNow   = !estPresentiel && maintenant >= debut && maintenant <= new Date(debut.getTime() + 2 * 60 * 60 * 1000);
                  const minutesAvant = joignable ? 0 : Math.round((debutMoins15 - maintenant) / 60000);
                  const contenusSess = [];

                  return (
                    <div key={s.id} style={{ background: estPresentiel ? '#F0FDF4' : (joignable?'#F0FDF4':COULEURS.blanc), borderRadius:14, border:`1.5px solid ${estPresentiel ? '#6EE7B7' : (joignable?'#6EE7B7':COULEURS.gris200)}`, padding:'16px 20px', marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                          <div style={{ width:46, height:46, borderRadius:12, background: estPresentiel ? '#D1FAE5' : (joignable?'#D1FAE5':COULEURS.gris100), display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                            {estPresentiel ? '🏢' : (enCoursNow ? '🔴' : joignable ? '🟢' : '🔒')}
                          </div>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy, marginBottom:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              {s.titre}
                              {estPresentiel
                                ? <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>🏢 Présentiel</span>
                                : <span style={{ padding:'2px 8px', borderRadius:10, background:'#DBEAFE', color:'#1D4ED8', fontSize:10, fontWeight:800 }}>📡 En ligne</span>}
                              {enCoursNow && <span style={{ padding:'2px 8px', borderRadius:10, background:'#FEE2E2', color:'#991B1B', fontSize:10, fontWeight:800 }}>🔴 EN COURS</span>}
                              {!estPresentiel && joignable && !enCoursNow && <span style={{ padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46', fontSize:10, fontWeight:800 }}>✅ Salle ouverte</span>}
                            </div>
                            <div style={{ fontSize:12, color:COULEURS.gris600, display:'flex', gap:12, flexWrap:'wrap' }}>
                              <span>📅 {fmtDate(s.date)}</span>
                              <span>⏰ {s.heure_debut} – {s.heure_fin}</span>
                              {contenusSess.length > 0
                                ? <span style={{ color:couleurTheme, fontWeight:600 }}>📚 {contenusSess.length} cours lié{contenusSess.length > 1 ? 's' : ''}</span>
                                : <span style={{ color:COULEURS.gris300, fontStyle:'italic' }}>Aucun cours lié</span>}
                            </div>
                            {!estPresentiel && !joignable && minutesAvant < 1440 && (
                              <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4 }}>
                                🔒 Accès {MINUTES_OUVERTURE_SALLE} min avant · dans {minutesAvant < 60 ? `${minutesAvant} min` : `${Math.floor(minutesAvant/60)}h`}
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
                              style={{ padding:'10px 22px', borderRadius:10, border:'none', fontSize:13, fontWeight:800, cursor:joignable?'pointer':'not-allowed', background:enCoursNow?'#DC2626':joignable?COULEURS.succes:COULEURS.gris200, color:joignable?'#fff':COULEURS.gris400, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                              {enCoursNow ? '🔴 Rejoindre' : joignable ? `🎥 Rejoindre avec ${enfantActif?.prenom}` : '🔒 Pas encore'}
                            </button>
                          )}
                          {contenusSess.length > 0 && (
                            <button onClick={() => setSessionDetail(s.id)} style={{ padding:'7px 16px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, fontSize:12, fontWeight:700, cursor:'pointer', background:'transparent', color:COULEURS.navy, fontFamily:'"Plus Jakarta Sans",sans-serif', whiteSpace:'nowrap' }}>
                              📋 Voir le programme
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:4, fontStyle:'italic' }}>
                  🔓 La salle virtuelle (sessions en ligne) s'ouvre {MINUTES_OUVERTURE_SALLE} minutes avant le début du cours.
                </div>
              </div>

              {/* Sessions terminées */}
              {(() => {
                const terminees = seances.filter(s => s.statut === 'realisee').slice(0, 10);
                if (terminees.length === 0) return null;
                const TYPE_LABEL = { cours:'Cours', evaluation:'Évaluation', rattrapage:'Rattrapage', decouverte:'Découverte', presentiel:'Présentiel' };
                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy, marginBottom: 12 }}>✅ Sessions terminées</div>
                    <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 14, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: COULEURS.gris50 }}>
                            {['Date', 'Session', 'Horaire', 'Présence'].map((h, i) => (
                              <th key={i} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'center', fontSize: 10, fontWeight: 700, color: COULEURS.gris500, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${COULEURS.gris200}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {terminees.map((s, idx) => {
                            const dateObj = s.date ? new Date(s.date) : null;
                            const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
                            const label = s.objectifs_session
                              ? s.objectifs_session.slice(0, 45) + (s.objectifs_session.length > 45 ? '…' : '')
                              : (TYPE_LABEL[s.type] || 'Session');
                            const pres = presences.find(p => p.seance_id === s.id);
                            const statutPres = pres?.statut;
                            const STATUT_P = {
                              present: { bg: '#D1FAE5', txt: '#065F46', lib: 'Présent' },
                              absent:  { bg: '#FEE2E2', txt: '#991B1B', lib: 'Absent' },
                              retard:  { bg: '#FEF3C7', txt: '#92400E', lib: 'Retard' },
                            };
                            const sp = STATUT_P[statutPres];
                            return (
                              <tr key={s.id} style={{ borderBottom: idx < terminees.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600, color: COULEURS.gris600, whiteSpace: 'nowrap' }}>{dateStr}</td>
                                <td style={{ padding: '10px 14px', fontWeight: 600, color: COULEURS.navy, textAlign: 'center' }}>{label}</td>
                                <td style={{ padding: '10px 14px', color: COULEURS.gris500, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  {s.heure_debut && s.heure_fin ? `${s.heure_debut} – ${s.heure_fin}` : '-'}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                  {sp ? (
                                    <span style={{ background: sp.bg, color: sp.txt, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{sp.lib}</span>
                                  ) : (
                                    <span style={{ color: COULEURS.gris400, fontSize: 11 }}>-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Modal session présentielle */}
        {presentielInfoModal && (() => {
          const ps = presentielInfoModal;
          return (
            <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.75)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:'"Plus Jakarta Sans",sans-serif' }}
              onClick={() => setPresentielInfoModal(null)}>
              <div style={{ background:'#fff', borderRadius:18, width:'min(94vw,480px)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ background:'linear-gradient(135deg,#065F46,#059669)', padding:'22px 24px 18px', color:'#fff' }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>🏢 Session présentielle</div>
                  <div style={{ fontSize:20, fontWeight:900, marginBottom:10 }}>{ps.titre}</div>
                  <div style={{ fontSize:12, opacity:0.85 }}>👤 {enfantActif?.prenom} {enfantActif?.nom}</div>
                </div>
                <div style={{ padding:'20px 24px 24px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                    {[
                      { icon:'📅', label:'Date',  val: fmtDate(ps.date) },
                      { icon:'🕐', label:'Heure', val: `${ps.heure_debut}${ps.heure_fin ? ` – ${ps.heure_fin}` : ''}` },
                    ].map(item => (
                      <div key={item.label} style={{ background:COULEURS.gris50, borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{item.icon}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, fontWeight:600, marginBottom:2 }}>{item.label}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:20, padding:'16px', background:'#ECFDF5', borderRadius:12, border:'1.5px solid #6EE7B7' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>📍 Lieu du cours</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:4 }}>🏢 Séance en présentiel</div>
                    <div style={{ fontSize:13, color:'#047857' }}>Rendez-vous en salle selon les instructions du coach.</div>
                    <div style={{ fontSize:12, color:'#059669', marginTop:6 }}>Aucun lien de visioconférence requis.</div>
                  </div>
                  <div style={{ textAlign:'center', padding:'14px', borderRadius:12, background:'#ECFDF5', border:'1.5px solid #6EE7B7', fontSize:13, color:'#065F46', fontWeight:700 }}>
                    🏢 Rendez-vous le {fmtDate(ps.date)} à {ps.heure_debut}
                  </div>
                </div>
                <div style={{ padding:'12px 24px 20px', display:'flex', justifyContent:'center' }}>
                  <button onClick={() => setPresentielInfoModal(null)}
                    style={{ padding:'11px 32px', borderRadius:10, border:`1.5px solid ${COULEURS.gris200}`, background:'#fff', color:COULEURS.navy, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </TopNavLayout>

    {/* ── Panneau latéral : programme + lecteur ── */}
    {(sessionDetail || coursOuvertLive) && (() => {
      const sess         = seances.find(s => s.id === sessionDetail);
      const contenusSess = [];

      const TYPE_INFO_L = {
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

      function scoreQuizL(bloc) {
        const q = bloc.questions || [];
        const bonnes = q.filter(q => reponsesQuizLive[`${bloc.id}_${q.id}`] === q.correct).length;
        return { bonnes, total: q.length, pct: q.length > 0 ? Math.round(bonnes/q.length*100) : 0 };
      }

      // ── LECTEUR DE COURS ──
      if (coursOuvertLive) {
        const c      = coursOuvertLive;
        const blocs  = [];
        const typeI  = TYPE_INFO_L[c.type_contenu] || TYPE_INFO_L.lecon;
        const dureeT = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
        return (
          <>
            <div onClick={fermerTout} style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:1200, backdropFilter:'blur(3px)' }} />
            <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,780px)', background:'#fff', zIndex:1201, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
              <div style={{ background:`linear-gradient(135deg, ${typeI.accent}, ${COULEURS.navy})`, padding:'20px 24px', flexShrink:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                  <div>
                    {sess && <button onClick={() => setCoursOuvertLive(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 10px', color:'rgba(255,255,255,0.85)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', marginBottom:8, display:'inline-flex', alignItems:'center', gap:4 }}>← Programme : {sess.titre}</button>}
                    <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{typeI.icone} {typeI.label} · {c.module} · Semaine {c.semaine}</div>
                    <div style={{ fontSize:19, fontWeight:800, color:'#fff', lineHeight:1.3, marginBottom:4 }}>{c.titre}</div>
                    <div style={{ display:'flex', gap:14, fontSize:12, color:'rgba(255,255,255,0.7)' }}>
                      {dureeT > 0 && <span>⏱ {dureeT} min</span>}
                      <span>📦 {blocs.length} bloc{blocs.length>1?'s':''}</span>
                      {terminesLive[c.id] && <span style={{ color:'#6EE7B7', fontWeight:700 }}>✅ Terminé</span>}
                    </div>
                  </div>
                  <button onClick={fermerTout} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                </div>
              </div>
              {blocs.length > 0 && (
                <div style={{ display:'flex', gap:6, padding:'10px 24px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, flexWrap:'wrap', flexShrink:0 }}>
                  {blocs.map((b, i) => { const bt = BLOC_TYPE_INFO_L[b.type] || BLOC_TYPE_INFO_L.texte; return (
                    <a key={b.id} href={`#blocp-${b.id}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, background:bt.couleur+'15', color:bt.couleur, fontSize:11, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                      {bt.icone} {i+1}. {b.titre.length > 20 ? b.titre.slice(0,20)+'…' : b.titre}
                    </a>
                  ); })}
                </div>
              )}
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
                    <div key={b.id} id={`blocp-${b.id}`} style={{ marginBottom:24, borderRadius:14, border:`1px solid ${bt.couleur}25`, overflow:'hidden' }}>
                      <div style={{ padding:'12px 18px', background:bt.couleur+'0a', borderBottom:`1px solid ${bt.couleur}20`, display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:20 }}>{bt.icone}</span>
                        <div style={{ flex:1 }}><div style={{ fontWeight:700, color:COULEURS.navy, fontSize:14 }}>{b.titre}</div><div style={{ fontSize:11, color:COULEURS.gris400 }}>{bt.label} · {b.dureeMin} min</div></div>
                        <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris400 }}>#{bi+1}</span>
                      </div>
                      <div style={{ padding:'16px 18px', background:'#fff' }}>
                        {(b.type === 'texte' || b.type === 'exercice') && b.sections?.length > 0 && (
                          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                            {b.sections.map(sec => (
                              <div key={sec.id}>
                                {sec.niveau === 'h2' && <h3 style={{ margin:'0 0 6px', fontSize:15, color:COULEURS.navy, fontWeight:700 }}>{sec.titre}</h3>}
                                {sec.niveau === 'note' && <div style={{ background:'#FFFBEB', borderLeft:'3px solid #F59E0B', borderRadius:'0 8px 8px 0', padding:'10px 14px' }}><div style={{ fontWeight:700, color:'#92400E', marginBottom:4, fontSize:12 }}>{sec.titre}</div><div style={{ fontSize:13, color:'#78350F', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{sec.contenu}</div></div>}
                                {!['h1','h2','h3','note','ul'].includes(sec.niveau) && <p style={{ margin:0, fontSize:14, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>}
                                {['h1','h2','h3'].includes(sec.niveau) && sec.contenu && <p style={{ margin:'4px 0 0', fontSize:14, color:COULEURS.gris600, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{sec.contenu}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                        {b.type === 'video' && <div style={{ background:'#1E293B', borderRadius:10, padding:'40px 20px', textAlign:'center' }}><div style={{ fontSize:48, marginBottom:8 }}>🎬</div><a href={b.url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:8, background:bt.couleur, color:'#fff', borderRadius:8, padding:'10px 20px', fontWeight:700, fontSize:14, textDecoration:'none' }}>▶ Regarder la vidéo</a></div>}
                        {b.type === 'audio' && <div style={{ background:'#F0FDF4', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}><div style={{ fontSize:36 }}>🎧</div><div><div style={{ fontWeight:700, color:COULEURS.navy, marginBottom:4 }}>{b.titre}</div><a href={b.url} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#059669', fontWeight:600 }}>▶ Écouter</a></div></div>}
                        {b.type === 'lien' && <div style={{ background:'#E0F2FE', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}><div style={{ fontSize:28 }}>🔗</div><div><div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>{b.titre}</div><a href={b.url} target="_blank" rel="noreferrer" style={{ fontSize:13, color:couleurTheme }}>Accéder →</a></div></div>}
                        {b.type === 'document' && <div style={{ background:'#FFF7ED', borderRadius:10, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}><div style={{ fontSize:36 }}>📄</div><div><div style={{ fontWeight:600, color:COULEURS.navy, marginBottom:4 }}>{b.fichier || b.titre}</div>{/* Ce bouton n'avait AUCUN `onClick` : il changeait de curseur au survol et
                            ne faisait rien. Un parent cliquait sans jamais obtenir le document. */}
                          {b.url ? (
                            <span style={{ display:'flex', gap:12 }}>
                              <a href={urlOuvrir(b.url, b.fichier || b.titre)} target="_blank" rel="noreferrer" style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>👁 Ouvrir</a>
                              <a href={urlTelecharger(b.url, b.fichier || b.titre || 'document')} style={{ fontSize:13, color:'#F59E0B', fontWeight:600 }}>⬇ Télécharger</a>
                            </span>
                          ) : (
                            <span style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun fichier joint à ce bloc.</span>
                          )}</div></div>}
                        {b.type === 'quiz' && (() => {
                          const soumis = quizSoumisLive[b.id];
                          const { bonnes, total, pct } = scoreQuizL(b);
                          return (
                            <div>
                              {b.questions.map((q, qi) => {
                                const clef = `${b.id}_${q.id}`; const choix = reponsesQuizLive[clef]; const estBon = choix === q.correct;
                                return (
                                  <div key={q.id} style={{ marginBottom:18, padding:'14px 16px', borderRadius:10, background:soumis?(estBon?'#F0FDF4':'#FFF5F5'):COULEURS.gris50, border:`1px solid ${soumis?(estBon?'#6EE7B7':'#FECACA'):COULEURS.gris200}` }}>
                                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy, marginBottom:10 }}>{qi+1}. {q.texte}</div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                                      {q.options.map(opt => {
                                        const selec = choix === opt; const estCorr = opt === q.correct;
                                        let bg='#fff', bord=COULEURS.gris200, txtC=COULEURS.gris600;
                                        if (soumis) { if (estCorr) { bg='#F0FDF4'; bord='#6EE7B7'; txtC='#065F46'; } else if (selec) { bg='#FFF5F5'; bord='#FECACA'; txtC='#991B1B'; } } else if (selec) { bg=bt.couleur+'15'; bord=bt.couleur; txtC=bt.couleur; }
                                        return <button key={opt} disabled={soumis} onClick={() => !soumis && setReponsesQuizLive(p => ({ ...p, [clef]:opt }))} style={{ textAlign:'left', padding:'9px 14px', borderRadius:8, border:`1.5px solid ${bord}`, background:bg, color:txtC, fontSize:13, fontWeight:selec||soumis&&estCorr?700:400, cursor:soumis?'default':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', display:'flex', alignItems:'center', gap:8 }}>{soumis && estCorr && <span>✅</span>}{soumis && selec && !estCorr && <span>❌</span>}{opt}</button>;
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                              {soumis ? (
                                <div style={{ padding:'12px 16px', borderRadius:10, background:pct>=70?'#D1FAE5':'#FEE2E2', border:`1px solid ${pct>=70?'#6EE7B7':'#FECACA'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                  <div><div style={{ fontWeight:700, color:pct>=70?'#065F46':'#991B1B', fontSize:14 }}>{pct>=70?'🎉 Bravo !':'📖 Continue à réviser'}</div><div style={{ fontSize:13, color:pct>=70?'#065F46':'#991B1B', marginTop:2 }}>{bonnes}/{total} bonne{bonnes>1?'s':''} réponse{bonnes>1?'s':''} - {pct}%</div></div>
                                  <button onClick={() => { setQuizSoumisLive(p => { const n={...p}; delete n[b.id]; return n; }); setReponsesQuizLive(p => { const n={...p}; b.questions.forEach(q => delete n[`${b.id}_${q.id}`]); return n; }); }} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${pct>=70?'#6EE7B7':'#FECACA'}`, background:'#fff', color:pct>=70?'#065F46':'#991B1B', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>Recommencer</button>
                                </div>
                              ) : <button disabled={b.questions.some(q => !reponsesQuizLive[`${b.id}_${q.id}`])} onClick={() => setQuizSoumisLive(p => ({ ...p, [b.id]:true }))} style={{ padding:'10px 20px', borderRadius:8, border:'none', background:b.questions.some(q=>!reponsesQuizLive[`${b.id}_${q.id}`])?COULEURS.gris200:bt.couleur, color:b.questions.some(q=>!reponsesQuizLive[`${b.id}_${q.id}`])?COULEURS.gris400:'#fff', fontSize:13, fontWeight:700, cursor:b.questions.some(q=>!reponsesQuizLive[`${b.id}_${q.id}`])?'not-allowed':'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>✓ Valider mes réponses</button>}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, background:COULEURS.gris50, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div style={{ fontSize:12, color:COULEURS.gris400 }}>{terminesLive[c.id] ? '✅ Marqué comme terminé' : 'Marquez le cours comme terminé quand vous avez tout lu.'}</div>
                <button onClick={() => setTerminesLive(p => ({ ...p, [c.id]: !p[c.id] }))} style={{ padding:'10px 20px', borderRadius:8, border:'none', background:terminesLive[c.id]?COULEURS.gris200:COULEURS.succes, color:terminesLive[c.id]?COULEURS.gris600:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  {terminesLive[c.id] ? '↩ Marquer non terminé' : '✅ Marquer comme terminé'}
                </button>
              </div>
            </div>
          </>
        );
      }

      // ── LISTE DES COURS DE LA SESSION ──
      if (!sess) return null;
      return (
        <>
          <div onClick={fermerTout} style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', zIndex:1200, backdropFilter:'blur(3px)' }} />
          <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(92vw,680px)', background:'#fff', zIndex:1201, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,0.2)', fontFamily:'"Plus Jakarta Sans",sans-serif', overflow:'hidden' }}>
            <div style={{ background:'linear-gradient(135deg,#003087,#0891B2)', padding:'20px 24px', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Programme de la session</div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:6 }}>{sess.titre}</div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'rgba(255,255,255,0.75)', flexWrap:'wrap' }}>
                    <span>📅 {new Date(sess.date).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</span>
                    <span>⏰ {sess.heure_debut} – {sess.heure_fin}</span>
                    <span>👤 {enfantActif?.prenom} {enfantActif?.nom}</span>
                  </div>
                </div>
                <button onClick={fermerTout} style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              {contenusSess.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 20px', color:COULEURS.gris400, background:COULEURS.gris50, borderRadius:12, border:`1px dashed ${COULEURS.gris200}` }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
                  <div style={{ fontSize:14, fontWeight:600, color:COULEURS.gris600 }}>Aucun contenu associé pour l'instant</div>
                  <div style={{ fontSize:12, marginTop:4 }}>Le professeur n'a pas encore lié de cours à cette session.</div>
                </div>
              ) : contenusSess.map(c => {
                const ti    = TYPE_INFO_L[c.type_contenu] || TYPE_INFO_L.lecon;
                const blocs = [];
                const dureeC = blocs.reduce((s, b) => s + (b.dureeMin || 0), 0);
                const faitC  = terminesLive[c.id];
                return (
                  <div key={c.id} onClick={() => setCoursOuvertLive(c)}
                    style={{ background:COULEURS.blanc, borderRadius:14, padding:18, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', border:`1.5px solid ${faitC?'#6EE7B7':COULEURS.gris200}`, cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s', position:'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.07)'; }}
                  >
                    {faitC && <div style={{ position:'absolute', top:12, right:12, background:'#D1FAE5', color:'#065F46', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>✅ Terminé</div>}
                    <div style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:ti.bg, color:ti.txt, fontSize:11, fontWeight:700, marginBottom:8 }}>{ti.icone} {ti.label}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:COULEURS.navy, marginBottom:6, paddingRight: faitC ? 80 : 0 }}>{c.titre}</div>
                    {c.description && <div style={{ fontSize:13, color:COULEURS.gris600, marginBottom:10, lineHeight:1.5 }}>{c.description}</div>}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:COULEURS.gris400 }}>
                      <span>{c.module} · Semaine {c.semaine}</span>
                      {dureeC > 0 && <span>⏱ {dureeC} min</span>}
                    </div>
                    <div style={{ marginTop:12, padding:'8px 14px', background:ti.bg+'60', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:ti.txt }}>
                      {faitC ? '✅ Revoir le cours' : '▶ Consulter le cours'}
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
              {contenusSess.length} cours · Cliquez pour lire
            </div>
          </div>
        </>
      );
    })()}

    {/* ── Panneau latéral : contenu cours ── */}
    {coursOuvert && (() => {
      const c = coursOuvert;
      const TYPE_STYLE_P = {
        lecon:    { bg:'#E0F2FE', txt:'#0E7490', icone:'📖', label:'Leçon',    acc:'#0891B2' },
        exercice: { bg:'#D1FAE5', txt:'#065F46', icone:'✏️', label:'Exercice', acc:'#059669' },
        video:    { bg:'#F3E8FF', txt:'#7E22CE', icone:'🎬', label:'Vidéo',    acc:'#7C3AED' },
        quiz:     { bg:'#FEF9C3', txt:'#92400E', icone:'🧠', label:'Quiz',     acc:'#D97706' },
      };
      const ts = TYPE_STYLE_P[c.type_contenu] || TYPE_STYLE_P.lecon;
      const blocs = Array.isArray(c.blocs) ? c.blocs : [];
      return (
        <>
          {/* Overlay */}
          <div onClick={() => setCoursOuvert(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.35)', zIndex:1000, backdropFilter:'blur(2px)' }}/>
          {/* Panneau */}
          <div style={{ position:'fixed', top:0, right:0, width:520, maxWidth:'95vw', height:'100vh', background:'#fff', zIndex:1001, boxShadow:'-4px 0 32px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
            {/* Header */}
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'flex-start', gap:14, background:ts.bg }}>
              <div style={{ width:44, height:44, borderRadius:12, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>{ts.icone}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#0F172A', lineHeight:1.3 }}>{c.titre}</div>
                <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                  <span style={{ padding:'2px 10px', borderRadius:20, background:'#fff', color:ts.txt, fontSize:10, fontWeight:700 }}>{ts.label}</span>
                  {c.duree_estimee && <span style={{ fontSize:11, color:ts.txt }}>⏱ {c.duree_estimee} min</span>}
                  {c.semaine && <span style={{ fontSize:11, color:ts.txt }}>Semaine {c.semaine}</span>}
                </div>
                {c.objectifs && <div style={{ fontSize:12, color:ts.txt, marginTop:6, fontStyle:'italic' }}>🎯 {c.objectifs}</div>}
              </div>
              <button onClick={() => setCoursOuvert(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'#64748B', flexShrink:0, padding:0 }}>✕</button>
            </div>

            {/* Blocs de contenu */}
            <div style={{ flex:1, padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              {blocs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 24px', color:'#94A3B8' }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                  <div>Aucun contenu disponible pour ce cours</div>
                </div>
              ) : blocs.map((b, bi) => (
                <div key={bi} style={{ borderRadius:10, overflow:'hidden', border:'1px solid #E2E8F0' }}>
                  {b.type === 'titre' && (
                    <div style={{ padding:'12px 16px', fontWeight:800, fontSize:15, color:'#0F172A', background:'#F8FAFC', borderLeft:`4px solid ${ts.acc}` }}>
                      {b.contenu}
                    </div>
                  )}
                  {b.type === 'texte' && (
                    <div style={{ padding:'14px 16px', fontSize:13, color:'#1E293B', lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                      {b.contenu}
                    </div>
                  )}
                  {b.type === 'image' && b.url && (
                    <img src={b.url} alt={b.legende || ''} style={{ width:'100%', display:'block', maxHeight:340, objectFit:'contain', background:'#F8FAFC' }} />
                  )}
                  {b.type === 'video' && b.url && (
                    <div style={{ padding:'14px 16px', background:'#0F172A', display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:28 }}>🎬</span>
                      <a href={b.url} target="_blank" rel="noreferrer" style={{ color:'#38BDF8', fontWeight:700, fontSize:13 }}>▶ Voir la vidéo</a>
                    </div>
                  )}
                  {b.type === 'fichier' && b.url && (
                    <div style={{ padding:'14px 16px', background:'#F0FDF4', display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:22 }}>📎</span>
                      <div>
                        <a href={b.url} target="_blank" rel="noreferrer" style={{ color:'#059669', fontWeight:700, fontSize:13, display:'block' }}>
                          {b.nom || 'Télécharger le fichier'}
                        </a>
                        {b.nom && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{b.nom}</div>}
                      </div>
                    </div>
                  )}
                  {b.type === 'audio' && b.url && (
                    <div style={{ padding:'14px 16px' }}>
                      <audio controls src={b.url} style={{ width:'100%' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer navigation */}
            {cours.length > 1 && (() => {
              const idx = cours.findIndex(x => x.id === c.id);
              const prev = idx > 0 ? cours[idx - 1] : null;
              const next = idx < cours.length - 1 ? cours[idx + 1] : null;
              return (
                <div style={{ padding:'14px 24px', borderTop:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', gap:10 }}>
                  <button onClick={() => prev && setCoursOuvert(prev)} disabled={!prev}
                    style={{ padding:'9px 16px', borderRadius:8, border:'1px solid #E2E8F0', background: prev ? '#fff' : '#F8FAFC', color: prev ? '#0F172A' : '#CBD5E1', fontSize:12, fontWeight:600, cursor: prev ? 'pointer' : 'not-allowed' }}>
                    ← Précédent
                  </button>
                  <span style={{ fontSize:11, color:'#94A3B8', alignSelf:'center' }}>{idx + 1} / {cours.length}</span>
                  <button onClick={() => next && setCoursOuvert(next)} disabled={!next}
                    style={{ padding:'9px 16px', borderRadius:8, border:'none', background: next ? ts.acc : '#F8FAFC', color: next ? '#fff' : '#CBD5E1', fontSize:12, fontWeight:600, cursor: next ? 'pointer' : 'not-allowed' }}>
                    Suivant →
                  </button>
                </div>
              );
            })()}
          </div>
        </>
      );
    })()}
    {/* ── Modal évaluation coach ── */}
    {showEvalModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        onClick={e => { if (e.target === e.currentTarget) setShowEvalModal(false); }}>
        <div style={{ background:'#fff', borderRadius:18, padding:'28px 32px', width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
          {/* Header modal */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:'#0F172A' }}>⭐ Évaluer le coach</div>
              <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>
                {new Date().toLocaleDateString('fr-FR',{month:'long',year:'numeric'})} · {enfantActif?.prenom}
              </div>
            </div>
            <button onClick={() => setShowEvalModal(false)}
              style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'#F1F5F9', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>

          {/* Critères */}
          {[
            { id:'q1', lbl:'Clarté des explications',         icone:'💡' },
            { id:'q2', lbl:'Disponibilité et réactivité',     icone:'📞' },
            { id:'q3', lbl:"Adaptation au niveau de l'enfant", icone:'🎯' },
            { id:'q4', lbl:'Ambiance et dynamisme du cours',  icone:'⚡' },
            { id:'q5', lbl:'Progression visible de votre enfant', icone:'📈' },
          ].map(q => (
            <div key={q.id} style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#0F172A', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                <span>{q.icone}</span> {q.lbl}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {[1,2,3,4,5].map(v => (
                  <button key={v} onClick={() => setEvalForm(prev=>({...prev,[q.id]:v}))}
                    style={{
                      width:42, height:42, borderRadius:'50%',
                      border:`2px solid ${evalForm[q.id] >= v ? '#F59E0B' : '#E2E8F0'}`,
                      background: evalForm[q.id] >= v ? '#FEF9C3' : '#fff',
                      cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.12s',
                    }}>⭐</button>
                ))}
                <span style={{ fontSize:12, color:'#94A3B8', marginLeft:4 }}>
                  {evalForm[q.id] > 0 ? `${evalForm[q.id]}/5` : 'Non noté'}
                </span>
              </div>
            </div>
          ))}

          {/* Commentaire */}
          <div style={{ marginBottom:22 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
              Commentaire libre (optionnel)
            </label>
            <textarea
              value={evalForm.commentaire}
              onChange={e => setEvalForm(prev=>({...prev,commentaire:e.target.value}))}
              style={{ padding:'10px 13px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', width:'100%', boxSizing:'border-box', outline:'none', minHeight:90, resize:'vertical', lineHeight:1.6 }}
              placeholder="Partagez vos observations sur le coaching de votre enfant..."
            />
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setShowEvalModal(false)}
              style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#334155', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              Annuler
            </button>
            <button
              onClick={soumettreEval}
              disabled={evalSaving || !(evalForm.q1 && evalForm.q2 && evalForm.q3 && evalForm.q4 && evalForm.q5)}
              style={{
                padding:'9px 20px', borderRadius:8, border:'none',
                background: (evalForm.q1 && evalForm.q2 && evalForm.q3 && evalForm.q4 && evalForm.q5) ? '#F59E0B' : '#CBD5E1',
                color:'#fff', fontSize:13, fontWeight:700, cursor: (evalForm.q1 && evalForm.q2 && evalForm.q3 && evalForm.q4 && evalForm.q5) ? 'pointer' : 'not-allowed',
                fontFamily:'"Plus Jakarta Sans", sans-serif', opacity: evalSaving ? 0.7 : 1,
              }}>
              {evalSaving ? '⏳ Envoi...' : '⭐ Envoyer l\'évaluation'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
