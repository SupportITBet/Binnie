import React, { useState, useEffect, useRef, useCallback } from "react";
import SelecteurEmoji, { insererAuCurseur } from "./SelecteurEmoji";
import { useFirebaseChat } from "../hooks/useFirebaseChat";
import { lienifier } from "../utils/lienifier";

import { uploadFichier } from "../utils/uploadFichier";
import { useEnregistreurVocal, microDisponible, dureeLisible } from "../hooks/useEnregistreurVocal";
const BET_COLOR = "#0891b2";
const BET_LIGHT = "#e0f2fe";
const API_URL   = process.env.REACT_APP_API_URL || "http://localhost:5001";
const MAX_FILES = 5; // maximum de PJ par message

/* ── Helpers pièces jointes ── */
const uploadTypeFor = (file) => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
};

const fileIcon = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf")                       return "📄";
  if (["doc","docx"].includes(ext))        return "📝";
  if (["xls","xlsx"].includes(ext))        return "📊";
  if (["ppt","pptx"].includes(ext))        return "📑";
  if (["zip","rar","7z"].includes(ext))    return "🗜️";
  if (["mp3","wav","ogg","m4a"].includes(ext)) return "🎵";
  if (["mp4","mov","webm"].includes(ext))  return "🎬";
  return "📎";
};

const fmtSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024)        return `${bytes}o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}Mo`;
};

// Keyframe spinner (injecté une seule fois)
if (typeof document !== "undefined" && !document.getElementById("msg-spinner-kf")) {
  const s = document.createElement("style"); s.id = "msg-spinner-kf";
  s.textContent = "@keyframes betSpin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}

const ROLE_LABELS = {
  super_admin:         "SuperAdmin",
  admin:               "Admin",
  manager:             "Manager",
  superviseur:         "Superviseur",
  deputy_superviseur:  "Deputy Sup.",
  responsable:         "Responsable",
  commercial:          "Commercial",
  gestionnaire:        "Gestionnaire",
  coach:               "Coach",
  data_collector:      "Data",
  rh:                  "RH / Paie",
  comptable:           "Comptable",
  onboarding:          "Onboarding",
  customer_care:       "Customer Care",
  placement_test:      "Placement Test",
  pedagogical_advisor: "Conseiller Péda.",
  assistant_elearning: "Assistant E-Learning",
  admin_elearning:     "Assistant E-Learning",
};

const Avatar = ({ name, size = 36, color = BET_COLOR, online = false, url = null }) => {
  const initials = name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "??";
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: url ? "transparent" : color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: size * 0.33, overflow: "hidden",
      }}>
        {url
          ? <img src={url} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentNode.textContent = initials; }} />
          : initials}
      </div>
      {online !== undefined && (
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: "50%",
          background: online ? "#22c55e" : "#d1d5db",
          border: "2px solid #fff",
        }} />
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════ */
export default function MessagerieTab({ accentColor = BET_COLOR, profil, token, openWithUser = null }) {
  const chat = useFirebaseChat({ overrideProfil: profil || undefined, overrideToken: token || undefined });
  /* LA PIÈCE JOINTE EST RÉSERVÉE AU PERSONNEL. Les types d'upload employés ici
     (`image`, `video`, `audio`, `document`) exigent tous un jeton d'administration : la
     sélection d'un apprenant échouait en 403, sans explication. Le bouton est grisé et
     dit la raison. Le micro et les emojis restent ouverts. */
  const sansPieceJointe = ["apprenant", "parent"].includes(profil?.role || chat?.profil?.role);
  const [input, setInput]                 = useState("");
  const [showNewConv, setShowNewConv]     = useState(false);
  const [searchContact, setSearchContact] = useState("");
  const [pendingFiles, setPendingFiles]   = useState([]); // pièces jointes en attente
  // Trois minutes, comme dans les conversations de groupe : au-delà ce n'est plus un
  // message mais un appel, et personne ne réécoute huit minutes pour une consigne.
  const vocal = useEnregistreurVocal({ dureeMaxS: 180 });
  const [envoiVocal, setEnvoiVocal] = useState(false);
  const [pctVocal, setPctVocal]     = useState(0);
  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);
  // La zone de saisie, pour insérer un emoji là où est le curseur.
  const champSaisieRef = useRef(null);

  // Scroll automatique en bas à chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  // Auto-ouvrir une conversation directement avec une personne précise.
  // openWithUser = { uid, nom, role, photo, ts }
  // Le ts garantit le re-déclenchement même si on clique sur la même personne deux fois.
  // On construit le contact directement depuis les props - pas de fetch contacts, pas de scope filtering.
  useEffect(() => {
    if (!openWithUser?.uid || !chat.myId) return;
    const contact = {
      id:         openWithUser.uid,
      nom:        openWithUser.nom  || "",
      prenom:     "",
      role:       openWithUser.role || "",
      avatar_url: openWithUser.photo || null,
    };
    chat.openOrCreateConv(contact);
  }, [openWithUser, chat.myId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Upload d'une pièce jointe vers Cloudinary ── */
  const uploadFile = useCallback(async (file) => {
    const id         = `${Date.now()}-${Math.random()}`;
    const uploadType = uploadTypeFor(file);
    setPendingFiles(p => [...p, { id, name: file.name, type: uploadType, size: file.size, status: "uploading", url: null, progress: 0 }]);

    try {
      // Envoi direct vers Cloudinary : le relais backend plafonnait toute piece jointe
      // a 4,5 Mo (limite Vercel), avec une erreur CORS trompeuse au-dela.
      const { url } = await uploadFichier(file, uploadType, {
        onProgress: (pct) => setPendingFiles(p => p.map(f => f.id === id ? { ...f, progress: pct } : f)),
      });
      setPendingFiles(p => p.map(f => f.id === id ? { ...f, status: "done", url, progress: 100 } : f));
    } catch {
      setPendingFiles(p => p.map(f => f.id === id ? { ...f, status: "error" } : f));
    }
  }, []);

  const onFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_FILES - pendingFiles.length;
    files.slice(0, remaining).forEach(uploadFile);
    e.target.value = "";
  };

  /**
   * La note vocale emprunte le MÊME chemin qu'une pièce jointe déposée à la main : même
   * téléversement direct, même forme d'attachement `{url, name, type, size}`. Le lecteur
   * audio de la bulle existe déjà pour `type: "audio"` - rien à ajouter côté affichage.
   *
   * Envoi IMMÉDIAT plutôt qu'ajout à la file d'attente : on vient de se réécouter dans
   * l'aperçu, l'intention est claire, et une étape de plus serait du zèle.
   */
  const envoyerVocal = async () => {
    const f = vocal.fichier();
    if (!f || envoiVocal) return;
    setEnvoiVocal(true);
    try {
      /* `message` et non `piece-jointe` : ce dernier exige un jeton d'administration, et la
         note vocale d'un apprenant échouait donc en 403. 5 Mo couvrent largement les trois
         minutes de l'enregistreur. */
      const { url } = await uploadFichier(f, "message", { onProgress: setPctVocal });
      if (url) {
        await chat.sendMessage("", [{ url, name: f.name, type: "audio", size: f.size }]);
        vocal.reinitialiser();
      }
    } catch { /* l'aperçu reste en place : on peut réessayer sans réenregistrer */ }
    finally { setEnvoiVocal(false); setPctVocal(0); }
  };

  /* Changer d'interlocuteur ABANDONNE un enregistrement en cours : l'envoyer à la
     mauvaise personne serait une erreur difficile à rattraper, et laisser le micro
     ouvert pire encore. */
  useEffect(() => { vocal.annuler(); }, [chat.activeConvId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    const readyAtts = pendingFiles.filter(f => f.status === "done").map(({ url, name, type, size }) => ({ url, name, type, size }));
    if (!input.trim() && readyAtts.length === 0) return;
    const txt = input;
    setInput("");
    setPendingFiles([]);
    await chat.sendMessage(txt, readyAtts);
  };

  const hasUploading = pendingFiles.some(f => f.status === "uploading");

  const canSend      = (input.trim() || pendingFiles.some(f => f.status === "done")) && !hasUploading;

  const filteredContacts = chat.contacts.filter((c) => {
    const term = searchContact.toLowerCase();
    return (
      !term ||
      `${c.prenom} ${c.nom}`.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.role || "").toLowerCase().includes(term)
    );
  });

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>💬 Messagerie interne</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9ca3af" }}>
            Échanges en temps réel entre les membres de votre centre · Firebase Firestore
          </p>
        </div>
        <button
          onClick={() => { chat.fetchContacts(); setShowNewConv(true); }}
          style={{ padding: "9px 18px", background: accentColor, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          ✏️ Nouvelle conversation
        </button>
      </div>

      {/* Modal : choisir un contact */}
      {showNewConv && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 460, maxHeight: "75vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Choisir un contact</h3>
              <button onClick={() => { setShowNewConv(false); setSearchContact(""); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
            </div>
            <input
              placeholder="🔍 Rechercher par nom, email, rôle…"
              value={searchContact}
              onChange={(e) => setSearchContact(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, marginBottom: 12, outline: "none" }}
            />
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {chat.contacts.length === 0
                ? <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>⏳ Chargement…</div>
                : filteredContacts.length === 0
                  ? <div style={{ textAlign: "center", padding: 20, color: "#9ca3af", fontSize: 13 }}>Aucun résultat</div>
                  : filteredContacts.map((c) => (
                    <div key={c.id}
                      onClick={async () => { await chat.openOrCreateConv(c); setShowNewConv(false); setSearchContact(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", cursor: "pointer", transition: "background .15s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f0f9ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
                    >
                      <Avatar name={`${c.prenom} ${c.nom}`} size={38} online={chat.isOnline(c.id)} url={c.avatar_url || null} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{c.prenom} {c.nom}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          <span style={{ padding: "1px 7px", borderRadius: 10, background: "#e0f2fe", color: accentColor, fontWeight: 600, marginRight: 6 }}>
                            {ROLE_LABELS[c.role] || c.role}
                          </span>
                          {c.email}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: chat.isOnline(c.id) ? "#22c55e" : "#9ca3af", fontWeight: 600 }}>
                        {chat.isOnline(c.id) ? "🟢 En ligne" : "⚫ Hors ligne"}
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Layout messagerie */}
      <div style={{ display: "flex", height: 580, border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

        {/* ── Panneau gauche : liste conversations ── */}
        <div style={{ width: 280, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#fafafa" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Conversations</span>
            {chat.unreadTotal > 0 && (
              <span style={{ padding: "2px 8px", borderRadius: 10, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800 }}>
                {chat.unreadTotal} non lu{chat.unreadTotal > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {chat.loadingConvs ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>⏳ Chargement…</div>
            ) : chat.conversations.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
                Aucune conversation.<br />Cliquez sur "Nouvelle conversation"
              </div>
            ) : (
              chat.conversations.map((conv) => {
                const isActive  = chat.activeConvId === conv.id;
                const pName     = chat.partnerName(conv);
                const pId       = chat.partnerId(conv);
                const pRole     = chat.partnerRole(conv);
                const unread    = conv.unread?.[chat.myId] || 0;
                const online    = chat.isOnline(pId);
                const lastTime  = conv.last_message_at
                  ? (conv.last_message_at.toDate ? conv.last_message_at.toDate() : new Date(conv.last_message_at))
                    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : "";

                return (
                  <div
                    key={conv.id}
                    onClick={() => chat.setActiveConvId(conv.id)}
                    style={{
                      padding: "12px 14px", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                      background: isActive ? BET_LIGHT : "transparent",
                      borderLeft: isActive ? `3px solid ${accentColor}` : "3px solid transparent",
                      display: "flex", alignItems: "center", gap: 10, transition: "background .12s",
                    }}>
                    <Avatar name={pName} size={38} online={online} url={chat.partnerAvatar(conv) || chat.onlineUsers[pId]?.avatar_url || null} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: unread > 0 ? 800 : 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pName}</div>
                        <div style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0, marginLeft: 4 }}>{lastTime}</div>
                      </div>
                      <div style={{ fontSize: 10, color: accentColor, fontWeight: 600, marginBottom: 2 }}>{ROLE_LABELS[pRole] || pRole}</div>
                      {conv.last_message && (
                        <div style={{ fontSize: 11, color: unread > 0 ? "#374151" : "#9ca3af", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontWeight: unread > 0 ? 600 : 400 }}>
                          {conv.last_message}
                        </div>
                      )}
                    </div>
                    {unread > 0 && (
                      <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 9, fontWeight: 800, padding: "2px 6px", flexShrink: 0 }}>{unread}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Panneau droit : messages ── */}
        {chat.activeConv ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {/* Header conversation */}
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
              <Avatar
                name={chat.partnerName(chat.activeConv)}
                size={38}
                online={chat.isOnline(chat.partnerId(chat.activeConv))}
                url={chat.partnerAvatar(chat.activeConv) || chat.onlineUsers[chat.partnerId(chat.activeConv)]?.avatar_url || null}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{chat.partnerName(chat.activeConv)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {ROLE_LABELS[chat.partnerRole(chat.activeConv)] || chat.partnerRole(chat.activeConv)}
                  <span style={{ marginLeft: 8, color: chat.isOnline(chat.partnerId(chat.activeConv)) ? "#22c55e" : "#9ca3af", fontWeight: 600 }}>
                    {chat.isOnline(chat.partnerId(chat.activeConv)) ? "● En ligne" : "○ Hors ligne"}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>⚡ Temps réel · Firebase</div>
            </div>

            {/* Liste messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc" }}>
              {chat.messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 60, color: "#9ca3af", fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
                  Commencez la conversation !
                </div>
              )}
              {chat.messages.map((msg) => {
                const isMe  = msg.from_id === chat.myId;
                const time  = msg.created_at ? chat.fmtTime(msg.created_at) : "";
                const atts  = msg.attachments || [];
                const hasText = !!msg.content;
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
                    {!isMe && <Avatar name={msg.from_name} size={28} url={msg.from_avatar || null} />}
                    <div style={{ maxWidth: "72%" }}>
                      {!isMe && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 3, marginLeft: 4 }}>{msg.from_name}</div>
                      )}
                      <div style={{
                        padding: hasText || atts.length === 0 ? "10px 14px" : "8px 10px",
                        borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        background: isMe ? accentColor : "#fff",
                        color: isMe ? "#fff" : "#111827",
                        fontSize: 13, lineHeight: 1.55,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                      }}>
                        {hasText && <div>{lienifier(msg.content)}</div>}

                        {/* ── Pièces jointes ── */}
                        {atts.length > 0 && (
                          <div style={{ marginTop: hasText ? 8 : 0, display: "flex", flexDirection: "column", gap: 6 }}>
                            {atts.map((att, i) => {
                              if (att.type === "image") return (
                                <a key={i} href={att.url} target="_blank" rel="noreferrer">
                                  <img src={att.url} alt={att.name}
                                    style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, display: "block", border: isMe ? "none" : "1px solid #e5e7eb" }}
                                    onError={(e) => { e.target.style.display = "none"; }}
                                  />
                                </a>
                              );
                              if (att.type === "audio") return (
                                <div key={i}>
                                  <div style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,0.7)" : "#9ca3af", marginBottom: 3 }}>🎵 {att.name}</div>
                                  <audio controls src={att.url} style={{ width: "100%", minWidth: 200, maxWidth: 280, height: 34, borderRadius: 6 }} />
                                </div>
                              );
                              if (att.type === "video") return (
                                <video key={i} controls src={att.url}
                                  style={{ width: "100%", maxHeight: 180, borderRadius: 8, display: "block" }} />
                              );
                              // Document / fichier
                              return (
                                <a key={i} href={att.url} target="_blank" rel="noreferrer"
                                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10,
                                    background: isMe ? "rgba(255,255,255,0.18)" : "#f1f5f9",
                                    color: isMe ? "#fff" : "#0f172a", textDecoration: "none",
                                    border: isMe ? "1px solid rgba(255,255,255,0.3)" : "1px solid #e5e7eb" }}>
                                  <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(att.name)}</span>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</div>
                                    <div style={{ fontSize: 10, opacity: 0.7 }}>{fmtSize(att.size)} · Cliquer pour télécharger</div>
                                  </div>
                                  <span style={{ fontSize: 14, flexShrink: 0, opacity: 0.8 }}>⬇️</span>
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 3, textAlign: isMe ? "right" : "left", paddingRight: isMe ? 4 : 0, paddingLeft: isMe ? 0 : 4 }}>
                        {time}
                        {isMe && msg.read_by && msg.read_by.length > 1 && " · ✓✓"}
                      </div>
                    </div>
                    {isMe && <Avatar name={chat.myName} size={28} url={chat.myAvatarUrl} />}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Saisie */}
            <div style={{ borderTop: "1px solid #e5e7eb", background: "#fff" }}>

              {/* ── Preview pièces jointes en attente ── */}
              {pendingFiles.length > 0 && (
                <div style={{ padding: "8px 14px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {pendingFiles.map(f => (
                    <div key={f.id} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                      borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: f.status === "done" ? "#dcfce7" : f.status === "error" ? "#fee2e2" : "#f1f5f9",
                      color:      f.status === "done" ? "#166534" : f.status === "error" ? "#b91c1c" : "#374151",
                      border: `1px solid ${f.status === "done" ? "#bbf7d0" : f.status === "error" ? "#fecaca" : "#e5e7eb"}`,
                      maxWidth: 180,
                    }}>
                      {f.status === "uploading"
                        ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(8,145,178,.2)", borderTopColor: BET_COLOR, animation: "betSpin .7s linear infinite", display: "inline-block", flexShrink: 0 }} />
                        : <span style={{ flexShrink: 0 }}>{f.status === "done" ? "✓" : "⚠"}</span>
                      }
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      {f.status === "uploading" && <span style={{ flexShrink: 0, color: "#9ca3af" }}>{f.progress}%</span>}
                      <button onClick={() => setPendingFiles(p => p.filter(x => x.id !== f.id))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: "inherit", flexShrink: 0, lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* ENREGISTREMENT EN COURS - minuteur et sortie de secours. Sans « Annuler »,
                  la seule issue serait d'envoyer un message qu'on ne voulait pas. */}
              {vocal.etat === "enregistrement" && (
                <div style={{ padding: "9px 12px", background: "#fef2f2", borderTop: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#dc2626", flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#991b1b", fontVariantNumeric: "tabular-nums" }}>{dureeLisible(vocal.duree)}</span>
                  <span style={{ fontSize: 11.5, color: "#b91c1c", flex: 1 }}>
                    Enregistrement… arrêt automatique à {dureeLisible(vocal.dureeMaxS)}
                  </span>
                  <button onClick={vocal.annuler} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700, padding: "4px 8px" }}>Annuler</button>
                  <button onClick={vocal.arreter} style={{ padding: "6px 14px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>⏹ Terminer</button>
                </div>
              )}

              {/* APERÇU AVANT ENVOI - une note vocale partie ne se reprend pas. */}
              {vocal.etat === "pret" && (
                <div style={{ padding: "9px 12px", background: "#f0fdf4", borderTop: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17 }}>🎙️</span>
                  <audio controls src={vocal.url} style={{ flex: 1, minWidth: 170, height: 34 }} />
                  <span style={{ fontSize: 11.5, color: "#15803d", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dureeLisible(vocal.duree)}</span>
                  <button onClick={vocal.reinitialiser} disabled={envoiVocal}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#64748b", fontWeight: 700, padding: "4px 8px" }}>Refaire</button>
                  <button onClick={envoyerVocal} disabled={envoiVocal}
                    style={{ padding: "6px 14px", background: envoiVocal ? "#cbd5e1" : "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: envoiVocal ? "wait" : "pointer", fontWeight: 700, fontSize: 12 }}>
                    {envoiVocal ? (pctVocal > 0 && pctVocal < 100 ? `${pctVocal}%` : "Envoi…") : "Envoyer"}
                  </button>
                </div>
              )}

              {vocal.erreur && (
                <div style={{ padding: "8px 12px", background: "#fffbeb", borderTop: "1px solid #fde68a", fontSize: 11.5, color: "#92400e" }}>
                  {vocal.erreur}
                </div>
              )}

              <div style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-end" }}>
                {/* Bouton pièce jointe */}
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={onFileChange} style={{ display: "none" }} />
                <button
                  onClick={() => !sansPieceJointe && pendingFiles.length < MAX_FILES && fileInputRef.current?.click()}
                  disabled={sansPieceJointe || pendingFiles.length >= MAX_FILES}
                  title={sansPieceJointe
                    ? "L'envoi de fichiers n'est pas ouvert aux apprenants - vous pouvez écrire un message ou envoyer une note vocale."
                    : pendingFiles.length >= MAX_FILES ? `Max ${MAX_FILES} fichiers par message` : "Joindre un fichier"}
                  style={{
                    width: 38, height: 38, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc",
                    cursor: (!sansPieceJointe && pendingFiles.length < MAX_FILES) ? "pointer" : "not-allowed",
                    fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, color: (!sansPieceJointe && pendingFiles.length < MAX_FILES) ? "#475569" : "#d1d5db",
                    opacity: sansPieceJointe ? 0.45 : 1,
                    transition: "all .15s",
                  }}>
                  📎
                </button>

                {/* Le micro n'apparaît que s'il est utilisable : les navigateurs exigent
                    HTTPS ou localhost, et un bouton qui échoue toujours vaut moins que
                    pas de bouton. */}
                {microDisponible() && vocal.etat === "repos" && (
                  <button onClick={vocal.demarrer} disabled={envoiVocal} title="Enregistrer une note vocale"
                    style={{
                      width: 38, height: 38, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc",
                      cursor: envoiVocal ? "not-allowed" : "pointer", fontSize: 18, display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#475569",
                    }}>
                    🎤
                  </button>
                )}

                {/* Les emojis, juste après le micro - la même barre que dans les groupes. */}
                <SelecteurEmoji accent="#0369a1"
                  onInsert={emoji => {
                    const champ = champSaisieRef.current;
                    const { texte, curseur } = insererAuCurseur(input, emoji, champ);
                    setInput(texte);
                    requestAnimationFrame(() => {
                      if (!champ) return;
                      champ.focus();
                      champ.setSelectionRange(curseur, curseur);
                    });
                  }} />

                <textarea
                  ref={champSaisieRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Écrire un message… (Entrée pour envoyer)"
                  rows={1}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #e5e7eb",
                    fontSize: 13, outline: "none", resize: "none", lineHeight: 1.5,
                    fontFamily: "inherit", maxHeight: 100, overflowY: "auto",
                  }}
                  onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                />
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  title={hasUploading ? "Upload en cours…" : "Envoyer"}
                  style={{
                    width: 42, height: 38, background: canSend ? accentColor : "#e5e7eb",
                    color: canSend ? "#fff" : "#9ca3af",
                    border: "none", borderRadius: 12, cursor: canSend ? "pointer" : "default",
                    fontWeight: 700, fontSize: 16, transition: "all .15s", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  {hasUploading ? "⏳" : "➤"}
                </button>
              </div>

              {pendingFiles.length > 0 && (
                <div style={{ padding: "0 14px 8px", fontSize: 10, color: "#9ca3af" }}>
                  {pendingFiles.length}/{MAX_FILES} fichier(s) · {hasUploading ? "Upload en cours…" : "Prêt à envoyer"}
                  {pendingFiles.some(f => f.status === "error") && <span style={{ color: "#ef4444", marginLeft: 8 }}>⚠ Certains fichiers ont échoué - retirez-les</span>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#9ca3af" }}>
            <div style={{ fontSize: 52 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>Sélectionnez une conversation</div>
            <div style={{ fontSize: 12 }}>ou démarrez-en une nouvelle</div>
          </div>
        )}
      </div>
    </div>
  );
}
