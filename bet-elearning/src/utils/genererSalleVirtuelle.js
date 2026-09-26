/**
 * Génère un nom de salle Jitsi unique et stable pour une session.
 * Format : BET-{groupe_id}-{session_id} → nettoyé pour l'URL
 *
 * Pour passer à votre propre serveur Oracle/VPS plus tard :
 *   REACT_APP_JITSI_HOST=meet.bet-elearning.ci dans .env
 */

const JITSI_HOST = process.env.REACT_APP_JITSI_HOST || 'meet.jit.si';

export function genererNomSalle(session) {
  const raw = `BET-${session.groupe_id}-${session.id}`;
  return raw.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
}

export function genererLienJitsi(session) {
  return `https://${JITSI_HOST}/${genererNomSalle(session)}`;
}

/** Salle de test partagée prof ↔ apprenant (pas de date requise) */
export const SALLE_TEST = {
  id:         'test-demo',
  groupe_id:  'bet-demo',
  titre:      'Test de connexion BET',
  heure_debut:'-',
  heure_fin:  '-',
};

/** En développement, toutes les sessions sont accessibles */
export const MODE_DEV = process.env.NODE_ENV === 'development';

export { JITSI_HOST };
