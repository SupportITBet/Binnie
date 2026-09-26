import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, doc, query, orderBy,
  onSnapshot, addDoc, setDoc, updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

// La conversation est identifiée par l'assignation_id (commun aux deux côtés).
// Le dashboard de l'assistante retrouve le chat via cet ID aussi.
const chatDocId = (assignationId) => `parcours_${assignationId}`;

// Deux rôles dans la conversation : prospect (Supabase UUID) et assistante (assistantes.id)
const PROSPECT_KEY   = "prospect";
const ASSISTANTE_KEY = "assistante";

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

/**
 * Hook de chat Firebase pour le prospect / futur apprenant BET.
 *
 * ─ Clé de conversation : `parcours_{assignation_id}` ─
 * Cette clé est la même côté prospect (Frontend) et côté assistante (Dashboard).
 * Continuité garantie : l'historique persiste quand le prospect devient apprenant
 * car son Supabase UUID (myId) reste identique.
 */
export function useProspectChat(sbUser, assignation) {
  const myId = sbUser?.id || "";
  const myName = sbUser ? (() => {
    const m = sbUser.user_metadata || {};
    return (m.prenom && m.nom) ? `${m.prenom} ${m.nom}` : m.full_name || sbUser.email?.split("@")[0] || "Prospect";
  })() : "";

  const assignationId  = assignation?.assignation_id  || "";
  // assistantes.id (CRM) est un espace d'id différent de utilisateurs.id (celui utilisé
  // par useFirebaseChat/useAssistanteChat côté dashboard comme "myId" - profil.id). Sans
  // repointer sur utilisateur_id, le `participants` de la conversation contenait l'id CRM
  // et ne matchait jamais la requête "participants array-contains myId" du dashboard tant
  // que l'assistante n'avait pas elle-même ouvert ce chat une première fois (ce qui
  // écrase le doc avec le bon id) - la conversation restait invisible dans l'onglet
  // Messages, seulement accessible via Prospects parcours → bouton chat.
  const assistanteId   = assignation?.utilisateur_id || assignation?.assistante_id || "";
  const assistanteName = assignation
    ? `${assignation.assistante_prenom || ""} ${assignation.assistante_nom || ""}`.trim()
    : "";

  // La conversation dans Firestore
  const convId = assignationId ? chatDocId(assignationId) : null;

  const [messages,    setMessages]    = useState([]);
  const [conv,        setConv]        = useState(null);
  const [unread,      setUnread]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error,       setError]       = useState(null);

  const prevMsgCount   = useRef(0);
  const isFirstSnap    = useRef(true);
  const prevUnreadRef  = useRef(0);
  const isFirstUnread  = useRef(true);

  // ── Créer ou rejoindre la conversation ─────────────────────────
  // setDoc + { merge: true } : crée si inexistant, ne touche pas aux champs
  // existants (last_message, messages…). Fonctionne hors-ligne grâce à IndexedDB.
  const initConv = useCallback(async () => {
    if (!convId || !myId || initialized) return;
    setLoading(true); setError(null);
    try {
      await setDoc(
        doc(db, "chats", convId),
        {
          // Clé de routing pour le dashboard assistante
          assignation_id:  assignationId,
          assistante_id:   assistanteId,
          assistante_name: assistanteName,

          // Prospect
          prospect_id:     myId,
          prospect_name:   myName,

          // Compatibilité avec useFirebaseChat du dashboard
          participants:    [myId, assistanteId],
          user1_id:        myId,
          user1_name:      myName,
          user1_role:      PROSPECT_KEY,
          user2_id:        assistanteId,
          user2_name:      assistanteName,
          user2_role:      ASSISTANTE_KEY,

          last_message:    "",
          last_message_at: serverTimestamp(),
          created_at:      serverTimestamp(),
          unread:          { [myId]: 0, [assistanteId]: 0 },
        },
        { merge: true }
      );
      setInitialized(true);
    } catch (e) {
      // En cas de coupure réseau, Firestore met l'opération en file d'attente
      // et la rejoue dès la reconnexion. On continue quand même.
      console.warn("[ProspectChat] initConv queued:", e.message);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  }, [convId, myId, myName, assistanteId, assistanteName, assignationId, initialized]);

  // ── Écoute temps réel des messages ─────────────────────────────
  useEffect(() => {
    if (!convId || !initialized) return;
    isFirstSnap.current = true;

    const q = query(
      collection(db, "chats", convId, "messages"),
      orderBy("created_at", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);

        if (!isFirstSnap.current && msgs.length > prevMsgCount.current) {
          const newest = msgs[msgs.length - 1];
          if (newest?.from_id !== myId) playNotifSound();
        }
        prevMsgCount.current = msgs.length;
        isFirstSnap.current  = false;
        setError(null);

        updateDoc(doc(db, "chats", convId), {
          [`unread.${myId}`]: 0,
        }).catch(() => {});
      },
      (err) => {
        console.error("[ProspectChat]", err.message);
        if (err.code === "unavailable" || err.message.includes("offline")) {
          setError("En attente de connexion… Vos messages seront synchronisés automatiquement.");
        }
      }
    );
    return () => unsub();
  }, [convId, initialized, myId]);

  // ── Écoute du doc conversation - immédiate, sans attendre l'ouverture ──
  // Permet d'afficher le badge et jouer le son même si le chat est fermé.
  useEffect(() => {
    if (!convId || !myId) return;
    isFirstUnread.current = true;

    const unsub = onSnapshot(doc(db, "chats", convId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const newUnread = data.unread?.[myId] || 0;

      if (isFirstUnread.current) {
        prevUnreadRef.current = newUnread;
        isFirstUnread.current = false;
      } else if (newUnread > prevUnreadRef.current) {
        playNotifSound();
      }
      prevUnreadRef.current = newUnread;
      setUnread(newUnread);
      setConv({ id: snap.id, ...data });
    }, () => {});

    return () => unsub();
  }, [convId, myId]);

  // ── Présence prospect ──────────────────────────────────────────
  useEffect(() => {
    if (!myId || !initialized) return;
    const ref = doc(db, "presence", myId);
    setDoc(ref, { userId:myId, nom:myName, role:"prospect", statut:"en_ligne", dernierVu:serverTimestamp() }, { merge:true }).catch(()=>{});
    const iv = setInterval(() => setDoc(ref, { dernierVu:serverTimestamp() }, { merge:true }).catch(()=>{}), 30_000);
    const bye = () => setDoc(ref, { statut:"inactif", dernierVu:serverTimestamp() }, { merge:true }).catch(()=>{});
    window.addEventListener("beforeunload", bye);
    return () => { clearInterval(iv); window.removeEventListener("beforeunload", bye); bye(); };
  }, [myId, myName, initialized]);

  // ── Envoi d'un message ─────────────────────────────────────────
  // addDoc écrit dans le cache IndexedDB et synchronise dès la reconnexion.
  const sendMessage = useCallback(async (content) => {
    const text = content?.trim() || "";
    if (!text || !convId || !myId) return;

    await addDoc(collection(db, "chats", convId, "messages"), {
      from_id:    myId,
      from_name:  myName,
      from_role:  PROSPECT_KEY,
      content:    text,
      created_at: serverTimestamp(),
      read_by:    [myId],
    });

    await updateDoc(doc(db, "chats", convId), {
      last_message:    text.slice(0, 100),
      last_message_at: serverTimestamp(),
      [`unread.${assistanteId}`]: (conv?.unread?.[assistanteId] || 0) + 1,
      [`unread.${myId}`]: 0,
    });
  }, [convId, myId, myName, assistanteId, conv]);

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
    return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"short" });
  };

  return {
    myId, myName, convId, assistanteId, assistanteName,
    messages, conv, unread, loading, initialized, error,
    initConv, sendMessage, fmtTime,
  };
}
