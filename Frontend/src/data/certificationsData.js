export const certificationsData = {
  toeic: {
    name: "TOEIC",
    fullName: "Test of English for International Communication",
    description: "Le TOEIC est le test d'anglais le plus reconnu pour l'employabilité et la mobilité internationale. Il évalue vos compétences en compréhension orale et écrite dans un contexte professionnel.",
    heroImage: "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=1200&q=80",
    price: "200 000 F CFA / mois",
    duration: "Préparation intensive : 4 à 8 semaines",
    benefits: [
      "Faire des études dans n'importe quelle université dans le monde",
      "Travailler à l'étranger",
      "Prouver vos compétences linguistiques en anglais",
      "Faciliter la mobilité professionnelle et l'immigration (Canada, etc.)"
    ],
    examStructure: [
      { section: "Compréhension orale", duration: "45 min", questions: 100 },
      { section: "Compréhension écrite", duration: "75 min", questions: 100 }
    ],
    preparationProgram: {
      weeks: 6,
      hoursPerWeek: 8,
      details: "Cours intensifs, tests blancs, coaching personnalisé"
    },
    whyChoose: "Nos cours de préparation TOEIC sont animés par des experts certifiés. Vous bénéficiez de 6 tests blancs complets, d'une correction détaillée, et d'un suivi individuel pour maximiser votre score."
  },
  toefl: {
    name: "TOEFL",
    fullName: "Test of English as a Foreign Language",
    description: "Le TOEFL est le test d'anglais académique le plus reconnu pour entrer dans les universités américaines, canadiennes et européennes. Il évalue les 4 compétences : lecture, écoute, oral, écrit.",
    heroImage: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80",
    price: "220 000 F CFA / mois",
    duration: "Préparation : 8 semaines",
    benefits: [
      "Admission dans plus de 11 000 universités dans le monde",
      "Valorisation de votre dossier académique",
      "Test complet (lecture, écoute, oral, écrit)",
      "Reconnu par les gouvernements pour l'immigration"
    ],
    examStructure: [
      { section: "Reading", duration: "54-72 min", questions: "30-40" },
      { section: "Listening", duration: "41-57 min", questions: "28-39" },
      { section: "Speaking", duration: "17 min", tasks: 4 },
      { section: "Writing", duration: "50 min", tasks: 2 }
    ],
    preparationProgram: {
      weeks: 8,
      hoursPerWeek: 10,
      details: "Cours en ligne ou en présentiel, exercices interactifs, simulation d'examen"
    },
    whyChoose: "Notre préparation TOEFL vous offre un accès à une plateforme exclusive avec +500 exercices, des corrigés types, et des sessions de speaking en petit groupe avec des natifs."
  },
  ielts: {
    name: "IELTS",
    fullName: "International English Language Testing System",
    description: "L'IELTS est le test d'anglais le plus populaire pour étudier, travailler ou migrer dans les pays anglophones (Royaume-Uni, Australie, Nouvelle-Zélande, Canada).",
    heroImage: "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
    price: "210 000 F CFA / mois",
    duration: "Préparation : 6 à 10 semaines",
    benefits: [
      "Reconnu par plus de 10 000 organisations dans le monde",
      "Deux versions : Academic et General Training",
      "Idéal pour l'immigration au Canada, Australie, NZ",
      "Évaluation de l'anglais réel (accent variés)"
    ],
    examStructure: [
      { section: "Listening", duration: "30 min", questions: 40 },
      { section: "Reading", duration: "60 min", questions: 40 },
      { section: "Writing", duration: "60 min", tasks: 2 },
      { section: "Speaking", duration: "11-14 min", tasks: 3 }
    ],
    preparationProgram: {
      weeks: 8,
      hoursPerWeek: 9,
      details: "Cours particuliers ou groupe, focus sur les stratégies par section"
    },
    whyChoose: "Nous proposons une préparation IELTS avec des examinateurs certifiés. Bénéficiez de 8 simulations complètes et d'un plan de progression personnalisé."
  }
};