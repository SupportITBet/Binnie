import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseKeyPath = path.resolve(__dirname, "../../firebase-key.json");
let db = null;

try {
  if (!fs.existsSync(firebaseKeyPath)) throw new Error("fichier introuvable");
  if (fs.statSync(firebaseKeyPath).size === 0) throw new Error("fichier vide");
  const serviceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log("✅ Firebase initialisé");
} catch (err) {
  console.warn("⚠️ Firebase non initialisé :", err.message);
}
export { db };