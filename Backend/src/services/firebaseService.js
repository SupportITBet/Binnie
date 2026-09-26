// src/services/firebaseService.js

import { db } from "../config/firebase.js";

export const sendMessage = async (chatId, message) => {
  return await db.collection("chats")
    .doc(chatId)
    .collection("messages")
    .add(message);
};