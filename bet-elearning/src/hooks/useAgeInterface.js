import { COULEURS } from '../constants/couleurs';

export function useAgeInterface(apprenant) {
  const tranche       = apprenant?.tranche_age || 'adulte';
  const estEnfant     = tranche === 'enfant';
  const estAdolescent = tranche === 'adolescent';
  const estAdulte     = tranche === 'adulte';

  // Clé de menu pour TopNavLayout
  const menuRole = estEnfant     ? 'apprenant_enfant'
    : estAdolescent              ? 'apprenant_adolescent'
    : 'apprenant_adulte';

  // Couleurs
  const couleurPrimaire   = estEnfant ? COULEURS.orangeEnfant : estAdolescent ? '#8B5CF6' : COULEURS.cyan;
  const couleurSecondaire = estEnfant ? '#FCD34D'             : estAdolescent ? '#EC4899' : COULEURS.cyanFonce;
  const fondPage          = estEnfant ? '#FFF7ED'             : estAdolescent ? '#F5F3FF' : '#F8FAFC';

  // Styles carte KPI
  const styleCarte = estEnfant ? {
    background: 'linear-gradient(135deg, #FCD34D 0%, #F97316 100%)',
    borderRadius: 20, padding: 24,
    boxShadow: '0 8px 24px rgba(249,115,22,0.25)', border: 'none',
  } : {
    background: '#FFFFFF', borderRadius: 12, padding: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0',
  };

  const styleTitre = estEnfant ? {
    fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: 22, fontWeight: 900, color: '#0F172A',
  } : {
    fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: 16, fontWeight: 700, color: '#0F172A',
  };

  // Libellés adaptés par tranche d'âge
  const libelles = estEnfant ? {
    salutation:    (p) => `Bonjour ${p} ! 👋`,
    sousTexte:     'Prêt(e) à apprendre aujourd\'hui ? 🚀',
    prochainCours: '⏰ Ton prochain cours',
    mesCours:      '📚 Mes cours',
    devoirs:       '📝 Tes devoirs',
    badges:        '⭐ Tes badges',
    rejoindre:     '🚀 Rejoindre !',
  } : estAdolescent ? {
    salutation:    (p) => `Salut ${p} !`,
    sousTexte:     'Continue sur ta lancée 💪',
    prochainCours: '📅 Prochain cours',
    mesCours:      '📖 Mes cours',
    devoirs:       '📝 Devoirs à rendre',
    badges:        '🏅 Mes badges',
    rejoindre:     '🎥 Rejoindre',
  } : {
    salutation:    (p) => `Bonjour, ${p}`,
    sousTexte:     'Votre espace de formation professionnelle.',
    prochainCours: '📅 Prochain cours',
    mesCours:      '📖 Mes cours',
    devoirs:       '📝 Devoirs',
    badges:        '🏅 Badges',
    rejoindre:     'Rejoindre',
  };

  return {
    tranche, estEnfant, estAdolescent, estAdulte, menuRole,
    couleurPrimaire, couleurSecondaire, fondPage,
    styleCarte, styleTitre, libelles,
    // Rétrocompatibilité
    afficherMascotte:     estEnfant,
    afficherGamification: estEnfant || estAdolescent,
  };
}
