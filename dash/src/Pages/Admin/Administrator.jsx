import React, { useState, useEffect } from "react";
import { useUserContext } from "../../contexts/UserContext";
import CreateUserModal from "./CreateUserModal";
import EditPermissionsModal from "./EditPermissionsModal";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer";
import { Link } from "react-router-dom";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { AiOutlineMail, AiOutlineUser, AiOutlineEdit, AiOutlineDelete, AiOutlineEye, AiOutlineEyeInvisible, AiOutlinePlus, AiOutlineSetting } from 'react-icons/ai';



const AdminSidebar = () => {
  const navigate = useNavigate();
 const items = [
    { name: "Dashboard", path: "/AdminDashboard" },
    { name: "Professeurs", path: "/TeachersPage" },
    { name: "Classes", path: "/classes" },
    { name: "Cours", path: "/courses" },
    { name: "Etudiant", path: "/student" },
    { name: "Examens", path: "/exams" },
    // { name: "Emploi du temps", path: "/emploi/temps" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
    { name: "Profil", path: "/profile" },
    { name: "Déconnexion", path: "/logout" },
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


export default function Administrator() {
  const { user, getAuthHeaders } = useUserContext();
  const [showModalUser, setShowModal] = useState(false);
  const [mailUser, setMailUser] = useState(null);
  const [editProfileUser, setEditProfileUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [deleteUserModal, setDeleteUserModal] = useState({ isOpen: false, userId: null, userName: "" });
  const [showPasswords, setShowPasswords] = useState({}); // <-- state pour afficher/masquer les mots de passe

  const adminId = user?._id;

  useEffect(() => {
    if (adminId) fetchUsers();
  }, [adminId]);

  if (!user) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Chargement du profil administrateur...</p>
      </div>
    );
  }

  const permissionLabels = {
    view_users: "Voir utilisateurs",
    create_users: "Créer utilisateurs",
    edit_users: "Modifier utilisateurs",
    delete_users: "Supprimer utilisateurs",
    view_documents: "Voir documents",
    upload_documents: "Uploader documents",
    delete_documents: "Supprimer documents",
    create_projects: "Créer projets",
    view_projects: "Voir projets",
    edit_projects: "Modifier projets",
    delete_projects: "Supprimer projets",
    create_homes: "Créer maisons",
    view_homes: "Voir maisons",
    edit_homes: "Modifier maisons",
    delete_homes: "Supprimer maisons",
    archive_homes: "Archiver maisons",
    create_tenants: "Créer locataires",
    view_tenants: "Voir locataires",
    edit_tenants: "Modifier locataires",
    delete_tenants: "Supprimer locataires",
    archive_tenants: "Archiver locataires",
    manage_payments: "Gérer paiements",
    edit_payments: "Modifier paiements",
    delete_payments: "Supprimer paiements",
    view_payments: "Voir paiements",
    generate_reports: "Générer rapports",
    manage_settings: "Paramètres généraux",
    view_archives: "Voir archives",
    allow_signatures: "Autoriser les signatures",
    manage_work: "Autoriser les travaux",
    send_receipt: "Envoi reçu/mail",
    increase_rent:"Augmenter Loyer",
    create_charges: "Créer des charges",
    update_charges: "Mettre a jour charges",
    delete_charges : "Supprimer les charges",

  };

  const fetchUsers = async () => {
    if (!adminId) return;

    try {
      const res = await fetch(`http://localhost:8080/admin/${adminId}/users`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) throw new Error("Erreur HTTP " + res.status);

      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : data);
    } catch (err) {
      console.error("Erreur fetchUsers:", err);
      toast.error("Impossible de charger les utilisateurs");
      setUsers([]);
    }
  };

  const handleDeleteUser = (userId, name) => {
    const ConfirmDelete = ({ closeToast }) => (
      <div style={{ padding: "8px 0" }}>
        <p>Voulez-vous vraiment supprimer <strong>{name}</strong> ?</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            style={{
              background: "#dc2626",
              color: "#fff",
              border: "none",
              padding: "5px 10px",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            onClick={async () => {
              closeToast();
              try {
                const res = await fetch(`http://localhost:8080/admin/${user._id}/users/${userId}`, {
                  method: "DELETE",
                  headers: getAuthHeaders(),
                });
                const data = await res.json();
                if (data.success) {
                  toast.success(data.message || `Utilisateur ${name} supprimé ✅`);
                  setUsers((prev) => prev.filter((u) => u._id !== userId));
                } else {
                  toast.error(data.message || "Erreur lors de la suppression.");
                }
              } catch (error) {
                console.error(error);
                toast.error("Erreur de connexion au serveur.");
              }
            }}
          >
            Confirmer
          </button>
          <button
            style={{
              background: "#ccc",
              color: "#111",
              border: "none",
              padding: "5px 10px",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            onClick={() => {
              closeToast();
              toast("Suppression annulée", { icon: "⚠️" });
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    );

    toast.custom((t) => <ConfirmDelete closeToast={() => toast.dismiss(t.id)} />);
  };

  return (
    <>

      <div className="admin-layout">
        {/* Sidebar */}
        <AdminSidebar />
        <div className="admin-content">
      <div className="admin-dashboard">
        <div className="admin-header">
          <div>
            <h2>👨‍💼 Gestion des utilisateurs</h2>
            <p>Créez, gérez et attribuez les rôles & permissions de vos utilisateurs.</p>
          </div>
          <div>
            <Link to="/Actions">
              <button className="btn-actions">Actions</button>
            </Link>
            <button onClick={() => setShowModal(true)} className="btn-create">
              <AiOutlinePlus style={{ marginRight: "6px" }} />
              Nouvel utilisateur
            </button>
          </div>
        </div>

        <div className="admin-card">
          {users.length === 0 ? (
            <p className="empty-state">Aucun utilisateur créé pour le moment.</p>
          ) : (
            <div className="table-container">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Nom & Prénom</th>
                    <th>Email</th>
                    <th>Nom d’utilisateur</th>
                    <th>Mot de passe</th>
                    <th>Rôle</th>
                    <th>Permissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name} {u.prenom} <br /> ({u.nameRole})</td>
                      <td>{u.email || "-"}</td>
                      <td>{u.username || "-"}</td>
                      <td>
                        <span
                          style={{ cursor: "pointer", fontFamily: "monospace", userSelect: "none" }}
                          onClick={() =>
                            setShowPasswords(prev => ({ ...prev, [u._id]: !prev[u._id] }))
                          }
                        >
                          {showPasswords[u._id] ? (
                          <>
                            {u.plainPassword} <AiOutlineEyeInvisible style={{ marginLeft: 6 }} />
                          </>
                        ) : (
                          <>
                            ******** <AiOutlineEye style={{ marginLeft: 6 }} />
                          </>
                        )}
                        </span>
                      </td>
                      <td>
                        <span className={`role-badge ${u.role?.toLowerCase() || "agent"}`}>
                          {u.role || "Utilisateur"}
                        </span>
                      </td>
                      <td>
                        {u.permissions?.length ? (
                          <ul>
                            {u.permissions.map((perm) => (
                              <li key={perm} className="list-permissions">
                                {permissionLabels[perm] || perm}
                              </li>
                            ))}
                          </ul>
                        ) : "-"}
                      </td>
                      <td>
                        {/* ✉️ RENVOI MAIL */}
                        <button
                          title="Renvoyer les accès par mail"
                          onClick={() => setMailUser(u)}
                          style={{
                            background: "#10b981",
                            color: "white",
                            border: "none",
                            padding: "5px 8px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            margin:"1rem"
                          }}
                        >
                          <AiOutlineMail />
                        </button>
                        {/* 👤 MODIFIER PROFIL */}
                        <button
                          title="Modifier le profil"
                          onClick={() => setEditProfileUser(u)}
                          style={{
                            background: "#6366f1",
                            color: "white",
                            border: "none",
                            padding: "5px 8px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            margin:"1rem"
                          }}
                        >
                          <AiOutlineUser />
                        </button>
                        <button
                          onClick={() => setEditUser(u)}
                          style={{
                            background: "#2563eb",
                            color: "white",
                            border: "none",
                            padding: "5px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            marginRight: "1rem",
                            margin:"1rem"
                          }}
                        >
                          <AiOutlineEdit />
                        </button>
                        <button
                          onClick={() => setDeleteUserModal({ isOpen: true, userId: u._id, userName: `${u.name} ${u.prenom}` })}
                          style={{
                            background: "#dc2626",
                            color: "white",
                            border: "none",
                            padding: "5px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            margin:"1rem"
                          }}
                        >
                          <AiOutlineDelete />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModalUser && (
          <CreateUserModal
            adminId={adminId}
            onClose={() => setShowModal(false)}
            onUserCreated={fetchUsers}
          />
        )}

        {editUser && (
          <EditPermissionsModal
            user={editUser}
            onClose={() => setEditUser(null)}
            onUpdated={() => {
              fetchUsers();
              setEditUser(null);
            }}
            permissionLabels={permissionLabels}
            allPermissions={Object.keys(permissionLabels)}
          />
        )}

{editProfileUser && (
  <div className="modal-overlay-edit">
    <div className="modal-edit">
      
      {/* Header */}
      <div className="modal-header">
        <div className="modal-icon">👤</div>
        <div>
          <h3>Modifier le profil utilisateur</h3>
          <p>Mettez à jour les informations du compte</p>
        </div>
        <button
          className="modal-close"
          onClick={() => setEditProfileUser(null)}
        >
          ✕
        </button>
      </div>

      {/* ⚠️ Message d'erreur */}
      {editProfileUser.errorMessage && (
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
          {editProfileUser.errorMessage}
        </div>
      )}

      {/* Form */}
      <div className="modal-body">
        <div className="form-group">
          <label>Nom</label>
          <input
            type="text"
            value={editProfileUser.name}
            onChange={(e) =>
              setEditProfileUser({ ...editProfileUser, name: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label>Prénom</label>
          <input
            type="text"
            value={editProfileUser.prenom}
            onChange={(e) =>
              setEditProfileUser({ ...editProfileUser, prenom: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={editProfileUser.email || ""}
            onChange={(e) =>
              setEditProfileUser({ ...editProfileUser, email: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label>Fonction / Poste</label>
          <input
            type="text"
            value={editProfileUser.nameRole || ""}
            onChange={(e) =>
              setEditProfileUser({ ...editProfileUser, nameRole: e.target.value })
            }
          />
        </div>
      </div>

      {/* Actions */}
      <div className="modal-footer">
        <button
          className="btn-secondary"
          onClick={() => setEditProfileUser(null)}
        >
          Annuler
        </button>
        <button
          className="btn-primary"
          onClick={async () => {
            try {
              const payload = {
                name: editProfileUser.name,
                prenom: editProfileUser.prenom,
                nameRole: editProfileUser.nameRole,
                ...(editProfileUser.email !== undefined && { email: editProfileUser.email }),
              };

              const res = await fetch(
                `http://localhost:8080/update/user/${editProfileUser._id}`,
                {
                  method: "PUT",
                  headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                }
              );

              const data = await res.json();

              if (!res.ok) {
                // ⚠️ Mettre le message d'erreur dans le state
                setEditProfileUser(prev => ({ ...prev, errorMessage: data.message || "Erreur lors de la mise à jour" }));
              } else {
                toast.success("Profil mis à jour avec succès ✅");
                fetchUsers();
                setEditProfileUser(null);
              }
            } catch (err) {
              console.error(err);
              setEditProfileUser(prev => ({ ...prev, errorMessage: "Erreur serveur" }));
            }
          }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  </div>
)}

{mailUser && (
  <div className="modal-overlay-edit">
    <div className="modal-edit">
      <h3>📧 Renvoyer les accès</h3>
      <p>
        Voulez-vous renvoyer les accès de{" "}
        <strong>{mailUser.name} {mailUser.prenom}</strong> ?
      </p>

      {!mailUser.email && (
        <p style={{ color: "#dc2626", fontSize: "0.9rem" }}>
          ⚠️ Cet utilisateur n’a pas d’email enregistré.
        </p>
      )}

      <div className="modal-actions">
        <button
          className="btn-primary"
          disabled={isSendingMail || !mailUser.email}
          onClick={async () => {
            setIsSendingMail(true);
            try {
              const res = await fetch(
                `http://localhost:8080/users/${mailUser._id}/resend-access`,
                { method: "POST", headers: getAuthHeaders() }
              );
              const data = await res.json();
              data.success
                ? toast.success("Accès renvoyés avec succès ✉️")
                : toast.error(data.message);
            } catch {
              toast.error("Erreur serveur");
            } finally {
              setIsSendingMail(false);
              setMailUser(null);
            }
          }}
        >
          {isSendingMail ? (
            <span className="loader-inline"></span>
          ) : (
            "Envoyer"
          )}
        </button>

        <button
          className="btn-secondary"
          disabled={isSendingMail}
          onClick={() => setMailUser(null)}
        >
          Annuler
        </button>
      </div>
    </div>
  </div>
)}

        <ConfirmDeleteModal isOpen={deleteUserModal.isOpen}
          userName={deleteUserModal.userName}
          onClose={() => setDeleteUserModal({ isOpen: false, userId: null, userName: "" })}
          onConfirm={async () => {
            try {
              const res = await fetch(`http://localhost:8080/admin/${user._id}/users/${deleteUserModal.userId}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
              });
              const data = await res.json();
              if (data.success) {
                toast.success(data.message || `Utilisateur ${deleteUserModal.userName} supprimé ✅`);
                setUsers(prev => prev.filter(u => u._id !== deleteUserModal.userId));
              } else {
                toast.error(data.message || "Erreur lors de la suppression.");
              }
            } catch (err) {
              toast.error("Erreur de connexion au serveur.");
              console.error(err);
            }
            setDeleteUserModal({ isOpen: false, userId: null, userName: "" });
          }}/>
        </div>
        </div>
      </div>
      <Footer />

      <style jsx="true">{`
      .admin-layout {
          display: flex;
          min-height: 100vh;
          background: #f9fafc;
        }

        // .admin-content {
        //   flex: 1;
        //   padding: 40px 60px;
        // }

        .admin-dashboard {
          padding: 40px 60px;
          background: #f9fafc;
          min-height: 100vh;
          color: #111827;
          font-family: 'Inter', sans-serif;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .admin-header h2 {
          font-size: 1.8rem;
          font-weight: 600;
          color: #1e3a8a;
        }

        .btn-create {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.2);
        }

        .user-table td button:hover {
          opacity: 0.85;
        }
          .btn-actions {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          margin-right:1rem;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.2);
        }
          /* Conteneur du tableau */
.table-container {
  width: 100%;
  overflow-x: auto; /* Scroll horizontal si petit écran */
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
  background-color: #fff;
  margin-top: 20px;
}

/* Tableau */
.user-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 700px; /* garantit une largeur minimum */
  font-family: 'Inter', sans-serif;
  font-size: 0.95rem;
}

/* Entête du tableau */
.user-table thead {
  background-color: #f4f6f8;
  color: #34495e;
  font-weight: 600;
  text-align: left;
  border-bottom: 2px solid #ddd;
}

.user-table th, 
.user-table td {
  padding: 12px 15px;
  text-align: left;
  vertical-align: middle;
  word-break: break-word;
}

/* Lignes du tableau */
.user-table tbody tr {
  border-bottom: 1px solid #eee;
  transition: background 0.2s ease;
}

.user-table tbody tr:hover {
  background-color: #f0f4f8;
}

/* Boutons */
.user-table button {
  transition: all 0.2s ease;
}
.user-table button:hover {
  opacity: 0.85;
}

.role-badge {
  padding: 4px 8px;
  border-radius: 12px;
  color: #fff;
  font-weight: 500;
  text-align: center;
  display: inline-block;
  font-size: 0.85rem;
}
.role-badge.admin { background-color: #dc2626; }       /* Rouge pour Admin */
.role-badge.agent { background-color: #2563eb; }        /* Bleu pour User */
.role-badge.user { background-color: #dc2626; }        /* Bleu pour User */
.role-badge.moderator { background-color: #f59e0b; }   /* Orange pour Modérateur */

/* Liste des permissions */
.list-permissions {
  font-size: 0.85rem;
  padding-left: 0;
  margin: 2px 0;
  list-style-type: disc;
}

/* Responsive */
@media (max-width: 1024px) {
  .user-table th, 
  .user-table td {
    padding: 10px;
  }
}

@media (max-width: 768px) {
  .user-table {
    font-size: 0.85rem;
    min-width: 600px;
  }
}

@media (max-width: 480px) {
  .user-table {
    min-width: 500px;
  }

  .user-table td button {
    padding: 4px 6px;
    font-size: 0.75rem;
  }
}
  .modal-overlay-edit {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-edit {
  background: #fff;
  padding: 25px;
  border-radius: 10px;
  width: 400px;
  max-width: 95%;
}

.modal input {
  width: 100%;
  padding: 8px;
  margin: 8px 0;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
}

.btn-secondary {
  background: #e5e7eb;
  color: #111;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
}
  .loader-inline {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
      `}</style>
    
    
    </>
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