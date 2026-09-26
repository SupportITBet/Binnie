import React, { useState, useEffect } from "react";
import axios from "axios";
import { useUserContext } from "../../contexts/UserContext";
import toast from "react-hot-toast";
import { rolesPermissions, permissionLabels } from "./permissions.js";

const allPermissions = Array.from(new Set(Object.values(rolesPermissions).flat()));

function random8() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

export default function CreateUserModal({ adminId, onClose, onUserCreated }) {
  const { user, getAuthHeaders } = useUserContext();
  const [form, setForm] = useState({
    name: "",
    prenom: "",
    email: "",
    username: "",
    password: "",
    role: "user",
    nameRole: "",
    permissions: rolesPermissions["user"],
  });
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      permissions: rolesPermissions[prev.role] || [],
    }));
  }, [form.role]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handlePermissionToggle = (perm) => {
    setForm((prev) => {
      const alreadyChecked = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: alreadyChecked
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const payload = {
        name: form.name,
        prenom: form.prenom,
        role: form.role,
        nameRole: form.nameRole,
        permissions: form.permissions,
        ...(form.email && { email: form.email }),
        ...(form.username && { username: form.username }),
        ...(form.password && { password: form.password }),
      };

      const res = await axios.post(
        `http://localhost:8080/create/${adminId}/users`,
        payload,
        { headers: getAuthHeaders() }
      );

      toast.success("✅ Utilisateur créé avec succès !");
      setCredentials({
        username: res.data.credentials?.username || payload.username,
        password: res.data.credentials?.password || payload.password,
        email: payload.email || "",
        nameRole: payload.nameRole || "",
      });

      onUserCreated && onUserCreated();
      setForm({ ...form, email: "", username: "", password: "" });

    } catch (error) {
      if (error.response) {
        const { status, data } = error.response;

        if (status === 400 && data.message?.includes("email")) {
          setErrorMessage("❌ Cet email est déjà utilisé par un autre utilisateur.");
        } else if (status === 400 && data.message?.includes("Nom d’utilisateur")) {
          setErrorMessage("❌ Nom d’utilisateur déjà pris.");
        } else if (status === 401) {
          setErrorMessage("🔒 Non autorisé. Vérifiez votre connexion.");
        } else if (status === 403) {
          setErrorMessage(data.message || "🚫 Accès refusé.");
        } else {
          setErrorMessage(data.message || "❌ Erreur lors de la création.");
        }
      } else {
        setErrorMessage("❌ Impossible de contacter le serveur.");
      }
      console.error("Erreur création utilisateur :", error);
    } finally {
      setLoading(false);
    }
  };


  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("✅ Copié dans le presse‑papier");
  };

  return (
    <div className="overlay--user">
      {/* 🔹 Toaster directement dans le modal */}

      <div className="modal--user">
        <header className="modal-header">
          <h3>👤 Créer un nouvel utilisateur</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </header>


{/* ⚠️ Message d'erreur */}
{errorMessage && (
  <div
    style={{
      backgroundColor: "#fee2e2",
      color: "#b91c1c",
      padding: "8px 12px",
      borderRadius: "6px",
      margin: "0 0 10px 0",
      fontSize: "0.9rem",
    }}
  >
    {errorMessage}
  </div>
)}

        {!credentials ? (
        <form onSubmit={handleSubmit} className="form-body">
          <div className="form-grid">
            <div>
              <label>Nom*</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} required />
            </div>

            <div>
              <label>Prénom*</label>
              <input type="text" name="prenom" value={form.prenom} onChange={handleChange} required />
            </div>
          </div>

           <div>
              <label>Poste</label>
              <input type="text" name="nameRole" value={form.nameRole} onChange={handleChange} required />
            </div>
         

          <label>Email (optionnel)</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="ex: contact@exemple.com" />

          <label>Nom d'utilisateur (optionnel)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" name="username" value={form.username} onChange={handleChange} placeholder="Laisser vide pour générer" />
            <button type="button" onClick={() => setForm(prev => ({ ...prev, username: random8() }))}>Générer</button>
          </div>

          <label>Mot de passe (optionnel)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" name="password" value={form.password} onChange={handleChange} placeholder="Laisser vide pour générer" />
            <button type="button" onClick={() => setForm(prev => ({ ...prev, password: random8() }))}>Générer</button>
          </div>

          <label>Rôle*</label>
          <select name="role" value={form.role} onChange={handleChange}>
            {Object.keys(rolesPermissions).map((r) => (<option key={r} value={r}>{r.replace("_", " ").toUpperCase()}</option>))}
          </select>

          <div className="permissions-section">
            <h4>🔐 Permissions</h4>
            <p className="hint">Cochez les droits personnalisés à accorder</p>
            <div className="permissions-list">
              {allPermissions.map((perm) => (
                <label key={perm} className="perm-item">
                  <input type="checkbox" checked={form.permissions.includes(perm)} onChange={() => handlePermissionToggle(perm)} />
                  <span>{permissionLabels[perm] || perm}</span>
                </label>
              ))}
            </div>
          </div>

          <footer className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-save" disabled={loading}>{loading ? "Création..." : "Créer"}</button>
          </footer>
        </form>
        ) : (
   <div className="credentials-panel">
  <h4>Accès utilisateur créés</h4>

  {credentials.email && (
    <p><strong>Email :</strong> {credentials.email}</p>
  )}

  {credentials.nameRole && (
    <p><strong>Poste :</strong> {credentials.nameRole}</p>
  )}

  <p><strong>Username :</strong> {credentials.username}</p>
  <p><strong>Mot de passe :</strong> {credentials.password}</p>

  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
    <button
      onClick={() =>
        copyToClipboard(
          `email: ${credentials.email || "-"}\nposte: ${credentials.nameRole || "-"}\nusername: ${credentials.username}\npassword: ${credentials.password}`
        )
      }
    >
      Copier les accès
    </button>
    <button onClick={() => { setCredentials(null); onClose(); }}>Fermer</button>
  </div>

  <p style={{ marginTop: 12, fontSize: 12, color: '#555' }}>
    Remarque : le mot de passe est stocké en clair temporairement - pense à activer le hash et un flux de reset après test.
  </p>
</div>
        )}
      </div>

<style jsx="true">{`
/* Overlay & modal inchangés */
.overlay--user {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.modal--user {
  background: #fff;
  border-radius: 16px;
  width: 620px;
  padding: 30px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  animation: fadeIn 0.25s ease;
  font-family: 'Inter', sans-serif;
}

/* Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.modal-header h3 { color: #1e3a8a; font-weight: 600; }
.close-btn { background: none; border: none; font-size: 1.4rem; color: #6b7280; cursor: pointer; transition: all 0.2s; }
.close-btn:hover { color: #2563eb; transform: scale(1.1); }

/* Form grid */
.form-grid { display: flex; gap: 10px; }

/* Labels */
label { font-weight: 500; font-size: 0.9rem; margin-bottom: 4px; display: block; }

/* Inputs & Select */
input, select {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  margin-bottom: 15px;
  font-size: 0.95rem;
  transition: all 0.2s;
  background: #fefefe;
}
input:focus, select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235,0.2);
}

/* Buttons */
.flex-row { display: flex; gap: 8px; align-items: center; }
.btn-generate {
  background: #e0e7ff;
  color: #1e40af;
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-generate:hover { background: #c7d2fe; transform: translateY(-1px); }

/* Permissions en cartes flottantes */
.permissions-section {
  border: none;
  background: #f9fafb;
  padding: 15px;
  border-radius: 12px;
  margin-top: 15px;
}
.permissions-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
}
.permissions-list::-webkit-scrollbar { width: 6px; }
.permissions-list::-webkit-scrollbar-track { background: #f9fafb; border-radius: 6px; }
.permissions-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }

/* Carte permission */
.perm-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85rem;
  font-weight: 500;
}
.perm-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 10px rgba(0,0,0,0.15);
  background: #e0f2fe;
}
.perm-item input { accent-color: #2563eb; cursor: pointer; width: 16px; height: 16px; }

/* Footer */
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
.btn-cancel {
  background: #f3f4f6;
  color: #111;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-cancel:hover { background: #e5e7eb; }
.btn-save {
  background: linear-gradient(135deg, #93c5fd, #3b82f6);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(59,130,246,0.3);
  font-weight: 500;
  transition: all 0.2s;
}
.btn-save:hover { box-shadow: 0 5px 15px rgba(59,130,246,0.4); transform: translateY(-1px); }

/* Panel credentials */
.credentials-panel { padding: 15px; background: #f1f9ff; border-radius: 12px; }

/* Hint / petites notes */
.hint { font-size: 0.8rem; color: #6b7280; }

@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
`}</style>
    </div>
  );
}