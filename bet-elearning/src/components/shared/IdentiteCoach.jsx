import { useState, useEffect } from 'react';

/**
 * Ce que le header du coach bet-elearning ne disait pas, et que celui de dash dit.
 *
 * Côté dash, l'en-tête de l'Espace Coach annonce sa spécialité, son centre, et la tuile
 * « Ce mois · Xh dispensées ». Côté bet-elearning, la ligne d'identité se résumait à
 * « e-mail · Pédagogie » : le coach n'y lisait ni sa filière, ni ses niveaux, ni son
 * matricule, ni son type de contrat — et surtout aucune trace des heures qu'il a réellement
 * données. Il devait ouvrir un autre écran, ou l'autre plateforme, pour se relire.
 *
 * ── POURQUOI DEUX COMPOSANTS ET UNE SEULE REQUÊTE ──
 * Les deux morceaux vivent à deux endroits du header (sous le nom, et dans la barre de
 * droite), mais décrivent la même personne. Un `fetch` chacun aurait doublé l'appel à
 * chaque rendu du layout, qui est monté sur tous les écrans. Le cache de module les sert
 * tous les deux, et ne retient que la réponse — jamais l'échec, pour qu'une coupure réseau
 * n'éteigne pas le bandeau jusqu'au rechargement complet de la page.
 *
 * ── CE QUI RESTE MUET ──
 * Un coach sans `coach_info` renseigné (import ancien, fiche incomplète) ne doit pas voir
 * une rangée de tirets : chaque mention ne s'affiche que si elle existe, et la ligne
 * entière disparaît si aucune n'est là. Même règle pour la tuile des heures.
 */

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const jeton = () => localStorage.getItem('admin_token') || localStorage.getItem('bet_access_token') || '';

let cacheProfil = null;      // la réponse de /api/admin/me, partagée par les deux composants
let requeteEnCours = null;

function chargerProfilCoach() {
  if (cacheProfil) return Promise.resolve(cacheProfil);
  if (requeteEnCours) return requeteEnCours;
  const token = jeton();
  if (!token) return Promise.resolve(null);
  requeteEnCours = fetch(`${API}/api/admin/me`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Plateforme': 'bet-elearning' },
  })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { cacheProfil = d?.profil || null; return cacheProfil; })
    .catch(() => null)
    .finally(() => { requeteEnCours = null; });
  return requeteEnCours;
}

function useProfilCoach() {
  const [profil, setProfil] = useState(cacheProfil);
  useEffect(() => {
    if (cacheProfil) { setProfil(cacheProfil); return; }
    let vivant = true;
    chargerProfilCoach().then(p => { if (vivant) setProfil(p); });
    return () => { vivant = false; };
  }, []);
  return profil;
}

/**
 * Les mentions professionnelles du coach, sous son nom.
 * Spécialité, filière et niveaux, type de contrat, matricule — telles qu'elles sont saisies
 * dans sa fiche (`utilisateurs.coach_info`), et rien d'inventé quand elles manquent.
 */
export function MentionsCoach() {
  const profil = useProfilCoach();
  const info = profil?.coach_info || {};
  if (!profil) return null;

  const niveaux = String(info.niveaux || '').split(',').map(n => n.trim()).filter(Boolean);
  const puces = [
    info.specialite   && { cle: 'spe',  texte: `🎯 ${info.specialite}` },
    info.filiere      && { cle: 'fil',  texte: `📘 ${info.filiere}` },
    niveaux.length    && { cle: 'niv',  texte: `📊 ${niveaux.join(' · ')}` },
    info.type_contrat && { cle: 'ctr',  texte: `📄 ${info.type_contrat}` },
    (info.matricule || profil.matricule) && { cle: 'mat', texte: `🆔 ${info.matricule || profil.matricule}` },
  ].filter(Boolean);

  if (!puces.length) return null;

  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 5 }}>
      {puces.map(p => (
        <span key={p.cle} style={{
          padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: 'rgba(255,255,255,0.14)', color: '#e0f2fe',
          border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap',
        }}>{p.texte}</span>
      ))}
    </div>
  );
}

/**
 * « Ce mois · Xh dispensées » — les heures RÉELLEMENT passées en salle ce mois-ci.
 *
 * On compte le temps mesuré (`duree_reelle_s`, posé à la clôture par le coach), et non la
 * durée annoncée au planning : une séance de deux heures expédiée en vingt minutes ne fait
 * pas deux heures dispensées. Quand le chronomètre manque sur une séance pourtant tenue —
 * salle fermée sans clôture, séance antérieure à la mesure —, on retombe sur l'écart entre
 * ouverture et fermeture, puis sur la durée prévue : mieux vaut une heure approchée qu'un
 * compteur qui ignore le travail fait.
 */
export function HeuresDuMois({ coachId }) {
  const [minutes, setMinutes] = useState(null);

  useEffect(() => {
    if (!coachId) return;
    let vivant = true;
    const now = new Date();
    const url = `${API}/api/elearning/seances?coach_id=${coachId}&statut=realisee`
      + `&mois=${now.getMonth() + 1}&annee=${now.getFullYear()}`;
    fetch(url, { headers: { Authorization: `Bearer ${jeton()}`, 'X-Plateforme': 'bet-elearning' } })
      .then(r => (r.ok ? r.json() : { seances: [] }))
      .then(d => {
        if (!vivant) return;
        const total = (d.seances || []).reduce((n, s) => {
          if (s.duree_reelle_s != null) return n + Math.round(s.duree_reelle_s / 60);
          if (s.demarree_at && s.terminee_at) {
            return n + Math.max(0, Math.round((new Date(s.terminee_at) - new Date(s.demarree_at)) / 60000));
          }
          return n + (s.duree_minutes || 0);
        }, 0);
        setMinutes(total);
      })
      .catch(() => { if (vivant) setMinutes(null); });
    return () => { vivant = false; };
  }, [coachId]);

  // Tant que le compte n'est pas connu, on n'affiche rien plutôt qu'un « 0h » qui serait faux.
  if (minutes === null) return null;

  const heures = minutes / 60;
  const libelle = heures % 1 === 0 ? `${heures}h` : `${heures.toFixed(1)}h`;

  return (
    <div title={`${minutes} minutes réellement passées en salle depuis le 1er du mois`}
      style={{
        textAlign: 'center', padding: '6px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
        flexShrink: 0,
      }}>
      <div style={{ fontSize: 10, color: '#7dd3fc' }}>Ce mois</div>
      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: '#fff' }}>{libelle}</div>
      <div style={{ fontSize: 10, color: '#bae6fd' }}>dispensées</div>
    </div>
  );
}
