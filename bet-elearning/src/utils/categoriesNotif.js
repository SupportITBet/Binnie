/**
 * Catégories métier des notifications.
 *
 * La direction - SuperAdmin et Administrateur - reçoit désormais TOUTE notification de rôle
 * (ROLES_DIRECTION dans Backend/src/services/notifyRole.js), et le cloisonnement par
 * plateforme a été levé : chaque séance créée, chaque remplacement, chaque test passe
 * maintenant dans la même liste. Sans regroupement, cette exhaustivité rend la cloche
 * illisible et ce qui compte se noie dans ce qui défile.
 *
 * On classe sur le `type` de la notification ET sur son titre : `type` est un champ libre
 * rempli au point d'appel, il porte une soixantaine de valeurs différentes dont certaines
 * ne disent rien du métier ('info', 'success', 'warning'). Le titre, lui, est toujours
 * explicite. Les deux ensemble rattrapent ce qu'aucun des deux ne couvre seul.
 */

export const CATEGORIES_NOTIF = [
  {
    cle: 'paiements', libelle: 'Paiements', icone: '💰', couleur: '#059669',
    motifs: /paiement|versement|honorair|factur|encaiss|depense|dépense|tresorerie|trésorerie|tva|impay|solde|remboursement|devis/i,
  },
  {
    cle: 'inscriptions', libelle: 'Inscriptions & tests', icone: '📝', couleur: '#7C3AED',
    motifs: /inscription|placement|test|niveau|dossier|parcours|prospect|lead|candidat|assign/i,
  },
  {
    cle: 'classes', libelle: 'Classes & séances', icone: '🏫', couleur: '#0369A1',
    motifs: /classe|groupe|cours|seance|séance|session|planning|devoir|absence|presence|présence|transfert|sortie/i,
  },
  {
    cle: 'coachs', libelle: 'Coachs', icone: '👨‍🏫', couleur: '#C2410C',
    motifs: /coach|professeur|remplac|observation|evaluation|évaluation|contrat_coach|disponibilit/i,
  },
  {
    cle: 'entreprises', libelle: 'Entreprises', icone: '🏢', couleur: '#B45309',
    motifs: /entreprise|corporate|beneficiaire|bénéficiaire|contrat|renouvellement|rh /i,
  },
];

export const CATEGORIE_AUTRE = { cle: 'autres', libelle: 'Autres', icone: '📬', couleur: '#64748B' };

/**
 * Range une notification dans une catégorie. L'ORDRE DU TABLEAU FAIT FOI : une notification
 * « Versement entreprise validé » touche les deux, et c'est l'argent qui prime - c'est ce
 * qu'on cherche quand on filtre sur Paiements. Ne pas réordonner sans y penser.
 */
export function categorieNotif(notif) {
  /* `type_origine` d'abord : `type` a été ramené par le contexte à trois états
     d'affichage (alerte / succes / info) qui ne disent rien du métier. Le titre
     complète, car certains points d'appel se contentent d'un type générique. */
  const texte = `${notif?.type_origine || notif?.type || ''} ${notif?.titre || ''}`;
  return CATEGORIES_NOTIF.find(c => c.motifs.test(texte)) || CATEGORIE_AUTRE;
}

/** Compte les notifications par catégorie, pour pastiller les onglets de filtre. */
export function compterParCategorie(notifs = []) {
  const compte = {};
  for (const n of notifs) {
    const c = categorieNotif(n).cle;
    compte[c] = (compte[c] || 0) + 1;
  }
  return compte;
}

/** Étiquette d'origine : la `source` ne filtre plus, elle informe. */
export function libelleSource(source) {
  if (source === 'bet-elearning') return { lib: 'E-Learning', couleur: '#0369A1' };
  if (source === 'dash')          return { lib: 'BET', couleur: '#7C3AED' };
  return null;
}
