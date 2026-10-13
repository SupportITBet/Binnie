import { useState, useMemo } from 'react';
import { COULEURS } from '../../constants/couleurs';
import PastilleGroupe from './PastilleGroupe';
import BadgeCategorieCoach from './BadgeCategorieCoach';
import { CATEGORIES_COACH, CATEGORIE_SANS_NOTE, categorieCoach } from '../../utils/categorieCoach';

/**
 * Choisir un coach pour une classe — en voyant ce qui permet de choisir.
 *
 * La sélection se faisait sur une ligne portant le nom, le rôle et l'e-mail : de quoi
 * NOMMER un coach, pas de quoi en CHOISIR un. Il manquait tout ce sur quoi la décision
 * repose réellement — sa charge actuelle, ses disponibilités du mois, son niveau, sa
 * spécialité, sa note et donc sa catégorie de contrat.
 *
 * Trois filtres, parce que ce sont les trois questions qu'on se pose dans l'ordre :
 * qui enseigne ce niveau (recherche), qui est libre quand la classe démarre
 * (disponibilités), et à quelle catégorie de contrat il appartient.
 */

const ROLE_LIB = { coach: 'Coach', professeur_titulaire: 'Titulaire', professeur_remplacant: 'Remplaçant' };
const COLORS   = ['#6366F1', '#0891B2', '#059669', '#F97316', '#8B5CF6', '#EC4899', '#DC2626', '#0EA5E9'];
const MOIS_FR  = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const couleurDe = (co) => COLORS[(co.prenom || co.nom || 'A').charCodeAt(0) % COLORS.length];
const nomDe     = (co) => `${co.prenom || ''} ${co.nom || ''}`.trim() || 'Coach';
const infosDe   = (co) => co.coach_info || {};

const JOURS_ORDRE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JOURS_COURT = { Lundi: 'Lun', Mardi: 'Mar', Mercredi: 'Mer', Jeudi: 'Jeu', Vendredi: 'Ven', Samedi: 'Sam', Dimanche: 'Dim' };

/* Les quinze heures de la grille, de 07h à 22h — LA MÊME AMPLITUDE QUE CELLE QUE REMPLIT
   LE COACH (`components/professeur/SectionsCoach.jsx`). En afficher moins ici donnerait
   un emploi du temps tronqué : un créneau déclaré à 21h n'apparaîtrait nulle part. */
const HEURES_GRILLE = Array.from({ length: 15 }, (_, i) => 7 + i);

/* L'heure portée par un identifiant de créneau. La grille du coach stocke `h07`…`h21`,
   une ligne par heure (`components/professeur/SectionsCoach.jsx`). */
const heureDe = (creneau) => parseInt(String(creneau || '').replace(/\D/g, ''), 10);

/**
 * Ce coach couvre-t-il ce créneau de classe ?
 *
 * La vraie question de l'écran. Une classe « Lundi 09:00–11:00 » demande les heures 9 et
 * 10 ; le coach doit les avoir TOUTES, pas une sur deux — arriver à 10h sur un cours qui
 * commence à 9h n'est pas une couverture partielle acceptable, c'est un cours sans coach
 * pendant une heure. On distingue quand même les trois cas, parce que « il couvre la
 * moitié » et « il n'est pas là du tout » n'appellent pas la même décision.
 */
function couverture(creneauxCoach, horaireClasse) {
  const dispo = new Set((creneauxCoach || []).map(c => `${c.jour}|${heureDe(c.creneau)}`));
  return (horaireClasse || []).map(h => {
    const hd = parseInt(String(h.debut || '').slice(0, 2), 10);
    const hf = parseInt(String(h.fin   || '').slice(0, 2), 10);
    if (Number.isNaN(hd) || Number.isNaN(hf) || hf <= hd) {
      return { ...h, etat: 'inconnu', couvertes: 0, requises: 0 };
    }
    let couvertes = 0;
    for (let x = hd; x < hf; x++) if (dispo.has(`${h.jour}|${x}`)) couvertes++;
    const requises = hf - hd;
    return {
      ...h, couvertes, requises,
      etat: couvertes === requises ? 'ok' : couvertes === 0 ? 'non' : 'partiel',
    };
  });
}

/** La charge, dite en mots plutôt qu'en nombre brut : c'est ce qu'on lit d'un coup d'œil. */
function charge(nb) {
  if (nb === 0) return { lib: 'Disponible · 0 classe', bg: '#DCFCE7', txt: '#15803D', point: '🟢' };
  if (nb <= 2)  return { lib: `Peu chargé · ${nb} classe${nb > 1 ? 's' : ''}`, bg: '#FEF3C7', txt: '#92400E', point: '🟡' };
  return { lib: `Chargé · ${nb} classes`, bg: '#FEE2E2', txt: '#991B1B', point: '🔴' };
}

export default function SelecteurCoach({
  coaches = [], moisCourant, moisSuivant,
  coachSelectionne, onSelectionner,
  niveauClasse = null,
  horaireClasse = [],
  accent = '#6366F1',
}) {
  const [recherche, setRecherche] = useState('');
  const [periode,   setPeriode]   = useState('ce_mois');
  const [categorie, setCategorie] = useState('toutes');

  const dispoDe = (co) => periode === 'ce_mois' ? (co.dispos_ce_mois || 0) : (co.dispos_mois_prochain || 0);
  const creneauxDe = (co) => (periode === 'ce_mois' ? co.creneaux_ce_mois : co.creneaux_mois_prochain) || [];
  const libPeriode = periode === 'ce_mois'
    ? MOIS_FR[moisCourant?.mois] || 'ce mois'
    : MOIS_FR[moisSuivant?.mois] || 'le mois prochain';

  /* Les compteurs portent sur la liste filtrée par la RECHERCHE mais pas par la catégorie :
     un onglet doit annoncer ce qu'il contient, pas ce qu'il contiendrait si on le cliquait. */
  const parRecherche = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter(co => {
      const i = infosDe(co);
      return `${nomDe(co)} ${co.email || ''} ${i.niveaux || ''} ${i.specialite || ''} ${i.filiere || ''} ${i.matricule || ''}`
        .toLowerCase().includes(q);
    });
  }, [coaches, recherche]);

  const comptes = useMemo(() => {
    const c = { toutes: parRecherche.length };
    for (const co of parRecherche) {
      const cle = co.note_moyenne == null ? CATEGORIE_SANS_NOTE.cle : categorieCoach(co.note_moyenne).cle;
      c[cle] = (c[cle] || 0) + 1;
    }
    return c;
  }, [parRecherche]);

  const listeFiltree = useMemo(() => {
    const liste = categorie === 'toutes' ? parRecherche : parRecherche.filter(co => {
      const cle = co.note_moyenne == null ? CATEGORIE_SANS_NOTE.cle : categorieCoach(co.note_moyenne).cle;
      return cle === categorie;
    });
    /* Tri : le plus utile d'abord — celui qui COUVRE LES HEURES DE LA CLASSE, puis celui
       qui a renseigné ses disponibilités, puis le moins chargé, puis le mieux noté.

       La couverture passe devant tout le reste, et c'est voulu : le premier de la liste
       porte le badge « Recommandé ». Classer sur un total de créneaux recommandait un
       coach avec dix disponibilités le samedi pour une classe du lundi matin — un conseil
       faux, plus nuisible que pas de conseil. Un coach sans disponibilité connue n'est
       pas écarté pour autant, il passe derrière : c'est au PA de décider, pas à la liste. */
    const score = (co) => horaireClasse.length
      ? couverture(creneauxDe(co), horaireClasse).filter(h => h.etat === 'ok').length
      : 0;
    return [...liste].sort((a, b) => {
      if (horaireClasse.length) {
        const sa = score(a), sb = score(b);
        if (sa !== sb) return sb - sa;
      }
      const da = dispoDe(a) > 0 ? 0 : 1, db = dispoDe(b) > 0 ? 0 : 1;
      if (da !== db) return da - db;
      if ((a.nb_classes || 0) !== (b.nb_classes || 0)) return (a.nb_classes || 0) - (b.nb_classes || 0);
      return (b.note_moyenne || 0) - (a.note_moyenne || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parRecherche, categorie, periode, horaireClasse]);

  const champ = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    border: `1.5px solid ${COULEURS.gris200}`, fontFamily: '"Plus Jakarta Sans",sans-serif',
    boxSizing: 'border-box', outline: 'none',
  };
  const puce = (actif, couleur) => ({
    padding: '5px 13px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1.5px solid ${actif ? couleur : COULEURS.gris200}`,
    background: actif ? `${couleur}15` : COULEURS.blanc,
    color: actif ? couleur : COULEURS.gris600,
    fontSize: 11.5, fontWeight: 700, fontFamily: '"Plus Jakarta Sans",sans-serif',
  });

  return (
    <div>
      {/* Recherche */}
      <input value={recherche} onChange={e => setRecherche(e.target.value)}
        placeholder="🔍 Rechercher par nom, niveau (ex : B2), spécialité…"
        style={{ ...champ, marginBottom: 12 }} />

      {/* Disponibilités */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: COULEURS.gris600, fontWeight: 600 }}>📅 Disponibilités :</span>
        {[
          { v: 'ce_mois',  l: `Ce mois (${MOIS_FR[moisCourant?.mois] || '—'})` },
          { v: 'prochain', l: `Mois prochain (${MOIS_FR[moisSuivant?.mois] || '—'})` },
        ].map(p => (
          <button key={p.v} onClick={() => setPeriode(p.v)} style={puce(periode === p.v, '#059669')}>{p.l}</button>
        ))}
      </div>

      {/* Catégorie de contrat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: COULEURS.gris600, fontWeight: 600 }}>🗂️ Catégorie :</span>
        <button onClick={() => setCategorie('toutes')} style={puce(categorie === 'toutes', COULEURS.navy)}>
          Toutes ({comptes.toutes || 0})
        </button>
        {[...CATEGORIES_COACH, CATEGORIE_SANS_NOTE].map(cat => (
          <button key={cat.cle} onClick={() => setCategorie(cat.cle)} style={puce(categorie === cat.cle, cat.couleur)}>
            {cat.libelle} ({comptes[cat.cle] || 0})
          </button>
        ))}
      </div>

      {listeFiltree.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', background: COULEURS.gris50, borderRadius: 12, border: `2px dashed ${COULEURS.gris200}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, color: COULEURS.navy, marginBottom: 4 }}>Aucun coach ne correspond</div>
          <div style={{ fontSize: 12, color: COULEURS.gris600 }}>Élargissez la recherche ou changez de catégorie.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {listeFiltree.map((co, idx) => {
            const i    = infosDe(co);
            const sel  = coachSelectionne === co.id;
            const ch   = charge(co.nb_classes || 0);
            const disp = dispoDe(co);
            // Le niveau de la classe comparé à ceux que le coach enseigne : la
            // correspondance est la toute première chose qu'on vérifie.
            const niveaux = (i.niveaux || '').split(',').map(n => n.trim()).filter(Boolean);
            const couvre  = niveauClasse && niveaux.includes(niveauClasse);

            return (
              <div key={co.id} onClick={() => onSelectionner(co.id)}
                style={{
                  background: sel ? '#EEF2FF' : COULEURS.blanc,
                  border: `2px solid ${sel ? accent : (couvre ? '#86EFAC' : COULEURS.gris200)}`,
                  borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                {/* Identité */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <PastilleGroupe nom={nomDe(co)} url={co.avatar_url} taille={44} accent={couleurDe(co)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: COULEURS.navy }}>{nomDe(co)}</span>
                      {couvre && (
                        <span style={{ background: '#DCFCE7', color: '#15803D', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>
                          ✓ {niveauClasse}
                        </span>
                      )}
                      {/* Pas de recommandation quand elle n'a rien pour s'appuyer : si on
                          connaît l'emploi du temps et que ce coach n'en couvre aucune
                          heure, le badge dirait exactement le contraire de la réalité. */}
                      {idx === 0 && categorie === 'toutes' && !recherche
                        && (horaireClasse.length === 0
                            || couverture(creneauxDe(co), horaireClasse).some(h => h.etat === 'ok')) && (
                        <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 800 }}>🏆 Recommandé</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: COULEURS.gris600 }}>
                      {ROLE_LIB[co.role] || co.role}{i.type_contrat ? ` · ${i.type_contrat}` : ''}
                    </div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${sel ? accent : COULEURS.gris200}`, background: sel ? accent : COULEURS.blanc, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                </div>

                {/* Charge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: ch.bg, color: ch.txt, borderRadius: 20, padding: '3px 11px', fontSize: 11, fontWeight: 700, width: 'fit-content' }}>
                  {ch.point} {ch.lib}
                </div>

                {/* Note moyenne et catégorie de contrat */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: COULEURS.gris50, borderRadius: 10, padding: '10px 14px' }}>
                  <div>
                    <div style={{ fontSize: 9.5, color: COULEURS.gris400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note moyenne</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: co.note_moyenne != null ? categorieCoach(co.note_moyenne).couleur : COULEURS.gris400 }}>
                      {co.note_moyenne != null ? co.note_moyenne : '–'}
                      {co.nb_observations > 0 && <span style={{ fontSize: 10, color: COULEURS.gris400, fontWeight: 600 }}> · {co.nb_observations} obs.</span>}
                    </div>
                  </div>
                  <BadgeCategorieCoach note={co.note_moyenne} taille="sm" />
                </div>

                {/* ── DISPONIBILITÉS DU MOIS CHOISI, EN DÉTAIL ──
                    Le compteur seul — « 10 créneaux en octobre » — ne permettait pas de
                    décider : dix créneaux le samedi ne servent à rien pour une classe du
                    lundi matin. On montre la semaine telle qu'elle est déclarée, puis la
                    réponse à la seule question qui compte : ces heures-là couvrent-elles
                    l'emploi du temps de CETTE classe ? */}
                {disp > 0 ? (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, color: '#15803D', fontWeight: 700 }}>
                      🕒 {disp} créneau{disp > 1 ? 'x' : ''} disponible{disp > 1 ? 's' : ''} en {libPeriode}
                    </div>
                    {/* ── L'EMPLOI DU TEMPS DU MOIS, TEL QUE LE COACH L'A REMPLI ──
                        Un résumé en plages (« Lundi 07h–11h ») se lit vite mais reste une
                        reformulation : on ne voit plus la grille que le coach a cochée, et
                        c'est elle qui fait foi. La même grille, en petit, permet de lire
                        d'un coup où tombent ses heures dans la semaine — et de les
                        comparer à l'œil avec celles de la classe, surlignées en jaune.
                        Les jours entièrement vides restent affichés : une ligne absente se
                        lirait comme une information manquante, une ligne vide dit
                        clairement « rien ce jour-là ». */}
                    {(() => {
                      const pris = new Set(creneauxDe(co).map(c => `${c.jour}|${heureDe(c.creneau)}`));
                      const attendus = new Set();
                      horaireClasse.forEach(h => {
                        const hd = parseInt(String(h.debut || '').slice(0, 2), 10);
                        const hf = parseInt(String(h.fin || '').slice(0, 2), 10);
                        if (!Number.isNaN(hd) && !Number.isNaN(hf)) for (let x = hd; x < hf; x++) attendus.add(`${h.jour}|${x}`);
                      });
                      return (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: 8.5, fontFamily: 'inherit' }}>
                            <thead>
                              <tr>
                                <th style={{ width: 26 }} />
                                {HEURES_GRILLE.map(h => (
                                  <th key={h} style={{ width: 15, fontWeight: 600, color: '#15803D', padding: 0, textAlign: 'center' }}>
                                    {String(h).padStart(2, '0')}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {JOURS_ORDRE.map(j => (
                                <tr key={j}>
                                  <td style={{ fontSize: 9, fontWeight: 700, color: '#166534', paddingRight: 4, whiteSpace: 'nowrap' }}>
                                    {JOURS_COURT[j]}
                                  </td>
                                  {HEURES_GRILLE.map(h => {
                                    const cle = `${j}|${h}`;
                                    const dispo = pris.has(cle);
                                    const coursIci = attendus.has(cle);
                                    return (
                                      <td key={h} title={`${j} ${String(h).padStart(2, '0')}h–${String(h + 1).padStart(2, '0')}h`
                                        + (dispo ? ' · disponible' : ' · non déclaré')
                                        + (coursIci ? ' · heure de cours' : '')}
                                        style={{ padding: 1 }}>
                                        <div style={{
                                          height: 11, borderRadius: 2,
                                          background: dispo ? '#15803D' : '#FFFFFF',
                                          /* L'heure de cours est cerclée, pas colorée : elle doit
                                             se repérer sans masquer la réponse — disponible ou non. */
                                          border: coursIci ? '1.5px solid #D97706' : '1px solid #BBF7D0',
                                        }} />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 9, color: '#166534', flexWrap: 'wrap' }}>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#15803D', marginRight: 3 }} />disponible</span>
                            {horaireClasse.length > 0 && (
                              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, border: '1.5px solid #D97706', marginRight: 3 }} />heure de cours</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {horaireClasse.length > 0 && (
                      <div style={{ borderTop: '1px solid #BBF7D0', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 9.5, color: '#15803D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Couverture de l'emploi du temps
                        </div>
                        {couverture(creneauxDe(co), horaireClasse).map((h, hi) => {
                          const st = h.etat === 'ok'
                            ? { ic: '✅', c: '#15803D', txt: 'couvert' }
                            : h.etat === 'partiel'
                              ? { ic: '⚠️', c: '#B45309', txt: `${h.couvertes}/${h.requises} h seulement` }
                              : { ic: '❌', c: '#B91C1C', txt: 'non déclaré' };
                          return (
                            <div key={hi} style={{ fontSize: 10.5, color: st.c, fontWeight: 600, display: 'flex', gap: 5 }}>
                              <span>{st.ic}</span>
                              <span style={{ minWidth: 112 }}>{h.jour} {h.debut}–{h.fin}</span>
                              <span style={{ fontWeight: 500 }}>{st.txt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Dire que l'information MANQUE, et non que le coach est indisponible :
                     un planning non rempli ne veut pas dire un agenda plein. */
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '7px 11px', fontSize: 11, color: '#92400E', fontWeight: 600 }}>
                    ⚠️ Disponibilités non renseignées pour {libPeriode}
                  </div>
                )}

                {/* Ce qu'il enseigne */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {i.filiere    && <span style={{ fontSize: 11, color: COULEURS.gris600 }}>🏫 {i.filiere}</span>}
                  {i.matricule  && <span style={{ background: COULEURS.gris100, color: COULEURS.gris600, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>#{i.matricule}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {niveaux.length > 0 && <span style={{ background: '#EEF2FF', color: '#4338CA', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>📊 {niveaux.join(', ')}</span>}
                  {i.specialite && <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>🎓 {i.specialite}</span>}
                  <span style={{ background: '#FDF4FF', color: '#A21CAF', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>📜 {co.nb_contrats || 0} contrat{(co.nb_contrats || 0) > 1 ? 's' : ''}</span>
                </div>
                {Array.isArray(i.certifications) && i.certifications.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {i.certifications.map(cert => (
                      <span key={cert} style={{ background: '#ECFEFF', color: '#0E7490', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>🏅 {cert}</span>
                    ))}
                  </div>
                )}

                {/* Contact */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: COULEURS.gris600, borderTop: `1px solid ${COULEURS.gris100}`, paddingTop: 9 }}>
                  {co.email && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>✉️ {co.email}</span>}
                  {co.telephone && <span>📞 {co.telephone}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
