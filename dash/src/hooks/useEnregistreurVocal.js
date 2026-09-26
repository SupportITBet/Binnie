import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Enregistrement d'une note vocale depuis le micro.
 *
 * La mécanique de capture est reprise de l'espace apprenant, où elle tourne en production
 * pour les exercices d'expression orale - avec le détail qui compte le plus et qui ne
 * s'invente pas : Firefox ANNONCE le support de `audio/webm;codecs=opus` mais son encodeur
 * webm produit parfois un fichier de la bonne durée, totalement silencieux. Son format
 * natif `audio/ogg` est fiable chez lui. Chrome, Edge et Safari n'ont pas ce défaut.
 *
 * Extrait ici plutôt que recopié : deux copies de cette liste finiraient par diverger, et
 * c'est exactement le genre de correction qu'on n'applique qu'à un seul des deux endroits.
 */

/** Les formats à tenter, dans l'ordre, selon le navigateur. */
export function formatAudioSupporte() {
  const estFirefox = /firefox/i.test(navigator.userAgent);
  const candidats = estFirefox
    ? ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"]
    // `audio/mp4` en dernier recours : c'est le seul que Safari sur iOS sache produire.
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];

  const mime = candidats.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || "";
  const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
  return { mime, extension };
}

/** Le micro est-il seulement utilisable ici ? HTTPS ou localhost exigé par les navigateurs. */
export const microDisponible = () =>
  !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/** `83` → `1:23`. */
export const dureeLisible = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * @param {number} dureeMaxS  arrêt automatique. Au-delà de quelques minutes, ce n'est plus
 *   un message mais un appel téléphonique - et personne ne réécoute huit minutes d'audio
 *   pour retrouver une consigne.
 */
export function useEnregistreurVocal({ dureeMaxS = 180 } = {}) {
  const [etat, setEtat] = useState("repos");     // repos | enregistrement | pret
  const [duree, setDuree] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [erreur, setErreur] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const morceauxRef = useRef([]);
  const minuteurRef = useRef(null);
  const annuleRef = useRef(false);
  const extensionRef = useRef("webm");

  /** Coupe le micro. Sans ça, la pastille d'enregistrement reste allumée dans l'onglet. */
  const libererMicro = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    clearInterval(minuteurRef.current);
  }, []);

  const reinitialiser = useCallback(() => {
    // L'URL objet est révoquée : chaque aperçu non révoqué garde son blob en mémoire.
    setUrl(u => { if (u) URL.revokeObjectURL(u); return null; });
    setBlob(null); setDuree(0); setEtat("repos"); setErreur(null);
  }, []);

  const arreter = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const annuler = useCallback(() => {
    annuleRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else { libererMicro(); reinitialiser(); }
  }, [libererMicro, reinitialiser]);

  const demarrer = useCallback(async () => {
    setErreur(null);
    if (!microDisponible()) {
      setErreur("Ce navigateur ne permet pas d'enregistrer du son.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      annuleRef.current = false;
      morceauxRef.current = [];

      const { mime, extension } = formatAudioSupporte();
      extensionRef.current = extension;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) morceauxRef.current.push(e.data); };
      recorder.onstop = () => {
        libererMicro();
        if (annuleRef.current) { reinitialiser(); return; }
        const b = new Blob(morceauxRef.current, { type: mime || "audio/webm" });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setEtat("pret");
      };

      recorder.start();
      setEtat("enregistrement");
      setDuree(0);
      minuteurRef.current = setInterval(() => {
        setDuree(d => {
          const suivant = d + 1;
          // Arrêt AUTOMATIQUE : on ne compte pas sur l'utilisateur pour s'arrêter, et un
          // enregistrement oublié produirait un fichier que Cloudinary refuserait.
          if (suivant >= dureeMaxS) { recorderRef.current?.stop(); }
          return suivant;
        });
      }, 1000);
    } catch (e) {
      libererMicro();
      setErreur(e?.name === "NotAllowedError"
        ? "Accès au micro refusé. Autorisez-le dans les réglages du navigateur."
        : "Micro indisponible.");
      setEtat("repos");
    }
  }, [dureeMaxS, libererMicro, reinitialiser]);

  /** Le fichier prêt à être téléversé, nommé avec la BONNE extension. */
  const fichier = useCallback(() => {
    if (!blob) return null;
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new File([blob], `note-vocale-${horodatage}.${extensionRef.current}`, { type: blob.type });
  }, [blob]);

  // Quitter l'écran en pleine capture laisserait le micro ouvert.
  useEffect(() => () => { libererMicro(); }, [libererMicro]);

  return { etat, duree, dureeMaxS, blob, url, erreur, demarrer, arreter, annuler, reinitialiser, fichier };
}
