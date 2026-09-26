import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useGroupeChat, useGroupesChatUnread } from "../hooks/useGroupeChat";

import { uploadFichier, maxMoPour } from "../utils/uploadFichier";
import { useEnregistreurVocal, microDisponible, dureeLisible } from "../hooks/useEnregistreurVocal";
import SelecteurEmoji, { insererAuCurseur } from "./SelecteurEmoji";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * Le chat d'une classe - coach, commerciale, onboarding.
 *
 * ⚠️ Ce n'est PAS un canal interne. La conversation vit dans `chats/groupe_{id}/messages`,
 * et l'espace apprenant lit exactement la même (cf. EspaceApprenant). Écrire ici, c'est
 * s'adresser aux apprenants de la classe, à côté du coach. Toute évolution de cet écran doit
 * partir de là.
 *
 * Écrit d'abord dans l'espace coach, puis réclamé à l'identique par la commerciale et
 * l'onboarding : il vit donc ici plutôt qu'en trois copies qui finiraient par diverger.
 *
 * @param {Array}  groupes  classes visibles par ce rôle - chacune {id, nom, statut}
 * @param {Object} profil   l'auteur des messages : { id, prenom, nom }
 * @param {string} token    jeton porté par l'upload de fichiers
 * @param {string} accent   couleur du tableau de bord hôte
 * @param {Function} onMessageEnvoye  appelé après l'envoi d'un message texte (gamification…)
 * @param {string} source  "classe" (défaut) ou "libre".
 *   Généralisation VOLONTAIREMENT minimale : les groupes libres ont exactement le même fil,
 *   le même composeur et le même calcul de non-lus. Seuls changent le préfixe Firestore, le
 *   libellé du composeur, et l'annexe « Fichiers » qui n'a de sens que pour une classe.
 *   Extraire un composant commun aurait touché les cinq écrans qui montent celui-ci ;
 *   une valeur par défaut ne les touche pas du tout.
 */
/**
 * Rend cliquables les adresses écrites dans un message.
 *
 * Elles s'affichaient en texte brut : il fallait les sélectionner et les recopier. Or un
 * chat de classe sert précisément à transmettre des liens - un formulaire, un support, une
 * salle de visio.
 *
 * On découpe sur les URL plutôt que d'injecter du HTML : le texte vient d'un utilisateur, et
 * `dangerouslySetInnerHTML` y ouvrirait une injection. React échappe chaque fragment.
 */
/**
 * Le rôle affiché à côté du nom.
 *
 * Tout le monde écrit dans la même conversation - apprenants, parents, coach, assistante,
 * conseiller pédagogique. Sans cette mention, rien ne distingue une question d'apprenant
 * d'une consigne de l'équipe pédagogique.
 *
 * Les libellés portent le MÉTIER, pas la personne : « Commercial » et non « Commerciale »,
 * qui serait faux pour un homme occupant le même poste.
 */
const LIBELLE_ROLE = {
  apprenant: "Apprenant",
  parent: "Parent",
  coach: "Coach",
  professeur_titulaire: "Coach",
  professeur_remplacant: "Coach remplaçant",
  commercial: "Commercial",
  admin_commercial: "Commercial",
  onboarding: "Onboarding",
  admin_onboarding: "Onboarding",
  pedagogical_advisor: "Conseiller pédagogique",
  admin_pa_advisor: "Conseiller pédagogique",
  superviseur: "Superviseur",
  admin_superviseur: "Superviseur",
  deputy_superviseur: "Deputy superviseur",
  admin_deputy_superviseur: "Deputy superviseur",
  marketing: "Marketing",
  rh: "RH",
  placement_test: "Test de niveau",
  data_collector: "Data collector",
  admin: "Administrateur",
  super_admin: "Administrateur",
  manager: "Manager",
  comptable: "Comptable",
  assistant_elearning: "Assistant e-learning",
  customer_care: "Customer Care",
  sav: "Assistante SAV",
};

/** Un rôle non répertorié vaut mieux affiché proprement qu'omis. */
function libelleRole(role) {
  if (!role) return null;
  if (LIBELLE_ROLE[role]) return LIBELLE_ROLE[role];
  const lisible = String(role).replace(/_/g, " ").trim();
  return lisible ? lisible.charAt(0).toUpperCase() + lisible.slice(1) : null;
}

const MOTIF_URL = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function TexteAvecLiens({ texte, clair }) {
  const morceaux = String(texte || "").split(MOTIF_URL);
  return (
    <>
      {morceaux.map((bout, i) => {
        if (!bout) return null;
        if (!MOTIF_URL.test(bout)) { MOTIF_URL.lastIndex = 0; return <span key={i}>{bout}</span>; }
        MOTIF_URL.lastIndex = 0;
        const href = bout.startsWith("http") ? bout : `https://${bout}`;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: clair ? "#fff" : "#0369a1", textDecoration:"underline", wordBreak:"break-all" }}>
            {bout}
          </a>
        );
      })}
    </>
  );
}

/** L'initiale, ou la photo quand la personne en a une. */
function Pastille({ nom, url, taille = 32, fond, couleur }) {
  const [echec, setEchec] = useState(false);
  const base = {
    width: taille, height: taille, borderRadius: "50%", flexShrink: 0,
    marginRight: 8, alignSelf: "flex-end",
  };
  if (url && !echec) {
    return <img src={url} alt={nom || ""} onError={() => setEchec(true)}
      style={{ ...base, objectFit: "cover" }} />;
  }
  return (
    <div style={{ ...base, background: fond, display:"flex", alignItems:"center", justifyContent:"center",
      fontSize: 11, fontWeight: 700, color: couleur }}>
      {nom?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

/**
 * L'action « répondre », discrète jusqu'au survol.
 *
 * Toujours visible, elle doublerait le bruit visuel d'un fil dense ; jamais visible, elle
 * serait introuvable. L'opacité est portée par le composant lui-même plutôt que par une
 * règle CSS globale, ce fichier n'ayant pas de feuille de style à lui.
 */
function BoutonRepondre({ onClick }) {
  const [survol, setSurvol] = useState(false);
  return (
    <button onClick={onClick} title="Répondre à ce message"
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)} onBlur={() => setSurvol(false)}
      style={{ flexShrink:0, border:"none", background:"transparent", cursor:"pointer",
        fontSize:13, lineHeight:1, padding:"4px 5px", borderRadius:6, color:"#94a3b8",
        opacity: survol ? 1 : .32, transition:"opacity .15s ease" }}>
      ↩︎
    </button>
  );
}

export default function ChatGroupe({ groupes = [], profil, token, accent = "#0369a1", accentClair = "#e0f2fe", onMessageEnvoye, source = "classe", mentionVisibilite }) {
  const estLibre = source === "libre";
  const prefixe  = estLibre ? "libre" : "groupe";
  const [groupeId,   setGroupeId]   = useState(null);
  const [saisie,     setSaisie]     = useState("");
  // La zone de saisie, pour insérer un emoji là où est le curseur.
  const champSaisieRef = useRef(null);

  /* LA PIÈCE JOINTE EST RÉSERVÉE AU PERSONNEL. Le type d'upload `piece-jointe` exige un
     jeton d'administration : un apprenant qui cliquait sur 📎 voyait sa sélection échouer
     en 403, sans comprendre pourquoi. Le bouton est donc grisé et dit la raison, plutôt
     que d'échouer après coup. Le micro et les emojis, eux, restent ouverts. */
  const sansPieceJointe = ["apprenant", "parent"].includes(profil?.role);
  const [fichier,    setFichier]    = useState(null);
  const [pctFichier, setPctFichier] = useState(0);   // progression de l'envoi direct
  const [citation, setCitation] = useState(null);    // le message auquel on répond
  // L'image ouverte en grand. Une vignette de 260 px ne laisse pas lire une capture
  // d'écran, et c'est ce qu'on s'envoie le plus souvent dans ces fils.
  const [imagePleinEcran, setImagePleinEcran] = useState(null);
  const [surligne, setSurligne] = useState(null);    // message visé par un clic sur citation
  // Trois minutes : au-delà ce n'est plus un message mais un appel, et personne ne
  // réécoute huit minutes d'audio pour retrouver une consigne.
  const vocal = useEnregistreurVocal({ dureeMaxS: 180 });
  const [envoiFichier, setEnvoiFichier] = useState(false);
  // Les classes clôturées restent LISIBLES mais fermées à l'écriture : leur historique est
  // une trace qu'on ne masque pas, mais y écrire enverrait un message à des apprenants
  // partis. C'est la seule raison de ce commutateur.
  const [voirCloturees, setVoirCloturees] = useState(false);
  const [recherche,     setRecherche]     = useState("");

  const estCloturee = (g) => ["cloture", "terminé", "termine", "archive"].includes(g.statut);
  const actives  = groupes.filter(g => !estCloturee(g));
  const closes   = groupes.filter(estCloturee);
  const visibles = voirCloturees ? [...actives, ...closes] : actives;

  // Non-lus classe par classe. Un badge agrégé ne tombe pas à zéro quand on ouvre une seule
  // conversation sur trois, et rien n'indiquait laquelle il restait à ouvrir.
  const nonLus = useGroupesChatUnread(visibles.map(g => g.id), profil?.id);

  const groupe = visibles.find(g => g.id === groupeId) || null;
  const lectureSeule = groupe ? estCloturee(groupe) : false;

  const { messages, sendMessage, markRead, chargerPlus, encorePlus } = useGroupeChat(groupeId, prefixe);

  // Une classe qui sort de la liste (filtre décoché) ne doit pas rester ouverte derrière.
  useEffect(() => {
    if (groupeId && !visibles.some(g => g.id === groupeId)) setGroupeId(null);
  }, [voirCloturees]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une seule classe : il n'y a rien à choisir. On l'ouvre, et le sélecteur disparaît -
  // c'est le cas de l'apprenant, qui n'appartient qu'à la sienne.
  // La recherche ne filtre QUE les options proposées. `visibles` reste la liste complète :
  // c'est sur elle que se décide l'affichage de la barre - sinon une recherche ne laissant
  // qu'un résultat ferait disparaître le champ qu'on vient d'utiliser - et c'est en elle
  // qu'on retrouve la classe ouverte, qui ne doit pas se refermer pendant qu'on tape.
  const q = recherche.trim().toLowerCase();
  const filtrees = q ? visibles.filter(g => (g.nom || "").toLowerCase().includes(q)) : visibles;
  // Les conversations qui attendent une lecture passent devant : sur cinq classes, elles
  // seraient sinon à chercher une par une.
  const listees = [...filtrees].sort((a, b) => (nonLus[b.id] || 0) - (nonLus[a.id] || 0));

  const choixUnique = visibles.length === 1 && closes.length === 0;
  useEffect(() => {
    if (choixUnique && !groupeId) setGroupeId(visibles[0].id);
  }, [choixUnique, groupeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (groupeId && profil?.id) markRead(profil.id);
  }, [groupeId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Identité des auteurs (photo + rôle) - résolue depuis leur identifiant, jamais stockée
  // dans le message : l'historique déjà écrit en bénéficie, et un changement de photo ou de
  // rôle se propage partout au lieu de rester figé dans les anciens messages.
  const [profils, setProfils] = useState({});
  const idsDemandes = useRef(new Set());
  useEffect(() => {
    const manquants = [...new Set(messages.map(m => m.auteur_id).filter(Boolean))]
      .filter(id => !idsDemandes.current.has(id));
    if (!manquants.length) return;
    manquants.forEach(id => idsDemandes.current.add(id));
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/admin/profils-chat?ids=${manquants.join(",")}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.profils && Object.keys(d.profils).length) setProfils(p => ({ ...p, ...d.profils }));
      } catch { /* les initiales et le nom seul restent un repli acceptable */ }
    })();
  }, [messages, token]);

  const finDuFil = useRef(null);
  useEffect(() => { finDuFil.current?.scrollIntoView({ block: "end" }); }, [messages.length, groupeId]);

  /* Changer de conversation ABANDONNE la citation : elle désigne un message de l'autre
     fil, et l'envoyer ici produirait une citation pointant dans le vide. */
  useEffect(() => { setCitation(null); setSurligne(null); }, [groupeId]);

  /* Changer de conversation ABANDONNE un enregistrement en cours : l'envoyer dans l'autre
     fil serait une erreur difficile à rattraper, et laisser le micro ouvert pire encore. */
  useEffect(() => { vocal.annuler(); }, [groupeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Le résumé figé d'un message, tel qu'il sera recopié dans la citation. */
  const extraitDe = (m) => {
    if (m.type === "fichier" && m.fichier) return `📎 ${m.fichier.nom || "pièce jointe"}`;
    // 120 caractères : assez pour reconnaître le message, assez court pour ne pas
    // reconstruire une seconde bulle au-dessus de la première.
    const t = String(m.texte || "").replace(/\s+/g, " ").trim();
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  };

  /** Remonte au message cité et le surligne brièvement. */
  const allerAuMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;   // hors de la fenêtre chargée : on ne fait rien plutôt que de sauter
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setSurligne(id);
    setTimeout(() => setSurligne(v => (v === id ? null : v)), 1600);
  };

  /**
   * Envoie la note vocale enregistrée.
   *
   * Elle emprunte EXACTEMENT le chemin d'une pièce jointe - même téléversement direct,
   * même message de type « fichier ». Un type de message distinct aurait demandé de
   * l'afficher, de le citer et de le télécharger à part, pour un gain nul.
   */
  const envoyerVocal = async () => {
    const f = vocal.fichier();
    if (!f || envoiFichier) return;
    const auteur = `${profil?.prenom || ""} ${profil?.nom || ""}`.trim() || "-";
    setEnvoiFichier(true); setPctFichier(0);
    try {
      /* `message` et non `piece-jointe` : ce dernier est réservé au personnel, et la note
         vocale d'un apprenant échouait donc en 403. Son plafond de 5 Mo est large -
         l'enregistreur s'arrête à 3 minutes, moins d'1 Mo en opus. */
      const d = await uploadFichier(f, "message", { onProgress: setPctFichier });
      if (d.url) {
        await sendMessage(profil.id, auteur, "", { nom: f.name, url: d.url, type: "audio" }, citation);
        setCitation(null);
        vocal.reinitialiser();
      }
    } catch (e) { toast.error(e.message || "Envoi de la note vocale impossible"); }
    finally { setEnvoiFichier(false); setPctFichier(0); }
  };

  const envoyer = async () => {
    if (lectureSeule || envoiFichier) return;
    if (!saisie.trim() && !fichier) return;
    const auteur = `${profil?.prenom || ""} ${profil?.nom || ""}`.trim() || "-";

    if (saisie.trim()) {
      await sendMessage(profil.id, auteur, saisie.trim(), null, citation);
      setSaisie("");
      setCitation(null);
      // Crochet facultatif de l'écran hôte - l'espace apprenant s'en sert pour créditer la
      // gamification. Sans lui, brancher l'apprenant sur ce composant lui retirerait ses points.
      onMessageEnvoye?.();
    }
    if (fichier) {
      setEnvoiFichier(true);
      try {
        /* « piece-jointe » et envoi DIRECT vers Cloudinary, au lieu du relais.
           Le relais imposait deux limites que rien ne justifiait dans un chat : la liste
           blanche du type « document » - qui refusait un .zip comme une photo iPhone .heic -
           et le plafond de 4,5 Mo que Vercel applique au corps d'une requête. */
        setPctFichier(0);
        const d = await uploadFichier(fichier.file, "piece-jointe", { onProgress: setPctFichier });
        const url = d.url;
        if (url) {
          await sendMessage(profil.id, auteur, "", { nom: fichier.name, url, type: fichier.type }, citation);
          setCitation(null);
          // Le fichier rejoint aussi les « Fichiers » de la classe : un document partagé dans
          // la conversation doit rester retrouvable après que le fil a défilé.
          try {
            // Réservé aux classes : un groupe libre n'a pas d'onglet « Fichiers » où
            // ranger la pièce jointe, et l'appel répondrait 404 à chaque envoi.
            if (!estLibre) await fetch(`${API_URL}/api/groupes/${groupe.id}/fichiers`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ nom: fichier.name, url, type_fichier: fichier.type, taille_ko: Math.round(fichier.size / 1024) }),
            });
          } catch { /* le message est parti : ne pas faire échouer l'envoi pour l'annexe */ }
          toast.success(`✅ Fichier partagé - ${fichier.name}`);
        }
        setFichier(null);
      } catch (e) {
        toast.error(e.message || "Envoi du fichier impossible");
      } finally { setEnvoiFichier(false); setPctFichier(0); }
    }
  };

  if (!groupes.length) {
    return <div style={{ textAlign:"center", color:"#9ca3af", padding:"40px 20px", fontSize:13 }}>{estLibre ? "Aucun groupe - créez-en un pour commencer." : "Aucune classe à afficher."}</div>;
  }

  return (
    <div>
      <div style={{ display: choixUnique ? "none" : "flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:16 }}>
        <select value={groupeId || ""} onChange={e => setGroupeId(e.target.value || null)}
          style={{ padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, background:"#f8fafc", cursor:"pointer", minWidth:240 }}>
          <option value="">- Choisir {estLibre ? "un groupe" : "une classe"} -</option>
          {listees.map(g => (
            <option key={g.id} value={g.id}>
              {nonLus[g.id] > 0 ? `● ${g.nom} (${nonLus[g.id]})` : g.nom}{estCloturee(g) ? " (clôturée)" : ""}
            </option>
          ))}
          {/* La classe ouverte doit rester sélectionnable même si la recherche l'exclut,
              faute de quoi le sélecteur afficherait un choix vide sur une conversation
              pourtant bien ouverte. */}
          {groupe && !listees.some(g => g.id === groupe.id) && (
            <option value={groupe.id}>{groupe.nom}{estCloturee(groupe) ? " (clôturée)" : ""}</option>
          )}
        </select>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder={estLibre ? "🔍 Rechercher un groupe…" : "🔍 Rechercher une classe…"}
          style={{ padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, outline:"none", minWidth:200, flex:"0 1 240px" }} />
        {q && (
          <span style={{ fontSize:12, color: listees.length ? "#64748b" : "#b45309", fontWeight: listees.length ? 400 : 700 }}>
            {listees.length
              ? `${listees.length} ${estLibre ? "groupe" : "classe"}${listees.length > 1 ? "s" : ""} sur ${visibles.length}`
              : `Aucun${estLibre ? "" : "e"} ${estLibre ? "groupe ne correspond" : "classe ne correspond"} à « ${recherche.trim()} »`}
          </span>
        )}
        {closes.length > 0 && (
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#64748b", cursor:"pointer" }}>
            <input type="checkbox" checked={voirCloturees} onChange={e => setVoirCloturees(e.target.checked)} />
            Afficher les classes clôturées ({closes.length}) - en lecture seule
          </label>
        )}
      </div>

      {!actives.length && !voirCloturees && (
        <div style={{ textAlign:"center", color:"#9ca3af", padding:"30px 20px", fontSize:13 }}>
          {estLibre ? "Aucun groupe actif." : "Aucune classe active."} {closes.length > 0 ? "Cochez la case ci-dessus pour relire les classes clôturées." : ""}
        </div>
      )}

      {!groupe ? (
        visibles.length > 0 && (
          <div style={{ textAlign:"center", color:"#9ca3af", paddingTop:40, fontSize:13 }}>
            Sélectionnez {estLibre ? "un groupe" : "une classe"} pour accéder au chat.
          </div>
        )
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid #e5e7eb", background:`${accent}08`, fontWeight:700, fontSize:13, color:accent, display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
            {/* LE GROUPE EN TÊTE DE SON FIL - sa photo et son nom, comme dans WhatsApp.
                L'en-tête n'affichait qu'une ligne de texte : dans un écran où l'on passe
                d'un groupe à l'autre, l'image est ce qui dit le plus vite où l'on est. */}
            <span style={{ display:"flex", alignItems:"center", gap:9, minWidth:0 }}>
              {groupe.photo_url ? (
                <img src={groupe.photo_url} alt=""
                  onClick={() => setImagePleinEcran({ url: groupe.photo_url, nom: groupe.nom })}
                  title="Voir la photo du groupe"
                  style={{ width:30, height:30, borderRadius:"50%", objectFit:"cover", border:"1px solid #e2e8f0", cursor:"zoom-in", flexShrink:0 }} />
              ) : (
                <span style={{ width:30, height:30, borderRadius:"50%", background:`${accent}1f`, color:accent,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0 }}>
                  {(groupe.nom || "?").trim().slice(0, 2).toUpperCase()}
                </span>
              )}
              <span style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                <span style={{ fontSize:13.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{groupe.nom}</span>
                <span style={{ fontSize:10.5, fontWeight:600, color:"#94a3b8" }}>
                  {estLibre ? "Groupe de discussion" : "Chat de classe"}
                </span>
              </span>
            </span>
            {/* QUI LIT CE FIL - la mention la plus importante de l'écran, puisqu'elle
                décide de ce qu'on s'autorise à écrire. Elle annonçait « les apprenants de
                la classe » dans TOUS les cas : sur un groupe libre, elle faisait croire à
                un superviseur que sa conversation interne était lue par des apprenants. */}
            <span style={{ fontSize:11, fontWeight:600, color:"#94a3b8" }}>
              {mentionVisibilite
                || (estLibre
                  ? "Visible par les membres du groupe"
                  : "Visible par les apprenants de la classe et leur coach")}
            </span>
          </div>

          <div style={{ height:380, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign:"center", color:"#9ca3af", paddingTop:60 }}>Aucun message - commencez la conversation !</div>
            )}

            {/* Remonter dans l'historique. La conversation n'en montrait que les 200 premiers
                messages, sans aucun moyen d'aller plus loin - ni vers le passé, ni vers la
                suite. Le bouton disparait une fois le debut du fil atteint. */}
            {encorePlus && (
              <button onClick={chargerPlus}
                style={{ alignSelf:"center", background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#475569",
                  borderRadius:99, padding:"6px 16px", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                ↑ Messages précédents
              </button>
            )}
            {messages.map(m => {
              const moi = m.auteur_id === profil?.id;
              const bulle = {
                padding:"10px 14px",
                borderRadius: moi ? "12px 12px 0 12px" : "12px 12px 12px 0",
                background: moi ? accent : "#f3f4f6",
                color: moi ? "#fff" : "#0f172a",
                fontSize:13,
              };
              return (
                <div key={m.id} id={`msg-${m.id}`}
                  style={{ display:"flex", justifyContent: moi ? "flex-end" : "flex-start", alignItems:"flex-end", gap:6,
                    // Surlignage transitoire après un clic sur une citation : c'est le seul
                    // moyen de retrouver le message d'origine au milieu d'un fil dense.
                    background: surligne === m.id ? `${accent}18` : "transparent",
                    borderRadius: 10, padding: surligne === m.id ? "4px 6px" : 0,
                    transition: "background .35s ease" }}>
                  {!moi && (
                    <Pastille nom={m.auteur_nom} url={profils[m.auteur_id]?.avatar_url} fond={accentClair} couleur={accent} />
                  )}
                  {/* L'action « Répondre » à GAUCHE pour ses propres messages, à droite pour
                      ceux des autres : elle reste ainsi toujours du côté extérieur du fil,
                      sans jamais recouvrir le texte. */}
                  {moi && !lectureSeule && (
                    <BoutonRepondre onClick={() => setCitation({ id: m.id, auteur_nom: m.auteur_nom, extrait: extraitDe(m), type: m.type || "texte" })} />
                  )}
                  <div style={{ maxWidth:"72%" }}>
                    {!moi && (
                      <div style={{ fontSize:11, color:"#9ca3af", marginBottom:2, fontWeight:600 }}>
                        {m.auteur_nom}
                        {libelleRole(profils[m.auteur_id]?.role) && (
                          <span style={{ fontWeight:500, color:"#cbd5e1" }}> ({libelleRole(profils[m.auteur_id].role)})</span>
                        )}
                      </div>
                    )}
                    {/* LA CITATION. Cliquable pour remonter au message d'origine ; si
                        celui-ci est hors de la fenêtre chargée, le clic ne fait rien
                        plutôt que de faire sauter le fil au hasard. */}
                    {m.repond_a && (
                      <button onClick={() => allerAuMessage(m.repond_a.id)}
                        title="Aller au message cité"
                        style={{ display:"block", width:"100%", textAlign:"left", cursor:"pointer",
                          border:"none", borderLeft:`3px solid ${moi ? accent : "#cbd5e1"}`,
                          background: moi ? `${accent}12` : "#eef2f6",
                          borderRadius:"8px 8px 0 0", padding:"6px 10px", marginBottom:2, fontFamily:"inherit" }}>
                        <span style={{ display:"block", fontSize:10.5, fontWeight:700, color: moi ? accent : "#64748b" }}>
                          {m.repond_a.auteur_nom || "-"}
                        </span>
                        <span style={{ display:"block", fontSize:11.5, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {m.repond_a.extrait || "…"}
                        </span>
                      </button>
                    )}

                    {m.type === "fichier" && m.fichier ? (() => {
                      const f = m.fichier;
                      const ext = (f.nom && f.nom.includes(".")) ? f.nom.split(".").pop().toLowerCase() : (f.type === "image" ? "jpg" : f.type || "bin");
                      const image = ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
                      /* L'AUDIO SE JOUE DANS LE FIL. Tout fichier non-image devenait un
                         bouton de téléchargement : un enregistrement envoyé ici se
                         téléchargeait au lieu de s'écouter, alors qu'il se joue déjà dans
                         la messagerie privée. Incohérence corrigée pour les deux familles
                         de conversations. */
                      const audio = ["mp3","wav","ogg","m4a","aac","webm","opus","oga"].includes(ext);
                      /* LA VIDÉO SE REGARDE DANS LE FIL, comme l'audio s'y écoute déjà.
                         Elle tombait jusqu'ici dans le bouton de téléchargement : il
                         fallait la télécharger ou l'ouvrir ailleurs pour la voir, alors
                         qu'un message vidéo se consulte d'un coup d'œil ou pas du tout.
                         `webm` sert aux deux : c'est le conteneur des notes vocales du
                         chat, donc il reste rangé avec l'audio, décidé plus haut. */
                      const video = ["mp4","mov","m4v","ogv","avi","mkv"].includes(ext);
                      const nomComplet = f.nom && f.nom.includes(".") ? f.nom : `${f.nom || "fichier"}.${ext}`;
                      // Téléchargement par le proxy serveur : un lien direct vers le stockage
                      // ouvre le fichier dans l'onglet au lieu de l'enregistrer, et perd son nom.
                      const telecharger = async () => {
                        try {
                          const proxy = `${API_URL}/api/upload/download?url=${encodeURIComponent(f.url)}&nom=${encodeURIComponent(nomComplet)}&type=${encodeURIComponent(ext)}`;
                          const r = await fetch(proxy, { headers: { Authorization: `Bearer ${token}` } });
                          const blob = await r.blob();
                          const objUrl = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = objUrl; a.download = nomComplet; a.click();
                          setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
                        } catch { window.open(f.url, "_blank"); }
                      };
                      if (audio) return (
                        <div style={{ ...bulle, padding:"8px 10px", display:"flex", flexDirection:"column", gap:5, minWidth:230 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:11.5, fontWeight:700, opacity:.85 }}>
                            <span>🎙️</span>
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {f.nom?.startsWith("note-vocale") ? "Note vocale" : nomComplet}
                            </span>
                          </div>
                          {/* `preload="metadata"` : la durée s'affiche sans télécharger tout
                              le son - dans un fil de vingt audios, tout précharger saturerait
                              la connexion pour des messages que personne n'écoutera. */}
                          <audio controls preload="metadata" src={f.url}
                            style={{ width:"100%", height:34, borderRadius:6 }} />
                        </div>
                      );

                      if (video) return (
                        <div style={{ ...bulle, padding:6, maxWidth:320 }}>
                          {/* `preload="metadata"` : la vignette et la durée arrivent sans
                              charger la vidéo entière - dans un fil qui en compte dix,
                              tout précharger saturerait la connexion pour rien. */}
                          <video src={f.url} controls preload="metadata" playsInline
                            style={{ width:"100%", maxHeight:260, borderRadius:8, display:"block", background:"#000" }} />
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, fontSize:11, opacity:.85 }}>
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{nomComplet}</span>
                            <button onClick={telecharger}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"inherit", opacity:.8, padding:0 }}>
                              ⬇
                            </button>
                          </div>
                        </div>
                      );

                      /* L'IMAGE S'AFFICHE, au lieu de n'être qu'un lien à ouvrir ailleurs.
                         Un clic l'agrandit : une vignette de 260 px ne suffit pas à lire
                         une capture d'écran, le cas le plus fréquent dans ces fils. */
                      return image ? (
                        <div style={{ ...bulle, padding:6, maxWidth:320 }}>
                          <img src={f.url} alt={nomComplet} loading="lazy"
                            onClick={() => setImagePleinEcran({ url: f.url, nom: nomComplet })}
                            style={{ width:"100%", maxHeight:260, objectFit:"cover", borderRadius:8, display:"block", cursor:"zoom-in" }} />
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, fontSize:11, opacity:.85 }}>
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{nomComplet}</span>
                            <button onClick={telecharger}
                              style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"inherit", opacity:.8, padding:0 }}>
                              ⬇
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={telecharger}
                          style={{ ...bulle, display:"flex", alignItems:"center", gap:8, border:"none", cursor:"pointer" }}>
                          <span style={{ fontSize:20 }}>{ext === "pdf" ? "📄" : "📎"}</span>
                          <span style={{ fontWeight:600 }}>{nomComplet}</span>
                        </button>
                      );
                    })() : (
                      <div style={{ ...bulle, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
                        <TexteAvecLiens texte={m.texte} clair={moi} />
                      </div>
                    )}
                    <div style={{ fontSize:10, color:"#9ca3af", marginTop:2, textAlign: moi ? "right" : "left" }}>
                      {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : ""}
                    </div>
                  </div>
                  {!moi && !lectureSeule && (
                    <BoutonRepondre onClick={() => setCitation({ id: m.id, auteur_nom: m.auteur_nom, extrait: extraitDe(m), type: m.type || "texte" })} />
                  )}
                </div>
              );
            })}
            <div ref={finDuFil} />
          </div>

          {/* LA VISIONNEUSE, montée une seule fois pour tout le fil : une par message
              multiplierait les couches invisibles autant qu'il y a d'images. */}
          {imagePleinEcran && (
            <div onClick={() => setImagePleinEcran(null)}
              style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.9)", zIndex:10060,
                display:"flex", alignItems:"center", justifyContent:"center", padding:24, cursor:"zoom-out" }}>
              <img src={imagePleinEcran.url} alt={imagePleinEcran.nom} onClick={e => e.stopPropagation()}
                style={{ maxWidth:"92vw", maxHeight:"86vh", objectFit:"contain", borderRadius:10, cursor:"default" }} />
              <button onClick={() => setImagePleinEcran(null)}
                style={{ position:"absolute", top:18, right:22, background:"rgba(255,255,255,.15)", color:"#fff",
                  border:"none", borderRadius:"50%", width:38, height:38, fontSize:18, cursor:"pointer" }}>✕</button>
              <div style={{ position:"absolute", bottom:20, color:"rgba(255,255,255,.85)", fontSize:12.5 }}>
                {imagePleinEcran.nom}
              </div>
            </div>
          )}

          {lectureSeule ? (
            <div style={{ padding:"12px 16px", borderTop:"1px solid #e5e7eb", background:"#f8fafc", fontSize:12.5, color:"#64748b" }}>
              🔒 Classe clôturée - la conversation reste consultable, mais les apprenants ont
              quitté la classe : on ne peut plus y écrire.
            </div>
          ) : (
            <>
              {/* LE BANDEAU DE CITATION, au-dessus de la saisie - comme la pièce jointe en
                  attente juste en dessous. Il doit rester visible pendant qu'on écrit :
                  une réponse dont on ne voit plus la cible finit à côté du sujet. */}
              {citation && (
                <div style={{ padding:"8px 12px", borderTop:"1px solid #e5e7eb", background:"#f8fafc", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:15, color:"#94a3b8", flexShrink:0 }}>↩︎</span>
                  <div style={{ flex:1, minWidth:0, borderLeft:`3px solid ${accent}`, paddingLeft:9 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:accent }}>
                      Réponse à {citation.auteur_nom || "-"}
                    </div>
                    <div style={{ fontSize:11.5, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {citation.extrait || "…"}
                    </div>
                  </div>
                  <button onClick={() => setCitation(null)} title="Annuler la réponse"
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#9ca3af", lineHeight:1, padding:4 }}>✕</button>
                </div>
              )}

              {/* ENREGISTREMENT EN COURS - minuteur visible et sortie de secours.
                  Sans minuteur on ne sait pas depuis quand on parle ; sans « Annuler »,
                  la seule issue serait d'envoyer un message qu'on ne voulait pas. */}
              {vocal.etat === "enregistrement" && (
                <div style={{ padding:"9px 12px", borderTop:"1px solid #e5e7eb", background:"#fef2f2", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ width:9, height:9, borderRadius:"50%", background:"#dc2626", flexShrink:0, animation:"none" }} />
                  <span style={{ fontSize:12.5, fontWeight:800, color:"#991b1b", fontVariantNumeric:"tabular-nums" }}>
                    {dureeLisible(vocal.duree)}
                  </span>
                  <span style={{ fontSize:11.5, color:"#b91c1c", flex:1 }}>
                    Enregistrement… arrêt automatique à {dureeLisible(vocal.dureeMaxS)}
                  </span>
                  <button onClick={vocal.annuler}
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#991b1b", fontWeight:700, padding:"4px 8px" }}>
                    Annuler
                  </button>
                  <button onClick={vocal.arreter} style={{ padding:"6px 14px", background:"#dc2626", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                    ⏹ Terminer
                  </button>
                </div>
              )}

              {/* APERÇU AVANT ENVOI - on se réécoute et on recommence si besoin. Une note
                  vocale partie ne se reprend pas. */}
              {vocal.etat === "pret" && (
                <div style={{ padding:"9px 12px", borderTop:"1px solid #e5e7eb", background:"#f0fdf4", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontSize:17 }}>🎙️</span>
                  <audio controls src={vocal.url} style={{ flex:1, minWidth:180, height:34 }} />
                  <span style={{ fontSize:11.5, color:"#15803d", fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{dureeLisible(vocal.duree)}</span>
                  <button onClick={vocal.reinitialiser} disabled={envoiFichier}
                    style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#64748b", fontWeight:700, padding:"4px 8px" }}>
                    Refaire
                  </button>
                  <button onClick={envoyerVocal} disabled={envoiFichier}
                    style={{ padding:"6px 14px", background: envoiFichier ? "#cbd5e1" : "#16a34a", color:"#fff", border:"none", borderRadius:8, cursor: envoiFichier ? "wait" : "pointer", fontWeight:700, fontSize:12 }}>
                    {envoiFichier ? (pctFichier > 0 && pctFichier < 100 ? `${pctFichier}%` : "Envoi…") : "Envoyer"}
                  </button>
                </div>
              )}

              {vocal.erreur && (
                <div style={{ padding:"8px 12px", borderTop:"1px solid #e5e7eb", background:"#fffbeb", fontSize:11.5, color:"#92400e" }}>
                  {vocal.erreur}
                </div>
              )}

              {fichier && (
                <div style={{ padding:"8px 12px", borderTop:"1px solid #e5e7eb", background:"#f0f9ff", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{fichier.type === "image" ? "🖼️" : fichier.type === "pdf" ? "📄" : "📎"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fichier.name}</div>
                    <div style={{ fontSize:11, color:"#9ca3af" }}>{(fichier.size / (1024*1024)).toFixed(1)} Mo - prêt à envoyer</div>
                  </div>
                  <button onClick={() => setFichier(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#9ca3af", lineHeight:1, padding:4 }}>✕</button>
                </div>
              )}
              <div style={{ padding:"10px 12px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8, alignItems:"flex-end" }}>
                <label title={sansPieceJointe
                    ? "L'envoi de fichiers n'est pas ouvert aux apprenants - vous pouvez écrire un message ou envoyer une note vocale."
                    : `Joindre un fichier - tout format, jusqu'à ${maxMoPour("piece-jointe","video/mp4")} Mo pour une vidéo`}
                  style={{ padding:"8px 10px", background: sansPieceJointe ? "#f8fafc" : fichier ? "#dbeafe" : "#f1f5f9",
                    border:`1px solid ${sansPieceJointe ? "#e5e7eb" : fichier ? "#93c5fd" : "#e5e7eb"}`, borderRadius:8,
                    cursor: sansPieceJointe ? "not-allowed" : "pointer", fontSize:16, flexShrink:0,
                    opacity: sansPieceJointe ? 0.45 : 1 }}>
                  📎
                  {/* Aucune liste d'extensions : le selecteur proposait huit formats, et
                      tout le reste - archive, audio, video, photo iPhone - etait refuse. */}
                  <input type="file" style={{ display:"none" }} disabled={sansPieceJointe}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const max = maxMoPour("piece-jointe", f.type);
                      if (f.size > max * 1024 * 1024) { toast.error(`Fichier trop lourd - maximum ${max} Mo`); e.target.value = ""; return; }
                      const ext = f.name.split(".").pop().toLowerCase();
                      const image = f.type?.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","heic","heif","avif","bmp","tif","tiff"].includes(ext);
                      setFichier({ file: f, name: f.name, size: f.size, ext, type: image ? "image" : ext === "pdf" ? "pdf" : "autre" });
                      e.target.value = "";
                    }} />
                </label>
                {/* Le micro n'apparaît QUE s'il est utilisable : les navigateurs exigent
                    HTTPS ou localhost, et un bouton qui échoue toujours vaut moins que pas
                    de bouton du tout. */}
                {microDisponible() && vocal.etat === "repos" && (
                  <button onClick={vocal.demarrer} disabled={envoiFichier} title="Enregistrer une note vocale"
                    style={{ padding:"8px 10px", background:"#f1f5f9", border:"1px solid #e5e7eb", borderRadius:8, cursor: envoiFichier ? "not-allowed" : "pointer", fontSize:16, flexShrink:0 }}>
                    🎤
                  </button>
                )}

                {/* Les emojis, juste après le micro - la place où on les cherche.
                    L'insertion se fait à la position du curseur, pas en fin de texte. */}
                <SelecteurEmoji accent={accent} disabled={envoiFichier}
                  onInsert={emoji => {
                    const champ = champSaisieRef.current;
                    const { texte, curseur } = insererAuCurseur(saisie, emoji, champ);
                    setSaisie(texte);
                    // Le curseur repart APRÈS l'emoji : sans ce recalage, React le renvoie
                    // en fin de champ et la phrase se poursuit au mauvais endroit.
                    requestAnimationFrame(() => {
                      if (!champ) return;
                      champ.focus();
                      champ.setSelectionRange(curseur, curseur);
                    });
                  }} />

                <textarea ref={champSaisieRef} value={saisie} onChange={e => setSaisie(e.target.value)} rows={1}
                  placeholder={citation ? `Répondre à ${citation.auteur_nom || "ce message"}…`
                    : fichier ? "Ajouter un message avec le fichier (optionnel)…"
                    : `Message ${estLibre ? "au groupe" : "à la classe"} "${groupe.nom}"…`}
                  style={{ flex:1, padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:13, resize:"none", fontFamily:"inherit" }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }} />
                <button onClick={envoyer} disabled={(!saisie.trim() && !fichier) || envoiFichier}
                  style={{ padding:"9px 16px", background: accent, color:"#fff", border:"none", borderRadius:8, cursor:(!saisie.trim() && !fichier) ? "not-allowed" : "pointer", fontWeight:700, fontSize:13, opacity:(!saisie.trim() && !fichier) ? 0.5 : 1, flexShrink:0 }}>
                  {envoiFichier ? (pctFichier > 0 && pctFichier < 100 ? `${pctFichier}%` : "⏳") : "✉️"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
