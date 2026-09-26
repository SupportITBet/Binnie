import { useState } from 'react';
import { COULEURS } from '../../constants/couleurs';
import { useAuth } from '../../contexts/AuthContext';

// ── Styles tranches d'âge ─────────────────────────────────────────────────────
export const TRANCHES_STYLE = {
  'Enfants (6-12 ans)':     { bg:'#FEF3C7', txt:'#92400E', icone:'🧒' },
  'Adolescents (13-17 ans)':{ bg:'#EDE9FE', txt:'#5B21B6', icone:'🧑' },
  'Adultes / Entreprise':   { bg:'#DBEAFE', txt:'#1D4ED8', icone:'👔' },
  'Tous niveaux':           { bg:'#D1FAE5', txt:'#065F46', icone:'👥' },
};

// ── Données mock évaluations ──────────────────────────────────────────────────
export const CRITERES_EVAL = [
  { id:'ponctualite',          lib:'Ponctualité',                  desc:'Respect des horaires de début et fin de cours',           icone:'⏰' },
  { id:'qualite_cours',        lib:'Qualité du cours',             desc:'Structure, clarté, progression pédagogique',              icone:'📚' },
  { id:'relation_apprenants',  lib:'Relation apprenants',          desc:'Écoute, dynamisme, engagement et différenciation',        icone:'🤝' },
  { id:'supports',             lib:'Supports pédagogiques',        desc:'Utilisation et qualité des outils / supports utilisés',   icone:'🖥️' },
  { id:'resultats',            lib:'Résultats & progression',      desc:'Évolution observable des apprenants sur la période',      icone:'📈' },
];

function moyenneCriteres(criteres) {
  if (!criteres) return null;
  const vals = Object.values(criteres).filter(v => v > 0);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

export const MOCK_EVALUATIONS_PROFS = [
  { id:'ev-01', prof:'Marie Dupont',    role:'Titulaire',  date:'2026-05-28', type:'Éval. mensuelle',     seance:'Groupe Débutants A - TLG',         statut:'validee',  commentaire:'Excellente maîtrise de classe, interactions riches.',
    criteres:{ ponctualite:5, qualite_cours:5, relation_apprenants:4, supports:4, resultats:4 } },
  { id:'ev-02', prof:'Pierre Martin',   role:'Titulaire',  date:'2026-05-20', type:'Éval. mensuelle',     seance:'Groupe Intermédiaires B1 - TLG',   statut:'validee',  commentaire:'Bon rythme. Améliorer la gestion du temps oral.',
    criteres:{ ponctualite:4, qualite_cours:4, relation_apprenants:5, supports:4, resultats:4 } },
  { id:'ev-03', prof:'Marie Dupont',    role:'Titulaire',  date:'2026-04-30', type:'Éval. trimestrielle', seance:'Groupe Débutants A - TLG',         statut:'validee',  commentaire:'Progression constante des apprenants. Félicitations.',
    criteres:{ ponctualite:5, qualite_cours:5, relation_apprenants:5, supports:4, resultats:4 } },
  { id:'ev-04', prof:'Aurélie Bernard', role:'Titulaire',  date:'2026-05-25', type:'Éval. mensuelle',     seance:'Groupe Kids A1 - TLG',             statut:'validee',  commentaire:'Parfaite adaptation à la tranche 6-12 ans.',
    criteres:{ ponctualite:5, qualite_cours:5, relation_apprenants:5, supports:5, resultats:5 } },
  { id:'ev-05', prof:'Sophie Leclerc',  role:'Remplaçant', date:'2026-05-22', type:'Éval. remplacement',  seance:'Groupe Débutants A (remplacement)', statut:'validee',  commentaire:'Bonne prise en main du groupe malgré la nouveauté.',
    criteres:{ ponctualite:4, qualite_cours:4, relation_apprenants:4, supports:3, resultats:4 } },
  { id:'ev-06', prof:'Pierre Martin',   role:'Titulaire',  date:'2026-06-02', type:'Éval. mensuelle',     seance:'Groupe Intermédiaires B1 - TLG',   statut:'planifiee', commentaire:'', criteres:null },
  { id:'ev-07', prof:'Kwame Asare',     role:'Titulaire',  date:'2026-06-05', type:'Éval. mensuelle',     seance:'Groupe Avancés B2 - TLG',           statut:'planifiee', commentaire:'', criteres:null },
  { id:'ev-08', prof:'Dupont Marie',    role:'Titulaire',  date:'2026-05-28', type:'Éval. mensuelle',     seance:'Groupe Débutants A - TLG',         statut:'validee',  commentaire:'Excellente maîtrise de classe.',
    criteres:{ ponctualite:5, qualite_cours:5, relation_apprenants:4, supports:4, resultats:4 } },
  { id:'ev-09', prof:'Martin Pierre',   role:'Titulaire',  date:'2026-05-20', type:'Éval. mensuelle',     seance:'Groupe Intermédiaires B1 - TLG',   statut:'validee',  commentaire:'Bon rythme pédagogique.',
    criteres:{ ponctualite:4, qualite_cours:4, relation_apprenants:5, supports:4, resultats:4 } },
];

// ── Détails enrichis par ID (couvre teacher-xxx et ui-xxx) ────────────────────
const DETAIL_PROFS = {
  // ── Titulaires (MOCK_PROFESSEURS) ──
  'teacher-001': {
    telephone:'+225 07 11 22 33', nationalite:'Ivoirienne', adresse:'Cocody, Abidjan',
    bio:'Enseignante passionnée avec 5 ans d\'expérience. Spécialisée en méthodes communicatives, elle intervient auprès des enfants et adolescents TLG.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2020', valide:true },
      { nom:'TKT (Teaching Knowledge Test)', organisme:'Cambridge Assessment', annee:'2019', valide:true },
      { nom:'DELF B2', organisme:'CIEP', annee:'2018', valide:true },
    ],
    experiences:[
      { poste:'Professeure d\'anglais', etablissement:'Lycée International Abidjan', debut:'2021', fin:'2023', description:'Classes de 3e et Terminale, préparation au BAC International.' },
      { poste:'Tutrice en ligne', etablissement:'Preply (freelance)', debut:'2020', fin:'2021', description:'Cours particuliers en ligne, niveaux A1 à B2, tous âges.' },
    ],
    groupes:[
      { id:'g1', nom:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      niveau:'A1→A2', type:'Anglais Général', effectif:8,  jours:'Lun / Mer', horaire:'09h00–10h00', presence:87, client:'TLG PHARMA',  couleurClient:'#0891B2' },
      { id:'g2', nom:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', niveau:'A2→B1', type:'Anglais Général', effectif:10, jours:'Mar / Jeu', horaire:'14h00–15h30', presence:91, client:'TLG PHARMA',  couleurClient:'#0891B2' },
      { id:'g5', nom:'Enfants Débutants CI',  tranche:'Enfants (6-12 ans)',      niveau:'A1→A2', type:'Anglais Général', effectif:12, jours:'Mer / Ven', horaire:'09h00–10h00', presence:82, client:'ORANGE CI',    couleurClient:'#F97316' },
      { id:'g6', nom:'Adultes Interm. OCI',   tranche:'Adultes / Entreprise',    niveau:'B1→B2', type:'Business English', effectif:9, jours:'Lun / Jeu', horaire:'11h00–12h30', presence:78, client:'ORANGE CI',    couleurClient:'#F97316' },
    ],
    sessions:[
      { date:'2026-05-30', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:7,    type:'Cours',      statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-05-28', groupe:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:9,    type:'Cours',      statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-05-26', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:8,    type:'Évaluation', statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-05-24', groupe:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:10,   type:'Cours',      statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-05-22', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:7,    type:'Cours',      statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-05-20', groupe:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:8,    type:'Cours',      statut:'realisee',  client:'TLG PHARMA'  },
      { date:'2026-06-05', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:null, type:'Cours',      statut:'planifiee', client:'TLG PHARMA'  },
      { date:'2026-06-06', groupe:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:null, type:'Cours',      statut:'planifiee', client:'TLG PHARMA'  },
      { date:'2026-05-29', groupe:'Enfants Débutants CI',  tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:11,   type:'Cours',      statut:'realisee',  client:'ORANGE CI'   },
      { date:'2026-05-27', groupe:'Adultes Interm. OCI',   tranche:'Adultes / Entreprise',    duree:'1h30', participants:8,    type:'Cours',      statut:'realisee',  client:'ORANGE CI'   },
      { date:'2026-05-25', groupe:'Enfants Débutants CI',  tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:10,   type:'Évaluation', statut:'realisee',  client:'ORANGE CI'   },
      { date:'2026-05-23', groupe:'Adultes Interm. OCI',   tranche:'Adultes / Entreprise',    duree:'1h30', participants:9,    type:'Cours',      statut:'realisee',  client:'ORANGE CI'   },
      { date:'2026-06-04', groupe:'Enfants Débutants CI',  tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:null, type:'Cours',      statut:'planifiee', client:'ORANGE CI'   },
      { date:'2026-06-07', groupe:'Adultes Interm. OCI',   tranche:'Adultes / Entreprise',    duree:'1h30', participants:null, type:'Cours',      statut:'planifiee', client:'ORANGE CI'   },
    ],
    disponibilites:{
      lundi:   { actif:true,  debut:'08h00', fin:'12h00' },
      mardi:   { actif:true,  debut:'13h00', fin:'17h00' },
      mercredi:{ actif:false, debut:'',      fin:''      },
      jeudi:   { actif:true,  debut:'08h00', fin:'17h00' },
      vendredi:{ actif:true,  debut:'08h00', fin:'12h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'teacher-002': {
    telephone:'+225 05 44 55 66', nationalite:'Française', adresse:'Plateau, Abidjan',
    bio:'Professeur business English avec 6 ans d\'expérience corporate. Spécialiste des formations en entreprise pour cadres et dirigeants.',
    certifications:[
      { nom:'DELTA (Diploma in ELT)',          organisme:'Cambridge Assessment', annee:'2021', valide:true },
      { nom:'Business English Certificate (BEC Higher)', organisme:'Cambridge Assessment', annee:'2020', valide:true },
      { nom:'TOEIC 990/990',                   organisme:'ETS',                  annee:'2022', valide:true },
    ],
    experiences:[
      { poste:'Formateur Business English', etablissement:'Alliance Française Abidjan',  debut:'2023', fin:'2025', description:'Formation continue pour cadres d\'entreprises ivoiriennes et expatriés.' },
      { poste:'Responsable pédagogique',    etablissement:'Global English Center Paris', debut:'2020', fin:'2022', description:'Conception de programmes B2B, coordination de 8 formateurs.' },
    ],
    groupes:[
      { id:'g3', nom:'Adultes Business B1', tranche:'Adultes / Entreprise', niveau:'B1→C1', type:'Business English', effectif:10, jours:'Mar / Ven', horaire:'10h00–11h30', presence:79, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-05-29', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:8,    type:'Cours',      statut:'realisee'  },
      { date:'2026-05-27', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:9,    type:'Cours',      statut:'realisee'  },
      { date:'2026-05-23', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:7,    type:'Évaluation', statut:'realisee'  },
      { date:'2026-06-04', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:null, type:'Cours',      statut:'planifiee' },
    ],
    disponibilites:{
      lundi:   { actif:false, debut:'',      fin:''      },
      mardi:   { actif:true,  debut:'09h00', fin:'12h00' },
      mercredi:{ actif:true,  debut:'09h00', fin:'17h00' },
      jeudi:   { actif:false, debut:'',      fin:''      },
      vendredi:{ actif:true,  debut:'09h00', fin:'12h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:1,
  },
  'teacher-004': {
    telephone:'+225 01 77 88 99', nationalite:'Ivoirienne', adresse:'Yopougon, Abidjan',
    bio:'Spécialiste Young Learners. Méthodes ludiques, pédagogie active et storytelling pour enfants 6-12 ans. Certifiée YL par Cambridge.',
    certifications:[
      { nom:'CELTA',                            organisme:'Cambridge Assessment',  annee:'2019', valide:true },
      { nom:'Young Learners Certificate (YLE)', organisme:'Cambridge Assessment',  annee:'2020', valide:true },
      { nom:'Certificate in Primary English',   organisme:'Trinity College London',annee:'2021', valide:true },
      { nom:'Child Psychology for Educators',   organisme:'Coursera / Stanford',   annee:'2022', valide:true },
    ],
    experiences:[
      { poste:'Professeure Young Learners', etablissement:'BET E-Learning Abidjan',        debut:'2023', fin:null,   description:'Groupes d\'enfants 6-12 ans, 3 groupes TLG PHARMA.' },
      { poste:'Institutrice bilingue',      etablissement:'École Primaire Les Pinèdes',    debut:'2020', fin:'2023', description:'Classe bilingue français-anglais, 25 élèves CP-CE2.' },
    ],
    groupes:[
      { id:'g4', nom:'Kids Pré-débutants',  tranche:'Enfants (6-12 ans)', niveau:'Pré-A1→A1', type:'Young Learners', effectif:7, jours:'Lun / Mer', horaire:'08h30–09h30', presence:96, client:'TLG PHARMA' },
      { id:'g5', nom:'Kids Débutants A1',   tranche:'Enfants (6-12 ans)', niveau:'A1→A2',     type:'Young Learners', effectif:8, jours:'Mar / Jeu', horaire:'08h30–09h30', presence:94, client:'TLG PHARMA' },
      { id:'g6', nom:'Kids Intermédiaires', tranche:'Enfants (6-12 ans)', niveau:'A2→B1',     type:'Young Learners', effectif:6, jours:'Ven',       horaire:'15h00–16h00', presence:91, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-06-02', groupe:'Kids Débutants A1',   tranche:'Enfants (6-12 ans)', duree:'1h00', participants:8,    type:'Cours',      statut:'realisee'  },
      { date:'2026-06-01', groupe:'Kids Pré-débutants',  tranche:'Enfants (6-12 ans)', duree:'1h00', participants:7,    type:'Cours',      statut:'realisee'  },
      { date:'2026-05-30', groupe:'Kids Intermédiaires', tranche:'Enfants (6-12 ans)', duree:'1h00', participants:6,    type:'Cours',      statut:'realisee'  },
      { date:'2026-05-28', groupe:'Kids Débutants A1',   tranche:'Enfants (6-12 ans)', duree:'1h00', participants:7,    type:'Évaluation', statut:'realisee'  },
      { date:'2026-06-03', groupe:'Kids Débutants A1',   tranche:'Enfants (6-12 ans)', duree:'1h00', participants:null, type:'Cours',      statut:'planifiee' },
    ],
    disponibilites:{
      lundi:   { actif:true,  debut:'08h00', fin:'10h00' },
      mardi:   { actif:true,  debut:'08h00', fin:'10h00' },
      mercredi:{ actif:true,  debut:'08h00', fin:'10h00' },
      jeudi:   { actif:true,  debut:'08h00', fin:'10h00' },
      vendredi:{ actif:true,  debut:'14h00', fin:'17h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'teacher-005': {
    telephone:'+225 07 22 33 44', nationalite:'Ghanéenne', adresse:'Marcory, Abidjan',
    bio:'Expert IELTS & TOEFL, 8 ans d\'expérience. Actuellement en congé maladie.',
    certifications:[
      { nom:'IELTS Band 9.0',  organisme:'British Council / IDP', annee:'2018', valide:true },
      { nom:'TOEFL iBT 120/120', organisme:'ETS',                 annee:'2019', valide:true },
      { nom:'CELTA',           organisme:'Cambridge Assessment',  annee:'2017', valide:true },
    ],
    experiences:[
      { poste:'Préparateur IELTS / TOEFL', etablissement:'British Council Accra', debut:'2018', fin:'2024', description:'Préparation intensive, taux de réussite 92%.' },
      { poste:'Professeur d\'anglais',     etablissement:'University of Ghana',   debut:'2015', fin:'2018', description:'Cours d\'anglais académique, niveaux B2-C2.' },
    ],
    groupes:[], sessions:[],
    disponibilites:{ lundi:{actif:false,debut:'',fin:''}, mardi:{actif:false,debut:'',fin:''}, mercredi:{actif:false,debut:'',fin:''}, jeudi:{actif:false,debut:'',fin:''}, vendredi:{actif:false,debut:'',fin:''}, samedi:{actif:false,debut:'',fin:''} },
    absences_mois:4,
  },
  'teacher-003': {
    telephone:'+225 05 99 00 11', nationalite:'Française', adresse:'Cocody, Abidjan',
    bio:'Professeure remplaçante polyvalente, disponible sur courte durée. Multi-tranches d\'âge.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2022', valide:true },
      { nom:'DALF C1', organisme:'CIEP',               annee:'2021', valide:true },
    ],
    experiences:[
      { poste:'Professeure remplaçante', etablissement:'BET E-Learning',          debut:'2025', fin:null,   description:'Remplacement sur différents groupes selon disponibilité.' },
      { poste:'Assistante de langue',    etablissement:'Collège Jean Moulin, Lyon',debut:'2022', fin:'2024', description:'Collège et lycée, toutes classes.' },
    ],
    groupes:[
      { id:'g1', nom:'Débutants A - TLG (rempl.)', tranche:'Enfants (6-12 ans)', niveau:'A1→A2', type:'Anglais Général', effectif:8, jours:'Lun', horaire:'09h00–10h00', presence:85, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-05-22', groupe:'Débutants A - TLG', tranche:'Enfants (6-12 ans)', duree:'1h00', participants:7, type:'Cours', statut:'realisee' },
      { date:'2026-05-20', groupe:'Débutants A - TLG', tranche:'Enfants (6-12 ans)', duree:'1h00', participants:8, type:'Cours', statut:'realisee' },
    ],
    disponibilites:{
      lundi:   { actif:true,  debut:'08h00', fin:'12h00' },
      mardi:   { actif:false, debut:'',      fin:''      },
      mercredi:{ actif:true,  debut:'08h00', fin:'17h00' },
      jeudi:   { actif:false, debut:'',      fin:''      },
      vendredi:{ actif:true,  debut:'08h00', fin:'12h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'teacher-006': {
    telephone:'+225 07 55 66 77', nationalite:'Ivoirienne', adresse:'Abobo, Abidjan',
    bio:'Nouveau membre de l\'équipe. Spécialiste Business English en cours d\'intégration pédagogique.',
    certifications:[{ nom:'CELTA', organisme:'Cambridge Assessment', annee:'2025', valide:true }],
    experiences:[
      { poste:'Chargé de cours anglais', etablissement:'ISTC Abidjan', debut:'2024', fin:'2025', description:'Anglais professionnel pour étudiants en commerce international.' },
    ],
    groupes:[], sessions:[],
    disponibilites:{
      lundi:   { actif:true,  debut:'09h00', fin:'17h00' },
      mardi:   { actif:true,  debut:'09h00', fin:'17h00' },
      mercredi:{ actif:false, debut:'',      fin:''      },
      jeudi:   { actif:true,  debut:'09h00', fin:'17h00' },
      vendredi:{ actif:false, debut:'',      fin:''      },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },

  // ── Profs issus du UsersContext (GestionProfesseurs) ──────────────────────
  'ui-019': {
    telephone:'+225 07 11 22 33', nationalite:'Ivoirienne', adresse:'Cocody, Abidjan',
    bio:'Professeure titulaire spécialisée dans les groupes enfants et adolescents TLG. Méthodes communicatives et participatives.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2020', valide:true },
      { nom:'TKT (Teaching Knowledge Test)', organisme:'Cambridge Assessment', annee:'2019', valide:true },
    ],
    experiences:[
      { poste:'Professeure titulaire BET', etablissement:'BET E-Learning', debut:'2025', fin:null, description:'Groupes enfants et adolescents TLG PHARMA, 2 groupes actifs.' },
      { poste:'Professeure d\'anglais',    etablissement:'Lycée International Abidjan', debut:'2021', fin:'2024', description:'Classes de lycée, préparation examens.' },
    ],
    groupes:[
      { id:'g1', nom:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      niveau:'A1→A2', type:'Anglais Général', effectif:8,  jours:'Lun / Mer', horaire:'09h00–10h00', presence:87, client:'TLG PHARMA' },
      { id:'g2', nom:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', niveau:'A2→B1', type:'Anglais Général', effectif:10, jours:'Mar / Jeu', horaire:'14h00–15h30', presence:91, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-05-30', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:7,    type:'Cours', statut:'realisee'  },
      { date:'2026-05-28', groupe:'Adolescents Interm. B', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:9,    type:'Cours', statut:'realisee'  },
      { date:'2026-06-05', groupe:'Enfants Débutants A',   tranche:'Enfants (6-12 ans)',      duree:'1h00', participants:null, type:'Cours', statut:'planifiee' },
    ],
    disponibilites:{
      lundi:   { actif:true,  debut:'08h00', fin:'12h00' },
      mardi:   { actif:true,  debut:'13h00', fin:'17h00' },
      mercredi:{ actif:false, debut:'',      fin:''      },
      jeudi:   { actif:true,  debut:'08h00', fin:'17h00' },
      vendredi:{ actif:true,  debut:'08h00', fin:'12h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'ui-020': {
    telephone:'+225 05 44 55 66', nationalite:'Française', adresse:'Plateau, Abidjan',
    bio:'Professeur titulaire spécialisé en Business English. Intervient auprès des groupes adultes entreprises TLG.',
    certifications:[
      { nom:'DELTA (Diploma in ELT)', organisme:'Cambridge Assessment', annee:'2021', valide:true },
      { nom:'TOEIC 990/990',          organisme:'ETS',                  annee:'2022', valide:true },
    ],
    experiences:[
      { poste:'Professeur titulaire BET',   etablissement:'BET E-Learning', debut:'2025', fin:null,   description:'Groupes adultes entreprises, Business English B1→C1.' },
      { poste:'Formateur Business English', etablissement:'Alliance Française', debut:'2023', fin:'2025', description:'Formation cadres et dirigeants.' },
    ],
    groupes:[
      { id:'g3', nom:'Adultes Business B1', tranche:'Adultes / Entreprise', niveau:'B1→C1', type:'Business English', effectif:10, jours:'Mar / Ven', horaire:'10h00–11h30', presence:79, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-05-29', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:8,    type:'Cours', statut:'realisee'  },
      { date:'2026-06-04', groupe:'Adultes Business B1', tranche:'Adultes / Entreprise', duree:'1h30', participants:null, type:'Cours', statut:'planifiee' },
    ],
    disponibilites:{
      lundi:   { actif:false, debut:'',      fin:''      },
      mardi:   { actif:true,  debut:'09h00', fin:'12h00' },
      mercredi:{ actif:true,  debut:'09h00', fin:'17h00' },
      jeudi:   { actif:false, debut:'',      fin:''      },
      vendredi:{ actif:true,  debut:'09h00', fin:'12h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:1,
  },
  'ui-021': {
    telephone:'+225 01 88 99 00', nationalite:'Française', adresse:'Cocody, Abidjan',
    bio:'Professeure titulaire spécialisée en Business English et communication professionnelle. 4 ans d\'expérience en entreprise.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2021', valide:true },
      { nom:'Business English Certificate',organisme:'Cambridge Assessment', annee:'2022', valide:true },
    ],
    experiences:[
      { poste:'Professeure titulaire BET', etablissement:'BET E-Learning', debut:'2025', fin:null, description:'Groupes adultes et adolescents, spécialité communication professionnelle.' },
      { poste:'Formatrice en langues',     etablissement:'CFAO Academy Abidjan', debut:'2022', fin:'2024', description:'Anglais professionnel pour équipes commerciales.' },
    ],
    groupes:[
      { id:'g7', nom:'Ados Business Prep', tranche:'Adolescents (13-17 ans)', niveau:'B1→B2', type:'Business English', effectif:9, jours:'Lun / Mer', horaire:'16h00–17h30', presence:88, client:'TLG PHARMA' },
    ],
    sessions:[
      { date:'2026-05-31', groupe:'Ados Business Prep', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:8, type:'Cours', statut:'realisee' },
      { date:'2026-06-02', groupe:'Ados Business Prep', tranche:'Adolescents (13-17 ans)', duree:'1h30', participants:null, type:'Cours', statut:'planifiee' },
    ],
    disponibilites:{
      lundi:   { actif:true,  debut:'15h00', fin:'18h00' },
      mardi:   { actif:false, debut:'',      fin:''      },
      mercredi:{ actif:true,  debut:'15h00', fin:'18h00' },
      jeudi:   { actif:true,  debut:'09h00', fin:'12h00' },
      vendredi:{ actif:false, debut:'',      fin:''      },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'ui-022': {
    telephone:'+225 07 33 44 55', nationalite:'Ivoirien', adresse:'Adjamé, Abidjan',
    bio:'Professeur remplaçant disponible sur appel. Polyvalent tous niveaux, réactif pour les remplacements de courte durée.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2023', valide:true },
    ],
    experiences:[
      { poste:'Professeur remplaçant BET', etablissement:'BET E-Learning', debut:'2025', fin:null, description:'Remplacements ponctuels, tous groupes.' },
      { poste:'Moniteur d\'anglais',       etablissement:'Centre Culturel Français', debut:'2023', fin:'2024', description:'Ateliers de conversation, adultes.' },
    ],
    groupes:[], sessions:[],
    disponibilites:{
      lundi:   { actif:true,  debut:'08h00', fin:'18h00' },
      mardi:   { actif:true,  debut:'08h00', fin:'18h00' },
      mercredi:{ actif:true,  debut:'08h00', fin:'18h00' },
      jeudi:   { actif:true,  debut:'08h00', fin:'18h00' },
      vendredi:{ actif:true,  debut:'08h00', fin:'18h00' },
      samedi:  { actif:false, debut:'',      fin:''      },
    },
    absences_mois:0,
  },
  'ui-023': {
    telephone:'+225 05 66 77 88', nationalite:'Française', adresse:'Marcory, Abidjan',
    bio:'Professeure remplaçante disponible les week-ends. Expérience enfants et adultes.',
    certifications:[
      { nom:'CELTA', organisme:'Cambridge Assessment', annee:'2022', valide:true },
    ],
    experiences:[
      { poste:'Professeure remplaçante BET', etablissement:'BET E-Learning', debut:'2025', fin:null, description:'Remplacements week-end.' },
    ],
    groupes:[], sessions:[],
    disponibilites:{
      lundi:   { actif:false, debut:'',      fin:''      },
      mardi:   { actif:false, debut:'',      fin:''      },
      mercredi:{ actif:false, debut:'',      fin:''      },
      jeudi:   { actif:false, debut:'',      fin:''      },
      vendredi:{ actif:false, debut:'',      fin:''      },
      samedi:  { actif:true,  debut:'08h00', fin:'17h00' },
    },
    absences_mois:0,
  },
};

// ── Contrats par ID ───────────────────────────────────────────────────────────
const CONTRATS_DETAIL = {
  'teacher-001': { type:'CDI',     debut:'2024-01-15', fin:null,         salaire:450000, statut:'actif',          conge:false, nb_sessions_total:147, nb_sessions_mois:12 },
  'teacher-002': { type:'CDD',     debut:'2025-06-01', fin:'2026-06-01', salaire:380000, statut:'expire_bientot', conge:false, nb_sessions_total:58,  nb_sessions_mois:6  },
  'teacher-004': { type:'CDI',     debut:'2023-09-01', fin:null,         salaire:480000, statut:'actif',          conge:false, nb_sessions_total:210, nb_sessions_mois:15 },
  'teacher-005': { type:'CDI',     debut:'2024-03-01', fin:null,         salaire:400000, statut:'actif',          conge:true,  nb_sessions_total:42,  nb_sessions_mois:0  },
  'teacher-003': { type:'Vacation',debut:'2025-09-01', fin:'2026-08-01', salaire:120000, statut:'actif',          conge:false, nb_sessions_total:22,  nb_sessions_mois:4  },
  'teacher-006': { type:'Vacation',debut:'2026-02-01', fin:'2026-08-01', salaire:100000, statut:'actif',          conge:false, nb_sessions_total:0,   nb_sessions_mois:0  },
  // Users context
  'ui-019': { type:'CDI',     debut:'2025-01-12', fin:null,         salaire:450000, statut:'actif',          conge:false, nb_sessions_total:120, nb_sessions_mois:12 },
  'ui-020': { type:'CDI',     debut:'2025-02-01', fin:null,         salaire:380000, statut:'actif',          conge:false, nb_sessions_total:90,  nb_sessions_mois:6  },
  'ui-021': { type:'CDI',     debut:'2025-03-10', fin:null,         salaire:360000, statut:'actif',          conge:false, nb_sessions_total:75,  nb_sessions_mois:8  },
  'ui-022': { type:'Vacation',debut:'2025-05-15', fin:'2026-05-15', salaire:120000, statut:'actif',          conge:false, nb_sessions_total:15,  nb_sessions_mois:0  },
  'ui-023': { type:'Vacation',debut:'2025-06-20', fin:'2026-06-20', salaire:100000, statut:'actif',          conge:false, nb_sessions_total:5,   nb_sessions_mois:0  },
};

// ── Permissions par rôle ─────────────────────────────────────────────────────
// superviseur : peut écrire sur evals, statut, dispos
// admin (manager/rh/…) : peut écrire sur infos, contrat, groupes, certifs, exp
const DROITS = {
  admin_manager:       { ecriture: ['infos','contrat','groupes','certifs','exp'] },
  admin_rh_paie:       { ecriture: ['infos','contrat','certifs','exp'] },
  admin_superviseur:   { ecriture: ['evals','statut','dispos','contrat'] },
  admin_placement:     { ecriture: [] },
  admin_onboarding:    { ecriture: ['groupes'] },
  admin_elearning:     { ecriture: [] },
  admin_customer_care: { ecriture: [] },
  admin_pa_advisor:    { ecriture: ['evals'] },
  admin_comptable:     { ecriture: [] },
};

function BadgeLecture() {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:'#F1F5F9', border:'1px solid #E2E8F0', fontSize:11, fontWeight:600, color:'#64748B' }}>
      👁 Vue lecture seule
    </span>
  );
}

// ── Composant modal ───────────────────────────────────────────────────────────
export default function ModalProfSuivi({ prof, onFermer }) {
  const { profile }  = useAuth();
  const roleViewer   = profile?.role || 'admin_manager';
  const tabsEcriture = DROITS[roleViewer]?.ecriture || [];
  const peutEcrire   = (tabId) => tabsEcriture.includes(tabId);

  const [tab,       setTab]       = useState('infos');
  const [evalLocal, setEvalLocal] = useState(MOCK_EVALUATIONS_PROFS);
  const CRITERES_VIDES = Object.fromEntries(CRITERES_EVAL.map(c => [c.id, 0]));
  const [formEval,       setFormEval]       = useState({ seance:'', commentaire:'', criteres:{ ...CRITERES_VIDES } });
  const [modalEvalOuvert, setModalEvalOuvert] = useState(false);
  const [dispoLocal,setDispoLocal]= useState(null);
  const [jourEdite, setJourEdite] = useState(null); // jour en cours d'édition
  const [formDispo, setFormDispo] = useState({ debut:'08h00', fin:'17h00' });
  const [absences,       setAbsences]       = useState(null);
  const [filtreEvalPeriode, setFiltreEvalPeriode] = useState('toutes');
  const [filtreEvalType,    setFiltreEvalType]    = useState('tous');
  // ── Pagination sessions par entreprise ──
  const [pagesSessions, setPagesSessions] = useState({});
  const PAR_PAGE_SESSIONS = 4;
  // ── Accordéon groupes par entreprise ──
  const [groupesDeplis, setGroupesDeplis] = useState({});
  // ── Accordéon évaluations par mois ──
  const [evalsDeplis,  setEvalsDeplis]  = useState({});
  // ── Détail évaluation sélectionnée ──
  const [evalDetail,   setEvalDetail]   = useState(null);
  // ── Changement de contrat ──
  const [typeContratLocal,  setTypeContratLocal]  = useState(null); // null = pas en édition
  const [contratConfirm,    setContratConfirm]    = useState(false);
  const [typeContratChoisi, setTypeContratChoisi] = useState('');

  const detail  = DETAIL_PROFS[prof.id]   || {};

  // ── États locaux onglet Informations ──
  const [modeEditInfos, setModeEditInfos] = useState(false);
  const [formInfos, setFormInfos] = useState({
    telephone:  detail.telephone  || '',
    nationalite:detail.nationalite|| '',
    adresse:    detail.adresse    || '',
    specialite: prof.specialite   || '',
    niveaux:    prof.niveaux      || '',
    bio:        detail.bio        || '',
  });
  const [infosSaved, setInfosSaved] = useState({ ...formInfos });
  const [cvLocal, setCvLocal] = useState(prof.cv || null);

  function handleCV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLocal({ nom: file.name, taille: file.size, type: file.type, url: URL.createObjectURL(file) });
  }

  function sauvegarderInfos() {
    setInfosSaved({ ...formInfos });
    setModeEditInfos(false);
  }
  function annulerEditInfos() {
    setFormInfos({ ...infosSaved });
    setModeEditInfos(false);
  }

  // ── États locaux certifications & expériences (modifiables) ──
  const [certifs,    setCertifs]    = useState(() => (DETAIL_PROFS[prof.id]?.certifications || []));
  const [exps,       setExps]       = useState(() => (DETAIL_PROFS[prof.id]?.experiences   || []));
  const [formCertif, setFormCertif] = useState(null); // null=fermé | { _idx, nom, organisme, annee, valide }
  const [formExp,    setFormExp]    = useState(null);  // null=fermé | { _idx, poste, etablissement, debut, fin, description }

  const CERTIF_VIDE = { _idx:-1, nom:'', organisme:'', annee: new Date().getFullYear().toString(), valide:true };
  const EXP_VIDE    = { _idx:-1, poste:'', etablissement:'', debut: new Date().getFullYear().toString(), fin:'', description:'' };

  function sauvegarderCertif(f) {
    if (!f.nom.trim() || !f.organisme.trim()) return;
    if (f._idx === -1) {
      setCertifs(prev => [...prev, { nom:f.nom, organisme:f.organisme, annee:f.annee, valide:f.valide }]);
    } else {
      setCertifs(prev => prev.map((c, i) => i === f._idx ? { nom:f.nom, organisme:f.organisme, annee:f.annee, valide:f.valide } : c));
    }
    setFormCertif(null);
  }

  function supprimerCertif(idx) {
    setCertifs(prev => prev.filter((_, i) => i !== idx));
  }

  function sauvegarderExp(f) {
    if (!f.poste.trim() || !f.etablissement.trim()) return;
    const entry = { poste:f.poste, etablissement:f.etablissement, debut:f.debut, fin:f.fin||null, description:f.description };
    if (f._idx === -1) {
      setExps(prev => [...prev, entry]);
    } else {
      setExps(prev => prev.map((e, i) => i === f._idx ? entry : e));
    }
    setFormExp(null);
  }

  function supprimerExp(idx) {
    setExps(prev => prev.filter((_, i) => i !== idx));
  }
  const contrat = CONTRATS_DETAIL[prof.id] || {};
  const evalsProf = evalLocal.filter(
    e => e.prof === `${prof.prenom} ${prof.nom}` || e.prof === `${prof.nom} ${prof.prenom}`
  );
  const dispos = dispoLocal ?? detail.disponibilites ?? {};
  const nbAbsences = absences ?? detail.absences_mois ?? 0;

  const estRempl = prof.role === 'professeur_remplacant';
  const couleur  = estRempl ? '#7C3AED' : COULEURS.cyan;

  const TABS = [
    { id:'infos',    lib:'Informations',  icone:'👤' },
    { id:'evals',    lib:'Évaluations',   icone:'⭐', badge:(evalsProf).length },
    { id:'contrat',  lib:'Contrat',       icone:'📝' },
    { id:'groupes',  lib:'Groupes',       icone:'🏫', badge:(detail.groupes||[]).length },
    { id:'sessions', lib:'Sessions',      icone:'🎥', badge:(detail.sessions||[]).length },
    { id:'certifs',  lib:'Certifications',icone:'🎓', badge: certifs.length },
    { id:'exp',      lib:'Expériences',   icone:'💼', badge: exps.length    },
    { id:'dispos',   lib:'Disponibilités',icone:'📅' },
    { id:'statut',   lib:'Statut',        icone:'📊' },
  ];

  const JOURS       = ['lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const JOURS_COURT = { lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam' };
  const initiales   = `${prof.prenom?.[0]||''}${prof.nom?.[0]||''}`.toUpperCase();

  // Champs normalisés avec valeurs par défaut
  const specialite    = prof.specialite    || prof.specialites?.[0] || (prof.description?.split('·')[1]?.trim()) || '-';
  const niveaux       = prof.niveaux       || prof.niveaux_enseignes?.join('→') || 'A1 → B2';
  const typeContrat   = typeContratLocal ?? prof.contrat ?? contrat.type ?? 'Freelance';
  const dateDebut     = prof.debut         || prof.date_debut_poste || prof.date_creation || '-';
  const sessionsMois  = prof.sessions_mois ?? 0;
  const evaluationMoy = prof.evaluation    ?? null;
  const nbGroupes     = prof.nb_groupes    ?? (detail.groupes||[]).length;

  function ajouterEval() {
    const noteMoy = moyenneCriteres(formEval.criteres);
    if (!formEval.seance || !noteMoy) return;
    const now = new Date();
    // Calcul numéro de semaine ISO
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    const nouvelleEval = {
      id: `ev-${Date.now()}`,
      prof: `${prof.prenom} ${prof.nom}`,
      role: estRempl ? 'Remplaçant' : 'Titulaire',
      date: now.toISOString().split('T')[0],
      semaine: `S${weekNum}`,
      type: 'Éval. hebdomadaire',
      seance: formEval.seance,
      statut: 'validee',
      commentaire: formEval.commentaire,
      criteres: { ...formEval.criteres },
    };
    setEvalLocal(prev => [nouvelleEval, ...prev]);
    setFormEval({ seance:'', commentaire:'', criteres:{ ...CRITERES_VIDES } });
    setModalEvalOuvert(false);
  }

  // Normalise l'ancien format { actif, debut, fin } et le nouveau { actif, creneaux:[] }
  function getCreneaux(d) {
    if (!d) return [];
    if (Array.isArray(d.creneaux)) return d.creneaux;
    if (d.actif && d.debut && d.fin) return [{ debut:d.debut, fin:d.fin }];
    return [];
  }

  function baseDispos() {
    return dispoLocal ?? detail.disponibilites ?? {};
  }

  function ouvrirFormDispo(jour) {
    setFormDispo({ debut:'08h00', fin:'17h00' });
    setJourEdite(jour);
  }

  function ajouterCreneau() {
    if (!jourEdite || !formDispo.debut || !formDispo.fin || formDispo.fin <= formDispo.debut) return;
    setDispoLocal(prev => {
      const base = prev ?? detail.disponibilites ?? {};
      const existants = getCreneaux(base[jourEdite]);
      // Éviter le doublon
      const dejaPris = existants.some(c => c.debut === formDispo.debut && c.fin === formDispo.fin);
      if (dejaPris) return base;
      const nouvellesDonnees = [...existants, { debut:formDispo.debut, fin:formDispo.fin }]
        .sort((a,b) => a.debut.localeCompare(b.debut));
      return { ...base, [jourEdite]: { actif:true, creneaux: nouvellesDonnees } };
    });
    setFormDispo({ debut:'08h00', fin:'17h00' });
  }

  function supprimerCreneau(jour, index) {
    setDispoLocal(prev => {
      const base = prev ?? detail.disponibilites ?? {};
      const creneaux = getCreneaux(base[jour]).filter((_, i) => i !== index);
      return { ...base, [jour]: { actif: creneaux.length > 0, creneaux } };
    });
  }

  function retirerJour(jour) {
    setDispoLocal(prev => {
      const base = prev ?? detail.disponibilites ?? {};
      return { ...base, [jour]: { actif:false, creneaux:[] } };
    });
    if (jourEdite === jour) setJourEdite(null);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200, backdropFilter:'blur(3px)' }}>
      <div style={{ background:COULEURS.gris50, borderRadius:20, width:'90vw', maxWidth:'90vw', height:'90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden' }}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(135deg, ${couleur}CC, ${couleur})`, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'2.5px solid rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', flexShrink:0 }}>
                {initiales}
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{prof.prenom} {prof.nom}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
                  {estRempl ? '🔄 Professeur Remplaçant' : '🎓 Professeur Titulaire'} · {specialite}
                </div>
                <span style={{ display:'inline-block', marginTop:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, background: prof.est_actif ? '#D1FAE5' : '#FEE2E2', color: prof.est_actif ? '#065F46' : '#991B1B' }}>
                  {prof.est_actif ? '● Actif' : '● Inactif'}
                </span>
              </div>
            </div>
            <button onClick={onFermer} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:34, height:34, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { l:'Groupes',     v: nbGroupes                              },
              { l:'Sessions/mois', v: sessionsMois                         },
              { l:'Éval. moy.',  v: evaluationMoy ? `${evaluationMoy}/5` : '-' },
              { l:'Contrat',     v: typeContrat                            },
            ].map((s, i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{s.v}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Corps : sidebar onglets gauche + contenu droite ── */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* ── Sidebar onglets (gauche) ── */}
          <div style={{ width:195, flexShrink:0, background:COULEURS.blanc, borderRight:`1px solid ${COULEURS.gris200}`, display:'flex', flexDirection:'column', overflowY:'auto', padding:'10px 8px' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display:'flex', alignItems:'center', gap:9, padding:'10px 12px', border:'none', borderRadius:10,
                  background: tab===t.id ? couleur+'15' : 'transparent',
                  color: tab===t.id ? couleur : COULEURS.gris600,
                  fontWeight: tab===t.id ? 700 : 500, fontSize:13,
                  cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif',
                  textAlign:'left', width:'100%', marginBottom:2,
                  borderLeft: tab===t.id ? `3px solid ${couleur}` : '3px solid transparent',
                  transition:'all 0.15s',
                }}
              >
                <span style={{ fontSize:16, flexShrink:0 }}>{t.icone}</span>
                <span style={{ flex:1 }}>{t.lib}</span>
                {t.badge != null && t.badge > 0 && (
                  <span style={{ background: tab===t.id ? couleur : COULEURS.gris200, color: tab===t.id ? '#fff' : COULEURS.gris600, borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700, flexShrink:0 }}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Contenu scrollable (droite) ── */}
          <div style={{ flex:1, overflowY:'auto', padding:24 }}>

          {tab === 'infos' && (() => {
            const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${couleur}40`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
            const lbl = { fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:5 };

            return (
              <>
                {/* En-tête */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>👤 Profil du professeur</span>
                  {!modeEditInfos ? (
                    <button onClick={() => setModeEditInfos(true)}
                      style={{ padding:'6px 16px', borderRadius:8, border:`1.5px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                      ✏️ Modifier
                    </button>
                  ) : (
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={sauvegarderInfos}
                        style={{ padding:'6px 16px', borderRadius:8, border:'none', background:COULEURS.succes, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        ✓ Enregistrer
                      </button>
                      <button onClick={annulerEditInfos}
                        style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Annuler
                      </button>
                    </div>
                  )}
                </div>

                {/* Champs système - toujours en lecture seule */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  {[
                    ['Email', prof.email, COULEURS.cyan, true],
                    ['En poste depuis', dateDebut, null, true],
                  ].map(([l, v, c, locked]) => (
                    <div key={l} style={{ background: locked ? COULEURS.gris50 : COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em' }}>{l}</span>
                        {locked && <span style={{ fontSize:9, color:COULEURS.gris400, background:COULEURS.gris100, padding:'1px 6px', borderRadius:6, fontWeight:600 }}>🔒 Fixe</span>}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color: c || COULEURS.navy }}>{v || '-'}</div>
                    </div>
                  ))}
                </div>

                {/* Champs modifiables */}
                {(() => {
                  const NIVEAUX_CECR_SEL = ['A1','A2','B1','B2','C1','C2'];
                  const selSty = { ...inp, padding:'8px 10px' };
                  const NIV_C_SEL = { A1:'#94A3B8', A2:'#60A5FA', B1:'#34D399', B2:'#818CF8', C1:'#F59E0B', C2:'#F97316' };
                  const [nMin, nMax] = (formInfos.niveaux || 'A1 → B2').split(' → ');
                  const setNiveaux = (min, max) => setFormInfos(f => ({...f, niveaux:`${min} → ${max}`}));

                  const SPECIALITES_SEL = ['General English','Business English','Exam Preparation','Young Learners','Academic English','Conversation','Pronunciation','Grammar'];

                  return (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {[
                        ['Téléphone',   'telephone',  'text', '+225 07 XX XX XX'],
                        ['Nationalité', 'nationalite','text', 'ex : Ivoirienne'  ],
                        ['Adresse',     'adresse',    'text', 'ex : Cocody, Abidjan'],
                      ].map(([l, key, type, ph]) => (
                        <div key={key} style={{ background: modeEditInfos ? `${couleur}05` : COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${modeEditInfos ? couleur+'30' : COULEURS.gris200}`, transition:'all 0.15s' }}>
                          <label style={{ ...lbl, color: modeEditInfos ? couleur : COULEURS.gris400 }}>{l}</label>
                          {modeEditInfos ? (
                            <input type={type} value={formInfos[key]} placeholder={ph}
                              onChange={e => setFormInfos(f => ({...f, [key]:e.target.value}))}
                              style={inp} />
                          ) : (
                            <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{infosSaved[key] || '-'}</div>
                          )}
                        </div>
                      ))}

                      {/* Spécialité - select */}
                      <div style={{ background: modeEditInfos ? `${couleur}05` : COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${modeEditInfos ? couleur+'30' : COULEURS.gris200}`, transition:'all 0.15s' }}>
                        <label style={{ ...lbl, color: modeEditInfos ? couleur : COULEURS.gris400 }}>Spécialité</label>
                        {modeEditInfos ? (
                          <select value={formInfos.specialite} onChange={e => setFormInfos(f => ({...f, specialite:e.target.value}))}
                            style={{ ...inp, padding:'8px 10px' }}>
                            <option value="">- Choisir -</option>
                            {SPECIALITES_SEL.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{infosSaved.specialite || '-'}</div>
                        )}
                      </div>

                      {/* Niveaux enseignés - double select */}
                      <div style={{ background: modeEditInfos ? `${couleur}05` : COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${modeEditInfos ? couleur+'30' : COULEURS.gris200}`, transition:'all 0.15s' }}>
                        <label style={{ ...lbl, color: modeEditInfos ? couleur : COULEURS.gris400 }}>Niveaux enseignés</label>
                        {modeEditInfos ? (
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <select value={nMin} onChange={e => setNiveaux(e.target.value, nMax)}
                              style={{ ...selSty, flex:1 }}>
                              {NIVEAUX_CECR_SEL.map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            <span style={{ fontWeight:800, color:couleur, fontSize:16 }}>→</span>
                            <select value={nMax} onChange={e => setNiveaux(nMin, e.target.value)}
                              style={{ ...selSty, flex:1 }}>
                              {NIVEAUX_CECR_SEL.map(n => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                            {(infosSaved.niveaux || '-').split(' → ').map((n, i, arr) => (
                              <span key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ background:(NIV_C_SEL[n]||COULEURS.gris400)+'20', color:NIV_C_SEL[n]||COULEURS.gris400, padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:800 }}>{n}</span>
                                {i < arr.length - 1 && <span style={{ fontWeight:800, color:couleur }}>→</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Biographie - pleine largeur */}
                <div style={{ background: modeEditInfos ? `${couleur}05` : COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${modeEditInfos ? couleur+'30' : COULEURS.gris200}`, marginTop:12, transition:'all 0.15s' }}>
                  <label style={{ ...lbl, color: modeEditInfos ? couleur : COULEURS.gris400 }}>Biographie</label>
                  {modeEditInfos ? (
                    <textarea value={formInfos.bio} rows={4}
                      placeholder="Décrivez le parcours, la pédagogie et les points forts du professeur…"
                      onChange={e => setFormInfos(f => ({...f, bio:e.target.value}))}
                      style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
                  ) : (
                    <div style={{ fontSize:13, color:COULEURS.gris600, lineHeight:1.7 }}>{infosSaved.bio || '-'}</div>
                  )}
                </div>

                {/* CV - pleine largeur */}
                <input id="input-cv-modal-prof" type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }} onChange={handleCV} />
                <div style={{ marginTop:12, background: COULEURS.blanc, borderRadius:10, border:`1.5px dashed ${cvLocal ? couleur : COULEURS.gris200}`, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, transition:'border-color 0.15s' }}>
                  <div style={{ fontSize:28, flexShrink:0 }}>📄</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Curriculum Vitae</div>
                    {cvLocal ? (
                      <>
                        <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{cvLocal.nom}</div>
                        <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:1 }}>{(cvLocal.taille / 1024).toFixed(0)} Ko</div>
                      </>
                    ) : (
                      <div style={{ fontSize:13, color:COULEURS.gris400 }}>Aucun CV importé - PDF, DOC ou DOCX · Max 5 Mo</div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    {cvLocal && (
                      <a href={cvLocal.url} target="_blank" rel="noreferrer"
                        style={{ padding:'6px 13px', borderRadius:8, border:`1px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:12, fontWeight:600, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                        👁 Voir
                      </a>
                    )}
                    <button onClick={() => document.getElementById('input-cv-modal-prof').click()}
                      style={{ padding:'6px 13px', borderRadius:8, border:'none', background:couleur, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      {cvLocal ? '🔄 Remplacer' : '📤 Importer'}
                    </button>
                    {cvLocal && (
                      <button onClick={() => setCvLocal(null)}
                        style={{ padding:'6px 13px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.rouge, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>

                {modeEditInfos && (
                  <div style={{ marginTop:16, padding:'10px 14px', background:'#FFFBEB', borderRadius:9, border:'1px solid #FDE68A', fontSize:12, color:'#92400E' }}>
                    ⚠️ L'email et la date de prise de poste sont gérés par le système et ne peuvent pas être modifiés ici.
                  </div>
                )}
              </>
            );
          })()}

          {tab === 'evals' && (() => {
            const moisCourant   = new Date().toISOString().slice(0, 7);
            const evalsValidees = evalsProf.filter(e => e.statut === 'validee');
            const evalsCeMois   = evalsValidees.filter(e => e.date?.startsWith(moisCourant));

            // ── Filtre par période ──
            const now         = new Date();
            const mois3 = new Date(now); mois3.setMonth(now.getMonth() - 2);
            const mois6 = new Date(now); mois6.setMonth(now.getMonth() - 5);
            const PERIODES = [
              { id:'toutes',  lib:'Toutes' },
              { id:'ce_mois', lib:'Ce mois' },
              { id:'3mois',   lib:'3 derniers mois' },
              { id:'6mois',   lib:'6 derniers mois' },
            ];
            const evalsFiltrées = evalsProf.filter(e => {
              if (filtreEvalPeriode === 'toutes') return true;
              if (!e.date) return false;
              const d = new Date(e.date);
              if (filtreEvalPeriode === 'ce_mois') return e.date.startsWith(moisCourant);
              if (filtreEvalPeriode === '3mois')   return d >= mois3;
              if (filtreEvalPeriode === '6mois')   return d >= mois6;
              return true;
            });

            // Séances déjà évaluées (restriction doublon)
            const seancesDejaEvaluees = new Set(evalsProf.map(e => e.seance).filter(Boolean));

            // Séances disponibles pour évaluation (réalisées, non encore évaluées)
            const seancesDisponibles = (detail.sessions || [])
              .filter(s => s.statut === 'realisee' && !seancesDejaEvaluees.has(`${s.groupe} - ${s.date}`))
              .map(s => ({ label:`${s.groupe} - ${s.date}`, key:`${s.groupe} - ${s.date}`, client: s.client }));

            const noteMoyCalc = evalsValidees.length > 0
              ? (evalsValidees.reduce((s, e) => s + (moyenneCriteres(e.criteres) || 0), 0) / evalsValidees.filter(e => e.criteres).length).toFixed(1)
              : '-';

            // Note finale mensuelle = moyenne des évals hebdo du mois
            const noteFinMois = evalsCeMois.filter(e => e.criteres).length > 0
              ? (evalsCeMois.reduce((s, e) => s + (moyenneCriteres(e.criteres) || 0), 0) / evalsCeMois.filter(e => e.criteres).length).toFixed(1)
              : null;

            // Regrouper historique par mois puis par semaine (sur les évals filtrées)
            const parMois = evalsFiltrées.reduce((acc, e) => {
              const m = e.date?.slice(0,7) || 'Inconnu';
              if (!acc[m]) acc[m] = [];
              acc[m].push(e);
              return acc;
            }, {});
            const moisTries = Object.keys(parMois).sort((a,b) => b.localeCompare(a));

            // Helpers
            function couleurNote(n) {
              if (!n) return COULEURS.gris400;
              if (n >= 4.5) return COULEURS.succes;
              if (n >= 3.5) return '#F59E0B';
              if (n >= 2.5) return COULEURS.attention;
              return COULEURS.rouge;
            }
            function etoilesLecture(val) {
              return (
                <div style={{ display:'flex', gap:1 }}>
                  {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize:12, color: n <= val ? '#F59E0B' : COULEURS.gris200 }}>★</span>)}
                </div>
              );
            }

            return (
              <>
                {/* ── KPIs ── */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                  {[
                    { l:'Total évals',    v: evalsProf.length,     c: couleur                    },
                    { l:'Ce mois',        v: evalsCeMois.length,   c: COULEURS.attention         },
                    { l:'Séances dispo.', v: seancesDisponibles.length, c: COULEURS.cyan         },
                    { l:'Note moy. mois', v: noteFinMois ? `${noteFinMois}/5` : '-', c: couleurNote(parseFloat(noteFinMois)) },
                  ].map(k => (
                    <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                      <div style={{ fontSize:20, fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:4 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* ── Bouton nouvelle éval → ouvre modal ── */}
                <div style={{ marginBottom:18 }}>
                  {peutEcrire('evals') ? (
                    seancesDisponibles.length === 0 ? (
                      <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#92400E', fontWeight:600 }}>
                        ℹ️ Toutes les séances réalisées ont déjà été évaluées - aucune séance disponible.
                      </div>
                    ) : (
                      <button onClick={() => { setFormEval({ seance:'', commentaire:'', criteres:{ ...CRITERES_VIDES } }); setModalEvalOuvert(true); }}
                        style={{ width:'100%', padding:'11px 0', borderRadius:10, border:`2px dashed #F59E0B`, background:'#FFFBEB', color:'#92400E', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        ➕ Nouvelle évaluation hebdomadaire
                      </button>
                    )
                  ) : <BadgeLecture />}
                </div>

                {/* ── Filtre par période ── */}
                <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.05em' }}>Période :</span>
                  {PERIODES.map(p => (
                    <button key={p.id} onClick={() => setFiltreEvalPeriode(p.id)}
                      style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans",sans-serif', border:'none', transition:'all 0.15s',
                        background: filtreEvalPeriode===p.id ? couleur : COULEURS.gris100,
                        color:      filtreEvalPeriode===p.id ? '#fff'  : COULEURS.gris600,
                      }}>
                      {p.lib}
                    </button>
                  ))}
                  {filtreEvalPeriode !== 'toutes' && (
                    <span style={{ fontSize:11, color:COULEURS.gris400 }}>
                      - {evalsFiltrées.length} éval{evalsFiltrées.length!==1?'s':''}
                    </span>
                  )}
                </div>

                {/* ── Tableau historique ── */}
                {evalsFiltrées.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>⭐</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>Aucune évaluation enregistrée</div>
                  </div>
                ) : (
                  <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                    {/* En-tête colonnes */}
                    <div style={{ display:'grid', gridTemplateColumns:'0.5fr 0.6fr 1.8fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.6fr 0.8fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', alignItems:'center' }}>
                      <span>Date</span>
                      <span>Sem.</span>
                      <span>Séance observée</span>
                      {CRITERES_EVAL.map(c => <span key={c.id} title={c.lib} style={{ textAlign:'center' }}>{c.icone}</span>)}
                      <span style={{ textAlign:'center' }}>Moy.</span>
                      <span>Commentaire</span>
                    </div>

                    {moisTries.map((mois, midx) => {
                      const evsMois = parMois[mois].sort((a,b) => b.date.localeCompare(a.date));
                      const libMois = new Date(`${mois}-01`).toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
                      const libMoisCap = libMois.charAt(0).toUpperCase() + libMois.slice(1);
                      const noteMoisCalc = evsMois.filter(e => e.criteres).length > 0
                        ? (evsMois.reduce((s, e) => s + (moyenneCriteres(e.criteres) || 0), 0) / evsMois.filter(e => e.criteres).length).toFixed(1)
                        : null;
                      const depli = evalsDeplis[mois] !== false; // ouvert par défaut

                      return (
                        <div key={mois}>
                          {/* ── Ligne mois cliquable ── */}
                          <div
                            onClick={() => setEvalsDeplis(prev => ({ ...prev, [mois]: !depli }))}
                            style={{ display:'grid', gridTemplateColumns:'28px 1fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.7fr 0.9fr', padding:'10px 16px', background:`${couleur}10`, borderBottom:`1px solid ${couleur}20`, alignItems:'center', cursor:'pointer', userSelect:'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = `${couleur}18`}
                            onMouseLeave={e => e.currentTarget.style.background = `${couleur}10`}
                          >
                            <span style={{ fontSize:12, color:couleur, fontWeight:700 }}>{depli ? '▼' : '▶'}</span>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>{libMoisCap}</span>
                              <span style={{ fontSize:11, color:COULEURS.gris600 }}>{evsMois.length} éval{evsMois.length>1?'s':''}</span>
                            </div>
                            {CRITERES_EVAL.map(c => <span key={c.id} />)}
                            <div style={{ textAlign:'center' }}>
                              {noteMoisCalc ? (
                                <span style={{ fontSize:13, fontWeight:900, color:couleurNote(parseFloat(noteMoisCalc)), background:couleurNote(parseFloat(noteMoisCalc))+'20', padding:'3px 10px', borderRadius:20 }}>
                                  {noteMoisCalc}/5
                                </span>
                              ) : <span style={{ color:COULEURS.gris300 }}>-</span>}
                            </div>
                            <span style={{ fontSize:10, color:COULEURS.gris400, fontStyle:'italic' }}>note auto</span>
                          </div>

                          {/* ── Lignes évaluations (dépliables) ── */}
                          {depli && evsMois.map((e, ei) => {
                            const note = moyenneCriteres(e.criteres);
                            const derniere = ei === evsMois.length - 1;
                            const dernierMois = midx === moisTries.length - 1;
                            return (
                              <div key={e.id}
                                onClick={() => setEvalDetail(e)}
                                style={{ display:'grid', gridTemplateColumns:'28px 1fr 0.5fr 0.5fr 0.5fr 0.5fr 0.5fr 0.7fr 0.9fr', padding:'10px 16px 10px 28px', borderBottom: (!derniere || !dernierMois) ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background:COULEURS.blanc, cursor:'pointer', transition:'background 0.12s' }}
                                onMouseEnter={e2 => e2.currentTarget.style.background = COULEURS.gris50}
                                onMouseLeave={e2 => e2.currentTarget.style.background = COULEURS.blanc}
                              >
                                <span style={{ color:couleur, fontSize:10 }}>└</span>
                                <div>
                                  <div style={{ fontWeight:600, color:COULEURS.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.seance}>{e.seance}</div>
                                  <div style={{ display:'flex', gap:6, marginTop:2 }}>
                                    <span style={{ fontSize:10, color:COULEURS.gris400 }}>{e.date}</span>
                                    <span style={{ padding:'1px 6px', borderRadius:20, background:`${couleur}15`, color:couleur, fontSize:10, fontWeight:700 }}>{e.semaine || 'S?'}</span>
                                  </div>
                                </div>
                                {CRITERES_EVAL.map(c => (
                                  <div key={c.id} style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:12, fontWeight:800, color:couleurNote(e.criteres?.[c.id]) }}>
                                      {e.criteres?.[c.id] ?? '-'}
                                    </div>
                                    <div style={{ display:'flex', justifyContent:'center', gap:1 }}>
                                      {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize:7, color: n <= (e.criteres?.[c.id]||0) ? '#F59E0B' : COULEURS.gris200 }}>★</span>)}
                                    </div>
                                  </div>
                                ))}
                                <div style={{ textAlign:'center' }}>
                                  <span style={{ fontSize:15, fontWeight:900, color:couleurNote(note) }}>{note ?? '-'}</span>
                                  <div style={{ fontSize:9, color:COULEURS.gris400 }}>/5</div>
                                </div>
                                <span style={{ fontSize:10, color:COULEURS.gris500, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.commentaire}>
                                  {e.commentaire ? `"${e.commentaire}"` : <span style={{ color:COULEURS.gris300 }}>-</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── MODAL DÉTAIL ÉVALUATION ── */}
                {evalDetail && (() => {
                  const e    = evalDetail;
                  const note = moyenneCriteres(e.criteres);
                  function etoilesDetail(val) {
                    return (
                      <div style={{ display:'flex', gap:3 }}>
                        {[1,2,3,4,5].map(n => (
                          <span key={n} style={{ fontSize:20, color: n <= val ? '#F59E0B' : COULEURS.gris200 }}>★</span>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1700, backdropFilter:'blur(3px)' }}
                      onClick={() => setEvalDetail(null)}>
                      <div style={{ background:COULEURS.blanc, borderRadius:18, width:620, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                        onClick={ex => ex.stopPropagation()}>

                        {/* Header */}
                        <div style={{ background:`linear-gradient(135deg, #92400E, #F59E0B)`, padding:'18px 24px', flexShrink:0 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
                                Détail évaluation · {e.semaine || 'S?'}
                              </div>
                              <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>
                                {prof.prenom} {prof.nom}
                              </div>
                              <div style={{ display:'flex', gap:14, fontSize:12, color:'rgba(255,255,255,0.8)', flexWrap:'wrap' }}>
                                <span>📅 {e.date}</span>
                                <span>📍 {e.seance}</span>
                              </div>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                              {/* Note globale */}
                              <div style={{ textAlign:'center', background:'rgba(255,255,255,0.15)', borderRadius:12, padding:'10px 16px' }}>
                                <div style={{ fontSize:32, fontWeight:900, color:'#fff', lineHeight:1 }}>{note ?? '-'}</div>
                                <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', marginTop:3 }}>/ 5 · moyenne</div>
                              </div>
                              <button onClick={() => setEvalDetail(null)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                            </div>
                          </div>
                        </div>

                        {/* Corps */}
                        <div style={{ overflowY:'auto', flex:1, padding:'20px 24px' }}>
                          {/* Grille critères */}
                          <div style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Grille d'évaluation</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                            {CRITERES_EVAL.map(c => {
                              const val = e.criteres?.[c.id] ?? 0;
                              return (
                                <div key={c.id} style={{ background:COULEURS.gris50, borderRadius:12, padding:'12px 16px', border:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{c.icone} {c.lib}</div>
                                    <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:3 }}>{c.desc}</div>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                                    {etoilesDetail(val)}
                                    <span style={{ fontSize:18, fontWeight:900, color:couleurNote(val), minWidth:32, textAlign:'right' }}>
                                      {val > 0 ? `${val}/5` : '-'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Ligne récap moyenne */}
                          <div style={{ background:`${couleurNote(note)}15`, borderRadius:12, padding:'14px 18px', border:`1.5px solid ${couleurNote(note)}40`, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: e.commentaire ? 16 : 0 }}>
                            <span style={{ fontSize:14, fontWeight:800, color:COULEURS.navy }}>📊 Note finale calculée</span>
                            <span style={{ fontSize:28, fontWeight:900, color:couleurNote(note) }}>{note ?? '-'}<span style={{ fontSize:14, color:COULEURS.gris400, fontWeight:400 }}>/5</span></span>
                          </div>

                          {/* Commentaire */}
                          {e.commentaire && (
                            <div style={{ background:'#FFFBEB', borderRadius:10, padding:'12px 16px', border:'1px solid #FDE68A', borderLeft:`4px solid #F59E0B` }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Commentaire</div>
                              <div style={{ fontSize:13, color:'#78350F', lineHeight:1.7, fontStyle:'italic' }}>"{e.commentaire}"</div>
                            </div>
                          )}
                        </div>

                        {/* Pied */}
                        <div style={{ padding:'12px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
                          <button onClick={() => setEvalDetail(null)} style={{ padding:'9px 22px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                            Fermer
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── MODAL NOUVELLE ÉVALUATION ── */}
                {modalEvalOuvert && (() => {
                  const noteLive   = moyenneCriteres(formEval.criteres);
                  const formValide = formEval.seance && noteLive && Object.values(formEval.criteres).every(v => v > 0);
                  function etoilesEdit(val, onChange) {
                    return (
                      <div style={{ display:'flex', gap:4 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => onChange(n)} type="button"
                            style={{ fontSize:22, background:'none', border:'none', cursor:'pointer', color: n <= val ? '#F59E0B' : COULEURS.gris200, padding:'0 1px', lineHeight:1 }}>★</button>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1600, backdropFilter:'blur(3px)' }}
                      onClick={() => setModalEvalOuvert(false)}>
                      <div style={{ background:COULEURS.blanc, borderRadius:18, width:680, maxWidth:'96vw', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 80px rgba(0,0,0,0.35)', overflow:'hidden', fontFamily:'"Plus Jakarta Sans", sans-serif' }}
                        onClick={e => e.stopPropagation()}>

                        {/* Header modal */}
                        <div style={{ background:'linear-gradient(135deg,#92400E,#F59E0B)', padding:'18px 24px', flexShrink:0 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                            <div>
                              <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Évaluation hebdomadaire</div>
                              <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:3 }}>{prof.prenom} {prof.nom}</div>
                              <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)' }}>
                                {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })} · Semaine {evalsCeMois.length+1} ce mois
                              </div>
                            </div>
                            <button onClick={() => setModalEvalOuvert(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, width:32, height:32, color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                          </div>
                        </div>

                        {/* Corps scrollable */}
                        <div style={{ overflowY:'auto', flex:1, padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>

                          {/* Séance observée - SELECT avec restriction doublon */}
                          <div>
                            <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                              Séance observée *
                            </label>
                            <select
                              value={formEval.seance}
                              onChange={e => setFormEval(f => ({ ...f, seance:e.target.value }))}
                              style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1.5px solid ${formEval.seance ? '#FDE68A' : COULEURS.rouge+'60'}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', background:COULEURS.blanc, color: formEval.seance ? COULEURS.navy : COULEURS.gris400, outline:'none' }}
                            >
                              <option value="">- Sélectionner une séance -</option>
                              {seancesDisponibles.map(s => (
                                <option key={s.key} value={s.key}>{s.label}{s.client ? ` (${s.client})` : ''}</option>
                              ))}
                            </select>
                            {seancesDisponibles.length > 0 && (
                              <div style={{ fontSize:11, color:COULEURS.gris400, marginTop:5 }}>
                                {seancesDisponibles.length} séance{seancesDisponibles.length>1?'s':''} disponible{seancesDisponibles.length>1?'s':''} · Les séances déjà évaluées n'apparaissent pas.
                              </div>
                            )}
                          </div>

                          {/* Grille critères */}
                          <div>
                            <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Grille d'évaluation *</div>
                            <div style={{ background:COULEURS.gris50, borderRadius:12, overflow:'hidden', border:`1px solid #FDE68A` }}>
                              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 0.6fr', padding:'9px 16px', background:'#FEF9C3', borderBottom:`1px solid #FDE68A`, fontSize:11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                                <span>Critère</span><span style={{ textAlign:'center' }}>Note ★</span><span style={{ textAlign:'center' }}>Val.</span>
                              </div>
                              {CRITERES_EVAL.map((c, i) => (
                                <div key={c.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 0.6fr', padding:'11px 16px', borderBottom: i < CRITERES_EVAL.length-1 ? `1px solid #FEF3C7` : 'none', alignItems:'center', background:COULEURS.blanc }}>
                                  <div>
                                    <div style={{ fontSize:13, fontWeight:600, color:COULEURS.navy }}>{c.icone} {c.lib}</div>
                                    <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{c.desc}</div>
                                  </div>
                                  <div style={{ display:'flex', justifyContent:'center' }}>
                                    {etoilesEdit(formEval.criteres[c.id], val => setFormEval(f => ({ ...f, criteres:{ ...f.criteres, [c.id]:val } })))}
                                  </div>
                                  <div style={{ textAlign:'center', fontSize:15, fontWeight:800, color: couleurNote(formEval.criteres[c.id]) }}>
                                    {formEval.criteres[c.id] > 0 ? `${formEval.criteres[c.id]}/5` : '-'}
                                  </div>
                                </div>
                              ))}
                              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 0.6fr', padding:'11px 16px', background:'#FFFBEB', borderTop:`2px solid #FDE68A` }}>
                                <span style={{ fontSize:13, fontWeight:800, color:'#92400E' }}>📊 Moyenne</span>
                                <div />
                                <div style={{ textAlign:'center', fontSize:20, fontWeight:900, color: couleurNote(noteLive) }}>
                                  {noteLive ? `${noteLive}/5` : '-'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Commentaire */}
                          <div>
                            <label style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', display:'block', marginBottom:6 }}>
                              Commentaire (optionnel)
                            </label>
                            <textarea value={formEval.commentaire} onChange={e => setFormEval(f=>({...f,commentaire:e.target.value}))}
                              placeholder="Points forts, axes d'amélioration, observations…"
                              rows={3}
                              style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', resize:'vertical', boxSizing:'border-box', outline:'none' }} />
                          </div>
                        </div>

                        {/* Pied */}
                        <div style={{ padding:'14px 24px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                          <span style={{ fontSize:12, color:COULEURS.gris400 }}>
                            {!formEval.seance ? '⚠ Sélectionnez une séance' : !formValide ? '⚠ Notez tous les critères' : '✅ Prêt à enregistrer'}
                          </span>
                          <div style={{ display:'flex', gap:10 }}>
                            <button onClick={() => setModalEvalOuvert(false)} style={{ padding:'9px 18px', borderRadius:9, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                              Annuler
                            </button>
                            <button onClick={ajouterEval} disabled={!formValide}
                              style={{ padding:'9px 24px', borderRadius:9, border:'none', background: formValide ? '#F59E0B' : COULEURS.gris200, color: formValide ? '#fff' : COULEURS.gris400, fontSize:13, fontWeight:700, cursor: formValide ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                              ✅ Enregistrer l'évaluation
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {tab === 'contrat' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Contrat & rémunération</span>
                {!peutEcrire('contrat') && <BadgeLecture />}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

                {/* ── Carte Type de contrat - cliquable si droits ── */}
                {(() => {
                  const CFG_CONTRAT = { Freelance:{ bg:'#FEF3C7',txt:'#92400E',sbg:'#F59E0B',ic:'🔖' }, Consultant:{ bg:'#EDE9FE',txt:'#5B21B6',sbg:'#7C3AED',ic:'💼' }, Stagiaire:{ bg:'#DBEAFE',txt:'#1D4ED8',sbg:'#2563EB',ic:'🎓' }, Permanent:{ bg:'#D1FAE5',txt:'#065F46',sbg:'#059669',ic:'🏢' } };
                  const cActuel = CFG_CONTRAT[typeContrat] || { bg:COULEURS.gris100, txt:COULEURS.gris600, ic:'📝' };
                  const enEdition = typeContratChoisi !== '';
                  return (
                    <div style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1.5px solid ${typeContratLocal ? COULEURS.attention : couleur}40`, gridColumn: peutEcrire('contrat') ? '1 / -1' : 'auto' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span>Type de contrat</span>
                        {peutEcrire('contrat') && !enEdition && (
                          <button onClick={() => setTypeContratChoisi(typeContrat)}
                            style={{ padding:'2px 9px', borderRadius:6, border:`1px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                            ✏️ Modifier
                          </button>
                        )}
                      </div>

                      {/* Affichage normal */}
                      {!enEdition && (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ padding:'5px 14px', borderRadius:20, background:cActuel.bg, color:cActuel.txt, fontWeight:800, fontSize:13 }}>
                            {cActuel.ic} {typeContrat}
                          </span>
                          {typeContratLocal && (
                            <span style={{ fontSize:10, color:COULEURS.attention, fontWeight:700, padding:'2px 8px', background:'#FEF3C7', borderRadius:20 }}>modifié</span>
                          )}
                        </div>
                      )}

                      {/* Sélecteur inline */}
                      {enEdition && peutEcrire('contrat') && (
                        <>
                          <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:12, marginTop:4 }}>
                            {['Freelance','Consultant','Stagiaire','Permanent'].map(type => {
                              const c2 = CFG_CONTRAT[type];
                              const sel = typeContratChoisi === type;
                              return (
                                <button key={type} onClick={() => setTypeContratChoisi(type)}
                                  style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 13px', borderRadius:10, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:700, fontSize:12, border:`2px solid ${sel ? c2.sbg : COULEURS.gris200}`, background: sel ? c2.sbg : c2.bg, color: sel ? '#fff' : c2.txt, transition:'all 0.15s' }}>
                                  {c2.ic} {type}{sel && ' ✓'}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ display:'flex', gap:8 }}>
                            {typeContratChoisi !== typeContrat && (
                              <button onClick={() => setContratConfirm(true)}
                                style={{ padding:'7px 16px', borderRadius:8, border:'none', background:couleur, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                                Confirmer
                              </button>
                            )}
                            <button onClick={() => setTypeContratChoisi('')}
                              style={{ padding:'7px 13px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                              Annuler
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ── Bloc honoraires ── */}
                {(() => {
                  const fmtF = v => new Intl.NumberFormat('fr-FR').format(v) + ' FCFA';
                  // Lire la grille depuis localStorage, fallback sur les tarifs BET par défaut
                  let grille = { Freelance:{enfant:6000,ados:7000,adulte:9000,business:11000}, Consultant:{enfant:8000,ados:9000,adulte:11000,business:13000}, Stagiaire:{enfant:3000,ados:3500,adulte:4000,business:4500}, Permanent:{enfant:10000,ados:11000,adulte:13000,business:15000} };
                  try { const r = localStorage.getItem('bet_grille_honoraires'); if (r) grille = JSON.parse(r); } catch {}
                  const tarifs = grille[typeContrat] || {};
                  const tarifMoyen = tarifs ? Math.round(Object.values(tarifs).reduce((a,v)=>a+v,0) / Math.max(Object.values(tarifs).length,1)) : 0;
                  const sessionsM = contrat.nb_sessions_mois || 0;
                  const dureeEstimee = 2; // 2h par session en moyenne
                  const estimeMois = tarifMoyen * dureeEstimee * sessionsM;

                  return (
                    <div style={{ gridColumn:'1 / -1', background:`linear-gradient(135deg, ${couleur}08, ${couleur}15)`, borderRadius:12, padding:'14px 16px', border:`1px solid ${couleur}30` }}>
                      <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
                        💰 Honoraires - grille tarifaire ({typeContrat})
                      </div>
                      {/* Tarifs par type de public */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                        {[['🧒','Enfants','enfant'],['🧑','Ados','ados'],['👔','Adultes','adulte'],['💼','Business','business']].map(([ic,lib,key]) => (
                          <div key={key} style={{ background:COULEURS.blanc, borderRadius:9, padding:'9px 10px', textAlign:'center', border:`1px solid ${couleur}20` }}>
                            <div style={{ fontSize:14, marginBottom:4 }}>{ic}</div>
                            <div style={{ fontSize:10, color:COULEURS.gris400, marginBottom:4 }}>{lib}</div>
                            <div style={{ fontSize:13, fontWeight:800, color:couleur }}>{tarifs[key] ? fmtF(tarifs[key]) : '-'}</div>
                            <div style={{ fontSize:9, color:COULEURS.gris400, marginTop:2 }}>/ heure</div>
                          </div>
                        ))}
                      </div>
                      {/* Estimation mensuelle */}
                      <div style={{ background:COULEURS.blanc, borderRadius:9, padding:'10px 14px', border:`1px solid ${couleur}20`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:COULEURS.gris600 }}>Estimation du mois en cours</div>
                          <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>
                            {sessionsM} session{sessionsM>1?'s':''} × ~{dureeEstimee}h × tarif moyen {fmtF(tarifMoyen)}/h
                          </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:18, fontWeight:900, color:couleur }}>{fmtF(estimeMois)}</div>
                          <div style={{ fontSize:9, color:COULEURS.gris400 }}>estimation indicative</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Autres champs ── */}
                {[
                  ['Date de début',    contrat.debut,   null],
                  ['Date de fin',      contrat.fin||'Indéterminé', contrat.fin?COULEURS.attention:COULEURS.succes],
                  ['Statut',           contrat.statut==='expire_bientot'?'⚠️ Expire bientôt':'✅ Actif', contrat.statut==='expire_bientot'?COULEURS.attention:COULEURS.succes],
                  ['En congé',         contrat.conge?'📅 Oui':'Non', contrat.conge?COULEURS.attention:null],
                  ['Sessions totales', contrat.nb_sessions_total, null],
                  ['Sessions ce mois', contrat.nb_sessions_mois,  couleur],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'12px 14px', border:`1px solid ${COULEURS.gris200}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris400, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color: c||COULEURS.navy }}>{v??'-'}</div>
                  </div>
                ))}
              </div>

              {/* ── Modal de confirmation ── */}
              {contratConfirm && (
                <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1500, backdropFilter:'blur(3px)' }}>
                  <div style={{ background:'#fff', borderRadius:16, width:480, maxWidth:'94vw', boxShadow:'0 24px 60px rgba(0,0,0,0.3)', overflow:'hidden', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                    <div style={{ background:'linear-gradient(135deg,#F59E0B,#D97706)', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:22 }}>⚠️</span>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Changement de type de contrat</div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginTop:2 }}>{prof.prenom} {prof.nom}</div>
                      </div>
                    </div>
                    <div style={{ padding:'18px 20px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                        <span style={{ background:'#EDE9FE', color:'#5B21B6', padding:'4px 13px', borderRadius:20, fontWeight:800, fontSize:13 }}>{typeContrat}</span>
                        <span style={{ color:COULEURS.gris400, fontSize:16 }}>→</span>
                        <span style={{ background:'#D1FAE5', color:'#065F46', padding:'4px 13px', borderRadius:20, fontWeight:800, fontSize:13 }}>{typeContratChoisi}</span>
                      </div>
                      <div style={{ padding:'10px 14px', background:'#D1FAE5', borderRadius:10, border:'1px solid #6EE7B7', fontSize:12, color:'#065F46', marginBottom:10 }}>
                        ✅ <strong>Séances déjà validées et payées</strong> - tarif <strong>{typeContrat}</strong> conservé.
                      </div>
                      <div style={{ padding:'10px 14px', background:'#EFF6FF', borderRadius:10, border:'1px solid #BFDBFE', fontSize:12, color:'#1E40AF' }}>
                        🔄 <strong>Prochaines séances</strong> - calculées au tarif <strong>{typeContratChoisi}</strong>.
                      </div>
                    </div>
                    <div style={{ padding:'12px 20px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
                      <button onClick={() => setContratConfirm(false)}
                        style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Annuler
                      </button>
                      <button onClick={() => { setTypeContratLocal(typeContratChoisi); setContratConfirm(false); setTypeContratChoisi(''); }}
                        style={{ padding:'8px 20px', borderRadius:8, border:'none', background:couleur, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Confirmer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'groupes' && (() => {
            const groupes = detail.groupes || [];
            if (groupes.length === 0) return (
              <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🏫</div>
                <div style={{ fontSize:14, fontWeight:600 }}>Aucun groupe assigné</div>
              </div>
            );

            const parClient = groupes.reduce((acc, g) => {
              const key = g.client || 'Particuliers';
              if (!acc[key]) acc[key] = [];
              acc[key].push(g);
              return acc;
            }, {});
            const clients = Object.keys(parClient);
            const totalApprenants = groupes.reduce((s, g) => s + (g.effectif || 0), 0);

            return (
              <>
                {/* En-tête + KPIs */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ display:'flex', gap:10 }}>
                    {[
                      { l:'Groupes',     v: groupes.length,  c: couleur        },
                      { l:'Entreprises', v: clients.length,  c: COULEURS.navy  },
                      { l:'Apprenants',  v: totalApprenants, c: COULEURS.succes },
                    ].map(k => (
                      <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'8px 14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center', minWidth:78 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:k.c }}>{k.v}</div>
                        <div style={{ fontSize:10, color:COULEURS.gris600 }}>{k.l}</div>
                      </div>
                    ))}
                  </div>
                  {peutEcrire('groupes')
                    ? <button style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>✏️ Modifier l'assignation</button>
                    : <BadgeLecture />}
                </div>

                {/* Tableau accordéon */}
                <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  {/* En-tête colonnes */}
                  <div style={{ display:'grid', gridTemplateColumns:'28px 1.8fr 0.6fr 0.6fr 1fr 1fr 0.8fr 0.9fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span></span><span>Classe</span><span>Tranche</span><span>Niveau</span><span>Jours</span><span>Horaire</span><span>Effectif</span><span>Présence</span>
                  </div>

                  {clients.map((client, cidx) => {
                    const groupesCli = parClient[client];
                    const clCouleur  = groupesCli[0]?.couleurClient || couleur;
                    const effectifCli = groupesCli.reduce((s, g) => s + (g.effectif || 0), 0);
                    const presenceMoy = Math.round(groupesCli.reduce((s, g) => s + (g.presence || 0), 0) / groupesCli.length);
                    const depli = groupesDeplis[client] !== false; // ouvert par défaut

                    return (
                      <div key={client}>
                        {/* ── Ligne entreprise (cliquable) ── */}
                        <div
                          onClick={() => setGroupesDeplis(prev => ({ ...prev, [client]: !depli }))}
                          style={{ display:'grid', gridTemplateColumns:'28px 1.8fr 0.6fr 0.6fr 1fr 1fr 0.8fr 0.9fr', padding:'12px 16px', background:`${clCouleur}10`, borderBottom:`1px solid ${clCouleur}20`, cursor:'pointer', alignItems:'center', userSelect:'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = `${clCouleur}18`}
                          onMouseLeave={e => e.currentTarget.style.background = `${clCouleur}10`}
                        >
                          <span style={{ fontSize:12, color:clCouleur, fontWeight:700 }}>{depli ? '▼' : '▶'}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:clCouleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff', flexShrink:0 }}>
                              {client.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>{client}</div>
                              <div style={{ fontSize:10, color:COULEURS.gris600 }}>{groupesCli.length} classe{groupesCli.length>1?'s':''}</div>
                            </div>
                          </div>
                          <span></span><span></span><span></span><span></span>
                          <span style={{ fontWeight:700, color:COULEURS.navy, fontSize:12 }}>{effectifCli} appr.</span>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ flex:1, height:5, background:COULEURS.gris100, borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${presenceMoy}%`, background:presenceMoy>=80?COULEURS.succes:COULEURS.attention, borderRadius:3 }} />
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color:presenceMoy>=80?COULEURS.succes:COULEURS.attention, flexShrink:0 }}>{presenceMoy}%</span>
                          </div>
                        </div>

                        {/* ── Lignes des classes (dépliables) ── */}
                        {depli && groupesCli.map((g, gi) => {
                          const ts = TRANCHES_STYLE[g.tranche] || { bg:COULEURS.gris100, txt:COULEURS.gris600, icone:'👥' };
                          const derniere = gi === groupesCli.length - 1;
                          const dernierClient = cidx === clients.length - 1;
                          return (
                            <div key={g.id} style={{ display:'grid', gridTemplateColumns:'28px 1.8fr 0.6fr 0.6fr 1fr 1fr 0.8fr 0.9fr', padding:'11px 16px 11px 28px', borderBottom: (!derniere || !dernierClient) ? `1px solid ${COULEURS.gris100}` : 'none', background:COULEURS.blanc, alignItems:'center', fontSize:12 }}>
                              <span style={{ color:clCouleur, fontSize:10 }}>└</span>
                              <div>
                                <div style={{ fontWeight:700, color:COULEURS.navy }}>{g.nom}</div>
                                <div style={{ fontSize:10, color:COULEURS.gris400, marginTop:2 }}>{g.type}</div>
                              </div>
                              <span>
                                <span style={{ padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:700, background:ts.bg, color:ts.txt }}>{ts.icone}</span>
                              </span>
                              <span style={{ padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:700, background:COULEURS.cyanClair, color:COULEURS.cyanFonce, width:'fit-content' }}>{g.niveau}</span>
                              <span style={{ color:COULEURS.gris600, fontSize:11 }}>{g.jours}</span>
                              <span style={{ fontWeight:600, color:COULEURS.navy }}>{g.horaire}</span>
                              <span style={{ fontWeight:700, color:clCouleur }}>{g.effectif} <span style={{ fontSize:10, color:COULEURS.gris400, fontWeight:400 }}>appr.</span></span>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <div style={{ flex:1, height:4, background:COULEURS.gris100, borderRadius:2, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${g.presence}%`, background:g.presence>=80?COULEURS.succes:COULEURS.attention, borderRadius:2 }} />
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, color:g.presence>=80?COULEURS.succes:COULEURS.attention, flexShrink:0 }}>{g.presence}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {tab === 'sessions' && (() => {
            const sessions = detail.sessions || [];
            const groupes  = detail.groupes  || [];

            if (sessions.length === 0) return (
              <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🎥</div>
                <div style={{ fontSize:14, fontWeight:600 }}>Aucune session enregistrée</div>
              </div>
            );

            const realisees  = sessions.filter(s => s.statut === 'realisee').length;
            const planifiees = sessions.filter(s => s.statut === 'planifiee').length;
            const parClient  = sessions.reduce((acc, s) => {
              const key = s.client || 'Particuliers';
              if (!acc[key]) acc[key] = [];
              acc[key].push(s);
              return acc;
            }, {});
            const clients = Object.keys(parClient);

            return (
              <>
                {/* KPIs */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
                  {[
                    { l:'Total',       v: sessions.length, c: COULEURS.navy   },
                    { l:'Réalisées',   v: realisees,        c: COULEURS.cyan   },
                    { l:'Planifiées',  v: planifiees,       c: COULEURS.succes },
                    { l:'Entreprises', v: clients.length,   c: couleur         },
                  ].map(k => (
                    <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'9px 12px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                      <div style={{ fontSize:19, fontWeight:800, color:k.c }}>{k.v}</div>
                      <div style={{ fontSize:11, color:COULEURS.gris600 }}>{k.l}</div>
                    </div>
                  ))}
                </div>

                {/* Tableau accordéon */}
                <div style={{ borderRadius:12, overflow:'hidden', border:`1px solid ${COULEURS.gris200}` }}>
                  {/* En-tête colonnes */}
                  <div style={{ display:'grid', gridTemplateColumns:'28px 0.8fr 1.6fr 1.1fr 0.5fr 0.6fr 0.7fr 0.9fr', padding:'9px 16px', background:COULEURS.gris50, borderBottom:`1px solid ${COULEURS.gris200}`, fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <span></span><span>Date</span><span>Classe</span><span>Tranche</span><span>Durée</span><span>Présents</span><span>Type</span><span>Statut</span>
                  </div>

                  {clients.map((client, cidx) => {
                    const sessionsCli  = parClient[client];
                    const clCouleur    = groupes.find(g => g.client === client)?.couleurClient || couleur;
                    const realiseesCli = sessionsCli.filter(s => s.statut === 'realisee').length;
                    const planifCli    = sessionsCli.filter(s => s.statut === 'planifiee').length;
                    const pageActuelle = pagesSessions[client] || 1;
                    const nbPages      = Math.ceil(sessionsCli.length / PAR_PAGE_SESSIONS);
                    const debut        = (pageActuelle - 1) * PAR_PAGE_SESSIONS;
                    const sessionPage  = sessionsCli.slice(debut, debut + PAR_PAGE_SESSIONS);
                    const depli        = pagesSessions[`depli_${client}`] !== false; // ouvert par défaut

                    return (
                      <div key={client}>
                        {/* ── Ligne entreprise (cliquable) ── */}
                        <div
                          onClick={() => setPagesSessions(prev => ({ ...prev, [`depli_${client}`]: !depli }))}
                          style={{ display:'grid', gridTemplateColumns:'28px 0.8fr 1.6fr 1.1fr 0.5fr 0.6fr 0.7fr 0.9fr', padding:'12px 16px', background:`${clCouleur}10`, borderBottom:`1px solid ${clCouleur}20`, cursor:'pointer', alignItems:'center', userSelect:'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = `${clCouleur}18`}
                          onMouseLeave={e => e.currentTarget.style.background = `${clCouleur}10`}
                        >
                          <span style={{ fontSize:12, color:clCouleur, fontWeight:700 }}>{depli ? '▼' : '▶'}</span>
                          <span></span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:28, height:28, borderRadius:7, background:clCouleur, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff', flexShrink:0 }}>
                              {client.slice(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:800, color:COULEURS.navy }}>{client}</div>
                              <div style={{ fontSize:10, color:COULEURS.gris600 }}>{sessionsCli.length} session{sessionsCli.length>1?'s':''}</div>
                            </div>
                          </div>
                          <span></span><span></span>
                          <span style={{ fontWeight:700, color:COULEURS.succes, fontSize:12 }}>✅ {realiseesCli}</span>
                          <span style={{ fontWeight:700, color:COULEURS.cyan, fontSize:12 }}>📅 {planifCli}</span>
                          <span></span>
                        </div>

                        {/* ── Lignes des sessions ── */}
                        {depli && (
                          <>
                            {sessionPage.map((s, i) => {
                              const ts = TRANCHES_STYLE[s.tranche] || { bg:COULEURS.gris100, txt:COULEURS.gris600, icone:'👥' };
                              const derniere = i === sessionPage.length - 1;
                              const dernierClient = cidx === clients.length - 1;
                              return (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 0.8fr 1.6fr 1.1fr 0.5fr 0.6fr 0.7fr 0.9fr', padding:'10px 16px 10px 28px', borderBottom: (!derniere || nbPages > 1 || !dernierClient) ? `1px solid ${COULEURS.gris100}` : 'none', fontSize:12, alignItems:'center', background: s.statut==='planifiee'?`${clCouleur}04`:COULEURS.blanc }}>
                                  <span style={{ color:clCouleur, fontSize:10 }}>└</span>
                                  <span style={{ fontWeight:600, color:COULEURS.navy }}>{s.date}</span>
                                  <span style={{ color:COULEURS.gris600, fontSize:11 }}>{s.groupe}</span>
                                  <span><span style={{ padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:700, background:ts.bg, color:ts.txt }}>{ts.icone} {s.tranche?.split(' ')[0]}</span></span>
                                  <span style={{ color:COULEURS.navy, fontWeight:600 }}>{s.duree}</span>
                                  <span style={{ fontWeight:700, color:s.participants?clCouleur:COULEURS.gris400 }}>{s.participants??'-'}</span>
                                  <span style={{ padding:'2px 6px', borderRadius:6, fontSize:10, fontWeight:600, background:s.type==='Évaluation'?'#FEF3C7':'#EFF6FF', color:s.type==='Évaluation'?'#92400E':'#1D4ED8' }}>{s.type}</span>
                                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, background:s.statut==='realisee'?'#DBEAFE':'#D1FAE5', color:s.statut==='realisee'?'#1D4ED8':'#065F46' }}>
                                    {s.statut==='realisee'?'✅ Réalisée':'📅 Planifiée'}
                                  </span>
                                </div>
                              );
                            })}

                            {/* Pagination */}
                            {nbPages > 1 && (
                              <div style={{ padding:'8px 16px 8px 28px', borderBottom: cidx < clients.length-1 ? `1px solid ${COULEURS.gris100}` : 'none', display:'flex', justifyContent:'space-between', alignItems:'center', background:COULEURS.gris50 }}>
                                <span style={{ fontSize:11, color:COULEURS.gris400 }}>
                                  {debut+1}–{Math.min(debut+PAR_PAGE_SESSIONS, sessionsCli.length)} / {sessionsCli.length}
                                </span>
                                <div style={{ display:'flex', gap:4 }}>
                                  <button disabled={pageActuelle===1} onClick={e => { e.stopPropagation(); setPagesSessions(p=>({...p,[client]:pageActuelle-1})); }}
                                    style={{ width:26, height:26, borderRadius:6, border:`1px solid ${pageActuelle===1?COULEURS.gris100:clCouleur}`, background:COULEURS.blanc, color:pageActuelle===1?COULEURS.gris300:clCouleur, fontSize:13, cursor:pageActuelle===1?'not-allowed':'pointer', fontWeight:700 }}>‹</button>
                                  {Array.from({length:nbPages},(_,i)=>i+1).map(p=>(
                                    <button key={p} onClick={e => { e.stopPropagation(); setPagesSessions(prev=>({...prev,[client]:p})); }}
                                      style={{ width:26, height:26, borderRadius:6, border:`1px solid ${p===pageActuelle?clCouleur:COULEURS.gris200}`, background:p===pageActuelle?clCouleur:COULEURS.blanc, color:p===pageActuelle?'#fff':COULEURS.gris600, fontSize:11, cursor:'pointer', fontWeight:p===pageActuelle?700:400 }}>{p}</button>
                                  ))}
                                  <button disabled={pageActuelle===nbPages} onClick={e => { e.stopPropagation(); setPagesSessions(p=>({...p,[client]:pageActuelle+1})); }}
                                    style={{ width:26, height:26, borderRadius:6, border:`1px solid ${pageActuelle===nbPages?COULEURS.gris100:clCouleur}`, background:COULEURS.blanc, color:pageActuelle===nbPages?COULEURS.gris300:clCouleur, fontSize:13, cursor:pageActuelle===nbPages?'not-allowed':'pointer', fontWeight:700 }}>›</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* ══ CERTIFICATIONS ══ */}
          {tab === 'certifs' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>🎓 Certifications ({certifs.length})</span>
                <button onClick={() => setFormCertif({ ...CERTIF_VIDE })}
                  style={{ padding:'7px 16px', borderRadius:8, border:`1.5px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                  ➕ Ajouter une certification
                </button>
              </div>

              {certifs.length === 0 && !formCertif && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🎓</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>Aucune certification renseignée</div>
                  <div style={{ fontSize:12, marginTop:6 }}>Cliquez sur "Ajouter" pour commencer.</div>
                </div>
              )}

              {certifs.map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:14, background:COULEURS.blanc, borderRadius:12, padding:'14px 18px', border:`1px solid ${COULEURS.gris200}`, marginBottom:10 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background: c.valide ? couleur+'15' : COULEURS.gris100, border:`2px solid ${c.valide ? couleur+'40' : COULEURS.gris200}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                    {c.valide ? '🎓' : '📋'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, color:COULEURS.navy, fontSize:14 }}>{c.nom}</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>{c.organisme}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginRight:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>{c.annee}</div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: c.valide?'#D1FAE5':'#FEE2E2', color: c.valide?'#065F46':'#991B1B' }}>
                      {c.valide ? '✓ Valide' : 'Expirée'}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => setFormCertif({ _idx:i, nom:c.nom, organisme:c.organisme, annee:c.annee, valide:c.valide })}
                      style={{ background:'#EFF6FF', color:'#1D4ED8', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>✏️</button>
                    <button onClick={() => supprimerCertif(i)}
                      style={{ background:'#FEF2F2', color:'#991B1B', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>🗑</button>
                  </div>
                </div>
              ))}

              {/* Formulaire ajout / édition certification */}
              {formCertif && (() => {
                const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
                const lbl = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 };
                return (
                  <div style={{ background:`${couleur}08`, borderRadius:14, padding:'20px 18px', border:`2px solid ${couleur}30`, marginTop:12 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:couleur, marginBottom:16 }}>
                      {formCertif._idx === -1 ? '➕ Nouvelle certification' : '✏️ Modifier la certification'}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      <div>
                        <label style={lbl}>Nom de la certification *</label>
                        <input value={formCertif.nom} onChange={e => setFormCertif(f => ({...f, nom:e.target.value}))} placeholder="ex : CELTA, TOEIC…" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Organisme certificateur *</label>
                        <input value={formCertif.organisme} onChange={e => setFormCertif(f => ({...f, organisme:e.target.value}))} placeholder="ex : Cambridge Assessment" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Année d'obtention</label>
                        <input type="number" value={formCertif.annee} onChange={e => setFormCertif(f => ({...f, annee:e.target.value}))} min="1990" max="2030" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Statut</label>
                        <div style={{ display:'flex', gap:8, marginTop:4 }}>
                          {[true, false].map(v => (
                            <button key={String(v)} type="button" onClick={() => setFormCertif(f => ({...f, valide:v}))}
                              style={{ flex:1, padding:'8px', borderRadius:8, border:`2px solid ${formCertif.valide===v?(v?COULEURS.succes:'#EF4444'):COULEURS.gris200}`, background:formCertif.valide===v?(v?'#D1FAE5':'#FEE2E2'):COULEURS.blanc, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', color:formCertif.valide===v?(v?'#065F46':'#991B1B'):COULEURS.gris600 }}>
                              {v ? '✓ Valide' : 'Expirée'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => sauvegarderCertif(formCertif)}
                        style={{ flex:2, background:couleur, color:'#fff', border:'none', borderRadius:8, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        {formCertif._idx === -1 ? 'Ajouter →' : 'Enregistrer →'}
                      </button>
                      <button onClick={() => setFormCertif(null)}
                        style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'10px 0', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* ══ EXPÉRIENCES ══ */}
          {tab === 'exp' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>💼 Expériences professionnelles ({exps.length})</span>
                <button onClick={() => setFormExp({ ...EXP_VIDE })}
                  style={{ padding:'7px 16px', borderRadius:8, border:`1.5px solid ${couleur}`, background:couleur+'12', color:couleur, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                  ➕ Ajouter une expérience
                </button>
              </div>

              {exps.length === 0 && !formExp && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:COULEURS.gris400 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>💼</div>
                  <div style={{ fontSize:14, fontWeight:600 }}>Aucune expérience renseignée</div>
                  <div style={{ fontSize:12, marginTop:6 }}>Cliquez sur "Ajouter" pour commencer.</div>
                </div>
              )}

              {exps.map((e, i) => (
                <div key={i} style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}`, marginBottom:12, borderLeft:`4px solid ${couleur}`, position:'relative' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ fontWeight:800, color:COULEURS.navy, fontSize:14 }}>{e.poste}</div>
                      <div style={{ fontSize:13, color:couleur, fontWeight:600, marginTop:2 }}>{e.etablissement}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, marginLeft:12 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:COULEURS.gris600, background:COULEURS.gris100, padding:'3px 9px', borderRadius:20 }}>
                        {e.debut} - {e.fin || 'Présent'}
                      </span>
                      <button onClick={() => setFormExp({ _idx:i, poste:e.poste, etablissement:e.etablissement, debut:e.debut, fin:e.fin||'', description:e.description||'' })}
                        style={{ background:'#EFF6FF', color:'#1D4ED8', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>✏️</button>
                      <button onClick={() => supprimerExp(i)}
                        style={{ background:'#FEF2F2', color:'#991B1B', border:'none', borderRadius:7, padding:'5px 10px', fontSize:12, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', fontWeight:600 }}>🗑</button>
                    </div>
                  </div>
                  {e.description && (
                    <div style={{ fontSize:12, color:COULEURS.gris600, lineHeight:1.6, marginTop:8, paddingTop:8, borderTop:`1px solid ${COULEURS.gris100}` }}>{e.description}</div>
                  )}
                </div>
              ))}

              {/* Formulaire ajout / édition expérience */}
              {formExp && (() => {
                const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${COULEURS.gris200}`, fontSize:13, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, boxSizing:'border-box', background:COULEURS.blanc };
                const lbl = { fontSize:11, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.04em', display:'block', marginBottom:5 };
                return (
                  <div style={{ background:`${couleur}08`, borderRadius:14, padding:'20px 18px', border:`2px solid ${couleur}30`, marginTop:12 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:couleur, marginBottom:16 }}>
                      {formExp._idx === -1 ? '➕ Nouvelle expérience' : '✏️ Modifier l\'expérience'}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      <div>
                        <label style={lbl}>Poste / Titre *</label>
                        <input value={formExp.poste} onChange={e2 => setFormExp(f => ({...f, poste:e2.target.value}))} placeholder="ex : Professeur d'anglais" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Établissement *</label>
                        <input value={formExp.etablissement} onChange={e2 => setFormExp(f => ({...f, etablissement:e2.target.value}))} placeholder="ex : Alliance Française" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Début</label>
                        <input value={formExp.debut} onChange={e2 => setFormExp(f => ({...f, debut:e2.target.value}))} placeholder="2020" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Fin (vide = Présent)</label>
                        <input value={formExp.fin} onChange={e2 => setFormExp(f => ({...f, fin:e2.target.value}))} placeholder="2024 ou laisser vide" style={inp} />
                      </div>
                    </div>
                    <div style={{ marginBottom:14 }}>
                      <label style={lbl}>Description</label>
                      <textarea value={formExp.description} onChange={e2 => setFormExp(f => ({...f, description:e2.target.value}))}
                        rows={3} placeholder="Décrivez les missions, responsabilités, accomplissements…"
                        style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => sauvegarderExp(formExp)}
                        style={{ flex:2, background:couleur, color:'#fff', border:'none', borderRadius:8, padding:'10px 0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        {formExp._idx === -1 ? 'Ajouter →' : 'Enregistrer →'}
                      </button>
                      <button onClick={() => setFormExp(null)}
                        style={{ flex:1, background:COULEURS.gris100, color:COULEURS.gris600, border:'none', borderRadius:8, padding:'10px 0', fontSize:13, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {tab === 'dispos' && (() => {
            const CRENEAUX = ['06h00','07h00','08h00','09h00','10h00','11h00','12h00','13h00','14h00','15h00','16h00','17h00','18h00','19h00','20h00','21h00','22h00'];
            const nbDispos = JOURS.filter(j => getCreneaux(baseDispos()[j]).length > 0).length;

            return (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:COULEURS.navy }}>📅 Disponibilités hebdomadaires</div>
                    <div style={{ fontSize:12, color:COULEURS.gris600, marginTop:2 }}>
                      {peutEcrire('dispos') ? 'Cliquez sur un jour pour définir les horaires.' : 'Créneaux déclarés par le professeur.'}
                    </div>
                  </div>
                  {!peutEcrire('dispos') && <BadgeLecture />}
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                  {JOURS.map(j => {
                    const d          = baseDispos()[j] || { actif:false, creneaux:[] };
                    const creneaux   = getCreneaux(d);
                    const aCreneaux  = creneaux.length > 0;
                    const enEdition  = jourEdite === j;

                    return (
                      <div key={j}>
                        {/* ── Ligne principale du jour ── */}
                        <div style={{ display:'flex', alignItems:'flex-start', gap:12, borderRadius: enEdition ? '10px 10px 0 0' : 10, padding:'13px 16px', border:`1.5px solid ${enEdition ? couleur : aCreneaux ? couleur+'40' : COULEURS.gris200}`, background: enEdition ? couleur+'08' : aCreneaux ? couleur+'04' : COULEURS.blanc, transition:'all 0.15s' }}>

                          {/* Point statut + nom */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, width:90, flexShrink:0, paddingTop:2 }}>
                            <div style={{ width:9, height:9, borderRadius:'50%', background: aCreneaux ? COULEURS.succes : COULEURS.gris200, flexShrink:0 }} />
                            <div style={{ fontSize:13, fontWeight:700, color: aCreneaux ? COULEURS.navy : COULEURS.gris400 }}>{JOURS_COURT[j]}</div>
                          </div>

                          {/* Créneaux existants ou message */}
                          <div style={{ flex:1 }}>
                            {aCreneaux ? (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                {creneaux.map((c, ci) => (
                                  <div key={ci} style={{ display:'inline-flex', alignItems:'center', gap:5, background:couleur+'12', border:`1px solid ${couleur+'30'}`, borderRadius:20, padding:'4px 10px 4px 12px' }}>
                                    <span style={{ fontSize:13, fontWeight:700, color:couleur }}>{c.debut} → {c.fin}</span>
                                    <span style={{ fontSize:11, color:COULEURS.gris400, marginLeft:2 }}>
                                      ({parseInt(c.fin) - parseInt(c.debut)}h)
                                    </span>
                                    {peutEcrire('dispos') && (
                                      <button onClick={() => supprimerCreneau(j, ci)}
                                        title="Supprimer ce créneau"
                                        style={{ width:16, height:16, borderRadius:'50%', border:'none', background: COULEURS.rouge+'20', color:COULEURS.rouge, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, lineHeight:1, padding:0, flexShrink:0 }}>
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize:12, color:COULEURS.gris400 }}>Aucun créneau - non disponible</span>
                            )}
                          </div>

                          {/* Boutons actions (superviseur) */}
                          {peutEcrire('dispos') && (
                            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                              <button onClick={() => enEdition ? setJourEdite(null) : ouvrirFormDispo(j)}
                                style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${couleur+'60'}`, background: enEdition ? couleur : couleur+'12', color: enEdition ? '#fff' : couleur, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', transition:'all 0.15s' }}>
                                {enEdition ? '✕ Fermer' : '+ Créneau'}
                              </button>
                              {aCreneaux && (
                                <button onClick={() => retirerJour(j)}
                                  title="Supprimer tous les créneaux du jour"
                                  style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${COULEURS.rouge+'50'}`, background:'#FEF2F2', color:COULEURS.rouge, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                                  🗑
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ── Formulaire ajout créneau (inline sous la ligne) ── */}
                        {enEdition && peutEcrire('dispos') && (
                          <div style={{ border:`1.5px solid ${couleur}`, borderTop:'none', borderRadius:'0 0 12px 12px', background:'#fff', padding:'16px 18px' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:couleur, marginBottom:14 }}>
                              ➕ Ajouter un créneau - <strong>{JOURS_COURT[j]}</strong>
                              {creneaux.length > 0 && <span style={{ fontWeight:500, color:COULEURS.gris600 }}> · {creneaux.length} créneau{creneaux.length>1?'x':''} existant{creneaux.length>1?'s':''}</span>}
                            </div>

                            <div style={{ display:'grid', gridTemplateColumns:'1fr 32px 1fr 80px', gap:10, alignItems:'end', marginBottom:12 }}>
                              {/* Début */}
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Début</div>
                                <select value={formDispo.debut} onChange={e => setFormDispo(f => ({ ...f, debut:e.target.value }))}
                                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${couleur}`, fontSize:14, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, cursor:'pointer' }}>
                                  {CRENEAUX.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>

                              <div style={{ textAlign:'center', fontSize:18, color:COULEURS.gris400, paddingBottom:8 }}>→</div>

                              {/* Fin */}
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:COULEURS.gris600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Fin</div>
                                <select value={formDispo.fin} onChange={e => setFormDispo(f => ({ ...f, fin:e.target.value }))}
                                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid ${couleur}`, fontSize:14, fontWeight:700, fontFamily:'"Plus Jakarta Sans", sans-serif', color:COULEURS.navy, background:COULEURS.blanc, cursor:'pointer' }}>
                                  {CRENEAUX.filter(h => h > formDispo.debut).map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>

                              {/* Durée */}
                              <div style={{ paddingBottom:2 }}>
                                {formDispo.fin > formDispo.debut && (
                                  <div style={{ background:couleur+'12', color:couleur, borderRadius:8, padding:'10px 8px', fontSize:13, fontWeight:800, textAlign:'center' }}>
                                    {parseInt(formDispo.fin) - parseInt(formDispo.debut)}h
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Prévisualisation */}
                            {formDispo.fin > formDispo.debut && (
                              <div style={{ background:couleur+'08', border:`1px dashed ${couleur+'50'}`, borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:couleur, fontWeight:600 }}>
                                Nouveau créneau : <strong>{formDispo.debut} → {formDispo.fin}</strong> · {parseInt(formDispo.fin)-parseInt(formDispo.debut)}h de cours
                              </div>
                            )}

                            <div style={{ display:'flex', gap:8 }}>
                              <button onClick={ajouterCreneau}
                                disabled={!formDispo.debut || !formDispo.fin || formDispo.fin <= formDispo.debut}
                                style={{ padding:'8px 20px', borderRadius:8, border:'none', background: formDispo.fin > formDispo.debut ? couleur : COULEURS.gris200, color:'#fff', fontSize:13, fontWeight:700, cursor: formDispo.fin > formDispo.debut ? 'pointer' : 'not-allowed', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                                ✅ Ajouter ce créneau
                              </button>
                              <button onClick={() => setJourEdite(null)}
                                style={{ padding:'8px 16px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                                Fermer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Résumé semaine */}
                <div style={{ background:COULEURS.blanc, borderRadius:12, padding:'16px 18px', border:`1px solid ${COULEURS.gris200}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Récapitulatif de la semaine</div>
                    <div style={{ fontSize:22, fontWeight:800, color:couleur }}>
                      {nbDispos} <span style={{ fontSize:12, fontWeight:500, color:COULEURS.gris600 }}>jour{nbDispos!==1?'s':''}</span>
                    </div>
                  </div>
                  {JOURS.map(j => {
                    const cr = getCreneaux(baseDispos()[j]);
                    if (cr.length === 0) return null;
                    return (
                      <div key={j} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:`1px solid ${COULEURS.gris100}` }}>
                        <span style={{ width:40, fontSize:12, fontWeight:700, color:COULEURS.navy }}>{JOURS_COURT[j]}</span>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {cr.map((c, ci) => (
                            <span key={ci} style={{ padding:'2px 10px', borderRadius:20, background:couleur+'12', color:couleur, fontSize:12, fontWeight:700 }}>
                              {c.debut} → {c.fin}
                            </span>
                          ))}
                        </div>
                        <span style={{ marginLeft:'auto', fontSize:11, color:COULEURS.gris400 }}>
                          {cr.reduce((s,c) => s + parseInt(c.fin) - parseInt(c.debut), 0)}h total
                        </span>
                      </div>
                    );
                  })}
                  {nbDispos === 0 && <div style={{ fontSize:12, color:COULEURS.gris400 }}>Aucune disponibilité définie pour la semaine.</div>}
                </div>

                {peutEcrire('dispos') && dispoLocal && (
                  <div style={{ marginTop:12, padding:'10px 14px', background:'#D1FAE5', borderRadius:8, border:'1px solid #6EE7B7', fontSize:12, color:'#065F46', fontWeight:600 }}>
                    ✅ Disponibilités modifiées - changements enregistrés localement
                  </div>
                )}
              </>
            );
          })()}

          {tab === 'statut' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:700, color:COULEURS.navy }}>Activité & présence</span>
                {!peutEcrire('statut') && <BadgeLecture />}
              </div>
              <div style={{ background: prof.est_actif?'#D1FAE5':'#FEE2E2', border:`1px solid ${prof.est_actif?'#6EE7B7':'#FECACA'}`, borderRadius:12, padding:'16px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ fontSize:36 }}>{prof.est_actif ? '✅' : '⛔'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:800, color: prof.est_actif?'#065F46':'#991B1B' }}>
                    {prof.est_actif ? 'Professeur Actif' : 'Professeur Inactif'}
                  </div>
                  <div style={{ fontSize:12, color: prof.est_actif?'#059669':'#DC2626', marginTop:2 }}>
                    {contrat.conge ? '📅 En congé actuellement' : prof.est_actif ? 'En service - sessions en cours' : 'Hors service'}
                  </div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
                {[
                  { l:'Sessions ce mois', v: sessionsMois,                 c: couleur        },
                  { l:'Sessions totales', v: contrat.nb_sessions_total||0, c: COULEURS.navy  },
                  { l:'Absences ce mois', v: nbAbsences,                   c: nbAbsences>0?COULEURS.rouge:COULEURS.succes },
                ].map(k => (
                  <div key={k.l} style={{ background:COULEURS.blanc, borderRadius:10, padding:'14px', border:`1px solid ${COULEURS.gris200}`, textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div>
                    <div style={{ fontSize:11, color:COULEURS.gris600, marginTop:4 }}>{k.l}</div>
                  </div>
                ))}
              </div>

              {/* Action superviseur : signaler une absence */}
              {peutEcrire('statut') && (
                <div style={{ background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 18px', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:10 }}>⚠️ Signalement d'absence - Superviseur</div>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <button onClick={() => setAbsences(n => (n ?? nbAbsences) + 1)}
                      style={{ padding:'7px 14px', borderRadius:8, border:'none', background:COULEURS.rouge, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
                      + Signaler une absence
                    </button>
                    <button onClick={() => setAbsences(n => Math.max(0, (n ?? nbAbsences) - 1))}
                      disabled={(absences ?? nbAbsences) <= 0}
                      style={{ padding:'7px 14px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:COULEURS.blanc, color:COULEURS.gris600, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif', opacity:(absences??nbAbsences)<=0?0.4:1 }}>
                      − Corriger
                    </button>
                    <span style={{ fontSize:12, color:'#92400E', fontWeight:600 }}>
                      Total : <strong>{absences ?? nbAbsences}</strong> absence{(absences??nbAbsences)!==1?'s':''} ce mois
                    </span>
                  </div>
                  {(absences !== null) && (
                    <div style={{ fontSize:11, color:COULEURS.succes, fontWeight:600, marginTop:8 }}>✅ Modification enregistrée localement</div>
                  )}
                </div>
              )}

              <div style={{ background:COULEURS.blanc, borderRadius:12, padding:'14px 16px', border:`1px solid ${COULEURS.gris200}` }}>
                <div style={{ fontSize:12, fontWeight:700, color:COULEURS.navy, marginBottom:12 }}>📅 Disponibilités hebdomadaires</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
                  {JOURS.map(j => {
                    const cr     = getCreneaux(baseDispos()[j]);
                    const actif  = cr.length > 0;
                    return (
                      <div key={j} style={{ textAlign:'center', padding:'10px 4px', borderRadius:10, background: actif?couleur+'15':COULEURS.gris100, border:`1.5px solid ${actif?couleur+'40':COULEURS.gris200}` }}>
                        <div style={{ fontSize:11, fontWeight:700, color: actif?couleur:COULEURS.gris400 }}>{JOURS_COURT[j]}</div>
                        <div style={{ fontSize:14, marginTop:4 }}>{actif ? `${cr.length}×` : '–'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 22px', borderTop:`1px solid ${COULEURS.gris200}`, display:'flex', justifyContent:'flex-end', background:COULEURS.blanc, flexShrink:0 }}>
          <button onClick={onFermer} style={{ padding:'9px 20px', borderRadius:8, border:`1.5px solid ${COULEURS.gris200}`, background:'transparent', color:COULEURS.gris600, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
