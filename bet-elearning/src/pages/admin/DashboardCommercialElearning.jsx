// DashboardCommercialElearning.jsx - Volet pédagogique de la Commerciale, porté depuis
// dash/src/Pages/CommercialDashboard/CommercialDashboard.jsx (18 504 lignes).
import { useState, useEffect, useCallback } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * OÙ VIVENT CES ONGLETS, ET POURQUOI CE N'EST PAS ÉVIDENT
 *
 * bet-elearning n'a aucun rôle « Commerciale » : `ROLE_MAP_BET` résout `commercial`,
 * `corporate` ET `admin_commercial` vers `admin_elearning`. Le menu `admin_commercial` existe
 * dans `TopNavLayout` mais c'est du code mort — aucun rôle ne s'y résout, donc rien de ce
 * qu'on y ajouterait ne serait jamais affiché.
 *
 * Ces écrans sont donc branchés sur `admin_elearning`, le rôle que les comptes commerciaux
 * reçoivent réellement. Son menu mélange de ce fait deux métiers ; c'est le choix retenu pour
 * ne pas défaire la fusion de rôles décidée côté bet-elearning.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * CE QUI N'EST PAS ICI, ET CE N'EST PAS UN OUBLI :
 *
 *   · Plannings et Suivi démarrage réutilisent `OngletPlanningsElearning` et
 *     `OngletSuiviDemarrage`, déjà écrits pour le Superviseur et l'Onboarding.
 *   · Tests reçus réutilise `BetLevelTestsTab` ouvert sur sa vue de résultats, comme chez
 *     l'agent Placement.
 *   · Comptes entreprises et Pipeline B2B pointent sur `DashboardAssistantCommercial` et
 *     `GestionEntreprises`, soit 6 024 lignes déjà en place et plus riches que les onglets
 *     B2B de dash.
 *
 * DEUX SOURCES DE DONNÉES, DEUX COMPORTEMENTS À CONNAÎTRE. Les écrans qui lisent le pipeline
 * d'inscription et l'appartenance aux classes (`assignations_parcours`,
 * `groupes_apprenants`) affichent de VRAIES données : ces tables sont communes aux deux
 * plateformes, parce qu'un inscrit est la même personne vue de dash ou d'ici. Ceux qui lisent
 * les classes e-learning (`classes_elearning`) sont vides aujourd'hui, et c'est l'état attendu.
 */

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` });

const _fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
const _date = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Une lecture d'API, avec ses trois états. Le `null` initial distingue « pas encore chargé »
    de « chargé et vide » — sans quoi tout écran affiche son état vide pendant la requête. */
function useLecture(chemin, cle) {
  const [donnees, setDonnees] = useState(null);
  const recharger = useCallback(async () => {
    try {
      const r = await fetch(`${_API}${chemin}`, { headers: _hdrs() });
      const d = await r.json().catch(() => ({}));
      setDonnees(Array.isArray(d[cle]) ? d[cle] : []);
    } catch { setDonnees([]); }
  }, [chemin, cle]);
  useEffect(() => { recharger(); }, [recharger]);
  return [donnees, recharger];
}

/* ── Briques partagées par les six écrans ────────────────────────────────────────────────── */

function Entete({ icone, titre, sous, droite }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>{icone} {titre}</h2>
        {sous && <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>{sous}</p>}
      </div>
      {droite}
    </div>
  );
}

function Vide({ icone, titre, texte }) {
  return (
    <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icone}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>{titre}</div>
      <p style={{ fontSize: 12, color: COULEURS.gris400, margin: '7px auto 0', maxWidth: 460, lineHeight: 1.65 }}>{texte}</p>
    </div>
  );
}

function Tableau({ colonnes, lignes, vide }) {
  const th = { padding: '10px 14px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' };
  if (!lignes.length) return vide;
  return (
    <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden', background: COULEURS.blanc }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
              {colonnes.map(c => <th key={c.lib} style={{ ...th, textAlign: c.align || 'left' }}>{c.lib}</th>)}
            </tr>
          </thead>
          <tbody>{lignes}</tbody>
        </table>
      </div>
    </div>
  );
}

const Td = ({ children, align, gras, couleur, petit }) => (
  <td style={{ padding: '11px 14px', fontSize: petit ? 11.5 : 13,
    color: couleur || (petit ? COULEURS.gris400 : COULEURS.gris900),
    textAlign: align || 'left', fontWeight: gras ? 700 : 400,
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal' }}>
    {children}
  </td>
);

const Pastille = ({ children, c, bg }) => (
  <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

const STATUT_DOSSIER = {
  en_attente: { lib: 'En attente', c: '#d97706', bg: '#fef3c7' },
  en_cours:   { lib: 'En cours',   c: '#0891b2', bg: '#e0f2fe' },
  valide:     { lib: 'Validé',     c: '#16a34a', bg: '#dcfce7' },
  actif:      { lib: 'Actif',      c: '#16a34a', bg: '#dcfce7' },
  annule:     { lib: 'Annulé',     c: '#dc2626', bg: '#fee2e2' },
};
const sdo = (s) => STATUT_DOSSIER[s] || { lib: s || '—', c: COULEURS.gris600, bg: COULEURS.gris100 };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES TÂCHES
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletCommMesTaches() {
  const { couleurTheme } = useTheme();
  const [assignations] = useLecture('/api/parcours/assignations', 'assignations');
  // Source e-learning, comme « Mes apprenants » : `/api/groupes/apprenants` remontait les
  // apprenants du présentiel de dash. Ces deux écrans n'utilisent que `suivi_checklist`,
  // `apprenant_id` et le total — tous présents dans la table d'ici.
  const [apprenants] = useLecture('/api/classes-elearning/apprenants/tous', 'apprenants');

  const chargement = assignations === null || apprenants === null;
  const a = assignations || [], ap = apprenants || [];

  /* Les trois files réelles de la commerciale : des dossiers à traiter, des dossiers dont le
     paiement n'est pas réglé, et des démarrages inachevés. dash compte les mêmes. */
  const aTraiter = a.filter(x => (x.statut || '') === 'en_attente' || !x.statut).length;
  const impayes  = a.filter(x => x.statut_paiement && !['paye', 'solde'].includes(x.statut_paiement)).length;
  const ETAPES = ['bienvenue', 'acces', 'kit', 'planning'];
  const demarragesIncomplets = ap.filter(x => {
    const cl = { ...(x.suivi_checklist || {}), bienvenue: !!x.apprenant_id, acces: !!x.apprenant_id };
    return ETAPES.some(e => !cl[e]);
  }).length;

  const taches = [
    { icone: '📥', label: 'Dossiers à traiter',              n: aTraiter,              vers: '/admin/commercial/inscriptions' },
    { icone: '💳', label: 'Dossiers au paiement non réglé',   n: impayes,               vers: '/admin/commercial/paiements' },
    { icone: '🚀', label: 'Démarrages incomplets',            n: demarragesIncomplets,  vers: '/admin/commercial/suivi' },
  ];
  const ouvertes = taches.filter(t => t.n > 0);
  const total = taches.reduce((s, t) => s + t.n, 0);

  return (
    <div>
      <Entete icone="✅" titre="Mes tâches" sous={
        chargement ? 'Calcul en cours…'
          : total > 0 ? `${total} élément${total > 1 ? 's' : ''} à traiter au total.`
          : 'Rien à traiter pour le moment — tout est à jour.'} />
      {chargement ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : ouvertes.length === 0 ? (
        <Vide icone="🎉" titre="Aucune tâche en attente"
          texte={`Vos ${a.length} dossiers et ${ap.length} apprenants sont à jour.`} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ouvertes.map(t => (
            <a key={t.label} href={t.vers}
              style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`,
                borderLeft: `4px solid ${couleurTheme}`, borderRadius: 12, padding: '15px 18px' }}>
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

export function OngletCommTableauBord() {
  const { couleurTheme } = useTheme();
  const [assignations] = useLecture('/api/parcours/assignations', 'assignations');
  // Source e-learning, comme « Mes apprenants » : `/api/groupes/apprenants` remontait les
  // apprenants du présentiel de dash. Ces deux écrans n'utilisent que `suivi_checklist`,
  // `apprenant_id` et le total — tous présents dans la table d'ici.
  const [apprenants] = useLecture('/api/classes-elearning/apprenants/tous', 'apprenants');
  const [classes] = useLecture('/api/classes-elearning', 'classes');

  const a = assignations || [], ap = apprenants || [], cl = classes || [];
  const encaisse = a.reduce((s, x) => s + (Number(x.montant_paye) || 0), 0);
  const convertis = a.filter(x => ['valide', 'actif'].includes(x.statut)).length;
  const taux = a.length ? Math.round((convertis / a.length) * 100) : 0;

  const kpis = [
    { l: 'Dossiers suivis',     v: a.length,       i: '📋', c: couleurTheme },
    { l: 'Convertis',           v: convertis,      i: '✅', c: COULEURS.succes },
    { l: 'Taux de conversion',  v: `${taux} %`,    i: '📈', c: COULEURS.cyanFonce },
    { l: 'Apprenants en classe', v: ap.length,     i: '🎓', c: '#7C3AED' },
    { l: 'Classes e-learning',  v: cl.length,      i: '🏫', c: '#0891b2' },
    { l: 'Encaissé',            v: _fcfa(encaisse), i: '💰', c: COULEURS.attention },
  ];

  /* Répartition par statut, calculée sur les dossiers réellement présents : une liste figée
     de statuts masquerait un statut nouveau introduit en base. */
  const parStatut = Object.entries(
    a.reduce((acc, x) => { const k = x.statut || 'inconnu'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
  ).sort((x, y) => y[1] - x[1]);

  return (
    <div>
      <Entete icone="📊" titre="Tableau de bord" sous="Vue d'ensemble de votre portefeuille" />
      {assignations === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
            {kpis.map(k => (
              <div key={k.l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
                borderRadius: 12, padding: '16px 18px', borderTop: `3px solid ${k.c}` }}>
                <div style={{ fontSize: 21, marginBottom: 5 }}>{k.i}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: k.c }}>{k.v}</div>
                <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 3 }}>{k.l}</div>
              </div>
            ))}
          </div>

          {parStatut.length > 0 && (
            <div style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: COULEURS.navy, marginBottom: 14 }}>
                Répartition des dossiers
              </div>
              {parStatut.map(([statut, n]) => {
                const pct = Math.round((n / a.length) * 100);
                const st = sdo(statut);
                return (
                  <div key={statut} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: COULEURS.gris600 }}>{st.lib}</span>
                      <span style={{ fontWeight: 700, color: COULEURS.navy }}>{n} · {pct} %</span>
                    </div>
                    <div style={{ height: 6, background: COULEURS.gris100, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: st.c, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   INSCRIPTIONS
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletCommInscriptions() {
  const { couleurTheme } = useTheme();
  const [assignations] = useLecture('/api/parcours/assignations', 'assignations');
  const [statut, setStatut] = useState('tous');
  const [q, setQ] = useState('');

  const a = assignations || [];
  const filtrees = a.filter(x => {
    if (statut !== 'tous' && (x.statut || 'en_attente') !== statut) return false;
    if (q.trim()) {
      const t = `${x.prospect_nom || ''} ${x.prospect_email || ''} ${x.prospect_telephone || ''}`.toLowerCase();
      if (!t.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const puce = (actif, c) => ({
    padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: '"Plus Jakarta Sans",sans-serif',
    border: `1.5px solid ${actif ? c : COULEURS.gris200}`,
    background: actif ? c : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
  });

  return (
    <div>
      <Entete icone="📥" titre="Inscriptions"
        sous={`${filtrees.length} dossier${filtrees.length > 1 ? 's' : ''} affiché${filtrees.length > 1 ? 's' : ''} sur ${a.length}`}
        droite={
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
            style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, minWidth: 180 }} />
        } />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setStatut('tous')} style={puce(statut === 'tous', couleurTheme)}>Tous · {a.length}</button>
        {Object.entries(STATUT_DOSSIER).map(([k, v]) => {
          const n = a.filter(x => (x.statut || 'en_attente') === k).length;
          return n === 0 ? null : (
            <button key={k} onClick={() => setStatut(k)} style={puce(statut === k, v.c)}>{v.lib} · {n}</button>
          );
        })}
      </div>

      {assignations === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : (
        <Tableau
          colonnes={[{ lib: 'Prospect' }, { lib: 'Contact' }, { lib: 'Offre' }, { lib: 'Niveau' },
                     { lib: 'Reçu le' }, { lib: 'Statut' }]}
          vide={<Vide icone="📥" titre={a.length === 0 ? 'Aucune inscription' : 'Aucun dossier pour ce filtre'}
            texte={a.length === 0
              ? "Aucun dossier ne vous est attribué. Le pipeline d'inscription est commun aux deux plateformes : un dossier créé sur dash apparaît ici."
              : 'Changez de filtre ou videz la recherche.'} />}
          lignes={filtrees.map(x => {
            const st = sdo(x.statut || 'en_attente');
            return (
              <tr key={x.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                <Td gras>{x.prospect_nom || '—'}</Td>
                <Td petit>{x.prospect_email || x.prospect_telephone || '—'}</Td>
                <Td>{x.inscription_offre || '—'}</Td>
                <Td>{x.niveau_client || '—'}</Td>
                <Td petit>{_date(x.created_at)}</Td>
                <Td><Pastille c={st.c} bg={st.bg}>{st.lib}</Pastille></Td>
              </tr>
            );
          })}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES CLASSES
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletCommMesClasses() {
  const { couleurTheme } = useTheme();
  const [classes] = useLecture('/api/classes-elearning', 'classes');
  const cl = classes || [];

  return (
    <div>
      <Entete icone="🏫" titre="Mes classes"
        sous={`${cl.length} classe${cl.length > 1 ? 's' : ''} BET E-Learning`} />
      {classes === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : cl.length === 0 ? (
        <Vide icone="🏫" titre="Aucune classe e-learning"
          texte="Aucune classe n'a encore été créée sur BET E-Learning. Les classes présentielles de dash n'apparaissent pas ici : les deux plateformes sont séparées pour qu'aucune ne fausse les statistiques de l'autre." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 13 }}>
          {cl.map(c => (
            <div key={c.id} style={{ background: COULEURS.blanc, border: `1.5px solid ${COULEURS.gris200}`, borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COULEURS.navy }}>{c.nom || 'Classe sans nom'}</div>
              <div style={{ fontSize: 11, color: COULEURS.gris400, marginTop: 3 }}>
                {c.niveau || '—'} · {c.type_cours || '—'}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: COULEURS.gris600, marginTop: 11 }}>
                <span>👤 {c.coach_nom || 'sans coach'}</span>
                <span>🎓 {c.nb_apprenants ?? 0}</span>
              </div>
              {c.date_debut && (
                <div style={{ fontSize: 11, color: couleurTheme, marginTop: 8, fontWeight: 600 }}>
                  📅 {_date(c.date_debut)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   MES APPRENANTS
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletCommMesApprenants() {
  /* ⚠️ LA SOURCE EST CELLE DE CETTE PLATEFORME.
     Cet onglet lisait `/api/groupes/apprenants`, c'est-à-dire `groupes_apprenants` : la
     table des classes de DASH, partagée entre les deux plateformes. Il affichait donc les
     apprenants du présentiel. `/api/classes-elearning/apprenants/tous` ne rend que les
     inscrits des classes e-learning.
     Les champs changent avec la table : `nom_complet` au lieu de
     `prenom_apprenant`/`nom_apprenant`, `classe_nom` au lieu de `groupe_nom`. Garder les
     anciens noms aurait rempli le tableau de tirets sans rien signaler. */
  const [apprenants] = useLecture('/api/classes-elearning/apprenants/tous', 'apprenants');
  /* Le coach n'est pas porté par l'inscription mais par la CLASSE : on le résout ici
     plutôt que de l'omettre - savoir qui encadre un apprenant fait partie du suivi. */
  const [classes] = useLecture('/api/classes-elearning', 'classes');
  const coachParClasse = Object.fromEntries((classes || []).map(c => [c.id, c.coach_nom]));

  const [q, setQ] = useState('');
  const ap = apprenants || [];
  const nomDe = (x) => (x.nom_complet || `${x.prenom || ''} ${x.nom || ''}`).trim();
  const filtrees = ap.filter(x => {
    if (!q.trim()) return true;
    const t = `${nomDe(x)} ${x.email || ''} ${x.classe_nom || ''} ${coachParClasse[x.classe_id] || ''}`.toLowerCase();
    return t.includes(q.trim().toLowerCase());
  });

  return (
    <div>
      <Entete icone="🎓" titre="Mes apprenants"
        sous={`${filtrees.length} apprenant${filtrees.length > 1 ? 's' : ''} sur ${ap.length}`}
        droite={
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
            style={{ padding: '7px 11px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 12, minWidth: 180 }} />
        } />
      {apprenants === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : (
        <Tableau
          colonnes={[{ lib: 'Apprenant' }, { lib: 'Classe' }, { lib: 'Coach' }, { lib: 'Inscrit le' }, { lib: 'Compte' }]}
          vide={<Vide icone="🎓" titre={ap.length === 0 ? 'Aucun apprenant' : 'Aucun résultat'}
            texte={ap.length === 0
              ? "Aucun apprenant n'est encore inscrit dans une classe e-learning. Les apprenants du présentiel relèvent de dash et ne sont pas listés ici."
              : 'Videz la recherche pour revoir la liste.'} />}
          lignes={filtrees.map(x => (
            <tr key={x.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
              <Td gras>{nomDe(x) || '—'}</Td>
              <Td>{x.classe_nom || '—'}</Td>
              <Td>{coachParClasse[x.classe_id] || '—'}</Td>
              <Td petit>{_date(x.date_ajout || x.created_at)}</Td>
              <Td>
                {/* `apprenant_id` renseigné = le compte d'accès existe réellement. C'est ce qui
                    distingue un apprenant inscrit d'un apprenant qui peut se connecter. */}
                {x.apprenant_id
                  ? <Pastille c="#065F46" bg="#dcfce7">actif</Pastille>
                  : <Pastille c="#92400e" bg="#fef3c7">sans accès</Pastille>}
              </Td>
            </tr>
          ))}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   PAIEMENTS
═══════════════════════════════════════════════════════════════════════════════════════════ */

export function OngletCommPaiements() {
  const { couleurTheme } = useTheme();
  const [assignations] = useLecture('/api/parcours/assignations', 'assignations');
  const [filtre, setFiltre] = useState('tous');

  const a = assignations || [];
  const estRegle = (x) => ['paye', 'solde'].includes(x.statut_paiement);
  const filtrees = a.filter(x =>
    filtre === 'tous' ? true : filtre === 'regles' ? estRegle(x) : !estRegle(x));

  const encaisse = a.reduce((s, x) => s + (Number(x.montant_paye) || 0), 0);
  const nbImpayes = a.filter(x => !estRegle(x)).length;

  const puce = (actif) => ({
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: '"Plus Jakarta Sans",sans-serif',
    border: `1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`,
    background: actif ? couleurTheme : COULEURS.blanc, color: actif ? '#fff' : COULEURS.gris600,
  });

  return (
    <div>
      <Entete icone="💳" titre="Paiements" sous="État de règlement de vos dossiers" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
        {[
          { l: 'Encaissé',        v: _fcfa(encaisse), c: COULEURS.succes },
          { l: 'Dossiers réglés', v: a.length - nbImpayes, c: couleurTheme },
          { l: 'Non réglés',      v: nbImpayes, c: nbImpayes ? COULEURS.erreur : COULEURS.gris400 },
        ].map(k => (
          <div key={k.l} style={{ background: COULEURS.blanc, border: `1px solid ${COULEURS.gris200}`,
            borderRadius: 12, padding: '15px 18px', borderTop: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: k.c }}>{k.v}</div>
            <div style={{ fontSize: 11, color: COULEURS.gris600, marginTop: 3 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ v: 'tous', l: 'Tous' }, { v: 'impayes', l: 'Non réglés' }, { v: 'regles', l: 'Réglés' }].map(f => (
          <button key={f.v} onClick={() => setFiltre(f.v)} style={puce(filtre === f.v)}>{f.l}</button>
        ))}
      </div>

      {assignations === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : (
        <Tableau
          colonnes={[{ lib: 'Prospect' }, { lib: 'Offre' }, { lib: 'Mode' },
                     { lib: 'Payé', align: 'right' }, { lib: 'Règlement' }]}
          vide={<Vide icone="💳" titre="Aucun dossier"
            texte={a.length === 0
              ? "Aucun dossier ne vous est attribué."
              : `Aucun dossier ${filtre === 'regles' ? 'réglé' : 'non réglé'}.`} />}
          lignes={filtrees.map(x => (
            <tr key={x.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
              <Td gras>{x.prospect_nom || '—'}</Td>
              <Td>{x.inscription_offre || '—'}</Td>
              <Td petit>{x.mode_paiement || '—'}</Td>
              <Td align="right" gras>{_fcfa(x.montant_paye)}</Td>
              <Td>
                {estRegle(x)
                  ? <Pastille c="#065F46" bg="#dcfce7">réglé</Pastille>
                  : <Pastille c="#991b1b" bg="#fee2e2">{x.statut_paiement || 'en attente'}</Pastille>}
              </Td>
            </tr>
          ))}
        />
      )}
    </div>
  );
}
