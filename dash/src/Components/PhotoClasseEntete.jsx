import React, { useRef, useState } from "react";
import { toast } from "react-toastify";
import { uploadFichier } from "../utils/uploadFichier";
import PastilleGroupe from "./PastilleGroupe";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * La photo d'une classe, en tête de sa modale de détail.
 *
 * DEUX USAGES, UN SEUL COMPOSANT. Chez celles qui créent les classes - assistante présentiel
 * et onboarding - la photo se change d'ici, sans rouvrir le formulaire : c'est le geste
 * attendu, on regarde la fiche et on corrige l'image au passage. Partout ailleurs elle
 * s'affiche et s'agrandit, sans plus. Un seul composant pour les deux, parce que la
 * différence tient à un droit, pas à un rendu : deux copies auraient fini par ne plus
 * afficher la même chose au même endroit.
 *
 * L'ENREGISTREMENT EST IMMÉDIAT. Un PATCH part dès l'image déposée, et `onChange` remonte la
 * nouvelle URL pour que la modale et la liste derrière elle se mettent à jour sans
 * rechargement. On ne garde pas la photo « en attente » d'un bouton Enregistrer : la modale
 * de détail n'en a pas, et une image choisie qui ne serait pas partie se perdrait à la
 * fermeture sans que rien ne le dise.
 *
 * @param {object} groupe      la classe : { id, nom, photo_url }
 * @param {boolean} modifiable  affiche le crayon et autorise le remplacement
 * @param {() => object} authHeaders  les en-têtes d'authentification de l'écran hôte
 * @param {(url:string|null) => void} onChange  appelé après enregistrement réussi
 * @param {number} taille
 */
export default function PhotoClasseEntete({ groupe, modifiable = false, authHeaders, onChange, taille = 54 }) {
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  const enregistrer = async (url) => {
    const r = await fetch(`${API_URL}/api/groupes/${groupe.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ photo_url: url }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "Enregistrement impossible");
    }
    onChange?.(url);
  };

  const choisir = async (fichier) => {
    if (!fichier) return;
    setEnvoi(true);
    try {
      // `uploadFichier` rend un OBJET ({ url, public_id, size… }), pas une chaîne.
      const envoye = await uploadFichier(fichier, "avatar");
      if (!envoye?.url) throw new Error("Image non déposée");
      await enregistrer(envoye.url);
      toast.success("Photo de la classe mise à jour ✓");
    } catch (e) {
      toast.error(e.message || "Photo impossible à enregistrer");
    } finally {
      setEnvoi(false);
      // Autorise à re-choisir le MÊME fichier après un échec.
      if (champ.current) champ.current.value = "";
    }
  };

  const retirer = async () => {
    setEnvoi(true);
    try {
      await enregistrer(null);
      toast.success("Photo retirée");
    } catch (e) {
      toast.error(e.message || "Retrait impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={{ position: "relative", flexShrink: 0, width: taille, height: taille }}>
      <div style={{
        width: taille, height: taille, borderRadius: "50%", overflow: "hidden",
        border: "2px solid rgba(255,255,255,.55)", background: "rgba(255,255,255,.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: envoi ? 0.5 : 1,
      }}>
        {/* `agrandissable` : la vignette ne montre rien d'une photo de classe, et l'agrandir
            est le geste attendu partout ailleurs. */}
        <PastilleGroupe nom={groupe?.nom} url={groupe?.photo_url} taille={taille} accent="#fff" agrandissable />
      </div>

      {modifiable && (
        <>
          <button type="button" disabled={envoi}
            onClick={() => champ.current?.click()}
            title={groupe?.photo_url ? "Changer la photo de la classe" : "Ajouter une photo à la classe"}
            style={{
              position: "absolute", bottom: -3, right: -3, width: 22, height: 22, borderRadius: "50%",
              border: "2px solid #fff", background: "#0f172a", color: "#fff", fontSize: 10,
              lineHeight: 1, cursor: envoi ? "default" : "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", padding: 0,
            }}>
            {envoi ? "…" : "✏️"}
          </button>
          {groupe?.photo_url && !envoi && (
            <button type="button" onClick={retirer} title="Retirer la photo"
              style={{
                position: "absolute", top: -3, right: -3, width: 20, height: 20, borderRadius: "50%",
                border: "2px solid #fff", background: "#b91c1c", color: "#fff", fontSize: 9,
                lineHeight: 1, cursor: "pointer", padding: 0,
              }}>✕</button>
          )}
          <input ref={champ} type="file" accept="image/*" hidden
            onChange={e => choisir(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}
