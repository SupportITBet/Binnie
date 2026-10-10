import { categorieCoach, BAREME_TEXTE, TENDANCES } from '../../utils/categorieCoach';

/**
 * Le badge de catégorie de contrat d'un coach, déduit de sa note moyenne d'observation.
 *
 * Quatre tailles parce que le badge se pose dans des contextes très différents : une
 * cellule de tableau serrée, une ligne de classement, l'en-tête d'un dossier. Une seule
 * taille aurait obligé chaque écran à surcharger le style, et le badge aurait fini par
 * différer d'un écran à l'autre.
 *
 * `note` absente ou nulle → « Non évalué », en gris : un coach jamais observé n'est pas
 * un coach mal noté, et le montrer en rouge serait un contresens.
 *
 * Pendant de `dash/src/Components/BadgeCategorieCoach.jsx` - même rendu des deux côtés,
 * pour qu'une même personne reconnaisse le même verdict d'une plateforme à l'autre.
 */
export default function BadgeCategorieCoach({ note, taille = 'md', avecNote = false, style = {} }) {
  const cat = categorieCoach(note);

  const tailles = {
    xs: { fontSize: 8.5, padding: '1px 5px',  radius: 5, poids: 800 },
    sm: { fontSize: 9.5, padding: '2px 7px',  radius: 6, poids: 800 },
    md: { fontSize: 11,  padding: '3px 10px', radius: 7, poids: 800 },
    lg: { fontSize: 13,  padding: '5px 14px', radius: 8, poids: 900 },
  };
  const t = tailles[taille] || tailles.md;

  // Sur les petites tailles le libellé complet déborde des cellules : on garde la forme
  // abrégée, le titre au survol portant le texte entier.
  const libelle = (taille === 'xs' && cat.court) ? cat.court : cat.libelle;

  return (
    <span
      title={`${cat.libelle} - ${BAREME_TEXTE}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: cat.fond, color: cat.couleur,
        border: `1px solid ${cat.bord}`,
        borderRadius: t.radius, padding: t.padding,
        fontSize: t.fontSize, fontWeight: t.poids,
        lineHeight: 1.4, whiteSpace: 'nowrap', cursor: 'help',
        ...style,
      }}
    >
      {avecNote && Number(note) > 0 && (
        <strong style={{ fontWeight: 900 }}>{Number(note).toFixed(1)}</strong>
      )}
      {libelle}
    </span>
  );
}

/**
 * La flèche de tendance, colorée.
 *
 * Elle accompagne toujours une note : seule, une flèche verte ne dit pas de quoi elle
 * parle. Sous deux observations il n'y a pas de tendance mesurable - on l'annonce dans
 * l'infobulle plutôt que d'afficher « stable », qui serait une affirmation gratuite.
 */
export function FlecheTendance({ tendance = 'stable', nbNotes = 0, taille = 15 }) {
  const t = TENDANCES[tendance] || TENDANCES.stable;
  const mesurable = nbNotes >= 2;
  return (
    <span
      title={mesurable
        ? `${t.libelle} — dernière observation comparée à la première de la période`
        : 'Tendance non mesurable : une seule observation'}
      style={{ fontSize: taille, fontWeight: 800, color: mesurable ? t.couleur : '#cbd5e1',
        width: taille + 7, textAlign: 'center', display: 'inline-block', cursor: 'help' }}>
      {mesurable ? t.icone : '·'}
    </span>
  );
}
