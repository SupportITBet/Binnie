/**
 * Catalogue des offres - source unique pour toute liste de filières.
 *
 * Pourquoi ce module existe : la liste des filières proposée à la création d'une classe
 * était écrite en dur dans chaque dashboard (« Anglais Pro », « Business English »,
 * « TOEIC Prep »…). Aucune de ces valeurs n'existait au catalogue réel, alors que
 * `inscription_offre` - dérivé de la filière de la classe - est la clé qui relie un
 * dossier à son offre dans « Offres & Formations ». Chaque classe créée à la main
 * produisait donc des inscriptions « hors catalogue », dont le chiffre d'affaires était
 * exclu des statistiques sans que personne ne le voie.
 *
 * Le catalogue vit dans `plateforme_config` et se modifie depuis la configuration
 * SuperAdmin : le lire ici, plutôt que de le recopier, garantit que les listes suivent.
 */

/**
 * Libellés d'offres du catalogue, triés, sans doublon.
 * Retourne [] en cas d'échec - l'appelant décide quoi faire, plutôt que de recevoir
 * une liste de repli inventée qui recréerait le problème d'origine.
 */
export async function chargerFilieresCatalogue(apiUrl, token) {
  try {
    const r = await fetch(`${apiUrl}/api/admin/catalogue-offres`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    const d = await r.json().catch(() => ({}));
    const labels = (d.offres || []).map((o) => o.label).filter(Boolean);
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b, "fr"));
  } catch {
    return [];
  }
}
