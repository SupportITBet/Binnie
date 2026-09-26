import { db } from "./src/config/firebase.js";
if (!db) { console.log("no firestore"); process.exit(0); }
const snap = await db.collection("chats").get();
for (const d of snap.docs) {
  const data = d.data();
  console.log("DOC:", d.id, JSON.stringify({
    participants: data.participants,
    user1_id: data.user1_id, user1_name: data.user1_name,
    user2_id: data.user2_id, user2_name: data.user2_name,
    last_message: data.last_message,
  }));
}
process.exit(0);
