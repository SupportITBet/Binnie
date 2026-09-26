import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Écoute en temps réel tous les chats prospects de l'assistante connectée.
 * Retourne un objet { [assignation_id]: unreadCount } et le total.
 */
export function useProspectChatsUnread(assistanteId) {
  const [unreadMap, setUnreadMap] = useState({});
  const isFirst = useRef(true);

  useEffect(() => {
    if (!assistanteId) return;
    isFirst.current = true;

    const q = query(
      collection(db, "chats"),
      where("assistante_id", "==", assistanteId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.assignation_id) {
          map[data.assignation_id] = data.unread?.[assistanteId] || 0;
        }
      });
      setUnreadMap(map);
      isFirst.current = false;
    }, () => {});

    return () => unsub();
  }, [assistanteId]);

  const totalUnread = Object.values(unreadMap).reduce((s, v) => s + v, 0);

  return { unreadMap, totalUnread };
}
