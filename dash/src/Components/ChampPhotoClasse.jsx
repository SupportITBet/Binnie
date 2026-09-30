import React, { useRef, useState } from "react";
import { toast } from "react-toastify";
import { uploadFichier } from "../utils/uploadFichier";
import PastilleGroupe from "./PastilleGroupe";

/**
 * Le champ « photo » d'une classe : un aperçu cliquable, un téléversement, un retrait.
 *
 * UNE SEULE IMPLÉMENTATION POUR LES DEUX FORMULAIRES - celui de la commerciale présentiel et
 * celui de l'onboarding. Les deux créent le même objet et doivent se comporter pareil ; deux
 * copies auraient divergé au premier ajustement (taille acceptée, message d'erreur, geste de
 * retrait), et l'une des deux aurait fini par accepter ce que l'autre refuse.
 *
 * LA PHOTO EST CELLE DE LA CLASSE *ET* DE SON FIL DE DISCUSSION. `ChatGroupe` lit
 * `groupe.photo_url` sans distinguer une classe d'un groupe libre : renseigner ce champ
 * habille donc aussi la conversation, ce qui est exactement le but - un apprenant ne doit pas
 * voir deux visuels différents désigner le même endroit.
 *
 * @param {string|null} valeur    l'URL actuelle, ou null
 * @param {(url:string|null)=>void} onChange  appelé avec la nouvelle URL, ou null au retrait
 * @param {string} nom            le nom de la classe, pour les initiales à défaut de photo
 * @param {string} accent         la couleur du tableau de bord hôte
 * @param {boolean} desactive     grise le champ (classe clôturée, droits manquants…)
 */
export default function ChampPhotoClasse({ valeur, onChange, nom = "", accent = "#0891b2", desactive = false }) {
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  const choisir = async (fichier) => {
    if (!fichier) return;
    setEnvoi(true);
    try {
      // `uploadFichier` rend un OBJET ({ url, public_id, size… }), pas une chaîne. L'envoyer
      // tel quel faisait refuser l'URL côté serveur - le piège a déjà été rencontré deux fois
      // du côté des groupes libres.
      const envoye = await uploadFichier(fichier, "avatar");
      if (!envoye?.url) throw new Error("Image non déposée");
      onChange(envoye.url);
    } catch (e) {
      toast.error(e.message || "Image impossible à déposer");
    } finally {
      setEnvoi(false);
      // Permet de re-choisir le MÊME fichier après un échec : sans cette remise à zéro, le
      // navigateur considère qu'il n'y a pas eu de changement et ne redéclenche rien.
      if (champ.current) champ.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button type="button" disabled={desactive || envoi}
          onClick={() => champ.current?.click()}
          title={desactive ? undefined : valeur ? "Changer la photo" : "Ajouter une photo"}
          style={{
            width: 52, height: 52, borderRadius: "50%", border: `1.5px dashed ${desactive ? "#e2e8f0" : accent + "66"}`,
            background: "#f8fafc", padding: 0, overflow: "hidden", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: desactive || envoi ? "default" : "pointer",
          }}>
          {envoi
            ? <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>…</span>
            : valeur
              ? <img src={valeur} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <PastilleGroupe nom={nom || "?"} url={null} taille={50} accent={accent} />}
        </button>
        {valeur && !envoi && !desactive && (
          <button type="button" onClick={() => onChange(null)} title="Retirer la photo"
            style={{
              position: "absolute", top: -3, right: -3, width: 19, height: 19, borderRadius: "50%",
              border: "none", background: "#b91c1c", color: "#fff", fontSize: 10, lineHeight: 1, cursor: "pointer",
            }}>✕</button>
        )}
        <input ref={champ} type="file" accept="image/*" hidden disabled={desactive}
          onChange={e => choisir(e.target.files?.[0])} />
      </div>
      <div style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: "#475569" }}>Photo de la classe <span style={{ fontWeight: 400 }}>(facultative)</span></div>
        Elle habille aussi le fil de discussion de la classe.
        {!valeur && <> À défaut, les initiales du nom sont affichées.</>}
      </div>
    </div>
  );
}
