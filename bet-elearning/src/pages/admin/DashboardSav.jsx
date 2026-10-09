// DashboardSav.jsx - Module Assistante SAV (profil assistant_sav)
import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { COULEURS } from '../../constants/couleurs';

/**
 * L'ESPACE DE L'ASSISTANTE SAV, PORTÉ DEPUIS DASH.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE RÔLE N'EXISTAIT PAS ICI
 *
 * `assistant_sav` est le plus récent des rôles BET : il a été créé côté dash, avec son
 * dashboard, et bet-elearning ne le connaissait pas du tout — ni dans `ROLES`, ni dans
 * `MENUS_PAR_ROLE`, ni dans le routage. Une assistante SAV qui se connectait ici était
 * renvoyée au portail de connexion.
 *
 * L'IDENTIFIANT RESTE `assistant_sav`, celui de la base. bet-elearning préfixe d'ordinaire
 * ses rôles de façade (`admin_onboarding`, `admin_customer_care`) parce que leur rôle réel en
 * base porte un autre nom. Ce n'est pas le cas ici : inventer `admin_sav` aurait créé un
 * second identifiant pour un seul métier, à tenir synchronisé dans la matrice des droits, le
 * Backend et `app_metadata`. Un seul nom, donc.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * LA SOURCE EST `/api/plaintes`, LA MÊME QUE CUSTOMER CARE — et c'est voulu : une demande SAV
 * et une plainte sont la même ligne, vue par deux métiers. Deux tables auraient obligé à
 * décider, à la réception, laquelle des deux équipes « possède » le problème.
 *
 * ⚠️ UN POINT DE SÉCURITÉ À NE PAS OUBLIER. `PATCH` et `DELETE /api/plaintes/:id` ne portent
 * AUCUN `requirePermission` côté serveur (`Backend/src/routes/plaintes.js:60` et `:81`) : seule
 * l'interface masque les boutons. Et `assistant_sav` n'a aujourd'hui aucune ligne dans
 * `permissions_roles`, donc `POST /api/plaintes` (protégé par `support.create`) lui est refusé.
 * Cet écran fonctionne malgré cela — il ne fait que lire et mettre à jour — mais le rôle doit
 * recevoir ses droits pour être complet.
 */

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` });

/* Les mêmes configurations que dash, aux mêmes valeurs : un statut « en_cours » doit se lire
   « En cours » et s'afficher en orange des deux côtés, sinon la même demande paraît différente
   selon la plateforme par laquelle on la regarde. */
const STATUT_CFG = {
  ouverte:  { label: 'Ouverte',  couleur: '#dc2626', fond: '#fee2e2', icone: '🔓' },
  en_cours: { label: 'En cours', couleur: '#d97706', fond: '#fef3c7', icone: '⚙️' },
  resolue:  { label: 'Résolue',  couleur: '#16a34a', fond: '#dcfce7', icone: '✅' },
  fermee:   { label: 'Fermée',   couleur: '#6b7280', fond: '#f3f4f6', icone: '🔒' },
};

const PRIORITE_CFG = {
  critique: { label: 'Critique', couleur: '#dc2626', fond: '#fee2e2', icone: '🔴', ordre: 1 },
  haute:    { label: 'Haute',    couleur: '#d97706', fond: '#fef3c7', icone: '🟡', ordre: 2 },
  normale:  { label: 'Normale',  couleur: '#0891b2', fond: '#e0f2fe', icone: '🔵', ordre: 3 },
  faible:   { label: 'Faible',   couleur: '#16a34a', fond: '#dcfce7', icone: '🟢', ordre: 4 },
};

const fmtDateHeure = (d) => {
  if (!d) return '—';
  const v = new Date(d);
  return isNaN(v.getTime()) ? '—'
    : v.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' · '
      + v.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

/** Les demandes SAV, partagées par tous les onglets du module. */
function useDemandesSav() {
  const [demandes, setDemandes] = useState(null);   // null = pas encore chargé, ≠ []
  const [enregistre, setEnregistre] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const r = await fetch(`${_API}/api/plaintes`, { headers: _hdrs() });
      const d = await r.json().catch(() => ({}));
      setDemandes(Array.isArray(d.plaintes) ? d.plaintes : []);
    } catch { setDemandes([]); }
  }, []);

  useEffect(() => { recharger(); }, [recharger]);

  /** Mise à jour d'une demande, puis rechargement : le serveur recalcule des champs dérivés
      (dates de prise en charge, de résolution) qu'on ne saurait pas reproduire ici. */
  const modifier = useCallback(async (id, champs) => {
    if (enregistre) return false;
    setEnregistre(true);
    try {
      const r = await fetch(`${_API}/api/plaintes/${id}`, {
        method: 'PATCH', headers: _hdrs(), body: JSON.stringify(champs),
      });
      if (!r.ok) throw new Error();
      await recharger();
      toast.success('Demande mise à jour');
      return true;
    } catch {
      toast.error("La demande n'a pas pu être mise à jour", { duration: 5000 });
      return false;
    } finally { setEnregistre(false); }
  }, [enregistre, recharger]);

  return { demandes, recharger, modifier, enregistre };
}

/** Les compteurs dont les trois premiers onglets ont besoin. */
function useKpisSav(demandes) {
  return useMemo(() => {
    const l = demandes || [];
    const resolues = l.filter(p => p.statut === 'resolue' || p.statut === 'fermee').length;
    return {
      total: l.length,
      ouvertes: l.filter(p => p.statut === 'ouverte').length,
      enCours: l.filter(p => p.statut === 'en_cours').length,
      urgentes: l.filter(p => ['critique', 'haute'].includes(p.priorite)
        && ['ouverte', 'en_cours'].includes(p.statut)).length,
      tauxResolution: l.length ? `${Math.round((resolues / l.length) * 100)}%` : '—',
    };
  }, [demandes]);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES TÂCHES
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletMesTachesSav() {
  const { couleurTheme } = useTheme();
  const { demandes } = useDemandesSav();
  const k = useKpisSav(demandes);
  const chargement = demandes === null;

  const taches = [
    { icone: '🔓', label: 'Demandes ouvertes, jamais prises en charge', n: k.ouvertes },
    { icone: '⚙️', label: 'Demandes en cours de traitement',            n: k.enCours },
    { icone: '🔴', label: 'Demandes urgentes non résolues',             n: k.urgentes },
  ];
  const ouvertes = taches.filter(t => t.n > 0);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>✅ Mes tâches</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          {chargement ? 'Calcul en cours…'
            : k.ouvertes + k.enCours > 0
              ? `${k.ouvertes + k.enCours} demande${k.ouvertes + k.enCours > 1 ? 's' : ''} à traiter.`
              : 'Rien à traiter pour le moment — tout est à jour.'}
        </p>
      </div>

      {chargement ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : ouvertes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Aucune tâche en attente</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5 }}>
            {k.total === 0 ? 'Aucune demande SAV enregistrée.' : `Les ${k.total} demandes reçues sont traitées.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ouvertes.map(t => (
            <a key={t.label} href="/admin/sav/demandes"
              style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                padding: '15px 18px', borderRadius: 12, background: COULEURS.blanc,
                border: `1.5px solid ${COULEURS.gris200}`, borderLeft: `4px solid ${couleurTheme}` }}>
              <span style={{ fontSize: 22 }}>{t.icone}</span>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: COULEURS.navy }}>{t.label}</span>
              <span style={{ background: couleurTheme + '18', color: couleurTheme, borderRadius: 20,
                padding: '4px 12px', fontSize: 13, fontWeight: 800 }}>{t.n}</span>
              <span style={{ color: COULEURS.gris400, fontSize: 16 }}>›</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   TABLEAU DE BORD
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletTableauBordSav() {
  const { couleurTheme } = useTheme();
  const { demandes } = useDemandesSav();
  const k = useKpisSav(demandes);
  const liste = demandes || [];

  /* Les plus urgentes d'abord, puis les plus anciennes : c'est l'ordre dans lequel on les
     traite, donc l'ordre dans lequel elles doivent s'afficher. Trier par date seule ferait
     passer une demande critique derrière dix demandes faibles plus anciennes. */
  const aTraiter = [...liste]
    .filter(p => ['ouverte', 'en_cours'].includes(p.statut))
    .sort((a, b) => {
      const pa = PRIORITE_CFG[a.priorite]?.ordre ?? 9;
      const pb = PRIORITE_CFG[b.priorite]?.ordre ?? 9;
      return pa !== pb ? pa - pb : String(a.created_at || '').localeCompare(String(b.created_at || ''));
    })
    .slice(0, 6);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>🏠 Tableau de bord SAV</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          Vue d'ensemble des demandes après-vente
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { l: 'Ouvertes',         v: k.ouvertes,       c: '#dc2626',          i: '🔓' },
          { l: 'En cours',         v: k.enCours,        c: '#d97706',          i: '⚙️' },
          { l: 'Urgentes',         v: k.urgentes,       c: '#b91c1c',          i: '🔴' },
          { l: 'Taux de résolution', v: k.tauxResolution, c: COULEURS.succes,  i: '✅' },
          { l: 'Total reçu',       v: k.total,          c: couleurTheme,       i: '📨' },
        ].map(c => (
          <div key={c.l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
            borderRadius: 12, padding: '16px 18px', borderTop: `3px solid ${c.c}` }}>
            <div style={{ fontSize: 21, marginBottom: 5 }}>{c.i}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: c.c }}>{c.v}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 3 }}>{c.l}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 800, color: COULEURS.navy, margin: '0 0 12px' }}>
        À traiter en priorité
      </h3>
      {demandes === null ? (
        <div style={{ textAlign: 'center', padding: 40, color: COULEURS.gris400 }}>Chargement…</div>
      ) : aTraiter.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 36, background: COULEURS.gris50, borderRadius: 12, color: COULEURS.gris400, fontSize: 13 }}>
          Aucune demande en attente.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {aTraiter.map(p => {
            const s = STATUT_CFG[p.statut] || STATUT_CFG.ouverte;
            const pr = PRIORITE_CFG[p.priorite] || PRIORITE_CFG.normale;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: COULEURS.blanc,
                border: `1px solid ${COULEURS.gris200}`, borderRadius: 10, padding: '12px 15px' }}>
                <span style={{ fontSize: 15 }}>{pr.icone}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COULEURS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.sujet || p.objet || 'Demande sans objet'}
                  </div>
                  <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 2 }}>
                    {p.apprenant_nom || p.auteur_nom || 'Demandeur inconnu'} · {fmtDateHeure(p.created_at)}
                  </div>
                </div>
                <span style={{ background: s.fond, color: s.couleur, borderRadius: 20, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {s.icone} {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   DEMANDES SAV
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletDemandesSav() {
  const { couleurTheme } = useTheme();
  const { profile } = useAuth();
  const { demandes, recharger, modifier, enregistre } = useDemandesSav();
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [filtrePriorite, setFiltrePriorite] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [ouverte, setOuverte] = useState(null);
  const [note, setNote] = useState('');

  const liste = demandes || [];
  const filtrees = liste.filter(p => {
    if (filtreStatut !== 'tous' && p.statut !== filtreStatut) return false;
    if (filtrePriorite !== 'tous' && p.priorite !== filtrePriorite) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const champs = `${p.sujet || ''} ${p.objet || ''} ${p.description || ''} ${p.apprenant_nom || ''} ${p.auteur_nom || ''}`.toLowerCase();
      if (!champs.includes(q)) return false;
    }
    return true;
  });

  const nomAgent = `${profile?.prenom || ''} ${profile?.nom || ''}`.trim() || profile?.email || 'Assistante SAV';

  async function prendreEnCharge(p) {
    await modifier(p.id, { statut: 'en_cours', prise_en_charge_par_id: profile?.id, prise_en_charge_par_nom: nomAgent });
  }

  async function resoudre(p) {
    const ok = await modifier(p.id, { statut: 'resolue', note_resolution: note.trim() || null });
    if (ok) { setNote(''); setOuverte(null); }
  }

  const puce = (actif, couleur) => ({
    padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: '"Plus Jakarta Sans",sans-serif',
    border: `1.5px solid ${actif ? couleur : COULEURS.gris200}`,
    background: actif ? couleur : COULEURS.blanc,
    color: actif ? '#fff' : COULEURS.gris600,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>📨 Demandes SAV</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
            {filtrees.length} demande{filtrees.length > 1 ? 's' : ''} affichée{filtrees.length > 1 ? 's' : ''} sur {liste.length}
          </p>
        </div>
        <button onClick={recharger}
          style={{ padding: '7px 14px', background: couleurTheme + '15', border: `1px solid ${couleurTheme}40`,
            borderRadius: 8, fontSize: 12, color: couleurTheme, fontWeight: 600, cursor: 'pointer' }}>
          ↻ Actualiser
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setFiltreStatut('tous')} style={puce(filtreStatut === 'tous', couleurTheme)}>
          Tous · {liste.length}
        </button>
        {Object.entries(STATUT_CFG).map(([k, c]) => (
          <button key={k} onClick={() => setFiltreStatut(k)} style={puce(filtreStatut === k, c.couleur)}>
            {c.icone} {c.label} · {liste.filter(p => p.statut === k).length}
          </button>
        ))}
        <select value={filtrePriorite} onChange={e => setFiltrePriorite(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, marginLeft: 'auto' }}>
          <option value="tous">Toutes priorités</option>
          {Object.entries(PRIORITE_CFG).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher…"
          style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, minWidth: 160 }} />
      </div>

      {demandes === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtrees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 44, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}`, color: COULEURS.gris400, fontSize: 13 }}>
          {liste.length === 0 ? 'Aucune demande SAV enregistrée.' : 'Aucune demande ne correspond à ces filtres.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtrees.map(p => {
            const s = STATUT_CFG[p.statut] || STATUT_CFG.ouverte;
            const pr = PRIORITE_CFG[p.priorite] || PRIORITE_CFG.normale;
            const estOuverte = ouverte === p.id;
            return (
              <div key={p.id} style={{ background: COULEURS.blanc, border: `1.5px solid ${estOuverte ? couleurTheme + '55' : COULEURS.gris200}`,
                borderRadius: 12, padding: '14px 16px', borderLeft: `4px solid ${pr.couleur}` }}>
                <div onClick={() => { setOuverte(estOuverte ? null : p.id); setNote(''); }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>
                      {p.sujet || p.objet || 'Demande sans objet'}
                    </div>
                    <div style={{ fontSize: 11.5, color: COULEURS.gris400, marginTop: 3 }}>
                      {p.apprenant_nom || p.auteur_nom || 'Demandeur inconnu'} · {fmtDateHeure(p.created_at)}
                      {p.prise_en_charge_par_nom && ` · prise en charge par ${p.prise_en_charge_par_nom}`}
                    </div>
                  </div>
                  <span style={{ background: pr.fond, color: pr.couleur, borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {pr.label}
                  </span>
                  <span style={{ background: s.fond, color: s.couleur, borderRadius: 20, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {s.icone} {s.label}
                  </span>
                </div>

                {estOuverte && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COULEURS.gris100}` }}>
                    {p.description && (
                      <p style={{ margin: '0 0 14px', fontSize: 13, color: COULEURS.gris600, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                        {p.description}
                      </p>
                    )}
                    {p.note_resolution && (
                      <div style={{ background: '#dcfce7', borderRadius: 9, padding: '10px 13px', marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46', marginBottom: 3 }}>Note de résolution</div>
                        <div style={{ fontSize: 12.5, color: '#065F46', whiteSpace: 'pre-line' }}>{p.note_resolution}</div>
                      </div>
                    )}

                    {/* LES ACTIONS SUIVENT LE STATUT : une demande ouverte se prend en charge,
                        une demande en cours se résout. Afficher les deux boutons en permanence
                        laisserait résoudre une demande que personne n'a traitée. */}
                    {p.statut === 'ouverte' && (
                      <button onClick={() => prendreEnCharge(p)} disabled={enregistre}
                        style={{ padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                          background: '#d97706', color: '#fff', fontSize: 12.5, fontWeight: 700,
                          opacity: enregistre ? 0.5 : 1, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                        ⚙️ Prendre en charge
                      </button>
                    )}
                    {p.statut === 'en_cours' && (
                      <div>
                        <textarea value={note} onChange={e => setNote(e.target.value)}
                          placeholder="Ce qui a été fait pour résoudre la demande (optionnel)"
                          style={{ width: '100%', minHeight: 70, padding: '10px 12px', borderRadius: 9,
                            border: `1px solid ${COULEURS.gris200}`, fontSize: 12.5, resize: 'vertical',
                            boxSizing: 'border-box', fontFamily: '"Plus Jakarta Sans",sans-serif' }} />
                        <button onClick={() => resoudre(p)} disabled={enregistre}
                          style={{ marginTop: 10, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                            background: COULEURS.succes, color: '#fff', fontSize: 12.5, fontWeight: 700,
                            opacity: enregistre ? 0.5 : 1, fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                          ✅ Marquer résolue
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   REMBOURSEMENTS & SUIVI SATISFACTION — ébauches, comme sur dash

   CES DEUX ONGLETS NE SONT PAS OUBLIÉS : ils sont vides sur dash aussi, où ils affichent le
   même message « à connecter ». Les porter en l'état plutôt que les masquer garde les deux
   plateformes identiques — une assistante qui connaît dash ne se demande pas où est passé
   l'onglet — et dit franchement que le circuit de traitement reste à définir.
═══════════════════════════════════════════════════════════════════════════════════════════ */

function EnConstruction({ icone, titre, description }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 28px', background: COULEURS.gris50,
      borderRadius: 16, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 42, marginBottom: 14 }}>{icone}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: COULEURS.navy, marginBottom: 8 }}>{titre}</div>
      <p style={{ margin: '0 auto', maxWidth: 520, fontSize: 13, color: COULEURS.gris600, lineHeight: 1.65 }}>
        {description}
      </p>
    </div>
  );
}

export function OngletRemboursementsSav() {
  return (
    <EnConstruction icone="💳" titre="Remboursements — à connecter"
      description="Cet onglet accueillera le suivi des demandes de remboursement (statut, montant, motif, validation comptable) dès que le circuit de traitement réel sera défini avec l'équipe BET. Il est au même stade sur dash." />
  );
}

export function OngletSatisfactionSav() {
  return (
    <EnConstruction icone="😊" titre="Suivi satisfaction — à connecter"
      description="Cet onglet accueillera le suivi de satisfaction post-formation (relances, notes, retours apprenants) une fois le périmètre et les données disponibles. Il est au même stade sur dash." />
  );
}
