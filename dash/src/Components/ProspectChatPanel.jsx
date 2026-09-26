import React, { useState, useEffect, useRef } from "react";
import { useAssistanteChat } from "../hooks/useAssistanteChat";

const BET_BLUE = "#0891b2";
const BET_NAVY = "#1e3a8a";
const FF = "'Montserrat','Segoe UI',sans-serif";

if (!document.querySelector("#pcp-kf")) {
  const s = document.createElement("style"); s.id = "pcp-kf";
  s.textContent = `@keyframes pcpSpin{to{transform:rotate(360deg)}} @keyframes pcpFU{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(s);
}

/**
 * Panneau de chat privé prospect ↔ assistante (côté dashboard)
 * Props:
 *   assignationId - ID de l'assignation parcours (clé Firestore)
 *   profil        - admin_profil (id, nom, prenom)
 *   assignation   - données de l'assignation (prospect_nom, prospect_tel…)
 *   onClose       - fn()
 */
export default function ProspectChatPanel({ assignationId, profil, assignation, onClose }) {
  const {
    myId, messages, unread, loading, initialized, initConv, sendMessage, fmtTime,
  } = useAssistanteChat(assignationId, profil, assignation);

  const [text,    setText]    = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { initConv(); }, [initConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await sendMessage(text);
    setText("");
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const prospectNom = assignation?.prospect_nom || "Prospect";
  const prospectTel = assignation?.prospect_telephone || null;

  return (
    <div style={{ position:"fixed", bottom:24, right:24, width:360, maxHeight:"80vh", background:"#fff", borderRadius:20, boxShadow:"0 24px 64px rgba(0,0,0,.22)", display:"flex", flexDirection:"column", overflow:"hidden", zIndex:9999, animation:"pcpFU .25s ease", fontFamily:FF }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, flexShrink:0 }}>
        <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.18)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, flexShrink:0 }}>
          {prospectNom[0]?.toUpperCase() || "P"}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, color:"#fff", fontSize:14 }}>{prospectNom}</div>
          <div style={{ color:"rgba(255,255,255,.65)", fontSize:11 }}>
            {prospectTel ? `📞 ${prospectTel}` : "Prospect BET · Messagerie privée"}
          </div>
        </div>
        {prospectTel && (
          <a
            href={`https://wa.me/${prospectTel.replace(/[\s+\-()]/g,"")}`}
            target="_blank" rel="noopener noreferrer"
            title="WhatsApp"
            style={{ width:30, height:30, background:"#22c55e", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", textDecoration:"none", flexShrink:0 }}
          >
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/></svg>
          </a>
        )}
        <button onClick={onClose} style={{ width:28, height:28, background:"rgba(255,255,255,.15)", border:"none", borderRadius:"50%", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 10px", display:"flex", flexDirection:"column", gap:8, background:"#f8fafc", minHeight:200 }}>

        {(loading || !initialized) && (
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:24, color:"#94a3b8", fontSize:12 }}>
            <div style={{ width:18, height:18, border:"2.5px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"pcpSpin .8s linear infinite" }} />
            Connexion…
          </div>
        )}

        {initialized && messages.length === 0 && (
          <div style={{ textAlign:"center", padding:"24px 12px", color:"#94a3b8", fontSize:12, lineHeight:1.6 }}>
            <div style={{ fontSize:24, marginBottom:8 }}>💬</div>
            Aucun message. Commencez la conversation avec <strong style={{ color:"#475569" }}>{prospectNom}</strong>.
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.from_id === myId;
          return (
            <div key={msg.id} style={{ display:"flex", justifyContent: isMe ? "flex-end" : "flex-start", gap:6, alignItems:"flex-end" }}>
              {!isMe && (
                <div style={{ width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#e2e8f0,#cbd5e1)", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:10, flexShrink:0 }}>
                  {prospectNom[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ maxWidth:"76%" }}>
                <div style={{ background: isMe ? `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` : "#fff", color: isMe ? "#fff" : "#0f172a", borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px", padding:"8px 12px", fontSize:13, lineHeight:1.5, boxShadow: isMe ? "none" : "0 2px 6px rgba(0,0,0,.06)", border: isMe ? "none" : "1px solid #e2e8f0", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                  {msg.content}
                </div>
                <div style={{ fontSize:10, color:"#94a3b8", marginTop:2, textAlign: isMe ? "right" : "left" }}>
                  {fmtTime(msg.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:"8px 10px", borderTop:"1px solid #e2e8f0", display:"flex", gap:6, alignItems:"flex-end", background:"#fff", flexShrink:0 }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Répondre à ${prospectNom}…`}
          rows={1}
          style={{ flex:1, resize:"none", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"8px 11px", fontSize:13, fontFamily:FF, outline:"none", lineHeight:1.5, maxHeight:90, overflowY:"auto" }}
          onFocus={e => e.target.style.borderColor = BET_BLUE}
          onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
          onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 90) + "px"; }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          style={{ width:36, height:36, background:(text.trim() && !sending) ? `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` : "#e2e8f0", color:(text.trim() && !sending) ? "#fff" : "#94a3b8", border:"none", borderRadius:10, cursor:(text.trim() && !sending) ? "pointer" : "default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .18s" }}
        >
          {sending
            ? <div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"pcpSpin .7s linear infinite" }} />
            : <span style={{ fontSize:14 }}>➤</span>}
        </button>
      </div>
    </div>
  );
}
