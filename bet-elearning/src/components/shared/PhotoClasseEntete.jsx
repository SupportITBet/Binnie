import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { COULEURS } from '../../constants/couleurs';
import { envoyerFichier } from '../../utils/uploadFichier';
import PastilleGroupe from './PastilleGroupe';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';

/**
 * La photo d'une classe e-learning, en tête de sa fiche ou de son fil de discussion.
 *
 * DEUX USAGES, UN SEUL COMPOSANT. Là où l'on a le droit de modifier la classe, la photo se
 * change d'ici sans rouvrir le formulaire : c'est le geste attendu, on regarde la fiche et
 * on corrige l'image au passage. Partout ailleurs - le fil de la classe côté apprenant, le
 * chat du coach - elle s'affiche et s'agrandit, sans plus. La différence tient à un droit,
 * pas à un rendu : deux composants auraient fini par ne plus montrer la même chose au même
 * endroit.
 *
 * L'ENREGISTREMENT EST IMMÉDIAT. Un PATCH part dès l'image déposée, et `onChange` remonte
 * la nouvelle URL pour que l'écran hôte se mette à jour sans rechargement. On ne garde pas
 * la photo « en attente » d'un bouton Enregistrer : ces fiches n'en ont pas, et une image
 * choisie qui ne serait pas partie se perdrait à la fermeture sans que rien ne le dise.
 *
 * @param {object} classe       la classe : { id, nom, photo_url }
 * @param {boolean} modifiable  affiche le crayon et autorise le remplacement
 * @param {(url:string|null) => void} onChange  appelé après enregistrement réussi
 * @param {number} taille
 * @param {string} accent
 */
export default function PhotoClasseEntete({ classe, modifiable = false, onChange, taille = 54, accent = '#fff' }) {
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  const enregistrer = async (url) => {
    const r = await fetch(`${API_URL}/api/classes-elearning/${classe.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${jeton()}`, 'Content-Type': 'application/json', 'X-Plateforme': 'bet-elearning' },
      body: JSON.stringify({ photo_url: url }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Enregistrement impossible');
    // La classe est bien modifiée, mais la colonne n'existe pas encore : le dire, sinon
    // l'image semble avoir disparu sans raison.
    if (d.photo_non_enregistree) { toast.error(d.photo_non_enregistree, { duration: 8000 }); return; }
    onChange?.(url);
    toast.success(url ? 'Photo de la classe mise à jour ✓' : 'Photo retirée');
  };

  const choisir = async (fichier) => {
    if (!fichier) return;
    setEnvoi(true);
    try {
      const envoye = await envoyerFichier(fichier, 'avatar');
      if (!envoye?.url) throw new Error('Image non déposée');
      await enregistrer(envoye.url);
    } catch (e) {
      toast.error(e.message || 'Photo impossible à enregistrer');
    } finally {
      setEnvoi(false);
      // Autorise à re-choisir le MÊME fichier après un échec.
      if (champ.current) champ.current.value = '';
    }
  };

  const retirer = async () => {
    setEnvoi(true);
    try { await enregistrer(null); }
    catch (e) { toast.error(e.message || 'Retrait impossible'); }
    finally { setEnvoi(false); }
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: taille, height: taille }}>
      <div style={{
        width: taille, height: taille, borderRadius: '50%', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: envoi ? 0.5 : 1,
      }}>
        {/* `agrandissable` : la vignette ne montre rien d'une photo de classe, et
            l'agrandir est le geste attendu partout ailleurs. */}
        <PastilleGroupe nom={classe?.nom} url={classe?.photo_url} taille={taille} accent={accent} agrandissable />
      </div>

      {modifiable && (
        <>
          <button type="button" disabled={envoi}
            onClick={() => champ.current?.click()}
            title={classe?.photo_url ? 'Changer la photo de la classe' : 'Ajouter une photo à la classe'}
            style={{
              position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: '50%',
              border: `2px solid ${COULEURS.blanc}`, background: COULEURS.navy, color: '#fff', fontSize: 10,
              lineHeight: 1, cursor: envoi ? 'default' : 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            {envoi ? '…' : '✏️'}
          </button>
          {classe?.photo_url && !envoi && (
            <button type="button" onClick={retirer} title="Retirer la photo"
              style={{
                position: 'absolute', top: -3, right: -3, width: 20, height: 20, borderRadius: '50%',
                border: `2px solid ${COULEURS.blanc}`, background: '#B91C1C', color: '#fff', fontSize: 9,
                lineHeight: 1, cursor: 'pointer', padding: 0,
              }}>✕</button>
          )}
          <input ref={champ} type="file" accept="image/*" hidden
            onChange={e => choisir(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}
