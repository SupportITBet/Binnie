export const MOCK_BADGES = [
  {
    id: 'badge-001',
    nom: 'Première étoile',
    description: 'Terminer ta première leçon',
    icone: '⭐',
    condition: { type: 'lecons_terminees', valeur: 1 },
  },
  {
    id: 'badge-002',
    nom: 'Curieux !',
    description: 'Ouvrir 5 contenus différents',
    icone: '🔍',
    condition: { type: 'contenus_ouverts', valeur: 5 },
  },
  {
    id: 'badge-003',
    nom: 'Assidu',
    description: 'Assister à 5 séances sans absence',
    icone: '🏆',
    condition: { type: 'presences_consecutives', valeur: 5 },
  },
  {
    id: 'badge-004',
    nom: 'Quiz Master',
    description: 'Obtenir 90% ou plus à un quiz',
    icone: '🎯',
    condition: { type: 'score_quiz_min', valeur: 90 },
  },
  {
    id: 'badge-005',
    nom: 'Vocabulaire VIP',
    description: 'Apprendre 100 mots nouveaux',
    icone: '📚',
    condition: { type: 'mots_appris', valeur: 100 },
  },
];

export const MOCK_BADGES_APPRENANT = [
  {
    apprenant_id: 'app-001',
    badge_id: 'badge-001',
    obtenu_le: '2026-05-16T10:00:00Z',
    badge: MOCK_BADGES[0],
  },
  {
    apprenant_id: 'app-001',
    badge_id: 'badge-003',
    obtenu_le: '2026-05-28T12:00:00Z',
    badge: MOCK_BADGES[2],
  },
];
