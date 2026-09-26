// src/components/CloudinaryUpload.jsx
// Composant réutilisable pour uploader vers Cloudinary via le backend BET
// Usage :
//   <CloudinaryUpload type="avatar" onSuccess={(file) => setAvatar(file.url)} />
//   <CloudinaryUpload type="video"  label="Ajouter une vidéo de cours" onSuccess={...} />
//
// types disponibles : "avatar" | "image" | "video" | "audio" | "document"

import React, { useRef, useState } from "react";
import { uploadFichier, maxMoPour } from "../utils/uploadFichier";

// Les tailles ne sont plus déclarées ici : ce composant annonçait 200 Mo pour une vidéo et
// 20 Mo pour un document, deux chiffres que ni le backend ni Cloudinary n'ont jamais
// acceptés. Elles viennent maintenant de utils/uploadFichier, miroir de la table serveur.
const TYPE_CONFIG = {
  avatar:   { accept: "image/*",                               label: "Photo de profil", icon: "🖼️", formats: "JPG, PNG, WEBP" },
  image:    { accept: "image/*",                               label: "Image",           icon: "🖼️", formats: "JPG, PNG, WEBP, GIF" },
  video:    { accept: "video/*",                               label: "Vidéo",           icon: "🎬", formats: "MP4, MOV, MKV, WEBM" },
  audio:    { accept: "audio/*",                               label: "Audio",           icon: "🎵", formats: "MP3, WAV, OGG, M4A" },
  document: { accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx", label: "Document",        icon: "📄", formats: "PDF, Word, PowerPoint, Excel" },
};

/** Le type MIME représentatif d'un type d'upload, pour calculer la limite avant tout choix. */
const MIME_REPRESENTATIF = { avatar:"image/jpeg", image:"image/jpeg", video:"video/mp4", audio:"audio/mpeg", document:"application/pdf" };

export default function CloudinaryUpload({
  type       = "image",
  label,
  onSuccess,
  onError,
  currentUrl,      // URL actuelle (pour preview)
  className,
  style,
  compact = false, // Mode bouton compact (sans zone de drop)
}) {
  const cfg       = TYPE_CONFIG[type] || TYPE_CONFIG.image;
  const maxMb     = maxMoPour(type, MIME_REPRESENTATIF[type] || "image/jpeg");
  const hint      = `${cfg.formats} - max ${maxMb} Mo`;
  const inputRef  = useRef(null);
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState(currentUrl || null);
  const [error,   setError]     = useState("");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);


  const upload = async (file) => {
    if (!file) return;
    setError("");
    setLoading(true);
    setProgress(0);

    // Aperçu local immédiat pour les images - l'envoi peut durer, l'utilisateur voit
    // tout de suite ce qu'il a choisi.
    if (type === "avatar" || type === "image") {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }

    try {
      // uploadFichier valide la taille avant tout réseau, envoie directement à Cloudinary
      // et retourne la même forme que l'ancienne route de relais.
      const fichier = await uploadFichier(file, type, { onProgress: setProgress });
      setProgress(100);
      if (fichier.url) setPreview(fichier.url);
      onSuccess?.(fichier);
    } catch (e) {
      setError(e.message);
      setPreview(currentUrl || null);
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  if (compact) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }} className={className}>
        <input ref={inputRef} type="file" accept={cfg.accept} onChange={onFileChange} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#0891b2", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <Spinner /> : <span>{cfg.icon}</span>}
          {loading ? `${progress}%` : (label || `Uploader ${cfg.label.toLowerCase()}`)}
        </button>
        {error && <span style={{ fontSize: 12, color: "#dc2626" }}>⚠️ {error}</span>}
      </div>
    );
  }

  return (
    <div style={{ ...style }} className={className}>
      <input ref={inputRef} type="file" accept={cfg.accept} onChange={onFileChange} style={{ display: "none" }} />

      {/* Zone de drop */}
      <div
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? "#0891b2" : error ? "#dc2626" : "#e2e8f0"}`,
          borderRadius: 12,
          padding: 20,
          textAlign: "center",
          cursor: loading ? "not-allowed" : "pointer",
          background: dragging ? "#e0f2fe" : "#f8fafc",
          transition: "all .2s",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Preview image/avatar */}
        {preview && (type === "avatar" || type === "image") && (
          <img src={preview} alt="preview"
            style={{ width: type === "avatar" ? 80 : "100%", height: type === "avatar" ? 80 : 140,
              objectFit: "cover", borderRadius: type === "avatar" ? "50%" : 8, marginBottom: 10 }} />
        )}

        {/* Icône + texte */}
        {!loading && (
          <>
            <div style={{ fontSize: preview ? 20 : 32, marginBottom: 6 }}>{cfg.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
              {label || `Uploader ${cfg.label.toLowerCase()}`}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Glissez-déposez ou cliquez</div>
          </>
        )}

        {/* Progression */}
        {loading && (
          <div style={{ padding: "10px 0" }}>
            <Spinner size={28} />
            <div style={{ marginTop: 8, fontSize: 13, color: "#0891b2", fontWeight: 600 }}>Upload {progress}%</div>
            <div style={{ marginTop: 6, height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#0891b2", borderRadius: 4, transition: "width .3s" }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

// ── Composant avatar cliquable (photo de profil ronde) ────────────────────────
export function AvatarUpload({ currentUrl, nom = "", onSuccess, size = 80, token }) {
  const initiales = nom.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??";
  const [url, setUrl] = useState(currentUrl);

  return (
    <CloudinaryUpload
      type="avatar"
      token={token}
      currentUrl={url}
      compact={false}
      style={{ width: size + 40 }}
      onSuccess={(file) => { setUrl(file.url); onSuccess?.(file); }}
    />
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size,
      border: "2.5px solid rgba(8,145,178,0.2)",
      borderTopColor: "#0891b2",
      borderRadius: "50%",
      animation: "betSpin .7s linear infinite",
      display: "inline-block",
    }} />
  );
}

// Injection du keyframe global (une seule fois)
if (typeof document !== "undefined" && !document.getElementById("bet-spinner-style")) {
  const s = document.createElement("style");
  s.id = "bet-spinner-style";
  s.textContent = "@keyframes betSpin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}
