import { initializeApp, getApps } from 'firebase/app';
import { getFirestore }           from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

// Évite la double initialisation en HMR
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db = getFirestore(app);

// FCM uniquement si le navigateur le supporte (HTTPS requis)
export let messaging = null;
isSupported()
  .then(ok => { if (ok) messaging = getMessaging(app); })
  .catch(() => {});
