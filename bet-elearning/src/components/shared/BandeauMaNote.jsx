import { useState, useEffect } from 'react';
import BadgeCategorieCoach from './BadgeCategorieCoach';
import { NOTE_COULEUR, NOTE_FOND, BAREME_TEXTE, TENDANCES } from '../../utils/categorieCoach';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';

/**
 * « Ma note » - ce que le coach voit de lui-même dans l'en-tête de son espace.
 *
 * Pendant du bandeau de `dash/src/Pages/EspaceProfesseur`. Le coach doit lire le MÊME
 * verdict que son superviseur : la moyenne, la catégorie de contrat qui en découle, et la
 * trajectoire. Une note affichée d'un côté et pas de l'autre mettrait le coach en position
 * d'apprendre son classement par quelqu'un d'autre.
 *
 * ⚠️ LA NOTE EST CELLE DE CETTE PLATEFORME. L'en-tête `X-Plateforme` fait filtrer le
 * serveur sur `evaluations_coachs.plateforme` et `rapports_observation.plateforme` - les
 * mêmes colonnes que le superviseur bet-elearning. Sans lui, le coach lirait une moyenne
 * mêlant ses observations de dash, que le superviseur d'ici ne retrouverait jamais.
 *
 * AFFICHÉ MÊME SANS NOTE : ne rien montrer ne distinguerait pas « pas encore observé »
 * d'un serveur qui n'a pas répondu.
 */
export default function BandeauMaNote({ compact = false }) {
  const [maNote, setMaNote] = useState(null);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/coachs/ma-note`, {
          headers: { Authorization: `Bearer ${jeton()}`, 'X-Plateforme': 'bet-elearning' },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (vivant && d && d.moyenne !== undefined) setMaNote(d);
      } catch { /* le bandeau reste absent plutôt que faux */ }
    })();
    return () => { vivant = false; };
  }, []);

  if (!maNote) return null;

  const notes = maNote.dernieres_notes || [];
  const tend  = TENDANCES[maNote.tendance] || TENDANCES.stable;
  const taille = compact ? 32 : 38;

  return (
    <div
      title={maNote.nb_avec_note > 0
        ? `Moyenne de vos ${maNote.nb_avec_note} observation${maNote.nb_avec_note > 1 ? 's' : ''} sur BET E-Learning - ${BAREME_TEXTE}`
        : `Aucune observation notée pour le moment sur BET E-Learning - ${BAREME_TEXTE}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
        background: 'rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'help',
        border: `1px solid ${maNote.moyenne ? NOTE_COULEUR(maNote.moyenne) + '80' : 'rgba(255,255,255,0.12)'}` }}>

      <div style={{ width: taille, height: taille, borderRadius: '50%', flexShrink: 0,
        background: NOTE_FOND(maNote.moyenne),
        border: `2.5px solid ${NOTE_COULEUR(maNote.moyenne)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: 13, color: NOTE_COULEUR(maNote.moyenne) }}>
        {maNote.moyenne ? Number(maNote.moyenne).toFixed(1) : '-'}
      </div>

      {/* Les cinq dernières notes dans l'ordre, puis la flèche de tendance. La moyenne
          seule ne dit pas si le coach monte ou descend - deux coachs à 3,5 n'ont pas la
          même trajectoire. La flèche n'a de sens qu'à partir de deux notes : avec une
          seule, il n'y a rien à comparer. */}
      {notes.length > 0 && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26, flexShrink: 0 }}
          title={`Vos ${notes.length} dernière${notes.length > 1 ? 's' : ''} note${notes.length > 1 ? 's' : ''} : ${notes.join(' · ')}`}>
          {notes.map((n, i) => (
            <div key={i} style={{ width: 7, borderRadius: 3, background: NOTE_COULEUR(n),
              height: `${(n / 5) * 100}%`, minHeight: 4 }} />
          ))}
        </div>
      )}
      {notes.length >= 2 && (
        <div title={`Tendance : ${tend.libelle}`}
          style={{ fontSize: 17, fontWeight: 900, flexShrink: 0, width: 18, textAlign: 'center', color: tend.couleur }}>
          {tend.icone}
        </div>
      )}

      <div style={{ lineHeight: 1.3 }}>
        <div style={{ fontSize: 10, color: '#7DD3FC', marginBottom: 3 }}>Ma note</div>
        <BadgeCategorieCoach note={maNote.moyenne} taille="xs" />
      </div>
    </div>
  );
}
