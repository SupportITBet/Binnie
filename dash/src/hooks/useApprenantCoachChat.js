import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, doc, query, orderBy,
  onSnapshot, addDoc, updateDoc, setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { supabase } from "../config/supabase";

// Même convention que le coach (useAssistanteChat)
const chatDocId = (assignationId) => `parcours_${assignationId}`;

export function useApprenantCoachChat(assignationId, profil) {
  const [resolvedId, setResolvedId] = useState(profil?.id || "");
  const myName = [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || profil?.email || "Apprenant";
  const convId = assignationId ? chatDocId(assignationId) : null;
  const myId   = resolvedId;

  // Si profil.id absent, récupérer l'UID depuis la session Supabase
  useEffect(() => {
    if (profil?.id) { setResolvedId(profil.id); return; }
    supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id;
      if (uid) setResolvedId(uid);
    });
  }, [profil?.id]);

  const [messages,    setMessages]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [initialized, setInitialized] = useState(false);
  const isFirstSnap = useRef(true);

  useEffect(() => {
    if (!convId) { setLoading(false); return; }
    isFirstSnap.current = true;
    setLoading(true);

    const q = query(
      collection(db, "chats", convId, "messages"),
      orderBy("created_at", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setLoading(false);
      setInitialized(true);
      isFirstSnap.current = false;

      // Marquer les messages comme lus
      if (myId) {
        updateDoc(doc(db, "chats", convId), { [`unread.${myId}`]: 0 }).catch(() => {});
      }
    }, (err) => {
      console.warn("[ApprenantCoachChat]", err.message);
      setLoading(false);
      setInitialized(true);
    });

    return () => unsub();
  }, [convId, myId]);

  const sendMessage = useCallback(async (text) => {
    const content = text?.trim() || "";
    if (!content || !convId || !myId) {
      console.warn("[ApprenantCoachChat] sendMessage bloqué:", { content: !!content, convId, myId });
      return;
    }

    try {
      // Créer le doc parent s'il n'existe pas encore (merge pour ne pas écraser les données du coach)
      await setDoc(doc(db, "chats", convId), {
        assignation_id:  convId.replace("parcours_", ""),
        apprenant_id:    myId,
        apprenant_name:  myName,
        participants:    [myId],
        last_message:    content.slice(0, 100),
        last_message_at: serverTimestamp(),
      }, { merge: true });

      await addDoc(collection(db, "chats", convId, "messages"), {
        from_id:    myId,
        from_name:  myName,
        from_role:  "apprenant",
        content,
        created_at: serverTimestamp(),
        read_by:    [myId],
      });
    } catch (err) {
      console.error("[ApprenantCoachChat] Erreur envoi:", err.message);
      throw err;
    }
  }, [convId, myId, myName]);

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };

  return { myId, messages, loading, initialized, sendMessage, fmtTime };
}
