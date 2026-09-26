import { useState, useEffect, useRef } from 'react';
import { collection, doc, query, where, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIREBASE_ACTIF } from '../services/firebase';

/**
 * Les non-lus des groupes de discussion libres, pour la pastille de l'onglet.
 *
 * Le calcul vit ICI, chez le tableau de bord, et non dans l'écran des groupes : la pastille
 * doit s'allumer alors même que l'onglet n'est pas ouvert - donc que l'écran n'est pas monté.
 *
 * ⚠️ COPIE VOLONTAIRE de la logique de `dash/src/hooks/useGroupeChat.js`. Les deux
 * plateformes ne partagent pas de code ; les groupes libres, eux, partagent leur fil
 * (`chats/libre_{id}`). Toute correction ici doit être reportée là-bas.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const jeton = () => localStorage.getItem('bet_access_token') || localStorage.getItem('admin_token') || '';

export function useGroupesLibresNonLus(monId) {
  const [ids, setIds] = useState([]);
  const [parGroupe, setParGroupe] = useState({});
  const comptes = useRef({});

  // 1. Quels groupes ? Une seule requête, au montage.
  useEffect(() => {
    if (!monId) { setIds([]); return; }
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/conversations`, { headers: { Authorization: `Bearer ${jeton()}` } });
        const d = await r.json();
        // Les groupes SUPERVISÉS sont exclus : la direction les lit sans en être membre,
        // et une pastille pour chaque message de chaque groupe rendrait l'onglet illisible.
        if (vivant && r.ok) setIds((d.conversations || []).filter(c => !c.supervision).map(c => c.id));
      } catch { /* pastille absente plutôt que fausse */ }
    })();
    return () => { vivant = false; };
  }, [monId]);

  // 2. Combien de non-lus dans chacun ?
  useEffect(() => {
    if (!FIREBASE_ACTIF || !db || !monId || !ids.length) { setParGroupe({}); return; }
    comptes.current = {};
    const recalculer = () => setParGroupe({ ...comptes.current });

    const unsubs = ids.map(gid => {
      const convId = `libre_${gid}`;
      return onSnapshot(doc(db, 'chats', convId), async (snap) => {
        const data = snap.data() || {};
        const dernier = data.lastMessageAt || null;
        const lu = data.lastRead?.[monId] || null;

        if (!dernier || (lu && lu.toMillis() >= dernier.toMillis())) {
          comptes.current[gid] = 0; recalculer(); return;
        }
        try {
          /* On LIT les messages au lieu de les compter côté serveur, parce qu'il faut en
             exclure les siens : un comptage brut incrémenterait son propre badge à chaque
             envoi. Firestore interdit `createdAt >` et `auteur_id !=` dans une même
             requête - deux inégalités sur deux champs - d'où le filtre côté client. Le
             volume lu est borné par le nombre de non-lus, jamais tout l'historique. */
          const messages = collection(db, 'chats', convId, 'messages');
          const q = lu ? query(messages, where('createdAt', '>', lu), limit(100)) : query(messages, limit(100));
          const res = await getDocs(q);
          comptes.current[gid] = res.docs.filter(d => d.data()?.auteur_id !== monId).length;
        } catch { comptes.current[gid] = 0; }
        recalculer();
      }, () => { comptes.current[gid] = 0; recalculer(); });
    });

    return () => unsubs.forEach(u => u());
  }, [monId, JSON.stringify(ids)]); // eslint-disable-line react-hooks/exhaustive-deps

  return Object.values(parGroupe).reduce((a, b) => a + b, 0);
}
