/**
 * Moteur de détection des alertes automatiques.
 * Analyse les données mock et retourne les alertes actives.
 *
 * 4 règles métier :
 *   A1 - Absence apprenant × 2 sessions consécutives → parent + Customer Care
 *   A2 - Devoir non rendu après date limite         → apprenant + parent
 *   A3 - Note < 40%                                 → professeur + E-learning
 *   A4 - Absence prof non signalée 24h avant cours  → Superviseur
 */

import { MOCK_APPRENANTS } from '../mock/apprenants';
import { MOCK_SESSIONS }   from '../mock/sessions';
import { MOCK_NOTES, MOCK_PRESENCES } from '../mock/notes';
import { MOCK_DEVOIRS }    from '../mock/contenus';

// Tableau interne des noms professeurs (pour lisibilité des alertes)
const NOMS_PROFS = {
  'teacher-001': 'Marie Dupont',
  'teacher-002': 'Pierre Martin',
  'teacher-003': 'Aurélie Bernard',
  'teacher-004': 'Sophie Leclerc',
};

/** Formate une date en français */
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Détecte toutes les alertes actives et retourne un tableau d'objets alerte.
 * Chaque alerte a : { id, type, gravite, titre, message, date, lien, destinataires[] }
 * destinataires : 'apprenant'|'parent'|'professeur'|'admin_customer_care'|'admin_elearning'|'admin_superviseur'
 */
export function detecterAlertes() {
  const alertes = [];
  const now = new Date('2026-06-03T12:00:00Z'); // date de référence (aujourd'hui dans le mock)

  // ── A1 : Absence apprenant × 2 sessions consécutives ─────────────────────
  MOCK_APPRENANTS.forEach(app => {
    // Récupérer toutes les présences de cet apprenant, triées par session
    const presencesApp = MOCK_PRESENCES.filter(p => p.apprenant_id === app.id);
    const absences     = presencesApp.filter(p => p.statut === 'absent');

    // On considère ≥2 absences dans les données comme "consécutives" (simplifié)
    if (absences.length >= 2) {
      const sessionsIds = absences.map(a => a.session_id);
      alertes.push({
        id:           `a1-${app.id}`,
        type:         'absence_consecutive',
        gravite:      'critique',
        icone:        '🔴',
        titre:        `Absences consécutives - ${app.prenom} ${app.nom}`,
        message:      `${app.prenom} ${app.nom} est absent(e) à ${absences.length} sessions consécutives (sessions ${sessionsIds.join(', ')}). Un suivi urgent est recommandé.`,
        date:         now.toISOString(),
        lien_parent:  '/parent/presences',
        lien_admin:   '/admin/support/tickets',
        destinataires: ['parent', 'admin_customer_care'],
        apprenant:    app,
      });
    }
  });

  // ── A2 : Devoir non rendu après date limite ───────────────────────────────
  MOCK_DEVOIRS.forEach(dev => {
    if (dev.statut !== 'a_rendre') return;
    if (!dev.date_limite) return;
    const dateLimite = new Date(dev.date_limite);
    if (dateLimite >= now) return; // pas encore expiré

    const app = MOCK_APPRENANTS.find(a => a.id === dev.apprenant_id);
    if (!app) return;

    const retardJours = Math.floor((now - dateLimite) / (1000 * 60 * 60 * 24));

    alertes.push({
      id:           `a2-${dev.id}`,
      type:         'devoir_non_rendu',
      gravite:      retardJours > 5 ? 'critique' : 'warning',
      icone:        '📝',
      titre:        `Devoir non rendu - ${app.prenom} ${app.nom}`,
      message:      `${app.prenom} ${app.nom} n'a pas rendu son devoir (délai expiré le ${fmtDate(dev.date_limite)}). Retard : ${retardJours} jour${retardJours > 1 ? 's' : ''}.`,
      date:         now.toISOString(),
      lien_apprenant: '/apprenant/devoirs',
      lien_parent:  '/parent/devoirs',
      destinataires: ['apprenant', 'parent'],
      apprenant:    app,
      devoir:       dev,
    });
  });

  // ── A3 : Note < 40% ──────────────────────────────────────────────────────
  MOCK_NOTES.forEach(note => {
    const pct = note.note / note.note_max;
    if (pct >= 0.40) return;

    const app  = MOCK_APPRENANTS.find(a => a.id === note.apprenant_id);
    if (!app) return;
    const pctStr = Math.round(pct * 100);

    alertes.push({
      id:           `a3-${note.id}`,
      type:         'note_faible',
      gravite:      pct < 0.25 ? 'critique' : 'warning',
      icone:        '📉',
      titre:        `Note insuffisante - ${app.prenom} ${app.nom}`,
      message:      `${app.prenom} ${app.nom} a obtenu ${note.note}/${note.note_max} (${pctStr}%) en ${note.competence} - en dessous du seuil de 40%. Une intervention pédagogique est recommandée.`,
      date:         note.created_at || now.toISOString(),
      lien_prof:    '/professeur/notes',
      lien_admin:   '/admin/elearning/programme',
      destinataires: ['professeur_titulaire', 'professeur_remplacant', 'admin_elearning', 'admin_pa_advisor'],
      apprenant:    app,
      note,
    });
  });

  // ── A4 : Absence prof non signalée 24h avant cours ──────────────────────
  MOCK_SESSIONS.forEach(ses => {
    if (ses.statut !== 'planifiee') return;
    if (ses.professeur_confirme !== false) return; // seules les sessions explicitement non confirmées

    const dateSession = new Date(`${ses.date_session}T${ses.heure_debut}:00`);
    const diffHeures  = (dateSession - now) / (1000 * 60 * 60);

    // Dans les prochaines 24h et prof non confirmé
    if (diffHeures > 0 && diffHeures <= 48) {
      const nomProf = NOMS_PROFS[ses.professeur_id] || ses.professeur_id;
      alertes.push({
        id:           `a4-${ses.id}`,
        type:         'absence_prof',
        gravite:      diffHeures <= 12 ? 'critique' : 'warning',
        icone:        '👨‍🏫',
        titre:        `Absence prof non confirmée - ${nomProf}`,
        message:      `${nomProf} n'a pas confirmé sa présence pour la session "${ses.titre}" le ${fmtDate(ses.date_session)} à ${ses.heure_debut}. Il reste ${Math.round(diffHeures)}h avant le cours. Un remplaçant doit être trouvé.`,
        date:         now.toISOString(),
        lien_admin:   '/admin/superviseur/remplacements',
        destinataires: ['admin_superviseur'],
        session:      ses,
        professeur:   nomProf,
      });
    }
  });

  return alertes;
}

/**
 * Filtre les alertes pour un rôle donné.
 */
export function alertesPourRole(role) {
  return detecterAlertes().filter(a => a.destinataires.includes(role));
}

/**
 * Filtre les alertes pour un apprenant donné (vue parent).
 */
export function alertesPourApprenant(apprenantId) {
  return detecterAlertes().filter(a =>
    a.apprenant?.id === apprenantId &&
    (a.destinataires.includes('apprenant') || a.destinataires.includes('parent'))
  );
}
