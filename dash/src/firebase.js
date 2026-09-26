// ── src/firebase.js ──────────────────────────────────────────
const firebaseConfig = `
// src/config/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore }  from 'firebase/firestore';
import { getAuth }       from 'firebase/auth';
import { getMessaging }  from 'firebase/messaging';
 
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};
 
const app = initializeApp(firebaseConfig);
export const db      = getFirestore(app);
export const auth    = getFirestore(app);
export const messaging = getMessaging(app);
`;