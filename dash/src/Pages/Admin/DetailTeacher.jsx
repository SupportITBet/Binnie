// src/pages/DetailTeacher.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useUserContext } from "../../contexts/UserContext";
import toast from "react-hot-toast";
import CloudinaryUpload, { AvatarUpload } from "../../Components/CloudinaryUpload";

export default function DetailTeacher() {
  const { user, getAuthHeaders } = useUserContext();
  const { teacherId } = useParams();

  const [teacher, setTeacher] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);

  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState({});

  /* ================= FETCH ================= */
  const fetchTeacher = async () => {
    try {
      const res = await fetch(
        `http://localhost:8080/get/teacher/${teacherId}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json();
      setTeacher(data);
      setSelectedCourses(data.coursesTaught?.map(c => c._id) || []);
    } catch {
      toast.error("Erreur récupération professeur");
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await fetch(
        `http://localhost:8080/get/courses?adminId=${user._id}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json();
      setCourses(data);
    } catch {
      toast.error("Erreur récupération cours");
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchTeacher();
      fetchCourses();
    }
  }, [teacherId, user]);

/* ================= HANDLE COURSES ================= */
const handleCourseChange = (courseId, checked) => {
  const idStr = courseId.toString();
  let updated = [...selectedCourses];
  if (checked && !updated.includes(idStr)) updated.push(idStr);
  else if (!checked) updated = updated.filter((c) => c !== idStr);
  setSelectedCourses(updated);
};


  const handleSaveCourses = async () => {
    try {
      const res = await fetch(
        `http://localhost:8080/teachers/${teacherId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ coursesTaught: selectedCourses }),
        }
      );
      if (res.ok) {
        toast.success("Cours mis à jour !");
        setShowCoursesModal(false);
        fetchTeacher();
      } else {
        toast.error("Erreur mise à jour");
      }
    } catch {
      toast.error("Erreur serveur");
    }
  };

/* ================= MODAL EDIT ================= */
const openEditModal = () => {
  if (!teacher) return;
  setForm({
    fullname: teacher.fullname || "",
    email: teacher.email || "",
    username: teacher.username || "",
    phone: teacher.phone || "",
    address: teacher.address || "",
  });
  setShowEditModal(true);
};

  const handleUpdateTeacher = async () => {
    try {
      const res = await fetch(
        `http://localhost:8080/teachers/${teacherId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(form),
        }
      );
      if (res.ok) {
        toast.success("Prof mis à jour !");
        setShowEditModal(false);
        fetchTeacher();
      } else {
        toast.error("Erreur update");
      }
    } catch {
      toast.error("Erreur serveur");
    }
  };

  if (!teacher) return <p style={{ padding: 20 }}>Chargement...</p>;

  return (
    <div style={page}>

      {/* ================= HEADER ================= */}
      <div style={header}>
        <div>
          <h1 style={title}>{teacher.fullname}</h1>
          <p style={subtitle}>{teacher.email}</p>
        </div>

        <span
          style={{
            ...badge,
            background:
              teacher.status === "active" ? "#22c55e" : "#ef4444",
          }}
        >
          {teacher.status}
        </span>
      </div>

      {/* ================= ACTION BUTTONS ================= */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={openEditModal} style={buttonStyle}>
          Modifier le profil
        </button>
        <button
          onClick={() => setShowCoursesModal(true)}
          style={{ ...buttonStyle, marginLeft: 10 }}
        >
          Ajouter/Assigner des cours
        </button>
      </div>

      {/* ================= STATS ================= */}
      <div style={statsGrid}>
        <StatCard title="Cours" value={teacher.totalCourses} />
        <StatCard title="Examens" value={teacher.totalExams} />
        <StatCard
          title="Dernière connexion"
          value={
            teacher.lastLogin
              ? new Date(teacher.lastLogin).toLocaleDateString()
              : "Jamais"
          }
        />
        <StatCard
          title="Compte créé"
          value={new Date(teacher.createdAt).toLocaleDateString()}
        />
      </div>

      {/* ================= INFOS ================= */}
      <div style={grid}>
        <div style={card}>
          <h2>Informations</h2>
          <Info label="Username" value={teacher.username} />
          <Info label="Téléphone" value={teacher.phone || "-"} />
          <Info label="Adresse" value={teacher.address || "-"} />
          <Info label="Role" value={teacher.role} />
        </div>

        <div style={card}>
          <h2>Activité</h2>
          <Info label="Cours assignés" value={teacher.totalCourses} />
          <Info label="Examens créés" value={teacher.totalExams} />
        </div>
      </div>

      {/* ================= COURSES TABLE ================= */}
      <div style={card}>
        <h2>📚 Cours enseignés</h2>
        <table style={table}>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Description</th>
              <th>Étudiants</th>
            </tr>
          </thead>
          <tbody>
            {teacher.coursesTaught?.length > 0 ? (
              teacher.coursesTaught.map((course) => (
                <tr key={course._id}>
                  <td>{course.title}</td>
                  <td>{course.description || "-"}</td>
                  <td>{course.students?.length || 0}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3">Aucun cours</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= DOCUMENTS ================= */}
      <div style={card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h2 style={{ margin:0 }}>📄 Documents</h2>
          <CloudinaryUpload
            type="document"
            label="Ajouter un document"
            compact
            onSuccess={(file) => {
              setTeacher(t => ({ ...t, documents: [...(t.documents || []), { _id: Date.now(), title: file.original_name, url: file.url }] }));
              toast.success(`Document "${file.original_name}" ajouté ✓`);
            }}
            onError={(msg) => toast.error(msg)}
          />
        </div>
        {teacher.documents?.length > 0 ? (
          teacher.documents.map((doc) => (
            <div key={doc._id} style={docItem}>
              📄 {doc.title || "Document"}{doc.url && <a href={doc.url} target="_blank" rel="noreferrer" style={{ marginLeft:8, fontSize:12, color:"#0891b2" }}>Voir</a>}
            </div>
          ))
        ) : (
          <p>Aucun document</p>
        )}
      </div>

{showCoursesModal && (
  <div style={modalStyle}>
    <div style={modalContent}>
      <h2>Assigner des cours</h2>
      {courses.length > 0 ? (
        courses.map((c) => (
          <label key={c._id} style={{ display: "block", marginBottom: 5 }}>
            <input
              type="checkbox"
              checked={selectedCourses.includes(c._id.toString())}
              onChange={(e) => handleCourseChange(c._id, e.target.checked)}
            />{" "}
            {c.title}
          </label>
        ))
      ) : (
        <p>Aucun cours disponible</p>
      )}

      <div style={{ marginTop: 15 }}>
        <button onClick={handleSaveCourses} style={buttonStyle}>
          Enregistrer
        </button>
        <button
          onClick={() => setShowCoursesModal(false)}
          style={{ marginLeft: 10 }}
        >
          Fermer
        </button>
      </div>
    </div>
  </div>
)}


      {/* ================= MODAL EDIT ================= */}
      {showEditModal && (
        <div style={modalStyle}>
          <div style={modalContent}>
            <h2>Modifier professeur</h2>

            <input
              value={form.fullname}
              onChange={(e) => setForm({ ...form, fullname: e.target.value })}
              placeholder="Nom"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
            />
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Username"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Téléphone"
            />
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Adresse"
            />

            <div style={{ marginTop: 15 }}>
              <button onClick={handleUpdateTeacher} style={buttonStyle}>
                Enregistrer
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ marginLeft: 10 }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= COMPONENTS ================= */
const StatCard = ({ title, value }) => (
  <div style={statCard}>
    <p style={{ color: "#888" }}>{title}</p>
    <h2>{value}</h2>
  </div>
);

const Info = ({ label, value }) => (
  <p>
    <strong>{label} :</strong> {value}
  </p>
);

/* ================= STYLES ================= */
const page = { padding: "30px", background: "#f9fafb", minHeight: "100vh", fontFamily: "Segoe UI" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" };
const title = { margin: 0 };
const subtitle = { color: "#6b7280" };
const badge = { padding: "5px 12px", borderRadius: "20px", color: "white", fontSize: "12px" };
const statsGrid = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "30px" };
const statCard = { background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" };
const card = { background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const table = { width: "100%", borderCollapse: "collapse", marginTop: "15px" };
const docItem = { padding: "10px", borderBottom: "1px solid #eee" };
const buttonStyle = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center" };
const modalContent = { background: "#fff", padding: "20px", borderRadius: "10px", width: "400px" };