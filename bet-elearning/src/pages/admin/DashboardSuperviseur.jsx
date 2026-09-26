// DashboardSuperviseur.jsx - Module Superviseur Général extrait de DashboardAdmin.jsx (profil admin_superviseur)
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { usePrompt } from '../../contexts/ConfirmContext';
import { COULEURS } from '../../constants/couleurs';

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

// ─────────────────────────── 1. CAHIERS COACHS ───────────────────────────
export function OngletCahiersCoachs() {
  const [coachs,   setCoachs]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreConformite, setFiltreConformite] = useState('tous');

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
    if (recherche && !`${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  const CONF_BADGE = {
    conforme:     { bg: '#D1FAE5', txt: '#065F46', lib: '✅ Conforme' },
    non_conforme: { bg: '#FEE2E2', txt: '#991B1B', lib: '⚠️ Non conforme' },
    en_attente:   { bg: '#FEF3C7', txt: '#92400E', lib: '⏳ En attente' },
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400 }}>Aucun coach trouvé.</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${COULEURS.gris200}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: COULEURS.gris50 }}>
                {['Coach', 'Groupes', 'Évaluations', 'Rapports Deputy', 'Note moyenne', 'Anomalies', 'Conformité'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COULEURS.gris600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map(c => {
                const conf = CONF_BADGE[c.statut_conformite] || CONF_BADGE.en_attente;
                return (
                  <tr key={c.id} style={{ borderTop: `1px solid ${COULEURS.gris100}` }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, color: COULEURS.navy }}>{c.prenom} {c.nom}</div>
                      <div style={{ fontSize: 11, color: COULEURS.gris400 }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_groupes}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_evaluations}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_rapports_deputy}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: c.note_moyenne && c.note_moyenne < 3 ? '#DC2626' : COULEURS.navy }}>{c.note_moyenne ? `${c.note_moyenne}/5` : '-'}</td>
                    <td style={{ padding: '10px 14px' }}>{c.nb_anomalies > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{c.nb_anomalies}</span> : '0'}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ background: conf.bg, color: conf.txt, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{conf.lib}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
