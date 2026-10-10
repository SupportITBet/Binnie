import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';
import { envoyerFichier } from '../../utils/uploadFichier';
import PastilleGroupe from './PastilleGroupe';

/**
 * Le champ « photo » d'une classe e-learning : un aperçu, un téléversement, un retrait.
 *
 * Pendant de `dash/src/Components/ChampPhotoClasse.jsx`, pour les classes de cette
 * plateforme. Les deux bases ne sont pas liées - une classe e-learning vit dans
 * `classes_elearning`, une classe présentiel dans `groupes` - mais le geste est le même, et
 * il doit le rester : une même personne passe d'un écran à l'autre.
 *
 * LA PHOTO EST CELLE DE LA CLASSE *ET* DE SON FIL DE DISCUSSION. Renseigner ce champ habille
 * donc aussi la conversation de la classe, ce qui est exactement le but : un apprenant ne
 * doit pas voir deux visuels différents désigner le même endroit.
 *
 * ICI RIEN N'EST ENREGISTRÉ : le composant remonte l'URL par `onChange`, et c'est le
 * formulaire hôte qui l'envoie avec le reste de la classe. Pour changer la photo d'une
 * classe qui existe déjà, voir `PhotoClasseEntete`, qui enregistre immédiatement.
 *
 * @param {string|null} valeur    l'URL actuelle, ou null
 * @param {(url:string|null)=>void} onChange  appelé avec la nouvelle URL, ou null au retrait
 * @param {string} nom            le nom de la classe, pour les initiales à défaut de photo
 * @param {string} accent         la couleur de l'écran hôte
 * @param {boolean} desactive     grise le champ (classe clôturée, droits manquants…)
 */
export default function ChampPhotoClasse({ valeur, onChange, nom = '', accent = COULEURS.cyan, desactive = false }) {
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  const choisir = async (fichier) => {
    if (!fichier) return;
    setEnvoi(true);
    try {
      /* `envoyerFichier` rend un OBJET ({ url, public_id… }), pas une chaîne : l'envoyer
         tel quel ferait refuser l'URL par le serveur. Le piège a déjà été rencontré du
         côté des groupes libres. */
      const envoye = await envoyerFichier(fichier, 'avatar');
      if (!envoye?.url) throw new Error('Image non déposée');
      onChange(envoye.url);
    } catch (e) {
      toast.error(e.message || 'Image impossible à déposer');
    } finally {
      setEnvoi(false);
      // Permet de re-choisir le MÊME fichier après un échec : sans cette remise à zéro, le
      // navigateur considère qu'il n'y a pas eu de changement et ne redéclenche rien.
      if (champ.current) champ.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button type="button" disabled={desactive || envoi}
          onClick={() => champ.current?.click()}
          title={desactive ? undefined : valeur ? 'Changer la photo' : 'Ajouter une photo'}
          style={{
            width: 52, height: 52, borderRadius: '50%',
            border: `1.5px dashed ${desactive ? COULEURS.gris200 : accent + '66'}`,
            background: COULEURS.gris50, padding: 0, overflow: 'hidden', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: desactive || envoi ? 'default' : 'pointer',
          }}>
          {envoi
            ? <span style={{ fontSize: 11, color: COULEURS.gris400, fontWeight: 700 }}>…</span>
            : valeur
              ? <img src={valeur} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <PastilleGroupe nom={nom || '?'} url={null} taille={50} accent={accent} />}
        </button>
        {valeur && !envoi && !desactive && (
          <button type="button" onClick={() => onChange(null)} title="Retirer la photo"
            style={{
              position: 'absolute', top: -3, right: -3, width: 19, height: 19, borderRadius: '50%',
              border: 'none', background: '#B91C1C', color: '#fff', fontSize: 10, lineHeight: 1, cursor: 'pointer',
            }}>✕</button>
        )}
        <input ref={champ} type="file" accept="image/*" hidden disabled={desactive}
          onChange={e => choisir(e.target.files?.[0])} />
      </div>
      <div style={{ fontSize: 11.5, color: COULEURS.gris400, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: COULEURS.gris600 }}>
          Photo de la classe <span style={{ fontWeight: 400 }}>(facultative)</span>
        </div>
        Elle habille aussi le fil de discussion de la classe.
        {!valeur && <> À défaut, les initiales du nom sont affichées.</>}
      </div>
    </div>
  );
}
