import React, { useState, useEffect, useRef } from "react";
import { useProspectChat } from "../../../hooks/useProspectChat";
import { lienifier } from "../../../utils/lienifier";

const FF = "'Montserrat','Segoe UI',sans-serif";
const BET_BLUE = "#0891b2";
const BET_NAVY = "#0c33ac";

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

function Avatar({ name, photo, size = 36 }) {
  const ini = name
    ? name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  if (photo) return (
    <img src={photo} alt="" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
  );
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:size*.28, flexShrink:0, fontFamily:FF }}>
      {ini}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width:18, height:18, border:"2.5px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"pcSpin .7s linear infinite", flexShrink:0 }} />
  );
}

/**
 * Chat embarqué prospect ↔ assistante BET
 * Continuité : utilise le Supabase UUID → persiste quand le prospect devient apprenant.
 */
export default function ProspectChat({ sbUser, assignation, floating = false }) {
  const {
    myId, assistanteName,
    messages, unread, loading, initialized, error,
    initConv, sendMessage, fmtTime,
  } = useProspectChat(sbUser, assignation);

  const [text,    setText]   = useState("");
  const [opened,  setOpened] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Injecter keyframes une seule fois
  useEffect(() => {
    if (document.querySelector("#pc-kf")) return;
    const s = document.createElement("style"); s.id = "pc-kf";
    s.textContent = `@keyframes pcSpin { to{transform:rotate(360deg)} } @keyframes pcFU { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`;
    document.head.appendChild(s);
  }, []);

  // Initialiser la conversation Firestore à l'ouverture
  const handleOpen = async () => {
    setOpened(true);
    if (!initialized) await initConv();
  };

  // Scroll auto vers le bas
  useEffect(() => {
    if (opened) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, opened]);

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

  if (!assignation?.assistante_id) return null;

  const photoUrl = assignation.assistante_photo || null;
  const prenom   = assignation.assistante_prenom || assistanteName;

  // ── Chat fermé ─────────────────────────────────────────────────
  if (!opened) {
    if (floating) {
      return (
        <button
          onClick={handleOpen}
          aria-label={`Discuter avec ${prenom}`}
          style={{ position:"fixed", bottom:"var(--flottant-p3)", right:"var(--flottant-droite)", width:"var(--flottant-taille)", height:"var(--flottant-taille)", borderRadius:"50%", border:"none", padding:0, overflow:"hidden", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, boxShadow:"0 4px 12px rgba(0,0,0,.2)", zIndex:900, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.6rem", animation:"pcFU .3s ease" }}
        >
          {/* Le visage de SON assistante plutôt qu'une bulle générique : le prospect
              reconnaît la personne à qui il écrit. Avatar retombe déjà sur les initiales
              quand aucune photo n'est renseignée, donc le bouton reste lisible dans tous
              les cas - l'emoji n'est le repli de personne. */}
          <Avatar name={assistanteName} photo={photoUrl} size={60} />
          {unread > 0 && (
            <div style={{ position:"absolute", top:-2, right:-2, background:"#ef4444", color:"#fff", borderRadius:"50%", minWidth:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:".7rem", padding:"0 5px", border:"2px solid #fff" }}>
              {unread}
            </div>
          )}
        </button>
      );
    }
    return (
      <div
        onClick={handleOpen}
        style={{ display:"flex", alignItems:"center", gap:12, background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, borderRadius:14, padding:"14px 18px", cursor:"pointer", userSelect:"none", marginTop:16, animation:"pcFU .3s ease" }}
      >
        <Avatar name={assistanteName} photo={photoUrl} size={44} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, color:"#fff", fontSize:".92rem", fontFamily:FF }}>
            💬 Discuter avec {prenom}
          </div>
          <div style={{ color:"rgba(255,255,255,.65)", fontSize:".74rem", marginTop:2 }}>
            Messagerie privée · Réponse sous quelques heures
          </div>
        </div>
        {unread > 0 && (
          <div style={{ background:"#ef4444", color:"#fff", borderRadius:"50%", minWidth:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:".7rem", padding:"0 5px", flexShrink:0 }}>
            {unread}
          </div>
        )}
        <span style={{ color:"rgba(255,255,255,.6)", fontSize:"1.2rem" }}>›</span>
      </div>
    );
  }

  // ── Chat ouvert ────────────────────────────────────────────────
  return (
    <div style={floating
      ? { position:"fixed", bottom:20, right:20, width:340, maxWidth:"calc(100vw - 40px)", maxHeight:"min(520px, calc(100vh - 40px))", border:"1.5px solid #e2e8f0", borderRadius:16, overflow:"hidden", background:"#fff", boxShadow:"0 8px 30px rgba(0,0,0,.25)", zIndex:901, display:"flex", flexDirection:"column", animation:"pcFU .2s ease" }
      : { border:`1.5px solid #e2e8f0`, borderRadius:16, overflow:"hidden", marginTop:16, background:"#fff", animation:"pcFU .2s ease" }}>

      {/* Header */}
      <div
        style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, cursor:"pointer" }}
        onClick={() => setOpened(false)}
      >
        <Avatar name={assistanteName} photo={photoUrl} size={36} />
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, color:"#fff", fontSize:".88rem", fontFamily:FF }}>{assistanteName}</div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:".7rem" }}>
            Assistante BET Languages · Messagerie privée
          </div>
        </div>
        <button style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:999, width:28, height:28, color:"#fff", cursor:"pointer", fontSize:".85rem", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          ✕
        </button>
      </div>

      {/* Bannière erreur / offline */}
      {error && (
        <div style={{ background:"#fef9ec", borderBottom:"1px solid #fde68a", padding:"8px 14px", fontSize:".74rem", color:"#92400e", display:"flex", alignItems:"center", gap:8 }}>
          <span>⏳</span>
          <span>{error}</span>
        </div>
      )}

      {/* Zone messages */}
      <div style={{ height:300, overflowY:"auto", padding:"14px 12px", display:"flex", flexDirection:"column", gap:8, background:"#f8fafc" }}>

        {/* Chargement initial */}
        {(loading || !initialized) && (
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:24, color:"#94a3b8", fontSize:".82rem" }}>
            <div style={{ width:20, height:20, border:"2.5px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"pcSpin .8s linear infinite" }} />
            Connexion en cours…
          </div>
        )}

        {/* Aucun message */}
        {initialized && !loading && messages.length === 0 && (
          <div style={{ textAlign:"center", padding:"28px 16px", animation:"pcFU .3s ease" }}>
            <div style={{ fontSize:"2rem", marginBottom:8 }}>👋</div>
            <p style={{ color:"#64748b", fontSize:".84rem", lineHeight:1.6, margin:0, fontFamily:FF }}>
              Bonjour ! Démarrez votre conversation avec <strong>{prenom}</strong>.<br />
              Elle vous répondra dès que possible.
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => {
          const isMe   = msg.from_id === myId;
          const atts   = msg.attachments || [];
          const hasText = !!msg.content;
          return (
            <div key={msg.id} style={{ display:"flex", justifyContent: isMe ? "flex-end" : "flex-start", gap:8, alignItems:"flex-end", animation:"pcFU .2s ease" }}>
              {!isMe && <Avatar name={assistanteName} photo={photoUrl} size={26} />}
              <div style={{ maxWidth:"75%" }}>
                <div style={{
                  background:    isMe ? `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` : "#fff",
                  color:         isMe ? "#fff" : "#011451",
                  borderRadius:  isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                  padding:       hasText || atts.length === 0 ? "9px 13px" : "7px 9px",
                  fontSize:      ".85rem",
                  lineHeight:    1.55,
                  boxShadow:     isMe ? "none" : "0 2px 8px rgba(0,0,0,.06)",
                  border:        isMe ? "none" : "1px solid #e2e8f0",
                  whiteSpace:    "pre-wrap",
                  wordBreak:     "break-word",
                  fontFamily:    FF,
                }}>
                  {hasText && <div>{lienifier(msg.content)}</div>}

                  {/* ── Pièces jointes ── */}
                  {atts.length > 0 && (
                    <div style={{ marginTop: hasText ? 8 : 0, display:"flex", flexDirection:"column", gap:6 }}>
                      {atts.map((att, i) => {
                        if (att.type === "image") return (
                          <a key={i} href={att.url} target="_blank" rel="noreferrer">
                            <img src={att.url} alt={att.name}
                              style={{ maxWidth:"100%", maxHeight:220, borderRadius:8, display:"block", border: isMe ? "none" : "1px solid #e2e8f0" }}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          </a>
                        );
                        if (att.type === "audio") return (
                          <div key={i}>
                            <div style={{ fontSize:10, color: isMe ? "rgba(255,255,255,.7)" : "#94a3b8", marginBottom:3 }}>🎵 {att.name}</div>
                            <audio controls src={att.url} style={{ width:"100%", minWidth:200, maxWidth:280, height:34, borderRadius:6 }} />
                          </div>
                        );
                        if (att.type === "video") return (
                          <video key={i} controls src={att.url} style={{ width:"100%", maxHeight:180, borderRadius:8, display:"block" }} />
                        );
                        // Document / fichier
                        return (
                          <a key={i} href={att.url} target="_blank" rel="noreferrer"
                            style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:10,
                              background: isMe ? "rgba(255,255,255,.18)" : "#f1f5f9",
                              color: isMe ? "#fff" : "#0f172a", textDecoration:"none",
                              border: isMe ? "1px solid rgba(255,255,255,.3)" : "1px solid #e2e8f0" }}>
                            <span style={{ fontSize:20, flexShrink:0 }}>{fileIcon(att.name)}</span>
                            <div style={{ minWidth:0, flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{att.name}</div>
                              <div style={{ fontSize:10, opacity:.7 }}>{fmtSize(att.size)} · Cliquer pour télécharger</div>
                            </div>
                            <span style={{ fontSize:14, flexShrink:0, opacity:.8 }}>⬇️</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:".64rem", color:"#94a3b8", marginTop:3, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 4 }}>
                  {fmtTime(msg.created_at)}
                  {isMe && " · Envoyé"}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:"10px 12px", borderTop:"1px solid #e2e8f0", display:"flex", gap:8, alignItems:"flex-end", background:"#fff" }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Message à ${prenom}…`}
          rows={1}
          style={{ flex:1, resize:"none", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"9px 12px", fontSize:".85rem", fontFamily:FF, outline:"none", lineHeight:1.5, maxHeight:100, overflowY:"auto", transition:"border-color .2s" }}
          onFocus={e => e.target.style.borderColor = BET_BLUE}
          onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
          onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          style={{ background: (text.trim() && !sending) ? `linear-gradient(135deg,${BET_BLUE},${BET_NAVY})` : "#e2e8f0", color: (text.trim() && !sending) ? "#fff" : "#94a3b8", border:"none", borderRadius:10, width:40, height:40, cursor: (text.trim() && !sending) ? "pointer" : "default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .18s" }}
        >
          {sending ? <Spinner /> : <span style={{ fontSize:"1rem" }}>➤</span>}
        </button>
      </div>

      {/* Note bas de chat */}
      <div style={{ padding:"6px 14px 8px", background:"#f8fafc", borderTop:"1px solid #f1f5f9" }}>
        <p style={{ margin:0, fontSize:".68rem", color:"#94a3b8", textAlign:"center" }}>
          🔒 Messagerie privée BET · Votre historique est conservé même si vous devenez apprenant
        </p>
      </div>
    </div>
  );
}
