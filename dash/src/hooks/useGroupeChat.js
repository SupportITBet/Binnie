import { useState, useEffect, useRef } from "react";
import {
  collection, doc, query, orderBy, where, onSnapshot,
  addDoc, setDoc, serverTimestamp, limit, getDoc, getDocs
} from "firebase/firestore";
import { db } from "../config/firebase";

/* Utilise la collection "chats" déjà autorisée dans les règles Firestore.
   Deux familles de conversations y cohabitent, distinguées par le PRÉFIXE :
     · chats/groupe_{classeId}/messages  - la discussion d'une classe
     · chats/libre_{convId}/messages     - un groupe libre, à membres choisis
   Le préfixe plutôt que deux collections : les règles, l'écoute temps réel et le
   calcul des non-lus sont identiques, et les dédoubler les ferait diverger. */
export const groupeDocId = (id, prefixe = "groupe") => `${prefixe}_${id}`;

/** Taille de la fenêtre d'historique, et pas de chargement quand on remonte le fil. */
const FENETRE = 200;

export function useGroupeChat(groupeId, prefixe = "groupe") {
  const [messages, setMessages] = useState([]);
  const [fenetre, setFenetre] = useState(FENETRE);
  // `true` tant que Firestore rend autant de messages que la fenêtre en demande : il en
  // reste alors probablement au-delà. Sert à masquer le bouton quand on est au début.
  const [encorePlus, setEncorePlus] = useState(false);

  // Revenir à une classe déjà ouverte ne doit pas conserver la fenêtre élargie de la
  // précédente : on repart du fil récent, comme à la première ouverture.
  useEffect(() => { setFenetre(FENETRE); setEncorePlus(false); }, [groupeId, prefixe]);

  useEffect(() => {
    if (!groupeId) return;
    const convId = groupeDocId(groupeId, prefixe);

    // S'assurer que le document parent existe (nécessaire pour Firestore)
    const parentRef = doc(db, "chats", convId);
    getDoc(parentRef).then((snap) => {
      if (!snap.exists()) {
        setDoc(parentRef, {
          type: prefixe,
          groupe_id: groupeId,
          created_at: serverTimestamp(),
          participants: [],
        }, { merge: true }).catch(() => {});
      }
    }).catch(() => {});

    /* TRI DESCENDANT, puis remise à l'endroit côté client.
       En ascendant, `limit(200)` renvoyait les 200 messages les PLUS ANCIENS : passé ce
       cap, une classe restait figée sur le début de sa conversation et aucun message
       nouveau n'apparaissait plus - l'écoute temps réel continuait de fonctionner, mais
       sur une fenêtre qui n'atteignait jamais la fin du fil.
       En descendant, la fenêtre suit toujours les messages récents ; `reverse()` rétablit
       l'ordre de lecture. */
    const q = query(
      collection(db, "chats", convId, "messages"),
      orderBy("createdAt", "desc"),
      limit(fenetre)
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
      setEncorePlus(snap.size >= fenetre);
    });
    return unsub;
  }, [groupeId, fenetre, prefixe]);

  /** Remonte dans l'historique en élargissant la fenêtre. */
  const chargerPlus = () => setFenetre(f => f + FENETRE);

  /**
   * @param {object|null} repondA  le message cité : `{ id, auteur_nom, extrait, type }`.
   *
   * L'EXTRAIT est FIGÉ à l'envoi, pas résolu à l'affichage. La fenêtre ne charge que les
   * derniers messages : citer un message plus ancien afficherait une citation vide, et
   * garder tout l'historique en mémoire pour l'éviter coûterait bien plus que ces
   * quelques centaines d'octets recopiés.
   */
  const sendMessage = async (auteur_id, auteur_nom, texte, fichier = null, repondA = null) => {
    if (!groupeId) return;
    const convId = groupeDocId(groupeId, prefixe);
    await addDoc(collection(db, "chats", convId, "messages"), {
      auteur_id,
      auteur_nom,
      texte: texte || "",
      fichier: fichier || null,
      type: fichier ? "fichier" : "texte",
      // Firestore n'a pas de schéma : les messages déjà écrits n'ont pas ce champ et
      // restent parfaitement lisibles. `null` plutôt qu'absent, pour que la forme du
      // document reste la même d'un message à l'autre.
      repond_a: repondA || null,
      createdAt: serverTimestamp(),
    });
    // Horodatage du dernier message sur le doc parent - sert de base au calcul du
    // badge "non lu" (comparé au dernier "lastRead" de chaque membre), le chat de
    // groupe n'ayant jusqu'ici aucune notion de lecture contrairement à la
    // messagerie privée (useFirebaseChat.unreadTotal).
    await setDoc(doc(db, "chats", convId), { lastMessageAt: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  // Marque le chat de ce groupe comme lu pour cet utilisateur - à appeler quand
  // il ouvre/consulte l'onglet de discussion du groupe.
  const markRead = async (userId) => {
    if (!groupeId || !userId) return;
    const convId = groupeDocId(groupeId, prefixe);
    // Objet IMBRIQUÉ, et non une clé en notation pointée.
    //
    // `setDoc` n'interprète pas les chemins pointés - seul `updateDoc` le fait. La version
    // précédente écrivait `{ "lastRead.<uid>": ... }`, ce qui créait un champ LITTÉRAL portant
    // un point dans son nom, à la racine du document. La lecture, elle, fait
    // `data.lastRead?.[myId]` : elle ne trouvait donc jamais rien, le « dernier lu » restait
    // nul, et le badge de non-lus repartait de l'origine des temps - ouvrir la conversation
    // ou y répondre n'y changeait rien.
    //
    // La crainte qui avait motivé la notation pointée (« un objet imbriqué écraserait les
    // autres utilisateurs ») est infondée : avec `merge: true`, Firestore fusionne les maps
    // clé par clé et ne touche qu'à la sous-clé fournie.
    try {
      await setDoc(doc(db, "chats", convId), { lastRead: { [userId]: serverTimestamp() } }, { merge: true });
    } catch (e) {
      // Plus de `.catch(() => {})` muet : c'est lui qui aurait révélé le défaut plus tôt.
      console.warn("[useGroupeChat] marquage de lecture échoué:", e?.message || e);
    }
  };

  return { messages, sendMessage, markRead, chargerPlus, encorePlus };
}

// ── Badge "non lu" agrégé sur plusieurs chats de groupe ─────────────────────
// Pour chaque groupe : compare lastMessageAt (mis à jour par sendMessage) au
// lastRead[myId] (mis à jour par markRead) sur le doc parent ; si un nouveau
// message est arrivé depuis la dernière lecture, on lit ces messages-là et on
// compte CEUX DES AUTRES - voir le commentaire en place du filtre.
// Jusqu'ici le badge "Messages" du dashboard ne reflétait jamais l'activité
// réelle du chat de groupe, qui n'avait aucune notion de lecture.
export function useGroupesChatUnread(groupeIds, myId, prefixe = "groupe") {
  const [parGroupe, setParGroupe] = useState({});
  const countsRef = useRef({});

  useEffect(() => {
    if (!myId || !groupeIds || groupeIds.length === 0) { setParGroupe({}); return; }
    countsRef.current = {};

    const recompute = () => setParGroupe({ ...countsRef.current });

    const unsubs = groupeIds.filter(Boolean).map(gid => {
      const convId = groupeDocId(gid, prefixe);
      const parentRef = doc(db, "chats", convId);
      return onSnapshot(parentRef, async (snap) => {
        const data = snap.data() || {};
        const lastMessageAt = data.lastMessageAt || null;
        const lastRead = data.lastRead?.[myId] || null;

        if (!lastMessageAt || (lastRead && lastRead.toMillis() >= lastMessageAt.toMillis())) {
          countsRef.current[gid] = 0;
          recompute();
          return;
        }
        try {
          // On LIT les messages au lieu de les compter côté serveur, parce qu'il faut en
          // exclure les siens : `getCountFromServer` comptait tout, si bien qu'envoyer un
          // message incrémentait son propre badge. Firestore interdit de combiner
          // `createdAt >` et `auteur_id !=` dans une même requête (deux inégalités sur deux
          // champs différents), d'où le filtre côté client. Le volume lu est borné par le
          // nombre de non-lus - quelques documents, jamais tout l'historique.
          //
          // Effet de bord voulu : la course entre `lastRead` et `lastMessageAt`, qui portent
          // tous deux un horodatage serveur, ne peut plus faire clignoter un badge pour un
          // message qu'on vient soi-même d'écrire.
          const messagesRef = collection(db, "chats", convId, "messages");
          const q = lastRead
            ? query(messagesRef, where("createdAt", ">", lastRead), limit(100))
            : query(messagesRef, limit(100));
          const snapMsgs = await getDocs(q);
          countsRef.current[gid] = snapMsgs.docs.filter(d => d.data()?.auteur_id !== myId).length;
        } catch {
          countsRef.current[gid] = 0;
        }
        recompute();
      }, () => { countsRef.current[gid] = 0; recompute(); });
    });

    return () => unsubs.forEach(u => u());
  }, [myId, JSON.stringify(groupeIds), prefixe]); // eslint-disable-line react-hooks/exhaustive-deps

  return parGroupe;
}

/**
 * Le total, pour un badge d'onglet. Simple somme du détail ci-dessus.
 *
 * Le détail est né d'un constat d'usage : un badge agrégé sur plusieurs classes ne tombe pas
 * à zéro quand on en ouvre une seule, et rien ne disait OÙ étaient les messages restants.
 * Le total reste utile sur l'onglet ; le détail sert à l'indiquer classe par classe.
 */
export function useGroupesChatUnreadTotal(groupeIds, myId, prefixe = "groupe") {
  const parGroupe = useGroupesChatUnread(groupeIds, myId, prefixe);
  return Object.values(parGroupe).reduce((a, b) => a + b, 0);
}

/**
 * Les non-lus des GROUPES LIBRES, pour la pastille de l'onglet.
 *
 * Le calcul doit vivre chez le tableau de bord, pas dans l'écran des groupes : la pastille
 * doit s'allumer alors même que l'onglet n'est pas ouvert - donc que le composant n'est pas
 * monté. D'où cette liste chargée ici, et non remontée par un enfant.
 *
 * `null` en cas d'échec plutôt que zéro : une pastille éteinte affirme « rien de nouveau »,
 * ce qu'on ne sait pas quand la requête n'a pas abouti. Elle reste alors simplement absente.
 */
export function useGroupesLibresNonLus(token, myId) {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    if (!token || !myId) { setIds([]); return; }
    let vivant = true;
    (async () => {
      try {
        const base = process.env.REACT_APP_API_URL || "http://localhost:5001";
        const r = await fetch(`${base}/api/conversations`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        // Les groupes SUPERVISÉS sont exclus : la direction les lit sans en être membre,
        // et faire clignoter une pastille pour chaque message de chaque groupe de
        // l'entreprise rendrait l'onglet illisible.
        if (vivant && r.ok) setIds((d.conversations || []).filter(c => !c.supervision).map(c => c.id));
      } catch { /* pastille absente plutôt que fausse */ }
    })();
    return () => { vivant = false; };
  }, [token, myId]);

  return useGroupesChatUnreadTotal(ids, myId, "libre");
}
