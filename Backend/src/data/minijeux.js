/**
 * LES QUESTIONS DES MINI-JEUX — LA SOURCE UNIQUE.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 *
 * `contenus_mini_jeux_dash` ne porte que l'ENVELOPPE d'un jeu : un nom, un `type`, une cible,
 * un plafond de tentatives et un `nb_questions`. Les questions elles-mêmes vivaient en dur
 * dans `dash/src/Pages/EspaceApprenant/EspaceApprenant.jsx`, c'est-à-dire dans UN SEUL client.
 *
 * Conséquence directe : l'application mobile ne pouvait pas faire jouer un seul jeu, et la
 * seule façon de l'y amener aurait été de recopier 190 lignes de questions dans un second
 * projet. Deux banques, deux vérités, et la certitude qu'elles divergent au premier ajout.
 *
 * Preuve que la dérive avait déjà commencé : la colonne `nb_questions` de la base contient
 * exactement la longueur des tableaux JS (10, 6, 5, 8…), recopiée à la main. Personne ne peut
 * modifier une question sans toucher au code du dashboard, et la colonne mentirait en silence
 * si quelqu'un le faisait.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * CE QUE CE FICHIER N'EST PAS : un éditeur de contenu. Les questions restent écrites par des
 * développeurs. Mais elles sont désormais servies par une route, donc le jour où l'équipe
 * pédagogique devra les éditer, il suffira de remplacer la lecture de ce module par une
 * lecture de table — sans toucher aux deux clients.
 *
 * LES BONNES RÉPONSES SONT ENVOYÉES AU CLIENT. C'est assumé, parce que le score l'est déjà :
 * `POST /mini-jeux/:id/resultat` enregistre le score que le client affirme avoir obtenu. Cacher
 * les réponses tout en faisant confiance au score ne protégerait rien. Un vrai verrou
 * demanderait de corriger les réponses côté serveur — autre chantier, noté ici et pas fait.
 *
 * `FORMES[type]` RENVOIE LA FORME ATTENDUE PAR LES MOTEURS. Chaque type a sa structure propre
 * (une liste de questions pour la plupart, une grille pour les mots croisés, un chrono pour le
 * sprint). Les noms de champs sont ceux que l'espace web utilisait déjà : le portage du web sur
 * cette route est un remplacement de constante, pas une réécriture.
 */

/* ── QCM Flash : traduire un mot, chronométré ─────────────────────────────────────────────── */
const QCM = [
  { mot: 'Hello',        options: ['Bonjour', 'Au revoir', 'Merci', "S'il vous plaît"],    correct: 'Bonjour' },
  { mot: 'Goodbye',      options: ['Bonjour', 'Bonsoir', 'Au revoir', 'Bienvenue'],        correct: 'Au revoir' },
  { mot: 'Thank you',    options: ['Pardon', 'Merci', 'De rien', "S'il vous plaît"],       correct: 'Merci' },
  { mot: 'Please',       options: ['Merci', 'Pardon', "S'il vous plaît", 'Bonjour'],       correct: "S'il vous plaît" },
  { mot: 'Sorry',        options: ['Bienvenue', 'Désolé', 'Bonjour', 'Bonsoir'],           correct: 'Désolé' },
  { mot: 'Yes',          options: ['Non', 'Peut-être', 'Oui', 'Jamais'],                   correct: 'Oui' },
  { mot: 'No',           options: ['Oui', 'Non', 'Peut-être', 'Toujours'],                 correct: 'Non' },
  { mot: 'Good morning', options: ['Bonsoir', 'Bonne nuit', 'Bonjour', 'Bon après-midi'],  correct: 'Bonjour' },
  { mot: 'Friend',       options: ['Ennemi', 'Famille', 'Ami', 'Collègue'],                correct: 'Ami' },
  { mot: 'Water',        options: ['Feu', 'Eau', 'Air', 'Terre'],                          correct: 'Eau' },
];

/* ── Association : relier un mot français à son équivalent anglais ───────────────────────── */
const ASSOCIATION = [
  { fr: 'Bonjour', en: 'Hello' },
  { fr: 'Merci',   en: 'Thank you' },
  { fr: 'Chat',    en: 'Cat' },
  { fr: 'Chien',   en: 'Dog' },
  { fr: 'Maison',  en: 'House' },
  { fr: 'Voiture', en: 'Car' },
];

/* ── Mot manquant ─────────────────────────────────────────────────────────────────────────── */
const LACUNES = [
  { phrase: 'My ___ is Aminata.',   mot: 'name',   indice: 'Ton prénom/nom' },
  { phrase: 'I am ___ years old.',  mot: 'twelve', indice: 'Ton âge (12)' },
  { phrase: '___ morning !',        mot: 'Good',   indice: 'Salutation matinale' },
  { phrase: 'Nice to ___ you !',    mot: 'meet',   indice: 'Enchanté de vous rencontrer' },
  { phrase: 'I ___ from Abidjan.',  mot: 'am',     indice: 'Verbe être (1ère pers.)' },
];

/* ── Anagramme ────────────────────────────────────────────────────────────────────────────────
   `melange` DOIT contenir exactement les lettres de `mot`, ni plus ni moins : les moteurs
   affichent une tuile par lettre du mélange et vérifient le mot reconstitué. La version web
   portait `FISH → 'HIFSF'` (cinq tuiles, deux F) : le jeu était infaisable pour cette entrée.
   Corrigé en 'HSIF', et `verifierBanques()` plus bas empêche la faute de revenir. */
const ANAGRAMME = [
  { mot: 'CAT',  melange: 'TCA',  indice: '🐱 Un animal domestique' },
  { mot: 'DOG',  melange: 'GOD',  indice: "🐶 Le meilleur ami de l'homme" },
  { mot: 'SUN',  melange: 'UNS',  indice: '☀️ Brille dans le ciel' },
  { mot: 'TREE', melange: 'EETR', indice: '🌳 Pousse dans la forêt' },
  { mot: 'BIRD', melange: 'RIBD', indice: '🐦 Vole dans les airs' },
  { mot: 'BLUE', melange: 'ULBE', indice: '🔵 Une couleur' },
  { mot: 'FISH', melange: 'HSIF', indice: "🐟 Vit dans l'eau" },
  { mot: 'STAR', melange: 'RATS', indice: '⭐ Brille la nuit' },
];

/* ── Sprint vocabulaire : le maximum de traductions en 60 secondes ───────────────────────── */
const SPRINT = [
  { en: 'apple', fr: 'pomme' },   { en: 'book', fr: 'livre' },    { en: 'car', fr: 'voiture' },
  { en: 'door', fr: 'porte' },    { en: 'eye', fr: 'œil' },       { en: 'fish', fr: 'poisson' },
  { en: 'girl', fr: 'fille' },    { en: 'hand', fr: 'main' },     { en: 'ice', fr: 'glace' },
  { en: 'jump', fr: 'sauter' },   { en: 'key', fr: 'clé' },       { en: 'lamp', fr: 'lampe' },
  { en: 'moon', fr: 'lune' },     { en: 'nose', fr: 'nez' },      { en: 'open', fr: 'ouvrir' },
  { en: 'pen', fr: 'stylo' },     { en: 'rain', fr: 'pluie' },    { en: 'sea', fr: 'mer' },
  { en: 'tree', fr: 'arbre' },    { en: 'up', fr: 'en haut' },    { en: 'voice', fr: 'voix' },
  { en: 'wind', fr: 'vent' },     { en: 'year', fr: 'année' },    { en: 'zero', fr: 'zéro' },
  { en: 'air', fr: 'air' },       { en: 'bed', fr: 'lit' },       { en: 'cat', fr: 'chat' },
  { en: 'day', fr: 'jour' },      { en: 'eat', fr: 'manger' },    { en: 'fly', fr: 'voler' },
];

/* ── Vrai ou Faux : juger une règle de grammaire ─────────────────────────────────────────── */
const VRAI_FAUX = [
  { enonce: '"I goed to school yesterday" is correct.',         correct: false, explication: '❌ Faux - le passé de "go" est "went" (irrégulier). ✅ "I went to school."' },
  { enonce: '"She doesn\'t like coffee" is correct.',           correct: true,  explication: '✅ Vrai - on utilise "doesn\'t" à la 3e personne du singulier.' },
  { enonce: '"Childrens are playing" is correct.',              correct: false, explication: '❌ Faux - "children" est déjà le pluriel irrégulier de "child". ✅ "Children are playing."' },
  { enonce: '"He has been living here for 5 years" is correct.', correct: true, explication: '✅ Vrai - present perfect + "for" pour une durée qui continue.' },
  { enonce: '"I am agree with you" is correct.',                correct: false, explication: '❌ Faux - "agree" est un verbe, pas un adjectif. ✅ "I agree with you."' },
  { enonce: '"Much students were absent" is correct.',          correct: false, explication: '❌ Faux - "many" pour les noms dénombrables. ✅ "Many students were absent."' },
  { enonce: '"She speaks English very well" is correct.',       correct: true,  explication: '✅ Vrai - structure correcte avec adverbe de manière après le complément.' },
  { enonce: '"I didn\'t went to the party" is correct.',        correct: false, explication: '❌ Faux - après "didn\'t", on utilise l\'infinitif. ✅ "I didn\'t go to the party."' },
];

/* ── Phrases à réordonner ─────────────────────────────────────────────────────────────────── */
const REORDRE = [
  { mots: ['I', 'school', 'to', 'go'],                      correct: ['I', 'go', 'to', 'school'],                               fr: "Je vais à l'école." },
  { mots: ['she', 'English', 'speaks'],                     correct: ['she', 'speaks', 'English'],                              fr: 'Elle parle anglais.' },
  { mots: ['cats', 'love', 'I'],                            correct: ['I', 'love', 'cats'],                                     fr: "J'adore les chats." },
  { mots: ['playing', 'are', 'they', 'football'],           correct: ['they', 'are', 'playing', 'football'],                    fr: 'Ils jouent au foot.' },
  { mots: ['yesterday', 'went', 'I', 'market', 'to', 'the'], correct: ['I', 'went', 'to', 'the', 'market', 'yesterday'],        fr: 'Je suis allé(e) au marché hier.' },
  { mots: ['much', 'how', 'cost', 'does', 'it'],            correct: ['how', 'much', 'does', 'it', 'cost'],                     fr: 'Combien ça coûte ?' },
  { mots: ['rain', 'it', 'will', 'tomorrow'],               correct: ['it', 'will', 'rain', 'tomorrow'],                        fr: 'Il va pleuvoir demain.' },
  { mots: ['never', 'coffee', 'drunk', 'have', 'I'],        correct: ['I', 'have', 'never', 'drunk', 'coffee'],                  fr: "Je n'ai jamais bu de café." },
];

/* ── Complétion de dialogue : trois situations, chacune avec ses répliques à choisir ─────── */
const DIALOGUE = [
  { situation: '☕ Au café', repliques: [
    { loc: 'Serveur', texte: 'Good morning! What would you like?' },
    { loc: 'Toi', options: ['I would like a coffee, please.', 'Give me coffee now!', 'Coffee! Coffee!'], correct: 0 },
    { loc: 'Serveur', texte: 'Of course! Anything else?' },
    { loc: 'Toi', options: ['No, thank you.', 'No want nothing.', 'I no want more.'], correct: 0 },
    { loc: 'Serveur', texte: "That'll be 500 FCFA, please." },
    { loc: 'Toi', options: ['Here you are.', 'Take money!', 'Give change!'], correct: 0 },
  ] },
  { situation: '🏪 En magasin', repliques: [
    { loc: 'Vendeur', texte: 'Can I help you?' },
    { loc: 'Toi', options: ["I'm looking for a blue shirt.", 'I want shirt blue.', 'Blue shirt give me.'], correct: 0 },
    { loc: 'Vendeur', texte: 'What size are you?' },
    { loc: 'Toi', options: ["I'm a medium, please.", 'My size medium.', 'Medium I am.'], correct: 0 },
    { loc: 'Vendeur', texte: 'Here you go. Would you like to try it on?' },
    { loc: 'Toi', options: ['Yes, please. Where are the fitting rooms?', 'Yes. Where room?', 'Yes fitting room where?'], correct: 0 },
  ] },
  { situation: '📞 Au téléphone', repliques: [
    { loc: 'Réceptionniste', texte: 'Good afternoon, BET Training. How can I help you?' },
    { loc: 'Toi', options: ["I'd like to book an appointment, please.", 'I want appointment!', 'Appointment make for me.'], correct: 0 },
    { loc: 'Réceptionniste', texte: 'Of course. What date suits you?' },
    { loc: 'Toi', options: ['Is Wednesday at 10am available?', 'Wednesday 10 ok?', 'I want Wednesday morning.'], correct: 0 },
    { loc: 'Réceptionniste', texte: 'Yes, that works. Can I have your name, please?' },
    { loc: 'Toi', options: ['My name is Aminata Koné.', 'Name me Aminata.', 'I Aminata Koné.'], correct: 0 },
  ] },
];

/* ── Flashcards ───────────────────────────────────────────────────────────────────────────── */
const FLASHCARDS = [
  { recto: 'to be',           verso: 'être\nam / is / are',                                        categorie: 'Verbes essentiels' },
  { recto: 'to have',         verso: 'avoir\nhave / has',                                           categorie: 'Verbes essentiels' },
  { recto: 'to go',           verso: 'aller\ngo → went (irrég.)',                                   categorie: 'Verbes essentiels' },
  { recto: 'to make',         verso: 'faire / fabriquer\nmake → made',                              categorie: 'Verbes essentiels' },
  { recto: 'to take',         verso: 'prendre\ntake → took',                                        categorie: 'Verbes essentiels' },
  { recto: 'to come',         verso: 'venir\ncome → came',                                          categorie: 'Verbes essentiels' },
  { recto: 'Present Perfect', verso: 'have/has + past participle\n"I have lived here for 5 years."', categorie: 'Grammaire' },
  { recto: 'Past Simple',     verso: 'Action terminée dans le passé\n"I went to school yesterday."', categorie: 'Grammaire' },
  { recto: 'will + verb',     verso: 'Futur simple\n"It will rain tomorrow."',                       categorie: 'Grammaire' },
  { recto: 'since vs for',    verso: '"since" = point de départ → since 2020\n"for" = durée → for 3 years', categorie: 'Grammaire' },
];

/* ── Conjugaison express ──────────────────────────────────────────────────────────────────── */
const CONJUGAISON = [
  { infinitif: 'go',    temps: 'passé simple (I)', correct: 'went',  indice: 'Aller (irrégulier)' },
  { infinitif: 'be',    temps: 'passé simple (I)', correct: 'was',   indice: 'Être (irrégulier)' },
  { infinitif: 'have',  temps: 'passé simple (I)', correct: 'had',   indice: 'Avoir (irrégulier)' },
  { infinitif: 'see',   temps: 'passé simple (I)', correct: 'saw',   indice: 'Voir (irrégulier)' },
  { infinitif: 'come',  temps: 'passé simple (I)', correct: 'came',  indice: 'Venir (irrégulier)' },
  { infinitif: 'take',  temps: 'passé simple (I)', correct: 'took',  indice: 'Prendre (irrégulier)' },
  { infinitif: 'give',  temps: 'passé simple (I)', correct: 'gave',  indice: 'Donner (irrégulier)' },
  { infinitif: 'speak', temps: 'passé simple (I)', correct: 'spoke', indice: 'Parler (irrégulier)' },
  { infinitif: 'write', temps: 'passé simple (I)', correct: 'wrote', indice: 'Écrire (irrégulier)' },
  { infinitif: 'know',  temps: 'passé simple (I)', correct: 'knew',  indice: 'Savoir (irrégulier)' },
];

/* ── Défi CECR : questions calibrées par niveau ───────────────────────────────────────────── */
const CECR = [
  { niveau: 'A1', q: 'What is the plural of "child"?',                  options: ['childs', 'children', 'childes', 'child'],                                      correct: 'children' },
  { niveau: 'A1', q: 'Choose the correct form: "She ___ coffee."',      options: ['like', 'likes', 'liking', 'liked'],                                            correct: 'likes' },
  { niveau: 'A2', q: 'Complete: "I have lived here ___ 2020."',         options: ['for', 'since', 'during', 'while'],                                             correct: 'since' },
  { niveau: 'A2', q: '"I went" is the past of which verb?',             options: ['to come', 'to go', 'to get', 'to give'],                                       correct: 'to go' },
  { niveau: 'B1', q: 'Which sentence is in the passive voice?',         options: ['She read the book.', 'The book was read by her.', 'She reads books.', 'She will read.'], correct: 'The book was read by her.' },
  { niveau: 'B1', q: 'Complete: "If I ___ you, I would study harder."', options: ['am', 'was', 'were', 'be'],                                                     correct: 'were' },
  { niveau: 'A1', q: '"How much does it cost?" - best reply?',          options: ['It costs 500 FCFA.', 'It cost 500 FCFA.', '500 FCFA cost it.', 'Costs 500 FCFA it.'], correct: 'It costs 500 FCFA.' },
  { niveau: 'A2', q: 'Choose the correct word: "There ___ a lot of students."', options: ['is', 'are', 'am', 'be'],                                               correct: 'are' },
  { niveau: 'B1', q: 'Which is correct?',                               options: ['I am agree', 'I agree', 'I am agreeing', 'I agreed to'],                       correct: 'I agree' },
  { niveau: 'A1', q: 'What does "beautiful" mean?',                     options: ['laid', 'petit', 'magnifique', 'rapide'],                                       correct: 'magnifique' },
];

/* ── Dictée éclair : écrire le mot anglais depuis son indice ─────────────────────────────── */
const DICTEE = [
  { mot: 'beautiful',  indice: 'adj. 🌸 - magnifique' },
  { mot: 'necessary',  indice: 'adj. ✅ - nécessaire' },
  { mot: 'Wednesday',  indice: '📅 - le milieu de la semaine' },
  { mot: 'February',   indice: "📅 - 2ème mois de l'année" },
  { mot: 'government', indice: '🏛️ - autorité qui dirige un pays' },
  { mot: 'knowledge',  indice: "🧠 - ce qu'on sait, le savoir" },
  { mot: 'language',   indice: "🗣️ - ce qu'on parle (ex: English)" },
  { mot: 'experience', indice: "💼 - ce qu'on a vécu ou appris" },
  { mot: 'different',  indice: '↔️ - pas pareil, distinct' },
  { mot: 'important',  indice: '⭐ - qui compte beaucoup' },
];

/* ── Traduction inverse : FR → EN ─────────────────────────────────────────────────────────── */
const TRADUCTION = [
  { fr: 'pomme',   mot: 'apple' },  { fr: 'chien',   mot: 'dog' },
  { fr: 'maison',  mot: 'house' },  { fr: 'voiture', mot: 'car' },
  { fr: 'livre',   mot: 'book' },   { fr: 'école',   mot: 'school' },
  { fr: 'ami',     mot: 'friend' }, { fr: 'travail', mot: 'work' },
  { fr: 'temps',   mot: 'time' },   { fr: 'famille', mot: 'family' },
];

/* ── Mots croisés : grille 5×5, deux mots horizontaux et deux verticaux qui se croisent ──── */
const MOTS_CROISES = {
  lignes: 5,
  colonnes: 5,
  /* Les cases réellement jouables, en clés `"ligne,colonne"` (0-indexées). Elles sont
     redondantes avec `mots[]` mais évitent à chaque client de les recalculer, et surtout
     d'arriver à un résultat légèrement différent sur les croisements. */
  cases: { '1,2': 'M', '2,1': 'C', '2,2': 'A', '2,3': 'T', '3,2': 'P', '3,3': 'E', '4,1': 'S', '4,2': 'U', '4,3': 'N' },
  mots: [
    { id: 'map', numero: 1, dir: 'v', ligne: 1, colonne: 2, longueur: 3, mot: 'MAP', indice: '🗺️ Aide à trouver son chemin' },
    { id: 'cat', numero: 2, dir: 'h', ligne: 2, colonne: 1, longueur: 3, mot: 'CAT', indice: "🐱 Un animal qui dit 'meow'" },
    { id: 'ten', numero: 3, dir: 'v', ligne: 2, colonne: 3, longueur: 3, mot: 'TEN', indice: '🔟 Le nombre après neuf' },
    { id: 'sun', numero: 4, dir: 'h', ligne: 4, colonne: 1, longueur: 3, mot: 'SUN', indice: '☀️ Brille pendant la journée' },
  ],
};

/* ── Mots cachés : cinq mots dans une grille 8×8, en ligne, en colonne ou en diagonale ───── */
const MOTS_CACHES_TAILLE = 8;
const MOTS_CACHES_POS = [
  { mot: 'CAT', ligne: 0, colonne: 0, dir: 'h' },
  { mot: 'DOG', ligne: 0, colonne: 4, dir: 'v' },
  { mot: 'SUN', ligne: 3, colonne: 1, dir: 'h' },
  { mot: 'RUN', ligne: 2, colonne: 6, dir: 'v' },
  { mot: 'BIG', ligne: 5, colonne: 0, dir: 'diag' },
];

/**
 * La grille est construite ICI, une fois, et servie telle quelle.
 *
 * Le remplissage est déterministe (`(r*7 + c*5) % 26`) et non aléatoire : c'est ce qui permet
 * de la calculer côté serveur sans qu'un apprenant qui recharge se retrouve devant une grille
 * différente en cours de partie. Elle est aussi la raison de la servir plutôt que de laisser
 * chaque client appliquer la formule — deux implémentations de la même formule, c'est une
 * occasion de dériver pour rien.
 */
function construireGrilleMotsCaches() {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const grille = Array.from({ length: MOTS_CACHES_TAILLE }, (_, r) =>
    Array.from({ length: MOTS_CACHES_TAILLE }, (_, c) => ALPHABET[(r * 7 + c * 5) % 26]));

  MOTS_CACHES_POS.forEach(({ mot, ligne, colonne, dir }) => {
    const [dr, dc] = dir === 'h' ? [0, 1] : dir === 'v' ? [1, 0] : [1, 1];
    mot.split('').forEach((lettre, i) => { grille[ligne + dr * i][colonne + dc * i] = lettre; });
  });
  return grille;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   LA FORME SERVIE, PAR TYPE DE JEU

   `nb` est le nombre de points marquables sur une partie — c'est le `score_max` que le client
   renverra. Il est dérivé de la banque, jamais recopié : la colonne `nb_questions` de la base
   est un libellé d'affichage, et le jour où les deux divergent c'est la banque qui a raison.

   Le sprint est le seul à n'avoir PAS de maximum (`nb: null`) : on compte les bonnes réponses
   données en 60 secondes, il n'y a pas de total à atteindre.
═══════════════════════════════════════════════════════════════════════════════════════════ */
const FORMES = {
  qcm:          () => ({ secondes_par_question: 15, questions: QCM,       nb: QCM.length }),
  association:  () => ({ paires: ASSOCIATION,                              nb: ASSOCIATION.length }),
  lacunes:      () => ({ questions: LACUNES,                               nb: LACUNES.length }),
  anagramme:    () => ({ questions: ANAGRAMME,                             nb: ANAGRAMME.length }),
  sprint:       () => ({ duree_secondes: 60, mots: SPRINT,                 nb: null }),
  vrai_faux:    () => ({ questions: VRAI_FAUX,                             nb: VRAI_FAUX.length }),
  reordre:      () => ({ questions: REORDRE,                               nb: REORDRE.length }),
  dialogue:     () => ({ scenes: DIALOGUE,                                 nb: DIALOGUE.length }),
  flashcards:   () => ({ cartes: FLASHCARDS,                               nb: FLASHCARDS.length }),
  conjugaison:  () => ({ questions: CONJUGAISON,                           nb: CONJUGAISON.length }),
  cecr:         () => ({ questions: CECR,                                  nb: CECR.length }),
  dictee:       () => ({ questions: DICTEE,                                nb: DICTEE.length }),
  traduction:   () => ({ questions: TRADUCTION,                            nb: TRADUCTION.length }),
  mots_croises: () => ({ ...MOTS_CROISES,                                  nb: MOTS_CROISES.mots.length }),
  mots_caches:  () => ({
    taille: MOTS_CACHES_TAILLE,
    mots: MOTS_CACHES_POS,
    grille: construireGrilleMotsCaches(),
    nb: MOTS_CACHES_POS.length,
  }),
};

/** Le contenu jouable d'un type, ou `null` si aucun moteur ne correspond. */
function contenuPourType(type) {
  const forme = FORMES[String(type || '').trim()];
  return forme ? forme() : null;
}

/** Les types pour lesquels une partie peut réellement être jouée. */
const TYPES_JOUABLES = Object.keys(FORMES);

/**
 * GARDE-FOU SUR LES ANAGRAMMES, exécutée au chargement du module.
 *
 * Une entrée dont le mélange ne contient pas exactement les lettres du mot rend la question
 * INFAISABLE : le joueur voit des tuiles qui ne peuvent pas former le mot attendu, épuise une
 * tentative et perd des points. C'était le cas de `FISH` avant ce fichier, sans que rien ne le
 * signale. Une erreur qui coûte une tentative à un apprenant mérite de casser au démarrage
 * plutôt que de passer en production.
 */
function verifierBanques() {
  const trie = (s) => String(s).toUpperCase().split('').sort().join('');
  const fautives = ANAGRAMME.filter(a => trie(a.mot) !== trie(a.melange));
  if (fautives.length) {
    throw new Error(
      `[minijeux] anagramme : mélange incohérent pour ${fautives.map(f => f.mot).join(', ')} `
      + '- le mélange doit contenir exactement les lettres du mot.');
  }
}
verifierBanques();

export { contenuPourType, TYPES_JOUABLES };
