import { db } from "../config/firebase";
import { collection, addDoc } from "firebase/firestore";

export const ajouterTest = async () => {
  return await addDoc(collection(db, "test"), {
    nom: "Service Firebase",
    date: new Date()
  });
};