export const MOCK_SESSIONS = [
  // ── Groupe grp-001 - Enfants Débutants TLG ──────────────────────────────
  { id:'ses-001', groupe_id:'grp-001', professeur_id:'teacher-001',
    titre:'Greetings & Introductions', date_session:'2026-06-02',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio:'https://zoom.us/j/mock001',
    type_session:'ligne', statut:'planifiee', notes_prof: null,
    contenu_ids: ['cnt-001', 'cnt-002'] },
  { id:'ses-002', groupe_id:'grp-001', professeur_id:'teacher-001',
    titre:'Numbers & Colors', date_session:'2026-05-28',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio:'https://zoom.us/j/mock002',
    type_session:'ligne', statut:'realisee', notes_prof:'Bonne participation. Réviser les couleurs secondaires.',
    contenu_ids: ['cnt-001'] },
  { id:'ses-007', groupe_id:'grp-001', professeur_id:'teacher-001',
    titre:'Animals & Nature', date_session:'2026-05-21',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio:'https://zoom.us/j/mock007',
    type_session:'ligne', statut:'realisee', notes_prof:'Excellente séance. Les enfants adorent les animaux.',
    contenu_ids: [] },
  { id:'ses-008', groupe_id:'grp-001', professeur_id:'teacher-001',
    titre:'My Family & Home', date_session:'2026-06-09',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio: null,
    type_session:'presentiel', statut:'planifiee', notes_prof: null,
    contenu_ids: ['cnt-003'] },

  // ── Groupe grp-002 - Adolescents Intermédiaires TLG ─────────────────────
  { id:'ses-003', groupe_id:'grp-002', professeur_id:'teacher-001',
    titre:'Past Simple Tense', date_session:'2026-06-03',
    heure_debut:'14:00', heure_fin:'16:00', lien_visio:'https://zoom.us/j/mock003',
    type_session:'ligne', statut:'planifiee', notes_prof: null,
    contenu_ids: ['cnt-004'] },
  { id:'ses-009', groupe_id:'grp-002', professeur_id:'teacher-001',
    titre:'Present Perfect vs Past Simple', date_session:'2026-05-27',
    heure_debut:'14:00', heure_fin:'16:00', lien_visio:'https://zoom.us/j/mock009',
    type_session:'ligne', statut:'realisee', notes_prof:'Confusion fréquente entre les deux temps. Exercices supplémentaires à prévoir.',
    contenu_ids: ['cnt-004'] },
  { id:'ses-010', groupe_id:'grp-002', professeur_id:'teacher-001',
    titre:'Everyday Conversations', date_session:'2026-06-10',
    heure_debut:'14:00', heure_fin:'16:00', lien_visio: null,
    type_session:'presentiel', statut:'en_cours', notes_prof: null,
    contenu_ids: [] },

  // ── Groupe grp-003 - Adolescents Avancés TLG ────────────────────────────
  { id:'ses-004', groupe_id:'grp-003', professeur_id:'teacher-002',
    titre:'Reading Comprehension - Article', date_session:'2026-05-30',
    heure_debut:'10:00', heure_fin:'12:00', lien_visio:'https://zoom.us/j/mock004',
    type_session:'ligne', statut:'en_cours', notes_prof: null, contenu_ids: [] },
  { id:'ses-011', groupe_id:'grp-003', professeur_id:'teacher-002',
    titre:'Business Writing & Emails', date_session:'2026-06-04',
    heure_debut:'10:00', heure_fin:'12:00', lien_visio:'https://zoom.us/j/mock011',
    type_session:'ligne', statut:'planifiee', notes_prof: null, contenu_ids: [] },
  { id:'ses-012', groupe_id:'grp-003', professeur_id:'teacher-002',
    titre:'Debate & Argumentation', date_session:'2026-05-23',
    heure_debut:'10:00', heure_fin:'12:00', lien_visio:'https://zoom.us/j/mock012',
    type_session:'ligne', statut:'realisee', notes_prof:'Très bon niveau d\'argumentation chez Ibrahim et Nadia.', contenu_ids: [] },

  // ── Groupe grp-004 - Enfants Débutants ORANGE CI ────────────────────────
  { id:'ses-005', groupe_id:'grp-004', professeur_id:'teacher-001',
    titre:'Colors & Shapes', date_session:'2026-06-05',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio: null,
    type_session:'presentiel', statut:'planifiee', notes_prof: null, contenu_ids: [] },
  { id:'ses-013', groupe_id:'grp-004', professeur_id:'teacher-001',
    titre:'Simple Greetings', date_session:'2026-05-29',
    heure_debut:'09:00', heure_fin:'11:00', lien_visio: null,
    type_session:'presentiel', statut:'realisee', notes_prof:'Premier cours bien accueilli. Les enfants sont motivés.', contenu_ids: [] },

  // ── Groupe grp-005 - Adolescents Avancés ORANGE CI ──────────────────────
  { id:'ses-006', groupe_id:'grp-005', professeur_id:'teacher-002',
    titre:'TOEIC Preparation - Part 1', date_session:'2026-06-06',
    heure_debut:'16:00', heure_fin:'18:00', lien_visio:'https://zoom.us/j/mock006',
    type_session:'ligne', statut:'planifiee', notes_prof: null, contenu_ids: [] },
  { id:'ses-014', groupe_id:'grp-005', professeur_id:'teacher-002',
    titre:'Listening Strategies', date_session:'2026-05-30',
    heure_debut:'16:00', heure_fin:'18:00', lien_visio:'https://zoom.us/j/mock014',
    type_session:'ligne', statut:'realisee', notes_prof:'Karim progresse très rapidement. Penser à lui proposer un niveau C1.', contenu_ids: [] },

  // ── Groupe grp-006 - Enfants SGBCI ──────────────────────────────────────
  { id:'ses-015', groupe_id:'grp-006', professeur_id:'teacher-003',
    titre:'Alphabet & Phonics', date_session:'2026-06-07',
    heure_debut:'10:00', heure_fin:'12:00', lien_visio: null,
    type_session:'presentiel', statut:'planifiee', notes_prof: null, contenu_ids: [] },
  { id:'ses-016', groupe_id:'grp-006', professeur_id:'teacher-003',
    titre:'Classroom Objects', date_session:'2026-05-31',
    heure_debut:'10:00', heure_fin:'12:00', lien_visio: null,
    type_session:'presentiel', statut:'realisee', notes_prof:'Groupe attentif. Éric se distingue particulièrement.', contenu_ids: [] },

  // ── ALERTE : Absence prof non signalée 24h avant ─────────────────────────
  { id:'ses-017', groupe_id:'grp-002', professeur_id:'teacher-002',
    titre:'Reported Speech & Indirect Questions', date_session:'2026-06-04',
    heure_debut:'14:00', heure_fin:'16:00', lien_visio:'https://zoom.us/j/mock017',
    type_session:'ligne', statut:'planifiee', notes_prof: null,
    professeur_confirme: false },
];

export const MOCK_GROUPES = [
  // ── TLG PHARMA ─────────────────────────────────────────────────────────────
  {
    id: 'grp-001', client_id: 'tlg-001',
    nom: 'Enfants Débutants A - TLG',
    niveau: 'debutant', cecr_min: 'A1', cecr_max: 'A2',
    tranche_age: 'enfant', effectif_max: 40,
    professeur_id: 'teacher-001', est_actif: true,
  },
  {
    id: 'grp-002', client_id: 'tlg-001',
    nom: 'Adolescents Intermédiaires - TLG',
    niveau: 'intermediaire', cecr_min: 'A2', cecr_max: 'B1',
    tranche_age: 'adolescent', effectif_max: 40,
    professeur_id: 'teacher-001', est_actif: true,
  },
  {
    id: 'grp-003', client_id: 'tlg-001',
    nom: 'Adolescents Avancés - TLG',
    niveau: 'avance', cecr_min: 'B1', cecr_max: 'B2',
    tranche_age: 'adolescent', effectif_max: 30,
    professeur_id: 'teacher-002', est_actif: true,
  },

  // ── ORANGE CI ──────────────────────────────────────────────────────────────
  {
    id: 'grp-004', client_id: 'oc-001',
    nom: 'Enfants Débutants - ORANGE CI',
    niveau: 'debutant', cecr_min: 'A1', cecr_max: 'A2',
    tranche_age: 'enfant', effectif_max: 35,
    professeur_id: 'teacher-001', est_actif: true,
  },
  {
    id: 'grp-005', client_id: 'oc-001',
    nom: 'Adolescents Avancés - ORANGE CI',
    niveau: 'avance', cecr_min: 'B1', cecr_max: 'C1',
    tranche_age: 'adolescent', effectif_max: 25,
    professeur_id: 'teacher-002', est_actif: true,
  },

  // ── SGBCI ──────────────────────────────────────────────────────────────────
  {
    id: 'grp-006', client_id: 'sg-001',
    nom: 'Enfants Tous Niveaux - SGBCI',
    niveau: 'debutant', cecr_min: 'A1', cecr_max: 'B1',
    tranche_age: 'enfant', effectif_max: 20,
    professeur_id: 'teacher-003', est_actif: true,
  },

  // ── Inactif (pour test filtre) ─────────────────────────────────────────────
  {
    id: 'grp-007', client_id: 'tlg-001',
    nom: 'Groupe Pilote - TLG (archivé)',
    niveau: 'debutant', cecr_min: 'A1', cecr_max: 'A1',
    tranche_age: 'enfant', effectif_max: 10,
    professeur_id: 'teacher-001', est_actif: false,
  },
];
