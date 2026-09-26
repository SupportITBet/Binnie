import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, doc, query, where, orderBy,
  onSnapshot, addDoc, setDoc, updateDoc,
  serverTimestamp, getDocs, Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

const API_URL  = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHdrs = (token) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token || localStorage.getItem("admin_token")}`,
});

// ── Identifiant de conversation déterministe (stable entre les deux users) ──
const convId = (id1, id2) => [id1, id2].sort().join("_");

// ── Son de notification via Web Audio API (aucun fichier requis) ──────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

// ── Notification navigateur ────────────────────────────────────────────────
function requestNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotif(title, body, onClick) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // déjà visible, pas besoin
  const notif = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag:  "bet-chat",
    renotify: true,
  });
  notif.onclick = () => { window.focus(); notif.close(); onClick?.(); };
}

export function useFirebaseChat({ overrideProfil, overrideToken } = {}) {
  const profil        = overrideProfil || JSON.parse(localStorage.getItem("admin_profil") || "{}");
  const myId          = profil?.id        || "";
  const myName        = [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || profil?.email || "";
  const myRole        = profil?.role      || "";
  const myAvatarUrl   = profil?.avatar_url || null;

  const [conversations, setConversations]   = useState([]);
  const [messages,      setMessages]        = useState([]);
  const [activeConvId,  setActiveConvId]    = useState(null);
  const [contacts,      setContacts]        = useState([]);
  const [onlineUsers,   setOnlineUsers]     = useState({});
  const [loadingConvs,  setLoadingConvs]    = useState(true);

  const msgUnsubRef    = useRef(null);
  const prevConvsRef   = useRef({}); // { [convId]: unreadCount } pour détecter les nouveaux messages
  const prevMsgCount   = useRef(0);  // nb messages déjà chargés dans la conv active
  const isFirstLoad    = useRef(true); // ignorer le chargement initial

  // ── Demander la permission de notification au premier montage ─────────────
  useEffect(() => { requestNotifPermission(); }, []);

  // ── 1. Écoute en temps réel de mes conversations ──────────────────────────
  useEffect(() => {
    if (!myId) return;

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", myId),
      orderBy("last_message_at", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setConversations(convs);
      setLoadingConvs(false);

      // Détecter un nouveau message non lu dans une autre conversation que la conv active
      if (!isFirstLoad.current) {
        convs.forEach((conv) => {
          const unread = conv.unread?.[myId] || 0;
          const prevUnread = prevConvsRef.current[conv.id] || 0;
          if (unread > prevUnread) {
            // Il y a un nouveau message dans cette conv
            const senderName = conv.user1_id === myId ? conv.user2_name : conv.user1_name;
            const preview = conv.last_message || "Nouveau message";
            const previewShort = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;
            playNotifSound();
            showBrowserNotif(`💬 ${senderName}`, previewShort);
            // Le toast + la banderole persistante sont désormais gérés par useNotifications
            // (table `notifications`, alimentée par le Backend au moment de l'envoi - voir
            // sendMessage ci-dessous) : même mécanisme que les autres notifications, plutôt
            // qu'un toast local ici qui aurait fait doublon.
          }
        });
      }

      // Mettre à jour le snapshot précédent
      const next = {};
      convs.forEach((c) => { next[c.id] = c.unread?.[myId] || 0; });
      prevConvsRef.current = next;

      // Patcher mon avatar dans les convs qui ne l'ont pas encore (migration silencieuse)
      if (myAvatarUrl) {
        convs.forEach((c) => {
          const isUser1 = c.user1_id === myId;
          const myField = isUser1 ? "user1_avatar" : "user2_avatar";
          if (!c[myField]) {
            updateDoc(doc(db, "chats", c.id), { [myField]: myAvatarUrl }).catch(() => {});
          }
        });
      }

      isFirstLoad.current = false;
    }, (err) => {
      if (err.code === "failed-precondition") {
        console.warn("⚠️ Firestore : index composite requis →", err.message);
      }
      setLoadingConvs(false);
    });

    return () => unsub();
  }, [myId]);

  // ── 2. Écoute en temps réel des messages de la conversation active ────────
  useEffect(() => {
    if (msgUnsubRef.current) { msgUnsubRef.current(); msgUnsubRef.current = null; }
    if (!activeConvId) { setMessages([]); prevMsgCount.current = 0; return; }

    const q = query(
      collection(db, "chats", activeConvId, "messages"),
      orderBy("created_at", "asc")
    );

    let firstSnap = true;
    msgUnsubRef.current = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      markAsRead(activeConvId);

      // Son uniquement pour les nouveaux messages reçus (pas l'envoi initial)
      if (!firstSnap && msgs.length > prevMsgCount.current) {
        const newest = msgs[msgs.length - 1];
        if (newest?.from_id !== myId) {
          playNotifSound();
        }
      }
      prevMsgCount.current = msgs.length;
      firstSnap = false;
    });

    return () => { if (msgUnsubRef.current) msgUnsubRef.current(); };
  }, [activeConvId]); // eslint-disable-line

  // ── 3. Écoute de la présence (en ligne / hors ligne) ─────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "presence"), (snap) => {
      const status = {};
      snap.docs.forEach((d) => { status[d.id] = d.data(); });
      setOnlineUsers(status);
    });
    return () => unsub();
  }, []);

  // ── 4. Publier ma propre présence ─────────────────────────────────────────
  useEffect(() => {
    if (!myId) return;

    const ref = doc(db, "presence", myId);
    setDoc(ref, { userId: myId, nom: myName, role: myRole, avatar_url: myAvatarUrl, statut: "en_ligne", dernierVu: serverTimestamp() });

    const interval = setInterval(() => {
      setDoc(ref, { dernierVu: serverTimestamp() }, { merge: true });
    }, 30000);

    const handleOffline = () =>
      setDoc(ref, { statut: "inactif", dernierVu: serverTimestamp() }, { merge: true });

    window.addEventListener("beforeunload", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleOffline);
      handleOffline();
    };
  }, [myId, myName, myRole]);

  // ── 5. Charger les contacts (autres utilisateurs) ─────────────────────────
  const fetchContacts = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/messages/contacts`, { headers: authHdrs(overrideToken) });
      if (!r.ok) return;
      const { contacts: list } = await r.json();
      setContacts(list || []);
    } catch {}
  }, []);

  // ── 6. Ouvrir ou créer une conversation ───────────────────────────────────
  const openOrCreateConv = useCallback(async (contact) => {
    if (!myId) return;

    const cid = convId(myId, contact.id);
    const ref  = doc(db, "chats", cid);

    // Vérifier si elle existe déjà
    const snap = await getDocs(
      query(collection(db, "chats"), where("participants", "array-contains", myId))
    );
    const exists = snap.docs.some((d) => d.id === cid);

    if (!exists) {
      const contactName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || contact.email;
      await setDoc(ref, {
        participants:    [myId, contact.id],
        user1_id:        myId,
        user1_name:      myName,
        user1_role:      myRole,
        user1_avatar:    myAvatarUrl || null,
        user2_id:        contact.id,
        user2_name:      contactName,
        user2_role:      contact.role,
        user2_avatar:    contact.avatar_url || null,
        last_message:    "",
        last_message_at: serverTimestamp(),
        created_at:      serverTimestamp(),
        unread:          { [myId]: 0, [contact.id]: 0 },
      });
    } else {
      // Mettre à jour mon avatar dans la conv existante
      const existingDoc = snap.docs.find((d) => d.id === cid);
      if (existingDoc) {
        const isUser1 = existingDoc.data().user1_id === myId;
        await updateDoc(ref, { [isUser1 ? "user1_avatar" : "user2_avatar"]: myAvatarUrl || null });
      }
    }

    setActiveConvId(cid);
  }, [myId, myName, myRole]);

  // ── 7. Envoyer un message (avec pièces jointes optionnelles) ────────────
  // attachments = [{ url, name, type, size }]
  const sendMessage = useCallback(async (content, attachments = []) => {
    const text = content?.trim() || "";
    if (!text && attachments.length === 0) return;
    if (!activeConvId || !myId) return;

    const convRef = doc(db, "chats", activeConvId);

    await addDoc(collection(db, "chats", activeConvId, "messages"), {
      from_id:     myId,
      from_name:   myName,
      from_role:   myRole,
      from_avatar: myAvatarUrl || null,
      content:     text,
      attachments: attachments,
      created_at:  serverTimestamp(),
      read_by:     [myId],
    });

    const conv = conversations.find((c) => c.id === activeConvId);
    const otherId = conv?.participants?.find((p) => p !== myId);
    const unreadUpdate = otherId ? { [`unread.${otherId}`]: (conv?.unread?.[otherId] || 0) + 1 } : {};
    const preview = text || (attachments.length > 0 ? `📎 ${attachments[0].name}` : "");

    await updateDoc(convRef, {
      last_message:    preview.slice(0, 100),
      last_message_at: serverTimestamp(),
      ...unreadUpdate,
    });

    // Notification persistante (banderole) côté destinataire - jusqu'ici un nouveau message
    // n'était visible que via le badge chiffré sur l'onglet "Messages", jamais dans la
    // banderole comme les autres notifications (paiement, assignation...). L'écriture du
    // message se fait client → Firestore directement, donc c'est ici qu'on déclenche l'appel
    // au Backend qui, lui, alimente la vraie table `notifications`.
    if (otherId) {
      fetch(`${API_URL}/api/notifications`, {
        method: "POST",
        headers: authHdrs(overrideToken),
        body: JSON.stringify({
          user_id: otherId,
          type:    "info",
          titre:   `💬 ${myName}`,
          message: preview.length > 80 ? preview.slice(0, 80) + "…" : preview,
          meta:    { chat_conv_id: activeConvId },
        }),
      }).catch(() => {});
    }
  }, [activeConvId, myId, myName, myRole, conversations, overrideToken]);

  // ── 8. Marquer les messages comme lus ────────────────────────────────────
  const markAsRead = useCallback(async (cid) => {
    if (!cid || !myId) return;
    try {
      await updateDoc(doc(db, "chats", cid), { [`unread.${myId}`]: 0 });
    } catch {}
  }, [myId]);

  // ── Helpers UI ────────────────────────────────────────────────────────────
  const partnerName = (conv) =>
    conv?.user1_id === myId ? conv.user2_name : conv.user1_name;

  const partnerRole = (conv) =>
    conv?.user1_id === myId ? conv.user2_role : conv.user1_role;

  const partnerId = (conv) =>
    conv?.user1_id === myId ? conv.user2_id : conv.user1_id;

  const partnerAvatar = (conv) =>
    conv?.user1_id === myId ? (conv?.user2_avatar || null) : (conv?.user1_avatar || null);

  const isOnline = (uid) => onlineUsers[uid]?.statut === "en_ligne";

  const unreadTotal = conversations.reduce((s, c) => s + (c.unread?.[myId] || 0), 0);

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  return {
    myId, myName, myRole, myAvatarUrl,
    conversations, messages, activeConvId, activeConv,
    setActiveConvId,
    contacts, fetchContacts,
    loadingConvs, unreadTotal,
    openOrCreateConv, sendMessage, markAsRead,
    partnerName, partnerRole, partnerId, partnerAvatar, isOnline, fmtTime,
    onlineUsers,
    requestNotifPermission,
  };
}
