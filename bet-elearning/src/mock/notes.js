export const MOCK_NOTES = [
  {
    id: 'note-001',
    apprenant_id: 'app-001',
    professeur_id: 'teacher-001',
    session_id: 'ses-002',
    type_eval: 'quiz',
    note: 14,
    note_max: 20,
    competence: 'vocabulaire',
    commentaire: 'Très bien ! Continue comme ça.',
    trimestre: 1,
    created_at: '2026-05-28T11:00:00Z',
  },
  {
    id: 'note-002',
    apprenant_id: 'app-001',
    professeur_id: 'teacher-001',
    session_id: null,
    type_eval: 'controle_continu',
    note: 16,
    note_max: 20,
    competence: 'grammaire',
    commentaire: 'Excellent travail sur les structures de base.',
    trimestre: 1,
    created_at: '2026-05-20T10:00:00Z',
  },
  {
    id: 'note-003',
    apprenant_id: 'app-002',
    professeur_id: 'teacher-001',
    session_id: null,
    type_eval: 'eval_mensuelle',
    note: 12,
    note_max: 20,
    competence: 'oral',
    commentaire: 'Doit travailler la prononciation.',
    trimestre: 1,
    created_at: '2026-05-25T14:00:00Z',
  },
  // ── ALERTE : Note < 40% ─────────────────────────────────────────────────────
  {
    id: 'note-004',
    apprenant_id: 'app-003',
    professeur_id: 'teacher-001',
    session_id: 'ses-007',
    type_eval: 'quiz',
    note: 7,
    note_max: 20,           // 35% - déclenche alerte < 40%
    competence: 'grammaire',
    commentaire: 'Résultat très insuffisant. Beaucoup d\'erreurs de conjugaison.',
    trimestre: 1,
    created_at: '2026-06-02T11:00:00Z',
  },
];

export const MOCK_PRESENCES = [
  {
    id: 'pre-001',
    session_id: 'ses-002',
    apprenant_id: 'app-001',
    statut: 'present',
    note_presence: null,
  },
  {
    id: 'pre-002',
    session_id: 'ses-002',
    apprenant_id: 'app-003',
    statut: 'present',
    note_presence: null,
  },
  {
    id: 'pre-003',
    session_id: 'ses-002',
    apprenant_id: 'app-002',
    statut: 'absent',
    note_presence: 'Non justifié',
  },
  // ── ALERTE : 2 absences consécutives - Moussa Traoré (app-002) ─────────────
  {
    id: 'pre-004',
    session_id: 'ses-009',        // session précédente grp-002
    apprenant_id: 'app-002',
    statut: 'absent',
    note_presence: 'Non justifié',
  },
  {
    id: 'pre-005',
    session_id: 'ses-003',
    apprenant_id: 'app-002',
    statut: 'absent',
    note_presence: 'Non justifié',
  },
  // ── 4ème absence - Moussa Traoré → BLOCAGE AUTO ─────────────────────────────
  {
    id: 'pre-006',
    session_id: 'ses-010',
    apprenant_id: 'app-002',
    statut: 'absent',
    note_presence: 'Non justifié',
  },
];

// ── Blocages pour absences répétées (≥ 4) ────────────────────────────────────
export const MOCK_BLOCAGES_ABSENCES = [
  {
    id: 'blq-001',
    apprenant_id: 'app-002',
    apprenant_prenom: 'Moussa',
    apprenant_nom: 'Traoré',
    groupe_id: 'grp-002',
    date_blocage: '2026-05-28',
    nb_absences: 4,
    absences: [
      { date: '2026-04-15', session: 'Greetings & Colors',  justifie: false },
      { date: '2026-04-22', session: 'Animals & Nature',    justifie: false },
      { date: '2026-05-06', session: 'Numbers 1–20',        justifie: false },
      { date: '2026-05-28', session: 'Past Tense Intro',    justifie: false },
    ],
    statut: 'bloque',       // 'bloque' | 'debloque'
    justification: null,
    date_deblocage: null,
    debloque_par: null,
    motif_deblocage: null,
  },
];
