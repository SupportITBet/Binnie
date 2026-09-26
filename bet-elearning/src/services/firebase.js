import { db } from '../config/firebase';
import {
  collection, doc, addDoc, setDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';

export const FIREBASE_ACTIF = !!(
  process.env.REACT_APP_FIREBASE_API_KEY &&
  process.env.REACT_APP_FIREBASE_PROJECT_ID
);

// ── Conversations (collection "chats") ───────────────────────────────────────

export async function obtenirOuCreerConversation(userId1, userId2, infoParticipants) {
  if (!db) return null;
  const convId  = [userId1, userId2].sort().join('_');
  const convRef = doc(db, 'chats_elearning', convId);
  await setDoc(convRef, {
    participants:     [userId1, userId2],
    participantsInfo: infoParticipants || {},
    dernierMessage:   '',
    dernierMessageAt: serverTimestamp(),
    nonLu: { [userId1]: false, [userId2]: false },
  }, { merge: true });
  return convId;
}

export function ecouterConversations(userId, callback) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'chats_elearning'),
    where('participants', 'array-contains', userId),
    orderBy('dernierMessageAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    if (err.code === 'failed-precondition') {
      console.warn('⚠️ Firestore : index composite requis pour chats_elearning →', err.message);
    } else {
      console.error('[ecouterConversations]', err);
    }
  });
}

export function ecouterMessages(convId, callback) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'chats_elearning', convId, 'messages'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[ecouterMessages]', err));
}

export async function envoyerMessage(convId, message, apercu) {
  if (!db) return null;
  const { participantsInfo, ...messageSansInfo } = message;
  const convRef = doc(db, 'chats_elearning', convId);
  await addDoc(collection(db, 'chats_elearning', convId, 'messages'), {
    ...messageSansInfo,
    timestamp: serverTimestamp(),
    lu:        false,
  });
  await setDoc(convRef, {
    participants:     convId.split('_'),
    // Ré-écrit à chaque message pour "réparer" une conv créée sans ces infos (voir MessagerieContext)
    ...(participantsInfo ? { participantsInfo } : {}),
    dernierMessage:   apercu ?? message.contenu,
    dernierMessageAt: serverTimestamp(),
    ...(message.destinataireId
      ? { nonLu: { [message.destinataireId]: true } }
      : {}),
  }, { merge: true });
}

export async function marquerCommeLu(convId, userId) {
  if (!db) return;
  await setDoc(doc(db, 'chats_elearning', convId), { nonLu: { [userId]: false } }, { merge: true });
}

// Republie mes propres infos (nom/rôle) sur la conversation - appelé à l'ouverture,
// pour réparer une conv où mon entrée participantsInfo est absente/incomplète,
// sans avoir besoin d'envoyer un message.
export async function assurerMesInfos(convId, userId, monInfo) {
  if (!db || !userId || !monInfo?.prenom) return;
  await setDoc(doc(db, 'chats_elearning', convId), {
    participants: convId.split('_'),
    participantsInfo: { [userId]: monInfo },
  }, { merge: true });
}

// ── Présence (/presence/{userId}) ────────────────────────────────────────────

export async function definirPresence(userId, infoUser) {
  if (!db) return;
  await setDoc(doc(db, 'presence_elearning', userId), {
    ...infoUser,
    enligne:          true,
    derniereActivite: serverTimestamp(),
  }, { merge: true });
}

export async function definirAbsence(userId) {
  if (!db) return;
  await setDoc(doc(db, 'presence_elearning', userId), {
    enligne:          false,
    derniereActivite: serverTimestamp(),
  }, { merge: true });
}

export function ecouterPresence(userId, callback) {
  if (!db) return () => {};
  return onSnapshot(doc(db, 'presence_elearning', userId), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ── Notifications (/notifications/{userId}/items/{itemId}) ───────────────────

export async function envoyerNotification(userId, notification) {
  if (!db) return;
  await addDoc(collection(db, 'notifications_elearning', userId, 'items'), {
    ...notification,
    lue:       false,
    createdAt: serverTimestamp(),
  });
}

export function ecouterNotifications(userId, callback) {
  if (!db) return () => {};
  const q = query(
    collection(db, 'notifications_elearning', userId, 'items'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[ecouterNotifications]', err));
}

export async function marquerNotificationLue(userId, notifId) {
  if (!db) return;
  await updateDoc(doc(db, 'notifications_elearning', userId, 'items', notifId), { lue: true });
}

export async function toutMarquerNotificationsLues(userId, notifIds) {
  if (!db || !notifIds.length) return;
  await Promise.all(
    notifIds.map(id =>
      updateDoc(doc(db, 'notifications_elearning', userId, 'items', id), { lue: true })
    )
  );
}
