import React, { useState } from "react";
import toast from "react-hot-toast";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * « Mon profil » - l'utilisateur renseigne lui-même son surnom.
 *
 * Les dashboards affichaient l'état civil complet (« KOARA KAYABA HONORINE ») là où
 * l'équipe s'appelle par un prénom d'usage. Le surnom devient le titre du dashboard ;
 * le nom complet reste juste en dessous, et reste seul dans la liste SuperAdmin, où
 * c'est la référence administrative qui compte.
 *
 * Le PATCH passe par le même endpoint que le sélecteur de couleur. Côté serveur, un
 * utilisateur n'a le droit de modifier sur lui-même qu'une liste blanche courte -
 * couleur et surnom : de la présentation, jamais l'identité (nom, email, rôle) ni les
 * droits, qui restent réservés au SuperAdmin.
 *
 * Le profil est relu depuis localStorage plutôt que passé en prop : tous les dashboards
 * y stockent déjà `admin_profil`, ce qui évite de modifier quinze signatures.
 *
 * Trois espaces - l'apprenant, le coach et le parent - ne sont PAS administrateurs : ils
 * n'ont ni `admin_token` ni `admin_profil`, et la route d'administration leur est fermée.
 * Le composant prend donc son espace de stockage et sa route en paramètre (`espace`)
 * plutôt que d'exister en double : deux copies auraient divergé au premier correctif.
 */

/**
 * Où lire le profil et où l'écrire, selon le compte connecté.
 * `admin` couvre les quatorze dashboards du personnel ; `utilisateur` couvre l'apprenant,
 * le coach et le parent, via une route qui n'autorise que le surnom.
 */
const ESPACES = {
  utilisateur: {
    // bet-elearning s'authentifie par Supabase : le jeton de session est le seul disponible,
    // quel que soit le role. La route n'ecrit que le surnom, sur la ligne de l'appelant.
    cle: "bet_profil",
    jeton: () => localStorage.getItem("bet_access_token") || localStorage.getItem("admin_token"),
    route: () => `${API_URL}/api/mon-espace/profil`,
  },
};
ESPACES.admin = ESPACES.utilisateur;
ESPACES.coach = ESPACES.utilisateur;

const lireProfil = (espace = "utilisateur") => {
  const conf = ESPACES[espace] || ESPACES.utilisateur;
  try { return JSON.parse(localStorage.getItem(conf.cle) || "{}"); }
  catch { return {}; }
};

export { lireProfil };

/** Ce qu'il faut afficher en titre : le surnom s'il existe, sinon l'état civil. */
export function nomAffiche(profil = {}) {
  const complet = `${profil.prenom || ""} ${profil.nom || ""}`.trim();
  return (profil.surnom || "").trim() || complet || profil.email || "-";
}

export default function MonProfilModal({ ouvert, onClose, onEnregistre, accent = "#0891b2", espace = "utilisateur", profil: profilProp }) {
  const conf = ESPACES[espace] || ESPACES.utilisateur;
  // L'espace apprenant et l'espace parent tiennent déjà leur profil en mémoire, chargé
  // depuis l'API : le leur faire passer évite un aller-retour et surtout évite de dépendre
  // d'un localStorage qu'ils ne remplissent pas.
  const profil = profilProp || lireProfil(espace);
  const [surnom, setSurnom] = useState(profil.surnom || "");
  const [saving, setSaving] = useState(false);

  if (!ouvert) return null;

  const complet = `${profil.prenom || ""} ${profil.nom || ""}`.trim();

  const enregistrer = async () => {
    setSaving(true);
    try {
      // `/api/admin/me` pour le personnel, `/api/mon-espace/profil` pour les autres : la
      // seconde est ouverte à tout compte connecté et n'écrit que le surnom.
      const r = await fetch(conf.route(), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${conf.jeton()}`,
        },
        body: JSON.stringify({ surnom: surnom.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || "Enregistrement impossible"); return; }

      // Le cache local est ce que lisent les en-têtes : le mettre à jour évite d'imposer
      // une reconnexion pour voir son propre surnom.
      // On ne cree pas un cache la ou il n'y en a pas : l'ecran qui passe `profil` en prop
      // se met a jour par `onEnregistre`, pas par le localStorage.
      if (localStorage.getItem(conf.cle)) {
        localStorage.setItem(conf.cle, JSON.stringify({ ...profil, surnom: surnom.trim() || null }));
      }
      toast.success(surnom.trim() ? "✓ Surnom enregistré" : "✓ Surnom retiré");
      onEnregistre?.(surnom.trim() || null);
      onClose?.();
    } catch {
      toast.error("Impossible de joindre le serveur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9500,
        display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}
    >
      <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:440, padding:24 }}>
        <h3 style={{ margin:"0 0 6px", fontSize:16, fontWeight:800, color:"#0f172a" }}>👤 Mon profil</h3>
        <p style={{ margin:"0 0 18px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
          Choisissez le nom sous lequel vous souhaitez apparaître sur votre tableau de bord.
          Votre nom complet reste inchangé pour l'administration.
        </p>

        <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".05em" }}>
            Nom complet
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginTop:3 }}>{complet || "-"}</div>
        </div>

        <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 }}>
          Surnom <span style={{ fontWeight:400, color:"#9ca3af" }}>(facultatif)</span>
        </label>
        <input
          value={surnom}
          onChange={(e) => setSurnom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !saving) enregistrer(); }}
          placeholder="Ex : Honorine"
          maxLength={40}
          autoFocus
          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #e5e7eb",
            fontSize:14, boxSizing:"border-box", outline:"none" }}
        />

        <div style={{ marginTop:14, padding:"12px 14px", borderRadius:10, background:accent + "10", border:`1px solid ${accent}35` }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".05em", marginBottom:4 }}>
            Aperçu de votre en-tête
          </div>
          <div style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>
            {nomAffiche({ ...profil, surnom })}
          </div>
          {surnom.trim() && complet && (
            <div style={{ fontSize:11.5, color:"#64748b", marginTop:2 }}>{complet}</div>
          )}
        </div>

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0",
              background:"#fff", color:"#374151", fontWeight:700, fontSize:13,
              cursor: saving ? "not-allowed" : "pointer" }}>
            Annuler
          </button>
          <button onClick={enregistrer} disabled={saving}
            style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none",
              background: saving ? "#e2e8f0" : accent, color: saving ? "#9ca3af" : "#fff",
              fontWeight:800, fontSize:13, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Le crayon posé à côté du nom dans l'en-tête - ouvre le modal. */
export function BoutonMonProfil({ onClick, couleurTexte = "rgba(255,255,255,.75)" }) {
  return (
    <button
      onClick={onClick}
      title="Mon profil - choisir mon surnom"
      aria-label="Modifier mon surnom"
      style={{ background:"transparent", border:"none", cursor:"pointer", padding:"2px 4px",
        color: couleurTexte, fontSize:13, lineHeight:1, opacity:.85 }}
    >
      ✏️
    </button>
  );
}
