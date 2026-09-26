import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import axios from "axios";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

/* ================= SIDEBAR (identique à Courses.jsx) ================= */
const TeacherSidebar = () => {
  const navigate = useNavigate();
  const items = [
    { name: "Dashboard", path: "/AdminDashboard" },
    { name: "Professeurs", path: "/TeachersPage" },
    { name: "Classes", path: "/classes" },
    { name: "Cours", path: "/courses" },
    { name: "Etudiant", path: "/student" },
    { name: "Examens", path: "/exams" },
    { name: "Salles", path: "/rooms" },
    { name: "bulletins", path: "/bulletins" },
    { name: "Notifications", path: "/notifications" },
    { name: "Gestion Utilisateurs", path: "/administrator" },
    { name: "Profil", path: "/profile" },
    { name: "Déconnexion", path: "/logout" },
  ];

  return (
    <div style={sidebarStyle}>
      <h2 style={{ marginBottom: "30px", color: "#fff" }}>Menu</h2>
      {items.map((item, idx) => (
        <div key={idx} style={sidebarItemStyle} onClick={() => navigate(item.path)}>
          {item.name}
        </div>
      ))}
    </div>
  );
};

/* ================= COMPOSANT PRINCIPAL CLASSES ================= */
export default function Classes() {
  const { user, token, getAuthHeaders } = useUserContext();
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");

  // État du formulaire (avec champs imbriqués)
  const [formData, setFormData] = useState({
    name: "",
    level: "",
    academicYear: "",
    scheduleNote: "",
    room: { name: "", capacity: "" },
    building: { name: "", floor: "" },
  });

  const API_URL = "http://localhost:8080";

  // ========== FETCH ==========
  const fetchClasses = async () => {
    try {
      const res = await axios.get(`${API_URL}/get/all/classes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClasses(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors du chargement des classes");
    }
  };

  useEffect(() => {
    if (token) fetchClasses();
  }, [token]);

  // ========== FILTRES ==========
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const matchSearch =
        !search ||
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.level?.toLowerCase().includes(search.toLowerCase()) ||
        c.academicYear?.toLowerCase().includes(search.toLowerCase());

      const matchLevel = !levelFilter || c.level === levelFilter;
      const matchYear = !academicYearFilter || c.academicYear === academicYearFilter;

      return matchSearch && matchLevel && matchYear;
    });
  }, [classes, search, levelFilter, academicYearFilter]);

  // ========== GESTION FORMULAIRE ==========
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (!name.includes(".")) {
      setFormData({ ...formData, [name]: value });
    } else {
      const [parent, child] = name.split(".");
      setFormData({
        ...formData,
        [parent]: { ...formData[parent], [child]: value },
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      level: "",
      academicYear: "",
      scheduleNote: "",
      room: { name: "", capacity: "" },
      building: { name: "", floor: "" },
    });
    setEditingClass(null);
  };

  const handleSubmit = async () => {
    try {
      if (editingClass) {
        await axios.put(`${API_URL}/update/classes/${editingClass._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Classe mise à jour");
      } else {
        await axios.post(`${API_URL}/create/classes`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Classe créée");
      }
      setShowModal(false);
      resetForm();
      fetchClasses();
    } catch {
      toast.error("Erreur lors de l'opération");
    }
  };

  const handleEdit = (classe) => {
    setEditingClass(classe);
    setFormData({
      name: classe.name || "",
      level: classe.level || "",
      academicYear: classe.academicYear || "",
      scheduleNote: classe.scheduleNote || "",
      room: {
        name: classe.room?.name || "",
        capacity: classe.room?.capacity || "",
      },
      building: {
        name: classe.building?.name || "",
        floor: classe.building?.floor || "",
      },
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Supprimer cette classe ?", { titre: "Supprimer la classe" }))) return;
    try {
      await axios.delete(`${API_URL}/delete/classes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Classe supprimée");
      fetchClasses();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  // ========== STATS ==========
  const totalClasses = filteredClasses.length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <TeacherSidebar />
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <h1 style={titleStyle}>🏫 Gestion des classes</h1>

        {/* Boutons d'action */}
        <button onClick={() => { resetForm(); setShowModal(true); }} style={buttonStyle}>
          + Ajouter une classe
        </button>

        {/* Filtres (style identique à Courses.jsx) */}
        <div style={filterContainer}>
          <input
            type="text"
            placeholder="🔍 Rechercher (nom, niveau, année)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={filterInput}
          />
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={filterInput}>
            <option value="">🎓 Tous les niveaux</option>
            {["Collège", "Lycée", "Université"].map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </select>
          <select value={academicYearFilter} onChange={(e) => setAcademicYearFilter(e.target.value)} style={filterInput}>
            <option value="">📅 Toutes les années</option>
            {[...new Set(classes.map(c => c.academicYear).filter(Boolean))].map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button style={{ ...buttonStyle, background: "#ef4444" }} onClick={() => {
            setSearch("");
            setLevelFilter("");
            setAcademicYearFilter("");
          }}>
            ❌ Reset
          </button>
        </div>

        {/* Carte statistique */}
        <div style={statsGrid}>
          <div style={statCard}>
            <p style={{ color: "#6b7280" }}>Total classes</p>
            <h2 style={{ margin: 0 }}>{totalClasses}</h2>
          </div>
        </div>

        {/* Tableau des classes (card) */}
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Nom</th><th>Niveau</th><th>Année scolaire</th>
                <th>Prof principal</th><th>Élèves</th>
                <th>Salle</th><th>Bâtiment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.length > 0 ? (
                filteredClasses.map((c) => (
                  <tr key={c._id}>
                    <td>{c.name}</td>
                    <td>{c.level || "-"}</td>
                    <td>{c.academicYear || "-"}</td>
                    <td>
                      {c.mainTeacher
                        ? `${c.mainTeacher.firstName || ""} ${c.mainTeacher.lastName || ""}`
                        : "-"}
                    </td>
                    <td>{c.students ? c.students.length : 0}</td>
                    <td>{c.room?.name ? `${c.room.name} (${c.room.capacity || 0})` : "-"}</td>
                    <td>{c.building?.name ? `${c.building.name} - ${c.building.floor || ""}` : "-"}</td>
                    <td>
                      <button style={editButtonStyle} onClick={() => handleEdit(c)}>Modifier</button>
                      <button style={{ ...buttonStyle, background: "#ef4444", marginLeft: 5 }} onClick={() => handleDelete(c._id)}>Supprimer</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8" style={{ textAlign: "center", padding: 20 }}>Aucune classe trouvée</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ================= MODAL AJOUT / MODIFICATION ================= */}
        {showModal && (
          <div style={modalStyle}>
            <div style={modalContentStyle}>
              <h2>{editingClass ? "Modifier" : "Ajouter"} une classe</h2>
              <input type="text" name="name" placeholder="Nom (ex: 3ème A)" value={formData.name} onChange={handleChange} style={inputStyle} />
              <input type="text" name="level" placeholder="Niveau (Collège, Lycée)" value={formData.level} onChange={handleChange} style={inputStyle} />
              <input type="text" name="academicYear" placeholder="Année scolaire (2025-2026)" value={formData.academicYear} onChange={handleChange} style={inputStyle} />

              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              ℹ️ La salle indiquée est informative seulement. 
              La réservation réelle se fait lors de la programmation des cours.
            </p>

              {/* <h4>🏫 Salle (optionnel)</h4>
              <input type="text" name="room.name" placeholder="Nom salle" value={formData.room.name} onChange={handleChange} style={inputStyle} />
              <input type="number" name="room.capacity" placeholder="Capacité" value={formData.room.capacity} onChange={handleChange} style={inputStyle} />

              <h4>🏢 Bâtiment (optionnel)</h4>
              <input type="text" name="building.name" placeholder="Nom bâtiment" value={formData.building.name} onChange={handleChange} style={inputStyle} />
              <input type="text" name="building.floor" placeholder="Étage" value={formData.building.floor} onChange={handleChange} style={inputStyle} />

              <textarea name="scheduleNote" placeholder="Note emploi du temps" value={formData.scheduleNote} onChange={handleChange} style={inputStyle} rows="3" /> */}

              <div style={{ marginTop: 15 }}>
                <button style={buttonStyle} onClick={handleSubmit}>Enregistrer</button>
                <button style={{ ...buttonStyle, background: "#aaa", marginLeft: 10 }} onClick={() => { setShowModal(false); resetForm(); }}>Annuler</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= STYLES (repris de Courses.jsx) ================= */
const titleStyle = { marginBottom: "20px" };
const sidebarStyle = { width: "200px", background: "#0f172a", color: "#fff", padding: "20px" };
const sidebarItemStyle = { padding: "12px", marginBottom: "10px", borderRadius: "8px", cursor: "pointer", background: "#1e3a8a" };
const cardStyle = { background: "#fff", padding: "5px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const buttonStyle = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "10px" };
const editButtonStyle = { ...buttonStyle, background: "#10b981" };
const inputStyle = { padding: "10px", marginBottom: "10px", width: "100%", borderRadius: "5px", border: "1px solid #ccc", boxSizing: "border-box" };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "10px", width: "450px", maxWidth: "90vw" };
const filterContainer = { display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", padding: "15px", background: "#ffffff", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" };
const filterInput = { padding: "10px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", minWidth: "200px", fontSize: "14px", outline: "none" };
const statsGrid = { display: "grid", gridTemplateColumns: "repeat(1, 1fr)", gap: "20px", margin: "20px 0" };
const statCard = { background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", textAlign: "center" };