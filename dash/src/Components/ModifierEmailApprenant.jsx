import React, { useState } from "react";
import { toast } from "react-toastify";

/**
 * Changer l'identifiant de connexion d'un apprenant, après son inscription.
 *
 * LA GARANTIE, et c'est elle qui rend l'opération acceptable : tout ce que l'apprenant
 * possède - classes, présences, paiements, cours lus, notes - est rattaché à son
 * IDENTIFIANT, jamais à son adresse. Celui-ci ne change pas. Il retrouve donc son espace
 * exactement comme il l'avait laissé, avec le même mot de passe.
 *
 * Le composant est partagé par les deux tableaux de bord des assistantes plutôt que
 * recopié : une opération qui touche à l'authentification ne doit pas exister en deux
 * versions susceptibles de diverger.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const valide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

export default function ModifierEmailApprenant({
  apprenantId, emailActuel, nomApprenant, accent = "#0891b2", onChange,
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nouveau, setNouveau] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const ancien = (emailActuel || "").trim();
  // Un identifiant technique n'est pas une adresse : le proposer à la modification
  // laisserait croire qu'on peut y écrire n'importe quoi.
  const technique = ancien.startsWith("tel.") || ancien.endsWith("@betacademy.app");
  const propre = nouveau.trim().toLowerCase();
  const pretAEnvoyer = valide(propre) && propre !== ancien.toLowerCase();

  const fermer = () => { setOuvert(false); setNouveau(""); setErreur(null); };

  const enregistrer = async () => {
    setOccupe(true); setErreur(null);
    try {
      const r = await fetch(`${API_URL}/api/apprenants/${apprenantId}/email`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: propre }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Changement impossible");

      toast.success(`Identifiant modifié - ${d.email}`);
      // Dire franchement que l'apprenant n'a PAS été prévenu : l'assistante devra
      // le faire elle-même, et elle ne peut le savoir que si on le lui annonce.
      if (d.email_envoye === false) {
        toast.warn("L'e-mail d'information n'est pas parti. Prévenez l'apprenant vous-même.");
      }
      onChange?.(d.email);
      fermer();
    } catch (e) { setErreur(e.message); }
    finally { setOccupe(false); }
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        title={technique ? "Remplacer cet identifiant technique par une vraie adresse" : "Modifier l'e-mail de connexion"}
        style={{ marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer",
          color: accent, fontSize: 11, fontWeight: 700 }}>
        ✏️ Modifier l'identifiant
      </button>

      {ouvert && (
        <div onClick={e => { if (e.target === e.currentTarget && !occupe) fermer(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.65)", zIndex: 10050,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, padding: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              ✏️ Modifier l'identifiant de connexion
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16 }}>
              {nomApprenant ? `Pour ${nomApprenant}.` : ""} L'apprenant se connectera désormais avec la nouvelle adresse.
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "11px 14px", marginBottom: 14, fontSize: 12.5, lineHeight: 1.8 }}>
              <div><span style={{ color: "#94a3b8" }}>Adresse actuelle :</span> <strong style={{ color: "#0f172a", wordBreak: "break-all" }}>{ancien || "-"}</strong></div>
              {technique && (
                <div style={{ color: "#b45309", fontSize: 11.5, marginTop: 3 }}>
                  C'est un identifiant technique, pas une vraie adresse - l'apprenant ne reçoit donc aucun e-mail aujourd'hui.
                </div>
              )}
            </div>

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Nouvelle adresse de connexion
            </label>
            <input type="email" value={nouveau} autoFocus
              onChange={e => { setNouveau(e.target.value); setErreur(null); }}
              onKeyDown={e => { if (e.key === "Enter" && pretAEnvoyer && !occupe) enregistrer(); }}
              placeholder="prenom.nom@exemple.com"
              style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${erreur ? "#fca5a5" : "#e5e7eb"}`,
                borderRadius: 9, fontSize: 13.5, outline: "none", fontFamily: "inherit" }} />

            {nouveau.trim() && !valide(propre) && (
              <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 6 }}>Cette adresse n'a pas une forme valide.</div>
            )}
            {erreur && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "10px 13px", marginTop: 10, fontSize: 12.5, color: "#991b1b" }}>
                {erreur}
              </div>
            )}

            {/* LA GARANTIE, écrite noir sur blanc. C'est la seule inquiétude que l'assistante
                aura au moment de cliquer, et y répondre évite qu'elle renonce. */}
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "11px 14px", margin: "14px 0 16px", fontSize: 12, color: "#166534", lineHeight: 1.65 }}>
              <strong>L'apprenant ne perd rien.</strong> Ses classes, présences, paiements, cours lus et
              notes restent attachés à son compte - ils ne dépendent pas de l'adresse.
              <strong> Son mot de passe ne change pas non plus.</strong> Il recevra simplement un e-mail
              à la nouvelle adresse pour l'informer.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={fermer} disabled={occupe}
                style={{ flex: 1, padding: 12, background: "#f1f5f9", color: "#374151", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Annuler
              </button>
              <button onClick={enregistrer} disabled={!pretAEnvoyer || occupe}
                style={{ flex: 1.5, padding: 12, background: !pretAEnvoyer || occupe ? "#cbd5e1" : accent,
                  color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13,
                  cursor: !pretAEnvoyer || occupe ? "not-allowed" : "pointer" }}>
                {occupe ? "Modification…" : "Modifier et prévenir l'apprenant"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
