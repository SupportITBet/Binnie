export const CATEGORIES_COMPETENCES = [
  { id: 'oral_comp',  lib: 'Compréhension orale',  icone: '🎧', couleur: '#10B981' },
  { id: 'oral_expr',  lib: 'Expression orale',      icone: '🎤', couleur: '#F97316' },
  { id: 'ecrit_comp', lib: 'Compréhension écrite',  icone: '📖', couleur: '#3B82F6' },
  { id: 'ecrit_expr', lib: 'Expression écrite',     icone: '✍️',  couleur: '#8B5CF6' },
  { id: 'vocab',      lib: 'Vocabulaire',            icone: '📚', couleur: '#0891B2' },
  { id: 'grammaire',  lib: 'Grammaire',              icone: '📐', couleur: '#6366F1' },
];

export const COMPETENCES_DEFAUT = {
  A1: [
    { id:'a1-01', categorie:'oral_comp',  libelle:'Comprendre des salutations et formules de politesse',    description:'Reconnaître "Bonjour", "Merci", "S\'il vous plaît", "Au revoir"' },
    { id:'a1-02', categorie:'oral_comp',  libelle:'Comprendre des chiffres et couleurs énoncés lentement',  description:'Identifier les nombres de 1 à 20 et les couleurs de base' },
    { id:'a1-03', categorie:'oral_expr',  libelle:'Se présenter simplement',                                 description:'Dire son prénom, son âge et sa nationalité' },
    { id:'a1-04', categorie:'oral_expr',  libelle:'Nommer des objets du quotidien',                          description:'Dire les noms de la famille, des animaux, des aliments courants' },
    { id:'a1-05', categorie:'ecrit_comp', libelle:'Comprendre des panneaux et instructions simples',         description:'Lire "STOP", "SORTIE", "OUVERT / FERMÉ"' },
    { id:'a1-06', categorie:'ecrit_comp', libelle:'Lire et comprendre des formulaires simples',              description:'Comprendre les champs nom, prénom, date de naissance' },
    { id:'a1-07', categorie:'ecrit_expr', libelle:'Écrire son prénom, son adresse et sa nationalité',        description:'Remplir un formulaire d\'identité basique' },
    { id:'a1-08', categorie:'vocab',      libelle:'Maîtriser 300 à 500 mots courants',                       description:'Vocabulaire de la vie quotidienne : famille, maison, nourriture, chiffres' },
    { id:'a1-09', categorie:'grammaire',  libelle:'Utiliser le présent simple des verbes TO BE et HAVE',     description:'"I am a student." / "She has a cat."' },
    { id:'a1-10', categorie:'grammaire',  libelle:'Construire des phrases affirmatives et négatives simples', description:'"I like cats." / "I don\'t like dogs."' },
  ],
  A2: [
    { id:'a2-01', categorie:'oral_comp',  libelle:'Comprendre des conversations simples sur des sujets familiers', description:'Dialogues sur les achats, la famille, le travail' },
    { id:'a2-02', categorie:'oral_comp',  libelle:'Comprendre des annonces courtes et des messages simples',        description:'Annonces dans les transports, messages téléphoniques' },
    { id:'a2-03', categorie:'oral_expr',  libelle:'Décrire sa famille, ses habitudes et son environnement',         description:'Parler de sa routine quotidienne et de son logement' },
    { id:'a2-04', categorie:'oral_expr',  libelle:'Échanger lors d\'activités simples (courses, restaurant)',        description:'Commander un repas, demander un prix, se plaindre poliment' },
    { id:'a2-05', categorie:'ecrit_comp', libelle:'Comprendre des textes courts et simples',                        description:'Petites annonces, cartes postales, menus, horaires' },
    { id:'a2-06', categorie:'ecrit_comp', libelle:'Lire et comprendre des e-mails informels courts',                description:'Messages de collègues, d\'amis ou de la famille' },
    { id:'a2-07', categorie:'ecrit_expr', libelle:'Rédiger une note ou un message simple',                          description:'Écrire un SMS, une carte postale, un e-mail court' },
    { id:'a2-08', categorie:'vocab',      libelle:'Maîtriser 1 000 à 1 500 mots',                                   description:'Vocabulaire élargi : travail, santé, loisirs, transport' },
    { id:'a2-09', categorie:'grammaire',  libelle:'Utiliser le passé simple (Past Simple)',                          description:'"I went to school yesterday." / "She didn\'t come."' },
    { id:'a2-10', categorie:'grammaire',  libelle:'Exprimer le futur avec WILL et BE GOING TO',                     description:'"I will call you." / "She is going to travel."' },
  ],
  B1: [
    { id:'b1-01', categorie:'oral_comp',  libelle:'Comprendre l\'essentiel d\'émissions radio et TV',               description:'Informations, documentaires, reportages sur des sujets familiers' },
    { id:'b1-02', categorie:'oral_comp',  libelle:'Comprendre des conversations entre locuteurs natifs',             description:'Saisir le sens général même sans tout comprendre' },
    { id:'b1-03', categorie:'oral_expr',  libelle:'Participer à des conversations sur des sujets familiers',         description:'Voyages, travail, actualités, expériences personnelles' },
    { id:'b1-04', categorie:'oral_expr',  libelle:'Raconter une histoire, un film ou un événement',                  description:'Décrire une intrigue, exprimer des réactions personnelles' },
    { id:'b1-05', categorie:'ecrit_comp', libelle:'Comprendre des textes rédigés en langage courant',               description:'Articles de journaux, lettres personnelles, descriptions' },
    { id:'b1-06', categorie:'ecrit_comp', libelle:'Comprendre des e-mails professionnels standards',                 description:'Devis, confirmations de rendez-vous, courriers RH' },
    { id:'b1-07', categorie:'ecrit_expr', libelle:'Rédiger un texte cohérent sur des sujets familiers',              description:'Lettres, résumés, récits d\'expériences' },
    { id:'b1-08', categorie:'vocab',      libelle:'Maîtriser 2 500 à 3 500 mots',                                   description:'Vocabulaire thématique : business, santé, environnement, technologie' },
    { id:'b1-09', categorie:'grammaire',  libelle:'Utiliser le Present Perfect vs Past Simple',                      description:'"I have just finished." vs "I finished yesterday."' },
    { id:'b1-10', categorie:'grammaire',  libelle:'Maîtriser les modaux de probabilité (MIGHT, COULD, SHOULD)',      description:'"She might be at the office." / "You should call him."' },
  ],
  B2: [
    { id:'b2-01', categorie:'oral_comp',  libelle:'Comprendre des conférences et discours complexes',               description:'Exposés techniques, débats, présentations académiques' },
    { id:'b2-02', categorie:'oral_comp',  libelle:'Comprendre des films et séries en version originale',             description:'Saisir les nuances, l\'humour et les expressions idiomatiques' },
    { id:'b2-03', categorie:'oral_expr',  libelle:'Participer activement à des débats et discussions',               description:'Argumenter, défendre un point de vue, nuancer sa position' },
    { id:'b2-04', categorie:'oral_expr',  libelle:'Présenter en public de façon claire et structurée',               description:'Exposés, réunions, présentations de projets' },
    { id:'b2-05', categorie:'ecrit_comp', libelle:'Comprendre des articles spécialisés et techniques',               description:'Rapports d\'entreprise, études de cas, articles scientifiques' },
    { id:'b2-06', categorie:'ecrit_comp', libelle:'Lire de la littérature contemporaine sans difficultés majeures',  description:'Romans, nouvelles, autobiographies en anglais' },
    { id:'b2-07', categorie:'ecrit_expr', libelle:'Rédiger des rapports et essais structurés',                       description:'Rapports professionnels, synthèses, lettres de motivation' },
    { id:'b2-08', categorie:'vocab',      libelle:'Maîtriser 5 000 à 7 000 mots',                                   description:'Vocabulaire académique, professionnel et idiomatic' },
    { id:'b2-09', categorie:'grammaire',  libelle:'Maîtriser le discours indirect et les conditionnels',             description:'"She said she would come." / "If I were you, I would..."' },
    { id:'b2-10', categorie:'grammaire',  libelle:'Utiliser les structures passives complexes',                       description:'"The report is being reviewed." / "It had been decided that..."' },
  ],
  C1: [
    { id:'c1-01', categorie:'oral_comp',  libelle:'Comprendre des textes longs et complexes sans effort',            description:'Discours abstraits, jargon spécialisé, accents variés' },
    { id:'c1-02', categorie:'oral_expr',  libelle:'S\'exprimer spontanément, couramment et précisément',             description:'Adapter son registre selon le contexte, utiliser l\'humour' },
    { id:'c1-03', categorie:'ecrit_comp', libelle:'Comprendre tous types de textes y compris implicites',            description:'Textes littéraires, satire, sous-entendus culturels' },
    { id:'c1-04', categorie:'ecrit_expr', libelle:'Rédiger des textes bien structurés sur des sujets complexes',     description:'Articles de presse, thèses, contrats professionnels' },
    { id:'c1-05', categorie:'vocab',      libelle:'Maîtriser plus de 10 000 mots incluant expressions idiomatiques', description:'Proverbes, argot professionnel, collocations avancées' },
  ],
  C2: [
    { id:'c2-01', categorie:'oral_comp',  libelle:'Comprendre sans difficulté tout type de langage oral',            description:'Dialectes, accents régionaux, vitesse élevée, jargon' },
    { id:'c2-02', categorie:'oral_expr',  libelle:'S\'exprimer spontanément avec une grande précision',             description:'Nuancer, reformuler, convaincre dans tout contexte' },
    { id:'c2-03', categorie:'ecrit_comp', libelle:'Lire avec aisance toute forme de texte',                          description:'Textes académiques, littérature classique, documents juridiques' },
    { id:'c2-04', categorie:'ecrit_expr', libelle:'Résumer et synthétiser des sources variées',                      description:'Rapports de recherche, révisions critiques, traductions' },
    { id:'c2-05', categorie:'vocab',      libelle:'Vocabulaire aussi étendu qu\'un locuteur natif cultivé',         description:'Maîtrise des registres formels, informels, littéraires' },
  ],
};

// Compétences par niveau CECR - éditables depuis Admin BET → Configuration →
// Compétences, persistées en base (table config_competences_elearning) pour
// être visibles par tous les apprenants, quel que soit leur navigateur/appareil
// (auparavant stocké en localStorage, donc invisible en dehors du poste de l'admin).
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export async function chargerCompetences(token) {
  try {
    const r = await fetch(`${API_URL}/api/config-competences-elearning`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ...COMPETENCES_DEFAUT };
    const d = await r.json();
    return d && Object.keys(d).length ? d : { ...COMPETENCES_DEFAUT };
  } catch {
    return { ...COMPETENCES_DEFAUT };
  }
}

export async function sauverCompetences(data, token) {
  const r = await fetch(`${API_URL}/api/config-competences-elearning`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Plateforme': 'bet-elearning' },
    body: JSON.stringify({ data }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return d;
}

export const NIVEAUX_CECR = {
  A1: {
    code:        'A1',
    libelle:     'Débutant',
    description: 'Peut comprendre et utiliser des expressions familières et quotidiennes',
    couleur:     '#10B981',
    couleurFond: '#D1FAE5',
    seuil_min:   0,
    seuil_max:   24,
  },
  A2: {
    code:        'A2',
    libelle:     'Élémentaire',
    description: 'Peut communiquer lors de tâches simples et habituelles',
    couleur:     '#0891B2',
    couleurFond: '#E0F2FE',
    seuil_min:   25,
    seuil_max:   49,
  },
  B1: {
    code:        'B1',
    libelle:     'Intermédiaire',
    description: 'Peut comprendre l\'essentiel quand le langage est clair et standard',
    couleur:     '#7C3AED',
    couleurFond: '#EDE9FE',
    seuil_min:   50,
    seuil_max:   74,
  },
  B2: {
    code:        'B2',
    libelle:     'Intermédiaire supérieur',
    description: 'Peut comprendre le contenu essentiel de sujets complexes',
    couleur:     '#D97706',
    couleurFond: '#FEF3C7',
    seuil_min:   75,
    seuil_max:   100,
  },
  C1: {
    code:        'C1',
    libelle:     'Avancé',
    description: 'Peut s\'exprimer spontanément et couramment sans trop chercher ses mots',
    couleur:     '#DC2626',
    couleurFond: '#FEE2E2',
    seuil_min:   101,
    seuil_max:   120,
  },
  C2: {
    code:        'C2',
    libelle:     'Maîtrise',
    description: 'Peut comprendre sans effort pratiquement tout ce qu\'il lit ou entend',
    couleur:     '#7C3AED',
    couleurFond: '#EDE9FE',
    seuil_min:   121,
    seuil_max:   999,
  },
};

export function scoreVersNiveauCECR(score) {
  if (score < 25) return 'A1';
  if (score < 50) return 'A2';
  if (score < 75) return 'B1';
  return 'B2';
}
