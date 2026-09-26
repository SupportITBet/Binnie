import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, doc, query, orderBy,
  onSnapshot, addDoc, setDoc, updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

// Même convention que côté prospect
const chatDocId = (assignationId) => `parcours_${assignationId}`;

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
 * Hook chat Firestore côté assistante/dashboard.
 * @param {string} assignationId  - ID de l'assignation (parcours_parcours_assignationId dans Firestore)
 * @param {object} profil         - admin_profil du dashboard ({ id, nom, prenom, role })
 * @param {object} assignation    - données de l'assignation (prospect_nom, assistante_id…)
 */
export function useAssistanteChat(assignationId, profil, assignation) {
  const myId   = profil?.id || "";
  const myName = [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || profil?.email || "Assistante";

  const prospectId   = assignation?.prospect_id   || "";
  const prospectName = assignation?.prospect_name  || assignation?.prospect_nom || "Prospect";

  const convId = assignationId ? chatDocId(assignationId) : null;

  const [messages,    setMessages]    = useState([]);
  const [conv,        setConv]        = useState(null);
  const [unread,      setUnread]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [initialized, setInitialized] = useState(false);

  const prevMsgCount = useRef(0);
  const isFirstSnap  = useRef(true);

  const initConv = useCallback(async () => {
    if (!convId || !myId || initialized) return;
    setLoading(true);
    try {
      // On met à jour les champs assistante sans écraser les données prospect
      await setDoc(
        doc(db, "chats", convId),
        {
          assignation_id:  assignationId,
          assistante_id:   myId,
          assistante_name: myName,
          participants:    prospectId ? [prospectId, myId] : [myId],
          user2_id:        myId,
          user2_name:      myName,
          user2_role:      "assistante",
          last_message_at: serverTimestamp(),
          unread:          { [myId]: 0 },
        },
        { merge: true }
      );
      setInitialized(true);
    } catch (e) {
      console.warn("[AssistanteChat] initConv:", e.message);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  }, [convId, myId, myName, prospectId, assignationId, initialized]);

  useEffect(() => {
    if (!convId || !initialized) return;
    isFirstSnap.current = true;

    const q = query(
      collection(db, "chats", convId, "messages"),
      orderBy("created_at", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

      if (!isFirstSnap.current && msgs.length > prevMsgCount.current) {
        const newest = msgs[msgs.length - 1];
        if (newest?.from_id !== myId) playNotifSound();
      }
      prevMsgCount.current = msgs.length;
      isFirstSnap.current  = false;

      updateDoc(doc(db, "chats", convId), { [`unread.${myId}`]: 0 }).catch(() => {});
    }, (err) => console.error("[AssistanteChat]", err.message));

    return () => unsub();
  }, [convId, initialized, myId]);

  useEffect(() => {
    if (!convId || !initialized) return;
    const unsub = onSnapshot(doc(db, "chats", convId), (snap) => {
      if (snap.exists()) {
        setConv({ id: snap.id, ...snap.data() });
        setUnread(snap.data()?.unread?.[myId] || 0);
      }
    }, () => {});
    return () => unsub();
  }, [convId, initialized, myId]);

  const sendMessage = useCallback(async (content) => {
    const text = content?.trim() || "";
    if (!text || !convId || !myId) return;

    await addDoc(collection(db, "chats", convId, "messages"), {
      from_id:    myId,
      from_name:  myName,
      from_role:  "assistante",
      content:    text,
      created_at: serverTimestamp(),
      read_by:    [myId],
    });

    const otherId = conv?.prospect_id || prospectId;
    await updateDoc(doc(db, "chats", convId), {
      last_message:    text.slice(0, 100),
      last_message_at: serverTimestamp(),
      ...(otherId ? { [`unread.${otherId}`]: (conv?.unread?.[otherId] || 0) + 1 } : {}),
      [`unread.${myId}`]: 0,
    });
  }, [convId, myId, myName, conv, prospectId]);

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
    return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"short" });
  };

  return { myId, convId, messages, conv, unread, loading, initialized, initConv, sendMessage, fmtTime };
}
