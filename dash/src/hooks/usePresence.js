import { useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export function usePresence(userId) {
  useEffect(() => {
    if (!userId) return;

    const ref = doc(db, 'presence', userId);

    setDoc(ref, {
      userId,
      statut: 'en_ligne',
      dernierVu: serverTimestamp(),
    });

    const interval = setInterval(() => {
      setDoc(ref, { dernierVu: serverTimestamp() }, { merge: true });
    }, 30000);

    return () => {
      clearInterval(interval);
      setDoc(ref, {
        statut: 'inactif',
        dernierVu: serverTimestamp(),
      }, { merge: true });
    };
  }, [userId]);
}