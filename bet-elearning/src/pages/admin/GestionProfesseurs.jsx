import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';
import TopNavLayout from '../../components/shared/TopNavLayout';
import { LIBELLES_ROLES, estRole } from '../../constants/roles';
import ModalProfSuivi from './ModalProfesseur';
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function authHeaders() {
  const token = localStorage.getItem('admin_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Plateforme': 'bet-elearning' };
}

// Mappe un utilisateur role=coach (API admin) → format attendu par le composant
function mapCoach(u) {
  const info    = u.coach_info || {};
  const filiere = (info.filiere || '').toLowerCase();
  const role    = filiere.includes('rempla') ? 'professeur_remplacant' : 'professeur_titulaire';

  const certifs = (() => {
    const c = info.certifications;
    if (Array.isArray(c)) return c;
    if (typeof c === 'string') return c.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  })();

  return {
    id:               u.id,
    prenom:           u.prenom || '',
    nom:              u.nom    || '',
    initiales:        `${(u.prenom || '')[0] || ''}${(u.nom || '')[0] || ''}`.toUpperCase(),
    photo:            u.avatar_url || info.photo_url || null,
    email:            u.email || '',
    role,
    description:      info.filiere || u.departement || '',
    niveau_anglais:   info.niveau_anglais || null,
    certifications:   certifs,
    annees_experience:info.annees_experience || null,
    disponibilites:   null,
    est_actif:        u.actif !== false,
    acces_elearning:  u.acces_elearning === true,
  };
}

const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const JOURS_COURT   = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam', dimanche:'Dim' };

const COULEUR_ROLE = {
  professeur_titulaire:  '#0D9488',
  professeur_remplacant: '#64748B',
};

function badgeStatut(actif) {
  return {
    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: actif ? '#D1FAE5' : '#FEE2E2',
    color: actif ? '#065F46' : '#991B1B',
  };
}

// ── Modale détail profil professeur ─────────────────────────────────────────
function ModalDetailProf({ prof, onFermer, onEditer }) {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [tab, setTab] = useState('infos');
  const couleur = COULEUR_ROLE[prof.role] || couleurTheme;
  const init    = prof.initiales || `${prof.prenom?.[0] || ''}${prof.nom?.[0] || ''}`.toUpperCase();

  const dispoActives = prof.disponibilites
    ? JOURS_SEMAINE.filter(j => prof.disponibilites[j]?.actif)
    : [];

  const TABS = [
    { id: 'infos',   lib: 'Informations',   icone: '👤' },
    { id: 'certifs', lib: 'Certifications',  icone: '🎓' },
    { id: 'exp',     lib: 'Expériences',     icone: '💼' },
    { id: 'planning',lib: 'Disponibilités',  icone: '📅' },
  ];

  const S = {
    overlay:  { position: 'fixed', inset: 0, background: 'rgba(10,18,35,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)' },
    modal:    { background: COULEURS.gris50, borderRadius: 20, width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header:   { background: `linear-gradient(135deg, ${couleur}CC 0%, ${couleur} 100%)`, padding: '22px 26px', flexShrink: 0 },
    hTop:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    avatar:   { width: 60, height: 60, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.15)' },
    nom:      { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 2 },
    sous:     { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
    btnX:     { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#fff', flexShrink: 0 },
    hStats:   { display: 'flex', gap: 20 },
    hStat:    { textAlign: 'center' },
    hStatVal: { fontSize: 17, fontWeight: 800, color: '#fff' },
    hStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' },
    hSep:     { width: 1, background: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' },
    tabs:     { display: 'flex', background: COULEURS.blanc, borderBottom: `1px solid ${COULEURS.gris200}`, padding: '0 16px', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' },
    tab:      (a) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: a ? `2px solid ${couleur}` : '2px solid transparent', color: a ? couleur : COULEURS.gris600, fontWeight: a ? 700 : 500, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0 }),
    corps:    { flex: 1, overflowY: 'auto', padding: 22 },
    carte:    { background: COULEURS.blanc, borderRadius: 10, padding: '13px 16px', border: `1px solid ${COULEURS.gris200}`, marginBottom: 12 },
    grille2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
    lbl:      { fontSize: 10, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    val:      { fontSize: 13, fontWeight: 600, color: COULEURS.navy },
    sepTitre: { fontSize: 11, fontWeight: 700, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${COULEURS.gris200}` },
    chip:     (c) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: c + '15', color: c, border: `1px solid ${c}30`, fontSize: 12, fontWeight: 600, margin: '3px' }),
    jourBarre:{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: COULEURS.blanc, borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, marginBottom: 6 },
    footer:   { padding: '14px 22px', borderTop: `1px solid ${COULEURS.gris200}`, display: 'flex', gap: 10, justifyContent: 'flex-end', background: COULEURS.blanc, flexShrink: 0 },
    btnSec:   { padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    btnPrim:  { padding: '8px 18px', borderRadius: 8, border: 'none', background: couleur, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans", sans-serif' },
    badge:    (bg, txt) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: bg, color: txt, fontSize: 11, fontWeight: 600 }),
  };

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.hTop}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={S.avatar}>
                {prof.photo
                  ? <img src={prof.photo} alt="profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : init}
              </div>
              <div>
                <div style={S.nom}>{prof.prenom} {prof.nom}</div>
                <div style={S.sous}>{LIBELLES_ROLES[prof.role]} · {prof.description || ''}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <span style={badgeStatut(prof.est_actif)}>{prof.est_actif ? 'Actif' : 'Inactif'}</span>
                  {prof.niveau_anglais && (
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                      Anglais {prof.niveau_anglais}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button style={S.btnX} onClick={onFermer}>×</button>
          </div>
          {/* Mini stats */}
          <div style={S.hStats}>
            <div style={S.hStat}>
              <div style={S.hStatVal}>{prof.annees_experience || '-'}</div>
              <div style={S.hStatLbl}>Ans d'exp.</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{(prof.certifications || []).length}</div>
              <div style={S.hStatLbl}>Certifications</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{(prof.specialites || []).length}</div>
              <div style={S.hStatLbl}>Spécialités</div>
            </div>
            <div style={S.hSep} />
            <div style={S.hStat}>
              <div style={S.hStatVal}>{dispoActives.length}</div>
              <div style={S.hStatLbl}>Jours dispo.</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              <span>{t.icone}</span><span>{t.lib}</span>
            </button>
          ))}
        </div>

        {/* Corps */}
        <div style={S.corps}>

          {tab === 'infos' && (
            <>
              <div style={S.grille2}>
                <div style={S.carte}>
                  <div style={S.lbl}>Email</div>
                  <div style={{ ...S.val, color: couleurTheme }}>{prof.email}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Téléphone</div>
                  <div style={S.val}>{prof.telephone || '-'}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Date de naissance</div>
                  <div style={S.val}>{prof.date_naissance || '-'}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Nationalité</div>
                  <div style={S.val}>{prof.nationalite || '-'}</div>
                </div>
                <div style={{ ...S.carte, gridColumn: '1 / -1' }}>
                  <div style={S.lbl}>Adresse / Ville</div>
                  <div style={S.val}>{prof.adresse || '-'}</div>
                </div>
              </div>
              <div style={S.grille2}>
                <div style={S.carte}>
                  <div style={S.lbl}>Rôle</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={S.chip(couleur)}>{LIBELLES_ROLES[prof.role]}</span>
                  </div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Date de prise de poste</div>
                  <div style={S.val}>{prof.date_debut_poste || '-'}</div>
                </div>
              </div>
              {prof.bio && (
                <div style={S.carte}>
                  <div style={S.lbl}>Biographie</div>
                  <div style={{ fontSize: 13, color: COULEURS.gris600, lineHeight: 1.7, marginTop: 4 }}>{prof.bio}</div>
                </div>
              )}
            </>
          )}

          {tab === 'certifs' && (
            <>
              <div style={S.sepTitre}>Formation académique</div>
              <div style={S.grille2}>
                <div style={S.carte}>
                  <div style={S.lbl}>Niveau d'études</div>
                  <div style={S.val}>{prof.niveau_etudes || '-'}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Établissement</div>
                  <div style={S.val}>{prof.etablissement_formation || '-'}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Niveau d'anglais certifié</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: couleur, marginTop: 2 }}>
                    {prof.niveau_anglais || '-'}
                  </div>
                </div>
              </div>
              <div style={S.sepTitre}>Certifications pédagogiques</div>
              {(prof.certifications || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10 }}>
                  Aucune certification renseignée.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {prof.certifications.map(c => (
                    <span key={c} style={{ padding: '6px 14px', borderRadius: 20, background: couleur + '15', color: couleur, border: `1.5px solid ${couleur}40`, fontSize: 13, fontWeight: 700 }}>
                      ✓ {c}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'exp' && (
            <>
              <div style={S.grille2}>
                <div style={S.carte}>
                  <div style={S.lbl}>Années d'expérience</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: couleur }}>{prof.annees_experience || '-'}</div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Établissements précédents</div>
                  <div style={S.val}>{prof.etablissements_precedents || '-'}</div>
                </div>
              </div>
              <div style={S.carte}>
                <div style={S.lbl}>Spécialités</div>
                <div style={{ marginTop: 6 }}>
                  {(prof.specialites || []).length === 0 ? <span style={{ color: COULEURS.gris400, fontSize: 13 }}>-</span>
                    : prof.specialites.map(s => <span key={s} style={S.chip(couleur)}>{s}</span>)}
                </div>
              </div>
              <div style={S.grille2}>
                <div style={S.carte}>
                  <div style={S.lbl}>Tranches d'âge</div>
                  <div style={{ marginTop: 6 }}>
                    {(prof.tranches_age || []).length === 0 ? <span style={{ color: COULEURS.gris400, fontSize: 13 }}>-</span>
                      : prof.tranches_age.map(t => <span key={t} style={S.chip('#8B5CF6')}>{t}</span>)}
                  </div>
                </div>
                <div style={S.carte}>
                  <div style={S.lbl}>Niveaux CECR</div>
                  <div style={{ marginTop: 6 }}>
                    {(prof.niveaux_enseignes || []).length === 0 ? <span style={{ color: COULEURS.gris400, fontSize: 13 }}>-</span>
                      : prof.niveaux_enseignes.map(n => <span key={n} style={S.chip('#F59E0B')}>{n}</span>)}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'planning' && (
            <>
              <div style={{ fontSize: 13, color: COULEURS.gris400, marginBottom: 16 }}>
                Disponibilités hebdomadaires définies par le professeur.
              </div>
              {JOURS_SEMAINE.map(id => {
                const d = prof.disponibilites?.[id];
                const actif = d?.actif;
                return (
                  <div key={id} style={{ ...S.jourBarre, background: actif ? couleur + '08' : COULEURS.blanc, border: `1px solid ${actif ? couleur + '40' : COULEURS.gris200}` }}>
                    <div style={{ width: 80, fontSize: 13, fontWeight: actif ? 700 : 500, color: actif ? COULEURS.navy : COULEURS.gris400 }}>
                      {JOURS_COURT[id]}
                    </div>
                    {actif ? (
                      <>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: COULEURS.succes, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: couleur }}>
                          {d.debut} → {d.fin}
                        </span>
                        <span style={{ fontSize: 11, color: COULEURS.gris400, marginLeft: 'auto' }}>
                          {Math.round((parseInt(d.fin) - parseInt(d.debut)) || 0)}h de cours
                        </span>
                      </>
                    ) : (
                      <>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: COULEURS.gris200, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: COULEURS.gris400 }}>Non disponible</span>
                      </>
                    )}
                  </div>
                );
              })}
              {dispoActives.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: COULEURS.gris400, border: `2px dashed ${COULEURS.gris200}`, borderRadius: 10, marginTop: 8 }}>
                  Aucune disponibilité renseignée.
                </div>
              )}
            </>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.btnSec} onClick={onFermer}>Fermer</button>
          <button style={S.btnPrim} onClick={() => { onFermer(); onEditer(prof); }}>✏️ Modifier</button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function GestionProfesseurs() {
  const { couleurTheme, couleurThemeFonce, couleurThemeClair } = useTheme();
  const [coachs,     setCoachs]     = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur,     setErreur]     = useState(null);
  const [recherche,  setRecherche]  = useState('');
  const [profDetail, setProfDetail] = useState(null);

  const chargerCoachs = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs?role=coach`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const d = await r.json();
      setCoachs((d.utilisateurs || []).map(mapCoach));
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { chargerCoachs(); }, [chargerCoachs]);

  async function toggleActifUser(id) {
    const coach = coachs.find(c => c.id === id);
    if (!coach) return;
    const nouvelEtat = !coach.est_actif;
    setCoachs(prev => prev.map(c => c.id === id ? { ...c, est_actif: nouvelEtat } : c));
    try {
      const r = await fetch(`${API_URL}/api/admin/utilisateurs/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ actif: nouvelEtat }),
      });
      if (!r.ok) throw new Error();
      toast.success(nouvelEtat ? `${coach.prenom} ${coach.nom} activé(e)` : `${coach.prenom} ${coach.nom} désactivé(e)`);
    } catch {
      setCoachs(prev => prev.map(c => c.id === id ? { ...c, est_actif: !nouvelEtat } : c));
      toast.error("Erreur lors du changement de statut");
    }
  }

  // Seuls les coachs habilités à la plateforme e-learning (acces_elearning=true) sont
  // affichés ici - un coach non habilité n'a rien à faire dans cette gestion e-learning.
  const tousProfs = coachs.filter(u => u.acces_elearning);
  const nbTitulaires  = tousProfs.filter(u => estRole(u.role, 'professeur_titulaire')).length;
  const nbRemplacants = tousProfs.filter(u => estRole(u.role, 'professeur_remplacant')).length;
  const nbActifs      = tousProfs.filter(u => u.est_actif).length;
  const nbCertifs     = tousProfs.filter(u => (u.certifications || []).length > 0).length;

  const liste = tousProfs
    .filter(u => recherche === '' || `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(recherche.toLowerCase()));

  const stats = [
    { label: 'Titulaires',    valeur: nbTitulaires,  couleur: '#0D9488' },
    { label: 'Remplaçants',   valeur: nbRemplacants, couleur: '#64748B' },
    { label: 'Actifs',        valeur: nbActifs,       couleur: COULEURS.succes },
    { label: 'Certifications',valeur: nbCertifs,      couleur: '#F59E0B' },
  ];

  return (
    <TopNavLayout stats={stats}>
      <div style={{ padding: 32, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

        {/* ── En-tête ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COULEURS.navy, marginBottom: 4 }}>👨‍🏫 Équipe pédagogique</div>
            <div style={{ fontSize: 13, color: COULEURS.gris400 }}>{liste.length} professeur{liste.length !== 1 ? 's' : ''} affiché{liste.length !== 1 ? 's' : ''} · BET E-Learning</div>
          </div>
          {/* Barre de recherche */}
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="🔍 Rechercher un professeur…"
            style={{ padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${COULEURS.gris200}`, fontSize: 13, fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none', minWidth: 260 }}
          />
        </div>

        {/* ── Tableau ── */}
        <div style={{ background: COULEURS.blanc, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: `1px solid ${COULEURS.gris200}` }}>

          {/* En-tête colonnes */}
          <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 2fr 1fr 1.4fr 1fr 1fr 1.1fr', padding: '10px 20px', background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}`, fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Professeur</span>
            <span>Rôle</span>
            <span>Email</span>
            <span>Niveau</span>
            <span>Certifications</span>
            <span>Expérience</span>
            <span>Disponibilités</span>
            <span>Statut / Actions</span>
          </div>

          {chargement && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: COULEURS.gris400 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Chargement des professeurs…</div>
            </div>
          )}

          {!chargement && erreur && (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: '#FEF2F2', borderRadius: 8, margin: 16, color: '#991B1B' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Impossible de charger les professeurs</div>
              <div style={{ fontSize: 12, marginBottom: 12, color: '#B91C1C' }}>{erreur}</div>
              <button onClick={chargerCoachs} style={{ padding: '7px 16px', borderRadius: 8, background: COULEURS.navy, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                🔄 Réessayer
              </button>
            </div>
          )}

          {!chargement && !erreur && liste.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: COULEURS.gris400 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍🏫</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Aucun professeur trouvé</div>
              <div style={{ fontSize: 13 }}>Modifiez votre recherche ou créez des profils depuis Gestion des droits</div>
            </div>
          )}

          {!chargement && !erreur && liste.map((p, idx) => {
            const couleur = COULEUR_ROLE[p.role] || couleurTheme;
            const init    = p.initiales || `${p.prenom?.[0] || ''}${p.nom?.[0] || ''}`.toUpperCase();
            const dispoNb = p.disponibilites ? JOURS_SEMAINE.filter(j => p.disponibilites[j]?.actif).length : 0;
            const estRempl = estRole(p.role, 'professeur_remplacant');

            return (
              <div
                key={p.id}
                style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 2fr 1fr 1.4fr 1fr 1fr 1.1fr', padding: '14px 20px', borderBottom: idx < liste.length - 1 ? `1px solid ${COULEURS.gris100}` : 'none', fontSize: 13, alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = COULEURS.gris50}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => setProfDetail(p)}
              >
                {/* Professeur - avatar + nom */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: couleur + '20', border: `2px solid ${couleur}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: couleur, flexShrink: 0, overflow: 'hidden' }}>
                    {p.photo ? <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: COULEURS.navy }}>{p.prenom} {p.nom}</div>
                    <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 1 }}>{p.description || ''}</div>
                  </div>
                </div>

                {/* Rôle */}
                <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: estRempl ? '#F1F5F9' : '#CCFBF1', color: estRempl ? '#64748B' : '#0D9488', width: 'fit-content' }}>
                  {estRempl ? '🔄 Remplaçant' : '🎓 Titulaire'}
                </span>

                {/* Email */}
                <span style={{ fontSize: 12, color: couleurTheme }}>{p.email}</span>

                {/* Niveau anglais */}
                <span style={{ fontSize: 13, fontWeight: 800, color: couleur }}>
                  {p.niveau_anglais || <span style={{ color: COULEURS.gris400, fontSize: 11, fontWeight: 400 }}>-</span>}
                </span>

                {/* Certifications */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(p.certifications || []).slice(0, 2).map(c => (
                    <span key={c} style={{ padding: '2px 7px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 600 }}>{c}</span>
                  ))}
                  {(p.certifications || []).length > 2 && (
                    <span style={{ padding: '2px 7px', borderRadius: 20, background: COULEURS.gris100, color: COULEURS.gris600, fontSize: 10 }}>+{p.certifications.length - 2}</span>
                  )}
                  {(p.certifications || []).length === 0 && <span style={{ fontSize: 11, color: COULEURS.gris400 }}>-</span>}
                </div>

                {/* Expérience */}
                <span style={{ color: COULEURS.gris600, fontSize: 12 }}>
                  {p.annees_experience ? `${p.annees_experience} ans` : <span style={{ color: COULEURS.gris400 }}>-</span>}
                </span>

                {/* Disponibilités */}
                <span style={{ fontSize: 12, color: dispoNb > 0 ? COULEURS.succes : COULEURS.gris400, fontWeight: dispoNb > 0 ? 600 : 400 }}>
                  {dispoNb > 0 ? `${dispoNb} j/sem.` : 'Non renseigné'}
                </span>

                {/* Statut + Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <span style={{ ...badgeStatut(p.est_actif), fontSize: 10 }}>{p.est_actif ? 'Actif' : 'Inactif'}</span>
                  <button
                    title={p.est_actif ? 'Désactiver' : 'Activer'}
                    onClick={() => toggleActifUser(p.id)}
                    style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${COULEURS.gris200}`, background: COULEURS.blanc, color: COULEURS.gris600, cursor: 'pointer', fontSize: 12, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    {p.est_actif ? '⏸' : '▶'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {profDetail && (
        <ModalProfSuivi
          prof={profDetail}
          onFermer={() => setProfDetail(null)}
        />
      )}
    </TopNavLayout>
  );
}
