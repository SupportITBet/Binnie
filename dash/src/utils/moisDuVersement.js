/**
 * Retrouver le mois qu'un versement solde.
 *
 * `paiements_parcours` enregistre une date d'encaissement, jamais le mois de cours réglé.
 * Or les deux divergent dès qu'un apprenant paie en plusieurs fois : un plan à
 * 100 000 F/mois réglé par tranches de 50 000 F prend un mois de retard par mois, si bien
 * qu'un versement encaissé le 1er août peut solder le mois de février. Lu sans cette
 * mention, l'écran des versements se confond avec l'échéancier - « août » y désigne la
 * date d'encaissement, pas le mois facturé.
 *
 * Le rapprochement se fait sur la référence, seul lien réellement présent des deux côtés :
 * la tranche du plan et la ligne de paiement portent la même (« TP-5676 »). Pas de
 * migration, et le rapprochement reste exact même si les dates dérivent.
 */

const norm = (v) => String(v ?? "").trim().toUpperCase();

/**
 * @param {object} paiement    ligne de `paiements_parcours` (ref_transaction, id…)
 * @param {object} plan        le `plan_paiement` du dossier
 * @returns {{ periode: string, label: string } | null} null si non rapprochable
 */
export function moisDuVersement(paiement, plan) {
  // Quand la colonne `mois_label` est renseignée, elle fait foi : c'est la saisie
  // explicite de la commerciale, plus fiable qu'une déduction par référence.
  const direct = String(paiement?.mois_label ?? "").trim();
  if (direct) {
    const m = (plan?.mois_paiements || []).find((x) => x.label === direct || x.periode === direct);
    return { periode: m?.periode || direct, label: m?.label || direct };
  }

  const ref = norm(paiement?.ref_transaction);
  const pid = norm(paiement?.id);
  if (!ref && !pid) return null;

  for (const mois of plan?.mois_paiements || []) {
    for (const t of mois.tranches || []) {
      // `paiement_id` est posé par le webhook TouchPoint, `ref` par les imports et la
      // saisie manuelle : on accepte les deux plutôt que d'en privilégier un.
      const correspond =
        (ref && (norm(t.ref) === ref || norm(t.reference) === ref)) ||
        (pid && norm(t.paiement_id) === pid);
      if (correspond) return { periode: mois.periode, label: mois.label || mois.periode };
    }
  }
  return null;
}

/** Le libellé prêt à afficher sous un versement, ou "" s'il n'est pas rapprochable. */
export function libelleMoisSolde(paiement, plan) {
  const m = moisDuVersement(paiement, plan);
  return m ? `Solde : ${m.label}` : "";
}
