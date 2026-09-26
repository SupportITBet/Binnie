// src/pages/Profile.jsx
import React, { useState } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

/* ================= SIDEBAR ================= */
const AdminSidebar = () => {
  const navigate = useNavigate();
  const items = [
    { name: "Dashboard", path: "/AdminDashboard" },
    { name: "Professeurs", path: "/TeachersPage" },
    { name: "Classes", path: "/classes" },
    { name: "Cours", path: "/courses" },
    { name: "Examens", path: "/exams" },
    { name: 'Emploi du temps', path: '/emploi/temps' },
        { name: "Notifications", path: "/notifications" },
    { name: "Profil", path: "/profile" },
     { name: "Gestion Utilisateurs", path: "/administrator" },
    { name: 'Déconnexion', path: '/logout' },
  ];

  return (
    <div style={sidebarStyle}>
      <h2 style={{ marginBottom: "30px" }}>Menu</h2>
      {items.map((item, idx) => (
        <div key={idx} style={sidebarItemStyle} onClick={() => navigate(item.path)}>
          {item.name}
        </div>
      ))}
    </div>
  );
};

/* ================= PAGE PROFIL ================= */
export default function Profile() {
  const { user, setUser, getAuthHeaders } = useUserContext();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [form, setForm] = useState({
    fullname: user?.fullname || "",
    username: user?.username || "",
    email: user?.email || "",
    number: user?.number || "",
    address: user?.address || "",
    typeAdmin: user?.typeAdmin || "particulier",
    companyName: user?.companyInfo?.companyName || "",
    legalMention: user?.companyInfo?.legalMention || "",
    identificationNumber: user?.companyInfo?.identificationNumber || "",
    photo: user?.photo || "",
  });

  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [previewPhoto, setPreviewPhoto] = useState(user?.photo || "");

  /* UPDATE PROFILE */
  const handleProfileUpdate = async () => {
    if (!form.fullname || !form.number || !form.address) {
      toast.error("Nom, téléphone et adresse sont obligatoires !");
      return;
    }

    const body = new FormData();
    Object.keys(form).forEach(key => {
      if (key === "photo" && form.photo instanceof File) {
        body.append("photo", form.photo);
      } else {
        body.append(key, form[key]);
      }
    });

    try {
      const res = await fetch(`http://localhost:8080/admin/${user._id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders() },
        body,
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        toast.success("Profil mis à jour !");
        setShowProfileModal(false);
      } else {
        const errorData = await res.json();
        toast.error(errorData.message || "Erreur mise à jour profil");
      }
    } catch {
      toast.error("Erreur serveur");
    }
  };

  /* UPDATE PASSWORD */
  const handlePasswordUpdate = async () => {
    if (!passwordForm.password || !passwordForm.confirmPassword) {
      toast.error("Veuillez remplir tous les champs !");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas !");
      return;
    }
    try {
      const res = await fetch(`http://localhost:8080/admin/password/${user._id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordForm.password }),
      });
      if (res.ok) {
        toast.success("Mot de passe mis à jour !");
        setShowPasswordModal(false);
        setPasswordForm({ password: "", confirmPassword: "" });
      } else {
        const errorData = await res.json();
        toast.error(errorData.message || "Erreur mise à jour mot de passe");
      }
    } catch {
      toast.error("Erreur serveur");
    }
  };

  return (
    <div style={container}>
      <AdminSidebar />
      <div style={content}>
        <h1 style={titleStyle}>Profil Administrateur</h1>

        <div style={cardStyle}>
          <img
            src={user?.photo || "/default-avatar.png"}
            alt="Profil"
            style={{ width: 100, height: 100, borderRadius: "50%", marginBottom: 15 }}
          />
          <p><strong>Nom complet:</strong> {user?.fullname}</p>
          <p><strong>Nom utilisateur:</strong> {user?.username}</p>
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Téléphone:</strong> {user?.number}</p>
          <p><strong>Adresse:</strong> {user?.address}</p>
          <p><strong>Type d'admin:</strong> {user?.typeAdmin}</p>

          {user.typeAdmin === "societe" && (
            <>
              <p><strong>Nom société:</strong> {user.companyInfo?.companyName}</p>
              <p><strong>Logo société:</strong> {user.companyInfo?.logo}</p>
              <p><strong>Mentions légales:</strong> {user.companyInfo?.legalMention}</p>
              <p><strong>N° identification:</strong> {user.companyInfo?.identificationNumber}</p>
            </>
          )}

          <p><strong>Signature sélectionnée:</strong> {user?.selectedSignature || "Aucune"}</p>

          <button style={buttonStyle} onClick={() => setShowProfileModal(true)}>
            Modifier le profil
          </button>
          <button style={{ ...buttonStyle, background: "#f59e0b", marginLeft: 10 }} onClick={() => setShowPasswordModal(true)}>
            Changer le mot de passe
          </button>
        </div>

        {/* MODAL PROFIL */}
        {showProfileModal && (
          <div style={modalStyle}>
            <div style={modalContentStyle}>
              <h2>Modifier le profil</h2>
              <input
                style={inputStyle}
                placeholder="Nom complet"
                value={form.fullname}
                onChange={(e) => setForm({ ...form, fullname: e.target.value })}
              />
              <input
                style={inputStyle}
                placeholder="Nom utilisateur"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <input
                style={inputStyle}
                placeholder="Téléphone"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
              <input
                style={inputStyle}
                placeholder="Adresse"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <input
                style={inputStyle}
                placeholder="Email (non modifiable)"
                value={form.email}
                disabled
              />
              <select
                style={inputStyle}
                value={form.typeAdmin}
                onChange={(e) => setForm({ ...form, typeAdmin: e.target.value })}
              >
                <option value="particulier">Particulier</option>
                <option value="societe">Société</option>
              </select>

              {form.typeAdmin === "societe" && (
                <>
                  <input
                    style={inputStyle}
                    placeholder="Nom société"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  />
                  <input
                    style={inputStyle}
                    placeholder="N° identification"
                    value={form.identificationNumber}
                    onChange={(e) => setForm({ ...form, identificationNumber: e.target.value })}
                  />
                  <input
                    style={inputStyle}
                    placeholder="Mentions légales"
                    value={form.legalMention}
                    onChange={(e) => setForm({ ...form, legalMention: e.target.value })}
                  />
                  <input
                    type="file"
                    style={inputStyle}
                    onChange={(e) => {
                      setForm({ ...form, photo: e.target.files[0] });
                      setPreviewPhoto(URL.createObjectURL(e.target.files[0]));
                    }}
                  />
                  {previewPhoto && <img src={previewPhoto} alt="Aperçu" style={{ width: 80, borderRadius: 10, marginTop: 10 }} />}
                </>
              )}

              <div style={{ marginTop: 10 }}>
                <button style={buttonStyle} onClick={handleProfileUpdate}>Enregistrer</button>
                <button style={{ marginLeft: 10 }} onClick={() => setShowProfileModal(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL MOT DE PASSE */}
        {showPasswordModal && (
          <div style={modalStyle}>
            <div style={modalContentStyle}>
              <h2>Changer le mot de passe</h2>
              <input
                style={inputStyle}
                type="password"
                placeholder="Nouveau mot de passe"
                value={passwordForm.password}
                onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
              />
              <input
                style={inputStyle}
                type="password"
                placeholder="Confirmer mot de passe"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
              <div style={{ marginTop: 10 }}>
                <button style={buttonStyle} onClick={handlePasswordUpdate}>Enregistrer</button>
                <button style={{ marginLeft: 10 }} onClick={() => setShowPasswordModal(false)}>Annuler</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const container = { display: "flex", minHeight: "100vh" };
const sidebarStyle = { width: "220px", background: "#0f172a", color: "#fff", padding: "20px" };
const sidebarItemStyle = {
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "8px",
  cursor: "pointer",
  background: "#1e3a8a",
};
const content = { flex: 1, padding: "30px", background: "#f9fafb" };
const titleStyle = { marginBottom: "20px" };
const cardStyle = { background: "#fff", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const buttonStyle = {
  padding: "10px 15px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: "5px",
  cursor: "pointer",
  marginTop: "10px",
};
const inputStyle = { padding: "10px", marginBottom: "10px", width: "100%", borderRadius: "5px", border: "1px solid #ccc" };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center" };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "10px", width: "450px", maxHeight: "90vh", overflowY: "auto" };