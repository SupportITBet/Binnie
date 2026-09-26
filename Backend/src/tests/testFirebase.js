import { db } from "../config/firebase.js";

export const testFirebase = async () => {
  if (!db) {
    console.warn("⚠️ Firebase non disponible – test ignoré");
    return;
  }
  try {
    const snapshot = await db.collection("test").get();
    console.log("✅ Firebase connecté – documents :", snapshot.size);
  } catch (error) {
    console.error("❌ Firebase erreur :", error.message);
  }
};