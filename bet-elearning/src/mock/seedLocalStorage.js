/**
 * Seed localStorage avec des données de démonstration réalistes.
 * Appelé une seule fois au démarrage si la clé "bet_seed_v2" n'existe pas.
 */
export function seedLocalStorageIfNeeded() {
  if (localStorage.getItem('bet_seed_v3')) return; // déjà initialisé

  // ── Tests de niveau créés par l'Agent Placement ───────────────────────────
  const tests = [
    {
      id: 'test-001',
      type: 'qcm',
      titre: 'Test QCM - Débutants A1/A2',
      niveau: 'A1',
      dureeMin: 20,
      notifierEleves: true,
      notifierResponsable: false,
      dateCreation: '2026-05-20',
      nbUtilisations: 4,
      questions: [
        { id:1, texte:'What is your name?',                   options:['My name is Aminata','I am fine','Yes please','I have a car'],       correct:'My name is Aminata' },
        { id:2, texte:'Choose the correct article: ___ apple', options:['A','An','The','-'],                                                 correct:'An' },
        { id:3, texte:'What color is the sky?',               options:['Green','Blue','Red','Yellow'],                                      correct:'Blue' },
        { id:4, texte:'How many days in a week?',             options:['Five','Six','Seven','Eight'],                                        correct:'Seven' },
        { id:5, texte:'She ___ a student.',                   options:['am','is','are','were'],                                              correct:'is' },
      ],
    },
    {
      id: 'test-002',
      type: 'qcm',
      titre: 'Test QCM - Intermédiaires A2/B1',
      niveau: 'A2',
      dureeMin: 30,
      notifierEleves: true,
      notifierResponsable: true,
      dateCreation: '2026-05-22',
      nbUtilisations: 3,
      questions: [
        { id:1, texte:'Which sentence is correct?',                      options:['I have went there','I went there yesterday','I go there yesterday','I was going there tomorrow'],  correct:'I went there yesterday' },
        { id:2, texte:'The comparative of "good" is:',                   options:['More good','Gooder','Better','Best'],                                                              correct:'Better' },
        { id:3, texte:'Choose the correct preposition: I\'m interested ___ music.', options:['at','on','in','of'],                                                                    correct:'in' },
        { id:4, texte:'How long ___ you been studying English?',          options:['do','did','have','are'],                                                                           correct:'have' },
        { id:5, texte:'The opposite of "ancient" is:',                   options:['Old','Modern','Big','Heavy'],                                                                      correct:'Modern' },
        { id:6, texte:'If I ___ you, I would study harder.',              options:['am','was','were','be'],                                                                            correct:'were' },
      ],
    },
    {
      id: 'test-003',
      type: 'listening',
      titre: 'Test Listening - Compréhension orale B1',
      niveau: 'B1',
      dureeMin: 25,
      ressourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      notifierEleves: true,
      notifierResponsable: false,
      dateCreation: '2026-05-25',
      nbUtilisations: 2,
      questions: [
        { id:1, texte:'What is the main topic of the audio?',     options:['Sports','Music','Travel','Food'],         correct:'Music' },
        { id:2, texte:'How does the speaker feel?',               options:['Sad','Angry','Happy','Nervous'],          correct:'Happy' },
        { id:3, texte:'What does the speaker want to do?',        options:['Stay home','Go out','Sleep','Study'],     correct:'Go out' },
      ],
    },
    {
      id: 'test-004',
      type: 'speaking',
      titre: 'Speaking Test - Expression orale B1',
      niveau: 'B1',
      dureeMin: 15,
      speakType: 'independant',
      speakConsigne: 'Do you prefer living in a city or in the countryside? Give at least 2 reasons for your choice and one example from your own experience.',
      speakTip: 'Structure: State your preference → Reason 1 (+ example) → Reason 2 → Conclusion',
      speakNiveau: 'B1',
      speakPrepTime: 45,
      speakRecordTime: 90,
      notifierEleves: true,
      notifierResponsable: true,
      dateCreation: '2026-05-28',
      nbUtilisations: 1,
    },
    {
      id: 'test-005',
      type: 'quiz',
      titre: 'Quiz Vocabulaire - Adolescents',
      niveau: 'A2',
      dureeMin: 15,
      notifierEleves: true,
      notifierResponsable: false,
      dateCreation: '2026-06-01',
      nbUtilisations: 0,
      questions: [
        { id:1, texte:'Give 3 words related to weather in English.' },
        { id:2, texte:'Describe your daily routine in 2-3 sentences.' },
        { id:3, texte:'What is the difference between "say" and "tell"? Give an example for each.' },
      ],
    },
  ];

  // ── Queue tests (apprenants en attente de test) ────────────────────────────
  const queueTests = [
    {
      id: 'insc-009', prenom: 'Chloé',    nom: 'Mensah',    age: 7,  classe: 'CP',
      entreprise: 'Particulier',  emailApp: 'chloe.mensah@betlearning.ci',
      emailParent: 'koffi.mensah@gmail.com',
      prenomParent: 'Koffi', nomParent: 'Mensah',
      dateCreation: '2026-06-01', statut: 'en_attente_test',
    },
    {
      id: 'insc-010', prenom: 'Ibrahim',  nom: 'Sanogo',    age: 15, classe: '2nde',
      entreprise: 'Particulier',  emailApp: 'ibrahim.sanogo@betlearning.ci',
      emailParent: 'fatouma.sanogo@yahoo.fr',
      prenomParent: 'Fatouma', nomParent: 'Sanogo',
      dateCreation: '2026-05-31', statut: 'en_attente_test',
    },
    {
      id: 'insc-006', prenom: 'Éric',     nom: 'Yao',       age: 11, classe: 'CM1',
      entreprise: 'SGBCI',        emailApp: 'eric.yao@betlearning.ci',
      emailParent: 'akissi.yao@sgbci.ci',
      prenomParent: 'Akissi', nomParent: 'Yao',
      dateCreation: '2026-05-30', statut: 'test_en_cours',
    },
    {
      id: 'insc-014', prenom: 'Daouda',   nom: 'Fofana',    age: 11, classe: 'CM1',
      entreprise: 'CANAL+ AFRIQUE', emailApp: 'daouda.fofana@betlearning.ci',
      emailParent: 'koulibaly.fofana@canalplus.com',
      prenomParent: 'Koulibaly', nomParent: 'Fofana',
      dateCreation: '2026-06-01', statut: 'en_attente_test',
    },
  ];

  // ── Queue assignation (tests passés, en attente d'assignation groupe) ──────
  const queueAssignation = [
    {
      id: 'insc-007', prenom: 'Nadia',    nom: 'Touré',     age: 16, classe: '1ère',
      entreprise: 'SGBCI',  emailApp: 'nadia.toure@betlearning.ci',
      dateCreation: '2026-05-30', dateTest: '2026-06-01',
      niveau_cecr: 'B1', notes_test: 'Très bon niveau oral. Quelques lacunes en grammaire.',
      duree_test: 28, statut: 'a_assigner',
    },
    {
      id: 'insc-013', prenom: 'Karim',    nom: 'Ouédraogo', age: 13, classe: '5e',
      entreprise: 'Orange CI', emailApp: 'karim.ouedraogo@betlearning.ci',
      dateCreation: '2026-05-25', dateTest: '2026-06-01',
      niveau_cecr: 'A2', notes_test: 'Niveau correct. Bonne compréhension écrite.',
      duree_test: 22, statut: 'a_assigner',
    },
    {
      id: 'app-005', prenom: 'Kofi',      nom: 'Assi',      age: 10, tranche_age: 'enfant',
      entreprise: 'TLG PHARMA', emailApp: 'kofi.assi@betlearning.ci',
      dateCreation: '2026-05-28', dateTest: '2026-05-31',
      niveau_cecr: 'A1', notes_test: 'Débutant complet. Motivé.',
      duree_test: 18, statut: 'a_assigner',
    },
  ];

  // ── Résultats détaillés de tests passés ───────────────────────────────────
  const resultats = [
    {
      apprenantId: 'insc-011', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 4, total: 5, niveauDetecte: 'A2', dureeMin: 17,
      date: '2026-05-22T10:30:00.000Z',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'A',                  correcte: 'An',                isCorrect: false },
        { question: 'What color is the sky?',                reponseApprenant: 'Blue',               correcte: 'Blue',              isCorrect: true },
        { question: 'How many days in a week?',              reponseApprenant: 'Seven',              correcte: 'Seven',             isCorrect: true },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true },
      ],
    },
    {
      apprenantId: 'insc-012', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 3, total: 5, niveauDetecte: 'A1', dureeMin: 19,
      date: '2026-05-23T09:15:00.000Z',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'I am fine',          correcte: 'My name is Aminata', isCorrect: false },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'An',                 correcte: 'An',                isCorrect: true },
        { question: 'What color is the sky?',                reponseApprenant: 'Blue',               correcte: 'Blue',              isCorrect: true },
        { question: 'How many days in a week?',              reponseApprenant: 'Six',                correcte: 'Seven',             isCorrect: false },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true },
      ],
    },
    {
      apprenantId: 'app-006', testId: 'test-002',
      titreTest: 'Test QCM - Intermédiaires A2/B1', type: 'qcm',
      score: 5, total: 6, niveauDetecte: 'B1', dureeMin: 26,
      date: '2026-05-27T14:00:00.000Z',
      notes_agent: 'Très bonne maîtrise globale. Légère difficulté sur le conditionnel.',
      detailReponses: [
        { question: 'Which sentence is correct?',                             reponseApprenant: 'I went there yesterday',       correcte: 'I went there yesterday',       isCorrect: true },
        { question: 'The comparative of "good" is:',                          reponseApprenant: 'Better',                       correcte: 'Better',                       isCorrect: true },
        { question: "Choose the correct preposition: I'm interested ___ music.", reponseApprenant: 'in',                        correcte: 'in',                           isCorrect: true },
        { question: "How long ___ you been studying English?",                reponseApprenant: 'have',                         correcte: 'have',                         isCorrect: true },
        { question: 'The opposite of "ancient" is:',                          reponseApprenant: 'Modern',                       correcte: 'Modern',                       isCorrect: true },
        { question: 'If I ___ you, I would study harder.',                    reponseApprenant: 'was',                          correcte: 'were',                         isCorrect: false },
      ],
    },
    {
      apprenantId: 'insc-007', testId: 'test-002',
      titreTest: 'Test QCM - Intermédiaires A2/B1', type: 'qcm',
      score: 4, total: 6, niveauDetecte: 'B1', dureeMin: 28,
      date: '2026-06-01T11:20:00.000Z',
      notes_agent: 'Très bon niveau oral. Quelques lacunes en grammaire écrite.',
      detailReponses: [
        { question: 'Which sentence is correct?',                             reponseApprenant: 'I went there yesterday',       correcte: 'I went there yesterday',       isCorrect: true },
        { question: 'The comparative of "good" is:',                          reponseApprenant: 'Better',                       correcte: 'Better',                       isCorrect: true },
        { question: "Choose the correct preposition: I'm interested ___ music.", reponseApprenant: 'on',                        correcte: 'in',                           isCorrect: false },
        { question: "How long ___ you been studying English?",                reponseApprenant: 'have',                         correcte: 'have',                         isCorrect: true },
        { question: 'The opposite of "ancient" is:',                          reponseApprenant: 'Old',                          correcte: 'Modern',                       isCorrect: false },
        { question: 'If I ___ you, I would study harder.',                    reponseApprenant: 'were',                         correcte: 'were',                         isCorrect: true },
      ],
    },
    {
      apprenantId: 'insc-013', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 4, total: 5, niveauDetecte: 'A2', dureeMin: 22,
      date: '2026-06-01T14:05:00.000Z',
      notes_agent: 'Niveau correct. Bonne compréhension écrite.',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'An',                 correcte: 'An',                isCorrect: true },
        { question: 'What color is the sky?',                reponseApprenant: 'Green',              correcte: 'Blue',              isCorrect: false },
        { question: 'How many days in a week?',              reponseApprenant: 'Seven',              correcte: 'Seven',             isCorrect: true },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true },
      ],
    },
    {
      apprenantId: 'app-005', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 3, total: 5, niveauDetecte: 'A1', dureeMin: 18,
      date: '2026-05-31T09:45:00.000Z',
      notes_agent: 'Débutant complet. Motivé.',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'A',                  correcte: 'An',                isCorrect: false },
        { question: 'What color is the sky?',                reponseApprenant: 'Blue',               correcte: 'Blue',              isCorrect: true },
        { question: 'How many days in a week?',              reponseApprenant: 'Eight',              correcte: 'Seven',             isCorrect: false },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true },
      ],
    },
    {
      apprenantId: 'insc-006', testId: 'test-003',
      titreTest: 'Test Listening - Compréhension orale B1', type: 'listening',
      score: 2, total: 3, niveauDetecte: 'B1', dureeMin: 24,
      date: '2026-06-01T15:30:00.000Z',
      detailReponses: [
        { question: 'What is the main topic of the audio?',  reponseApprenant: 'Music',  correcte: 'Music',  isCorrect: true },
        { question: 'How does the speaker feel?',            reponseApprenant: 'Angry',  correcte: 'Happy',  isCorrect: false },
        { question: 'What does the speaker want to do?',     reponseApprenant: 'Go out', correcte: 'Go out', isCorrect: true },
      ],
    },

    // ── Résultats pour les apprenants en queue ASSIGNATION ──────────────────

    // Nadia Touré (insc-007) - Test QCM Intermédiaires A2/B1 - 4/6 → B1
    {
      apprenantId: 'insc-007', testId: 'test-002',
      titreTest: 'Test QCM - Intermédiaires A2/B1', type: 'qcm',
      score: 4, total: 6, niveauDetecte: 'B1', dureeMin: 28,
      date: '2026-06-01T11:20:00.000Z',
      notes_agent: 'Très bon niveau oral. Quelques lacunes en grammaire écrite.',
      detailReponses: [
        { question: 'Which sentence is correct?',                              reponseApprenant: 'I went there yesterday',  correcte: 'I went there yesterday', isCorrect: true  },
        { question: 'The comparative of "good" is:',                           reponseApprenant: 'Better',                 correcte: 'Better',                 isCorrect: true  },
        { question: "Choose the correct preposition: I'm interested ___ music.", reponseApprenant: 'on',                   correcte: 'in',                     isCorrect: false },
        { question: "How long ___ you been studying English?",                 reponseApprenant: 'have',                   correcte: 'have',                   isCorrect: true  },
        { question: 'The opposite of "ancient" is:',                           reponseApprenant: 'Old',                    correcte: 'Modern',                 isCorrect: false },
        { question: 'If I ___ you, I would study harder.',                     reponseApprenant: 'were',                   correcte: 'were',                   isCorrect: true  },
      ],
    },

    // Karim Ouédraogo (insc-013) - Test QCM Débutants A1/A2 - 4/5 → A2
    {
      apprenantId: 'insc-013', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 4, total: 5, niveauDetecte: 'A2', dureeMin: 22,
      date: '2026-06-01T14:05:00.000Z',
      notes_agent: 'Niveau correct. Bonne compréhension écrite. Hésitations à l\'oral.',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true  },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'An',                 correcte: 'An',                isCorrect: true  },
        { question: 'What color is the sky?',                reponseApprenant: 'Green',              correcte: 'Blue',              isCorrect: false },
        { question: 'How many days in a week?',              reponseApprenant: 'Seven',              correcte: 'Seven',             isCorrect: true  },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true  },
      ],
    },

    // Kofi Assi (app-005) - Test QCM Débutants - 3/5 → A1
    {
      apprenantId: 'app-005', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 3, total: 5, niveauDetecte: 'A1', dureeMin: 18,
      date: '2026-05-31T09:45:00.000Z',
      notes_agent: 'Débutant complet. Très motivé, souriant pendant le test.',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true  },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'A',                  correcte: 'An',                isCorrect: false },
        { question: 'What color is the sky?',                reponseApprenant: 'Blue',               correcte: 'Blue',              isCorrect: true  },
        { question: 'How many days in a week?',              reponseApprenant: 'Eight',              correcte: 'Seven',             isCorrect: false },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true  },
      ],
    },

    // Awa Bamba (app-006) - Test QCM Intermédiaires - 5/6 → B1 (2e tentative aussi)
    {
      apprenantId: 'app-006', testId: 'test-002',
      titreTest: 'Test QCM - Intermédiaires A2/B1', type: 'qcm',
      score: 5, total: 6, niveauDetecte: 'B1', dureeMin: 26,
      date: '2026-05-27T14:00:00.000Z',
      notes_agent: 'Très bonne maîtrise globale. Légère difficulté sur le conditionnel.',
      detailReponses: [
        { question: 'Which sentence is correct?',                              reponseApprenant: 'I went there yesterday',  correcte: 'I went there yesterday', isCorrect: true  },
        { question: 'The comparative of "good" is:',                           reponseApprenant: 'Better',                 correcte: 'Better',                 isCorrect: true  },
        { question: "Choose the correct preposition: I'm interested ___ music.", reponseApprenant: 'in',                   correcte: 'in',                     isCorrect: true  },
        { question: "How long ___ you been studying English?",                 reponseApprenant: 'have',                   correcte: 'have',                   isCorrect: true  },
        { question: 'The opposite of "ancient" is:',                           reponseApprenant: 'Modern',                 correcte: 'Modern',                 isCorrect: true  },
        { question: 'If I ___ you, I would study harder.',                     reponseApprenant: 'was',                    correcte: 'were',                   isCorrect: false },
      ],
    },

    // Chloé Mensah (insc-009) - Speaking B1 (passé via lien)
    {
      apprenantId: 'insc-009', testId: 'test-004',
      titreTest: 'Speaking Test - Expression orale B1', type: 'speaking',
      score: null, total: null, niveauDetecte: 'B1', dureeMin: 14,
      date: '2026-06-01T16:00:00.000Z',
      speakConsigne: 'Do you prefer living in a city or in the countryside? Give at least 2 reasons for your choice and one example from your own experience.',
      speakType: 'independant',
      notes_agent: 'Réponse courte mais structurée. Accent à travailler. Niveau B1 confirmé.',
    },

    // Ibrahim Sanogo (insc-010) - Quiz Vocabulaire - réponses libres
    {
      apprenantId: 'insc-010', testId: 'test-005',
      titreTest: 'Quiz Vocabulaire - Adolescents', type: 'quiz',
      score: null, total: 3, niveauDetecte: 'A2', dureeMin: 12,
      date: '2026-06-01T17:10:00.000Z',
      detailReponses: [
        { question: 'Give 3 words related to weather in English.',                              reponseApprenant: 'Rain, sunny, cold',                                          correcte: null, isCorrect: null },
        { question: 'Describe your daily routine in 2-3 sentences.',                           reponseApprenant: 'I wake up at 7. I go to school. I study in the evening.',     correcte: null, isCorrect: null },
        { question: "What is the difference between \"say\" and \"tell\"? Give an example.",  reponseApprenant: 'Say is without person. Tell is with person. I say hello. I tell him.',  correcte: null, isCorrect: null },
      ],
    },

    // Nadia Touré - 2e passage sur test-001 (pour tester multi-tentatives)
    {
      apprenantId: 'insc-007', testId: 'test-001',
      titreTest: 'Test QCM - Débutants A1/A2', type: 'qcm',
      score: 5, total: 5, niveauDetecte: 'A2', dureeMin: 15,
      date: '2026-05-28T09:00:00.000Z',
      notes_agent: '1ère tentative (test de calibrage). Résultat ignoré - trop simple pour elle.',
      detailReponses: [
        { question: 'What is your name?',                    reponseApprenant: 'My name is Aminata', correcte: 'My name is Aminata', isCorrect: true },
        { question: 'Choose the correct article: ___ apple', reponseApprenant: 'An',                 correcte: 'An',                isCorrect: true },
        { question: 'What color is the sky?',                reponseApprenant: 'Blue',               correcte: 'Blue',              isCorrect: true },
        { question: 'How many days in a week?',              reponseApprenant: 'Seven',              correcte: 'Seven',             isCorrect: true },
        { question: 'She ___ a student.',                    reponseApprenant: 'is',                 correcte: 'is',                isCorrect: true },
      ],
    },
  ];

  localStorage.setItem('bet_tests_niveau',    JSON.stringify(tests));
  localStorage.setItem('bet_queue_tests',      JSON.stringify(queueTests));
  localStorage.setItem('bet_queue_assignation',JSON.stringify(queueAssignation));
  localStorage.setItem('bet_resultats_tests',  JSON.stringify(resultats));
  localStorage.setItem('bet_seed_v3',          '1');
}
