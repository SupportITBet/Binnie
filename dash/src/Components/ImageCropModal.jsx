import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { decouperImage } from "../utils/cropImage";

// Modal de recadrage générique - s'intercale entre la sélection d'un fichier et son upload,
// pour que l'admin contrôle le cadrage exact (zoom + position) plutôt que de subir le
// recadrage automatique (object-fit: cover) appliqué côté site public.
export default function ImageCropModal({ imageSrc, aspect = 1, fileName, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || saving) return;
    setSaving(true);
    try {
      const fichier = await decouperImage(imageSrc, croppedAreaPixels, fileName);
      onConfirm(fichier);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.7)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", borderRadius:14, width:420, maxWidth:"92vw", overflow:"hidden", boxShadow:"0 12px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #e2e8f0", fontWeight:800, fontSize:14, color:"#0f172a" }}>
          ✂️ Recadrer la photo
        </div>
        <div style={{ position:"relative", width:"100%", height:320, background:"#111" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div style={{ padding:"14px 18px" }}>
          <label style={{ fontSize:11, fontWeight:600, color:"#64748b" }}>Zoom</label>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ width:"100%", marginTop:4 }}
          />
        </div>
        <div style={{ display:"flex", gap:8, padding:"0 18px 18px" }}>
          <button onClick={onCancel} disabled={saving} style={{ flex:1, padding:"9px 0", background:"#f1f5f9", color:"#374151", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:saving?"not-allowed":"pointer" }}>
            Annuler
          </button>
          <button onClick={handleConfirm} disabled={saving} style={{ flex:1, padding:"9px 0", background:"#0891b2", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:saving?"not-allowed":"pointer", opacity:saving?0.7:1 }}>
            {saving ? "⏳ Validation…" : "✓ Valider le cadrage"}
          </button>
        </div>
      </div>
    </div>
  );
}
