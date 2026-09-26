// src/pages/TeachersPage.jsx
import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { useUserContext } from "../../contexts/UserContext";
import toast from "react-hot-toast";
import { useNavigate, Link } from "react-router-dom";

Modal.setAppElement("#root");

// ================= SIDEBAR =================
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
      <h2 style={{ marginBottom: "30px" }}>Menu</h2>
      {items.map((item, idx) => (
        <div key={idx} style={sidebarItemStyle} onClick={() => navigate(item.path)}>
          {item.name}
        </div>
      ))}
    </div>
  );
};

// ================= TEACHERS PAGE =================
export default function TeachersPage() {
  const { user, token, getAuthHeaders } = useUserContext();

  const [teachers, setTeachers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
const [currentPage, setCurrentPage] = useState(1);
const teachersPerPage = 5;

  const [form, setForm] = useState({
    fullname: "",
    username: "",
    email: "",
    password: "",
    phone: "",
    address: ""
  });

  const filteredTeachers = teachers.filter((t) =>
  t.fullname?.toLowerCase().includes(search.toLowerCase())
);

const indexOfLast = currentPage * teachersPerPage;
const indexOfFirst = indexOfLast - teachersPerPage;
const currentTeachers = filteredTeachers.slice(indexOfFirst, indexOfLast);

const totalPages = Math.ceil(filteredTeachers.length / teachersPerPage);

  // ================= GENERATE USERNAME & PASSWORD =================
  const generateUsername = (fullname) => {
    const cleanName = fullname.toLowerCase().replace(/\s+/g, '');
    const randomNum = Math.floor(100 + Math.random() * 900);
    return cleanName + randomNum;
  };

  const generatePassword = () => {
    return Math.random().toString(36).slice(-8);
  };

  // ================= FETCH TEACHERS =================
  const fetchTeachers = async () => {
    try {
      const res = await fetch(`http://localhost:8080/get/teachers`, {
        headers: getAuthHeaders(), // ✅ IMPORTANT
      });

      if (!res.ok) throw new Error("Erreur serveur");

      const data = await res.json();
      setTeachers(data);
    } catch (err) {
      console.error(err);
      toast.error("Erreur récupération profs");
    }
  };

  useEffect(() => {
    if (token) fetchTeachers();
  }, [token]);

  // ================= HANDLE FORM =================
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "fullname") {
      const username = generateUsername(value);
      const password = generatePassword();

      setForm({
        ...form,
        fullname: value,
        username,
        password
      });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  // ================= ADD TEACHER =================
  const handleAddTeacher = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        fullname: form.fullname,
        username: form.username,
        email: form.email,
        password: form.password,
        phone: form.phone,
        address: form.address
      };

      const res = await fetch("http://localhost:8080/create/teachers", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Prof ${data.fullname} créé !`);
        setModalOpen(false);

        setForm({
          fullname: "",
          username: "",
          email: "",
          password: "",
          phone: "",
          address: ""
        });

        fetchTeachers();
      } else {
        toast.error(data.message || "Erreur création");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur serveur");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <TeacherSidebar />

      <div style={{ flex: 1, padding: "20px" }}>

        <h1>Liste des professeurs</h1>


      {/* BUTTON */}
        <button style={buttonStyle} onClick={() => setModalOpen(true)}>
          Ajouter un prof
        </button>

        <input
  type="text"
  placeholder="🔍 Rechercher un professeur..."
  value={search}
  onChange={(e) => {
    setSearch(e.target.value);
    setCurrentPage(1); // reset page
  }}
  style={{
    padding: "10px",
    width: "300px",
    marginBottom: "15px",
    borderRadius: "8px",
    border: "1px solid #ccc"
  }}
/>
        {/* TABLE */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{  }}>
              <th style={tdStyle}>Nom</th>
              <th style={tdStyle}>Email</th>
              <th style={tdStyle}>Username</th>
              <th style={tdStyle}>Téléphone</th>
              <th style={tdStyle}>Détails</th>
            </tr>
          </thead>
          <tbody>
            {currentTeachers.map(t => (
              <tr key={t._id}>
                <td style={tdStyle}>{t.fullname}</td>
                <td style={tdStyle}>{t.email}</td>
                <td style={tdStyle}>{t.username}</td>
                <td style={tdStyle}>{t.phone}</td>
                <td style={tdStyle}>
                  <Link to={`/teachers/${t._id}`} style={{ color: "#2563eb" }}>
                    Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

  <div style={{ marginTop: "20px" }}>
  {Array.from({ length: totalPages }, (_, i) => (
    <button
      key={i}
      onClick={() => setCurrentPage(i + 1)}
      style={{
        margin: "5px",
        padding: "8px 12px",
        borderRadius: "5px",
        border: "none",
        cursor: "pointer",
        background: currentPage === i + 1 ? "#2563eb" : "#ccc",
        color: "#fff"
      }}
    >
      {i + 1}
    </button>
  ))}
</div>

        {/* MODAL */}
        <Modal isOpen={modalOpen} onRequestClose={() => setModalOpen(false)} style={modalStyles}>
          <h2>Ajouter professeur</h2>

          <form onSubmit={handleAddTeacher} style={{ display: "flex", flexDirection: "column" }}>
            <input name="fullname" placeholder="Nom" value={form.fullname} onChange={handleChange} style={inputStyle} required />
            <input name="username" value={form.username} style={inputStyle} disabled />
            <input name="password" value={form.password} style={inputStyle} disabled />
            <input type="email" name="email" placeholder="Email" value={form.email} onChange={handleChange} style={inputStyle} required />
            <input name="phone" placeholder="Téléphone" value={form.phone} onChange={handleChange} style={inputStyle} />
            <input name="address" placeholder="Adresse" value={form.address} onChange={handleChange} style={inputStyle} />

            <button type="submit" style={buttonStyle}>Ajouter</button>
          </form>

          <button onClick={() => setModalOpen(false)} style={{ ...buttonStyle, background: "#aaa" }}>
            Fermer
          </button>
        </Modal>
      </div>
    </div>
  );
}

// ================= STYLES =================
const tdStyle = { padding: "8px", borderBottom: "1px solid #ddd" };
const buttonStyle = { padding: "10px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "20px" };
const inputStyle = { padding: "10px", marginBottom: "10px", borderRadius: "5px", border: "1px solid #ccc" };

const modalStyles = {
  content: {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "400px"
  }
};

const sidebarStyle = {
  width: "220px",
  background: "#0f172a",
  color: "#fff",
  padding: "20px"
};

const sidebarItemStyle = {
  padding: "12px",
  marginBottom: "10px",
  borderRadius: "8px",
  cursor: "pointer",
  background: "#1e3a8a"
};