import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, limit,
  onSnapshot, addDoc, serverTimestamp, updateDoc, doc
} from 'firebase/firestore';
import { db } from '../config/firebase';

export function useMessages(conversationId, limitCount = 50) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!conversationId) return;

    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(limitCount)
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsub;
  }, [conversationId]);

  const sendMessage = async (userId, contenu) => {
    await addDoc(
      collection(db, 'conversations', conversationId, 'messages'),
      {
        envoyePar: userId,
        contenu,
        statut: 'envoye',
        timestamp: serverTimestamp(),
      }
    );

    await updateDoc(doc(db, 'conversations', conversationId), {
      'dernierMessage.contenu': contenu,
      'dernierMessage.envoyePar': userId,
      'dernierMessage.timestamp': serverTimestamp(),
    });
  };

  return { messages, loading, sendMessage };
}