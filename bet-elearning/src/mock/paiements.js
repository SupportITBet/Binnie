import { MOCK_SESSIONS, MOCK_GROUPES } from './sessions';
import { MOCK_REMPLACEMENTS } from './remplacements';

// ── Tarifs horaires en FCFA ──────────────────────────────────────────────────
export const TARIFS = {
  professeur_titulaire:  7500,  // FCFA/heure
  professeur_remplacant: 6000,  // FCFA/heure (pas de préparation pédagogique)
};

// ── Calcul durée en heures depuis heure_debut / heure_fin ────────────────────
export function calculerDuree(heureDebut, heureFin) {
  if (!heureDebut || !heureFin) return 0;
  const [hD, mD] = heureDebut.split(':').map(Number);
  const [hF, mF] = heureFin.split(':').map(Number);
  return Math.max(0, (hF * 60 + mF - (hD * 60 + mD)) / 60);
}

export function fmtFCFA(montant) {
  return new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA';
}

// ── Générer les lignes de paiement depuis les sessions réalisées ─────────────
function genererPaiements() {
  const lignes = [];

  // Sessions titulaires réalisées
  MOCK_SESSIONS
    .filter(s => s.statut === 'realisee')
    .forEach(s => {
      const groupe  = MOCK_GROUPES.find(g => g.id === s.groupe_id);
      const duree   = calculerDuree(s.heure_debut, s.heure_fin);
      const tarif   = TARIFS.professeur_titulaire;
      const montant = Math.round(duree * tarif);

      // Vérifier si cette session est aussi dans une délégation terminée (remplaçant)
      const delegRemplacement = MOCK_REMPLACEMENTS.find(r =>
        r.sessions_ids?.includes(s.id) && r.remplacant_id && r.statut === 'termine'
      );

      if (delegRemplacement) {
        // Session couverte par un remplaçant → paiement au remplaçant
        lignes.push({
          id:               `pay-remp-${s.id}`,
          professeur_id:    delegRemplacement.remplacant_id,
          professeur_nom:   delegRemplacement.remplacant,
          type_prof:        'professeur_remplacant',
          session_id:       s.id,
          session_titre:    s.titre,
          groupe_id:        s.groupe_id,
          groupe_nom:       groupe?.nom || '-',
          date_session:     s.date_session,
          heure_debut:      s.heure_debut,
          heure_fin:        s.heure_fin,
          duree_heures:     duree,
          tarif_horaire:    TARIFS.professeur_remplacant,
          montant:          Math.round(duree * TARIFS.professeur_remplacant),
          statut:           'valide',
          remplacement_id:  delegRemplacement.id,
          titulaire_absent_id: delegRemplacement.absent_id,
          titulaire_absent_nom: delegRemplacement.absent,
          date_validation:  '2026-05-30',
          date_paiement:    null,
          _delegation:      true,
        });
      } else {
        // Session ordinaire titulaire
        lignes.push({
          id:               `pay-tit-${s.id}`,
          professeur_id:    s.professeur_id,
          professeur_nom:   s.professeur_id === 'teacher-001' ? 'Marie Dupont'
                          : s.professeur_id === 'teacher-002' ? 'Pierre Martin'
                          : s.professeur_id === 'teacher-003' ? 'Sophie Leclerc'
                          : 'Professeur',
          type_prof:        'professeur_titulaire',
          session_id:       s.id,
          session_titre:    s.titre,
          groupe_id:        s.groupe_id,
          groupe_nom:       groupe?.nom || '-',
          date_session:     s.date_session,
          heure_debut:      s.heure_debut,
          heure_fin:        s.heure_fin,
          duree_heures:     duree,
          tarif_horaire:    tarif,
          montant:          montant,
          statut:           s.date_session < '2026-06-01' ? 'paye' : 'en_attente',
          remplacement_id:  null,
          titulaire_absent_id: null,
          titulaire_absent_nom: null,
          date_validation:  s.date_session < '2026-06-01' ? '2026-05-31' : null,
          date_paiement:    s.date_session < '2026-06-01' ? '2026-05-31' : null,
          _delegation:      false,
        });
      }
    });

  return lignes;
}

export const MOCK_PAIEMENTS = genererPaiements();
