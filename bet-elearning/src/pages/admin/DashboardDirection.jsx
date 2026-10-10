// DashboardDirection.jsx - Écrans propres à la direction (super_admin, admin, manager)
import { useState, useEffect } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { useTheme } from '../../contexts/ThemeContext';
import { LIBELLES_ROLES } from '../../constants/roles';
import { useAuth } from '../../contexts/AuthContext';

/**
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * TROIS RÔLES, TROIS MENUS — ET CE QUE JE N'AI PAS RECOPIÉ DE DASH
 *
 * Jusqu'ici `admin`, `super_admin` et `manager` partageaient la façade `admin_manager` : même
 * menu de neuf onglets, tous étiquetés « Manager BET ». Ils ont désormais leur propre rôle, et
 * à partir d'ici leur propre menu.
 *
 * Dash leur donne respectivement dix-sept, vingt et huit onglets. Je n'ai PAS porté neuf de
 * ceux du Super Admin, et c'est un choix qu'il faut pouvoir défendre :
 *
 *     Plateforme · Boutique · Média · Campagnes & Newsletters · Trafic web ·
 *     Sondages · Planning assistantes · Offres & Formations · Clients & Prospects
 *
 * Ces écrans ne pilotent pas une plateforme d'apprentissage : ils pilotent le SITE PUBLIC de
 * BET et les opérations propres à dash — le contenu marketing, la boutique en ligne, le
 * catalogue d'offres, les campagnes, les sondages, le planning des assistantes. Il n'en existe
 * qu'un seul exemplaire, et il est déjà administré depuis dash. Les rouvrir ici créerait une
 * seconde porte sur la même chose, sans aucun moyen de savoir laquelle a servi en dernier.
 * C'est le raisonnement déjà retenu pour la grille tarifaire et les onglets B2B.
 *
 * CE QUI EST ICI, EN REVANCHE, c'est la supervision de BET E-Learning : ses apprenants, ses
 * classes, ses coachs, ses paiements, son audit — et pour le Super Admin seul, la gouvernance
 * des droits et de la configuration. Presque tout existait déjà sous forme de composants :
 * les menus les assemblent, ils ne les réécrivent pas.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const _hdrs = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` });

/**
 * MES TÂCHES — ce qui attend la direction, à l'échelle de la plateforme.
 *
 * LES COMPTEURS SONT TRANSVERSES, et c'est ce qui distingue cet écran de celui des autres
 * métiers : un agent voit SA file, la direction voit ce qui traîne chez les autres. D'où des
 * seuils plutôt que des totaux — « 3 classes sans coach » est une anomalie à traiter, « 37
 * classes » est une information, pas une tâche.
 *
 * CHAQUE LIGNE N'APPARAÎT QUE SI SA DONNÉE A PU ÊTRE LUE. Un compteur à zéro faute de réponse
 * du serveur affirmerait que tout va bien — c'est exactement l'inverse de ce qu'on veut d'un
 * écran de supervision. Les lectures qui échouent sont donc comptées et annoncées en bas.
 */
export function OngletDirectionMesTaches() {
  const { couleurTheme } = useTheme();
  const { profile } = useAuth();
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const lire = async (chemin, cle) => {
        try {
          const r = await fetch(`${_API}${chemin}`, { headers: _hdrs() });
          if (!r.ok) return null;
          const d = await r.json().catch(() => null);
          if (!d) return null;
          return Array.isArray(d[cle]) ? d[cle] : null;
        } catch { return null; }
      };
      const [classes, apprenants, rapports, anomalies] = await Promise.all([
        lire('/api/classes-elearning', 'classes'),
        lire('/api/groupes/apprenants', 'apprenants'),
        lire('/api/superviseur/rapports-deputy', 'rapports'),
        lire('/api/superviseur/anomalies', 'anomalies'),
      ]);
      if (vivant) setEtat({ classes, apprenants, rapports, anomalies });
    })();
    return () => { vivant = false; };
  }, []);

  if (!etat) {
    return <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>;
  }

  const { classes, apprenants, rapports, anomalies } = etat;
  const echecs = [['classes e-learning', classes], ['apprenants', apprenants],
                  ['rapports', rapports], ['anomalies', anomalies]]
    .filter(([, v]) => v === null).map(([n]) => n);

  const taches = [];
  if (classes) {
    const sansCoach = classes.filter(c => !c.coach_nom && c.statut !== 'terminee').length;
    if (sansCoach) taches.push({ icone: '⚠️', label: 'Classes actives sans coach attribué', n: sansCoach, vers: '/admin/onboarding/classes' });
  }
  if (apprenants) {
    const sansAcces = apprenants.filter(a => !a.apprenant_id).length;
    if (sansAcces) taches.push({ icone: '🔑', label: "Apprenants sans compte d'accès", n: sansAcces, vers: '/admin/direction/apprenants' });
  }
  if (anomalies) {
    const ouvertes = anomalies.filter(a => a.statut === 'ouvert').length;
    if (ouvertes) taches.push({ icone: '🚨', label: 'Anomalies de supervision ouvertes', n: ouvertes, vers: '/admin/superviseur/anomalies' });
  }
  if (rapports) {
    const nonLus = rapports.filter(r => r.statut === 'soumis').length;
    if (nonLus) taches.push({ icone: '📋', label: "Rapports d'observation non lus", n: nonLus, vers: '/admin/superviseur/rapports-deputy' });
  }

  const total = taches.reduce((s, t) => s + t.n, 0);
  const libRole = LIBELLES_ROLES[profile?.role] || 'Direction';

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>✅ Mes tâches</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
          {libRole} · {total > 0
            ? `${total} point${total > 1 ? 's' : ''} d'attention sur BET E-Learning.`
            : "Rien ne requiert votre attention sur BET E-Learning."}
        </p>
      </div>

      {taches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>Aucun point d'attention</div>
          <div style={{ fontSize: 12, color: COULEURS.gris400, marginTop: 5, maxWidth: 440, margin: '5px auto 0', lineHeight: 1.6 }}>
            Classes avec coach, apprenants avec accès, aucune anomalie ouverte. Les opérations de
            dash se supervisent depuis dash — les deux plateformes sont séparées.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {taches.map(t => (
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

      {/* LES LECTURES QUI ONT ÉCHOUÉ SONT DITES. Sans cela, un écran de supervision qui n'a
          pas pu lire ses données affiche « tout va bien » — le pire mensonge possible ici. */}
      {echecs.length > 0 && (
        <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 10, padding: '12px 15px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
            Données partiellement indisponibles
          </div>
          <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, lineHeight: 1.6 }}>
            {echecs.join(', ')} — ces compteurs sont absents de la liste ci-dessus plutôt
            qu'affichés à zéro. Rechargez la page, ou vérifiez vos droits sur ces modules.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * APPRENANTS — ceux de BET E-Learning, et eux seuls.
 *
 * ⚠️ CORRECTION D'UNE ERREUR DE SOURCE. Cet onglet montait `OngletCommMesApprenants`, qui lit
 * `/api/groupes/apprenants` : une route construite à partir des CLASSES DE DASH (`groupes`,
 * 37 lignes). La direction de BET E-Learning voyait donc les apprenants du présentiel — une
 * donnée qui n'est pas la sienne, et qui fausserait toute lecture d'effectif.
 *
 * La bonne source est `/api/classes-elearning/apprenants/tous`, qui lit
 * `classes_elearning_apprenants` et l'enrichit du nom de classe, du niveau et de l'entreprise.
 * Elle est vide aujourd'hui — c'est l'état attendu tant qu'aucune classe e-learning n'existe —
 * et l'écran l'explique au lieu de ressembler à une panne.
 *
 * LA PAGINATION EST CÔTÉ CLIENT, parce que la route renvoie tout d'un coup. Avec zéro ligne
 * aujourd'hui, la question ne se pose pas ; elle se posera, et vingt-cinq lignes par page
 * valent mieux qu'un tableau de plusieurs centaines qu'aucun navigateur ne rend confortablement.
 */

const PAR_PAGE_APPRENANTS = 25;

export function OngletDirectionApprenants() {
  const { couleurTheme } = useTheme();
  const [apprenants, setApprenants] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${_API}/api/classes-elearning/apprenants/tous`, { headers: _hdrs() });
        const d = await r.json().catch(() => ({}));
        if (vivant) setApprenants(Array.isArray(d.apprenants) ? d.apprenants : []);
      } catch { if (vivant) setApprenants([]); }
    })();
    return () => { vivant = false; };
  }, []);

  const tous = apprenants || [];
  const filtres = tous.filter(a => {
    if (!q.trim()) return true;
    const t = `${a.nom_complet || ''} ${a.email || ''} ${a.classe_nom || ''} ${a.entreprise_nom || ''}`.toLowerCase();
    return t.includes(q.trim().toLowerCase());
  });

  const nbPages = Math.max(1, Math.ceil(filtres.length / PAR_PAGE_APPRENANTS));
  /* La page courante est bornée APRÈS filtrage : une recherche qui réduit la liste ne doit pas
     laisser l'écran sur une page devenue inexistante, donc vide sans explication. */
  const sure = Math.min(page, nbPages);
  const visibles = filtres.slice((sure - 1) * PAR_PAGE_APPRENANTS, sure * PAR_PAGE_APPRENANTS);

  const th = { padding: '10px 14px', fontSize: 11, color: COULEURS.gris600, textTransform: 'uppercase', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' };
  const td = { padding: '11px 14px', fontSize: 13, color: COULEURS.gris900 };
  const btn = (actif, off) => ({
    minWidth: 34, height: 34, borderRadius: 8, fontSize: 12, fontWeight: actif ? 800 : 500,
    cursor: off ? 'default' : 'pointer', border: `1.5px solid ${actif ? couleurTheme : COULEURS.gris200}`,
    background: actif ? couleurTheme : COULEURS.blanc,
    color: actif ? '#fff' : off ? COULEURS.gris200 : COULEURS.navy,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: COULEURS.navy }}>🎓 Apprenants</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: COULEURS.gris400 }}>
            {filtres.length} apprenant{filtres.length > 1 ? 's' : ''} BET E-Learning
            {q.trim() && tous.length !== filtres.length ? ` sur ${tous.length}` : ''}
          </p>
        </div>
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher…"
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COULEURS.gris200}`, fontSize: 12.5, minWidth: 200 }} />
      </div>

      {apprenants === null ? (
        <div style={{ textAlign: 'center', padding: 50, color: COULEURS.gris400 }}>Chargement…</div>
      ) : filtres.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 46, background: COULEURS.gris50, borderRadius: 14, border: `1px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.navy }}>
            {tous.length === 0 ? 'Aucun apprenant e-learning' : 'Aucun résultat'}
          </div>
          <p style={{ fontSize: 12, color: COULEURS.gris400, margin: '7px auto 0', maxWidth: 470, lineHeight: 1.65 }}>
            {tous.length === 0
              ? "Aucun apprenant n'est encore inscrit à une classe BET E-Learning. Les apprenants des classes présentielles de dash n'apparaissent pas ici : les deux plateformes sont séparées pour qu'aucune ne fausse les effectifs de l'autre."
              : 'Videz la recherche pour revoir la liste complète.'}
          </p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${COULEURS.gris200}`, borderRadius: 12, overflow: 'hidden', background: COULEURS.blanc }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: COULEURS.gris50, borderBottom: `1px solid ${COULEURS.gris200}` }}>
                  <th style={th}>Apprenant</th><th style={th}>Email</th><th style={th}>Classe</th>
                  <th style={th}>Niveau</th><th style={th}>Entreprise</th><th style={th}>Accès</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(a => (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${COULEURS.gris100}` }}>
                    <td style={{ ...td, fontWeight: 700 }}>{a.nom_complet || '—'}</td>
                    <td style={{ ...td, fontSize: 12, color: COULEURS.gris600 }}>{a.email || '—'}</td>
                    <td style={td}>{a.classe_nom || '—'}</td>
                    <td style={td}>{a.niveau_cecr || a.niveau_classe || '—'}</td>
                    <td style={td}>{a.entreprise_nom || '—'}</td>
                    <td style={td}>
                      <span style={{ borderRadius: 20, padding: '3px 10px', fontSize: 10.5, fontWeight: 700,
                        background: a.acces_elearning ? '#dcfce7' : COULEURS.gris100,
                        color: a.acces_elearning ? '#065F46' : COULEURS.gris600 }}>
                        {a.acces_elearning ? 'actif' : 'sans accès'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nbPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '14px 0', borderTop: `1px solid ${COULEURS.gris100}` }}>
              <span style={{ fontSize: 11.5, color: COULEURS.gris400, marginRight: 8 }}>
                Page {sure} / {nbPages} · {filtres.length} apprenant{filtres.length > 1 ? 's' : ''}
              </span>
              <button onClick={() => setPage(Math.max(1, sure - 1))} disabled={sure === 1} style={btn(false, sure === 1)}>‹</button>
              {Array.from({ length: nbPages }, (_, i) => i + 1)
                /* Au-delà de sept pages, on n'affiche que la fenêtre autour de la page courante :
                   une rangée de cinquante boutons est inutilisable. */
                .filter(n => nbPages <= 7 || Math.abs(n - sure) <= 2 || n === 1 || n === nbPages)
                .map((n, i, arr) => (
                  <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && arr[i - 1] !== n - 1 && <span style={{ color: COULEURS.gris400 }}>…</span>}
                    <button onClick={() => setPage(n)} style={btn(n === sure, false)}>{n}</button>
                  </span>
                ))}
              <button onClick={() => setPage(Math.min(nbPages, sure + 1))} disabled={sure === nbPages} style={btn(false, sure === nbPages)}>›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
