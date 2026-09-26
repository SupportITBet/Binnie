// src/pages/Student.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

/* ================= SIDEBAR ================= */
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
        <div key={idx} style={sidebarItemStyle} onClick={() => navigate(item.path)}>{item.name}</div>
      ))}
    </div>
  );
};

/* ================= HELPERS ================= */
const paymentBadge = (status) => {
  const map = {
    paye: { bg: "#dcfce7", color: "#166534", label: "Payé" },
    partiel: { bg: "#fef3c7", color: "#92400e", label: "Partiel" },
    non_paye: { bg: "#fee2e2", color: "#991b1b", label: "Non payé" },
  };
  const s = map[status] || map.non_paye;
  return (
    <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
};

/* ================= PAGE ÉTUDIANTS ================= */
export default function Student() {
  const { user, token, getAuthHeaders } = useUserContext();
  const confirm = useConfirm();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailStudent, setDetailStudent] = useState(null);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState({
    firstname: "",
    lastname: "",
    username: "",
    email: "",
    matricule: "",
    phone: "",
    address: "",
    classId: "",
    status: "active",
    // Scolarité
    totalFees: "",
    paidAmount: "",
    academicYear: "",
    scolariteNotes: "",
  });

  const API_URL = "http://localhost:8080";

    const navigate = useNavigate();

  /* ============ FETCH ============ */
  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_URL}/get/students`, { headers: getAuthHeaders() });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error("Erreur chargement des étudiants");
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch(`${API_URL}/get/all/classes`, { headers: getAuthHeaders() });
      setClasses(await res.json());
    } catch { toast.error("Erreur chargement des classes"); }
  };

  useEffect(() => {
    if (token) { fetchStudents(); fetchClasses(); }
  }, [token]);

  /* ============ GÉNÉRATION AUTO ============ */
  const generateUsername = (first, last) => {
    return `${first.toLowerCase().replace(/\s/g, "")}.${last.toLowerCase().replace(/\s/g, "")}${Math.floor(Math.random() * 1000)}`;
  };

  const generateMatricule = () => {
    const y = new Date().getFullYear();
    return `STU${y}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
  };

  useEffect(() => {
    if (!editingStudent && formData.firstname && formData.lastname) {
      setFormData((prev) => ({
        ...prev,
        username: generateUsername(formData.firstname, formData.lastname),
        matricule: generateMatricule(),
      }));
    }
  }, [formData.firstname, formData.lastname, editingStudent]);

  // Auto-remplir l'année académique quand on sélectionne une classe
  useEffect(() => {
    if (formData.classId && !formData.academicYear) {
      const cls = classes.find((c) => c._id === formData.classId);
      if (cls?.academicYear) {
        setFormData((prev) => ({ ...prev, academicYear: cls.academicYear }));
      }
    }
  }, [formData.classId, classes]);

  /* ============ FILTRES ============ */
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = !search ||
        `${s.firstname} ${s.lastname}`.toLowerCase().includes(search.toLowerCase()) ||
        s.username?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase()) ||
        s.matricule?.toLowerCase().includes(search.toLowerCase());
      const matchClass = !classFilter || s.class?._id === classFilter;
      const matchPayment = !paymentFilter || (s.scolarites?.[0]?.paymentStatus === paymentFilter);
      return matchSearch && matchClass && matchPayment;
    });
  }, [students, search, classFilter, paymentFilter]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  /* ============ STATS ============ */
  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((s) => s.status === "active").length;
    const totalFees = students.reduce((sum, s) => sum + (s.scolarites?.[0]?.totalFees || 0), 0);
    const totalPaid = students.reduce((sum, s) => sum + (s.scolarites?.[0]?.paidAmount || 0), 0);
    const paye = students.filter((s) => s.scolarites?.[0]?.paymentStatus === "paye").length;
    return { total, active, totalFees, totalPaid, paye, remaining: totalFees - totalPaid };
  }, [students]);

  /* ============ FORMULAIRE ============ */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      firstname: "", lastname: "", username: "", email: "", matricule: "",
      phone: "", address: "", classId: "", status: "active",
      totalFees: "", paidAmount: "", academicYear: "", scolariteNotes: "",
    });
    setEditingStudent(null);
  };

  const handleSubmit = async () => {
    if (!formData.firstname || !formData.lastname || !formData.email) {
      toast.error("Prénom, nom et email obligatoires");
      return;
    }

    try {
      let url = `${API_URL}/create/student`;
      let method = "POST";

      const payload = {
        firstname: formData.firstname,
        lastname: formData.lastname,
        username: formData.username,
        email: formData.email,
        matricule: formData.matricule,
        phone: formData.phone,
        address: formData.address,
        class: formData.classId || undefined,
        status: formData.status,
        adminId: user._id,
        // Scolarité
        totalFees: formData.totalFees ? Number(formData.totalFees) : 0,
        paidAmount: formData.paidAmount ? Number(formData.paidAmount) : 0,
        academicYear: formData.academicYear || "",
        scolariteNotes: formData.scolariteNotes || "",
      };

      if (editingStudent) {
        url = `${API_URL}/update/student/${editingStudent._id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(editingStudent ? "Étudiant modifié" : "Étudiant inscrit !");
        setShowModal(false);
        resetForm();
        fetchStudents();
      } else {
        toast.error(data.message || "Erreur");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur serveur");
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    const sco = student.scolarites?.[0];
    setFormData({
      firstname: student.firstname || "",
      lastname: student.lastname || "",
      username: student.username || "",
      email: student.email || "",
      matricule: student.matricule || "",
      phone: student.phone || "",
      address: student.address || "",
      classId: student.class?._id || "",
      status: student.status || "active",
      totalFees: sco?.totalFees?.toString() || "",
      paidAmount: sco?.paidAmount?.toString() || "",
      academicYear: sco?.academicYear || "",
      scolariteNotes: sco?.notes || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!(await confirm("Supprimer définitivement cet étudiant et sa scolarité ?", { titre: "Supprimer l'étudiant" }))) return;
    try {
      const res = await fetch(`${API_URL}/delete/student/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (res.ok) { toast.success("Supprimé"); fetchStudents(); }
      else { const e = await res.json(); toast.error(e.message || "Erreur"); }
    } catch { toast.error("Erreur serveur"); }
  };

  // const openDetail = (student) => {
  //   setDetailStudent(student);
  //   setShowDetailModal(true);
  // };
  const openDetail = (student) => {
  navigate(`/student/${student._id}`);
};

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <TeacherSidebar />
      <div style={{ flex: 1, padding: "0.4rem" }}>
        <h1 style={titleStyle}>👨‍🎓 Gestion des étudiants</h1>

        <button onClick={() => { resetForm(); setShowModal(true); }} style={buttonStyle}>+ Inscrire un étudiant</button>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "16px 0" }}>
          <div style={statCard}><div style={{ color: "#6b7280", fontSize: 12 }}>Total</div><div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div></div>
          <div style={statCard}><div style={{ color: "#6b7280", fontSize: 12 }}>Actifs</div><div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>{stats.active}</div></div>
          <div style={statCard}><div style={{ color: "#6b7280", fontSize: 12 }}>Payé complet</div><div style={{ fontSize: 22, fontWeight: 700, color: "#2563eb" }}>{stats.paye}</div></div>
          <div style={statCard}><div style={{ color: "#6b7280", fontSize: 12 }}>Encaissé</div><div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{stats.totalPaid.toLocaleString()} F</div></div>
          <div style={statCard}><div style={{ color: "#6b7280", fontSize: 12 }}>Reste à payer</div><div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{stats.remaining.toLocaleString()} F</div></div>
        </div>

        {/* Filtres */}
        <div style={filterContainer}>
          <input type="text" placeholder="🔍 Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} style={filterInput} />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={filterInput}>
            <option value="">🏫 Toutes les classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={filterInput}>
            <option value="">💰 Tous les paiements</option>
            <option value="paye">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="non_paye">Non payé</option>
          </select>
          <button style={{ ...buttonStyle, background: "#ef4444" }} onClick={() => { setSearch(""); setClassFilter(""); setPaymentFilter(""); setCurrentPage(1); }}>
            ❌ Reset
          </button>
        </div>

        {/* Tableau */}
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th>Nom complet</th><th>Matricule</th><th>Email</th>
                <th>Classe</th><th>Statut</th><th>Paiement</th><th>Montant</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.length > 0 ? paginatedStudents.map((s) => {
                const sco = s.scolarites?.[0];
                return (
                  <tr key={s._id}>
                    <td style={{ fontWeight: 500 }}>{s.firstname} {s.lastname}</td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{s.matricule || "-"}</td>
                    <td style={{ fontSize: 12 }}>{s.email}</td>
                    <td>{s.class?.name || "-"}</td>
                    <td>
                      <span style={{
                        padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: s.status === "active" ? "#dcfce7" : "#fee2e2",
                        color: s.status === "active" ? "#166534" : "#991b1b",
                      }}>
                        {s.status === "active" ? "Actif" : "Suspendu"}
                      </span>
                    </td>
                    <td>{sco ? paymentBadge(sco.paymentStatus) : <span style={{ fontSize: 11, color: "#9ca3af" }}>-</span>}</td>
                    <td style={{ fontSize: 12 }}>
                      {sco ? `${(sco.paidAmount || 0).toLocaleString()} / ${(sco.totalFees || 0).toLocaleString()} F` : "-"}
                    </td>
                    <td>
                      <button style={{ ...editButtonStyle, padding: "4px 8px", fontSize: 11 }} onClick={() => openDetail(s)} title="Détails">👁️</button>
                      <button style={{ ...editButtonStyle, marginLeft: 4, padding: "4px 8px", fontSize: 11 }} onClick={() => handleEdit(s)}>Modifier</button>
                      <button style={{ ...buttonStyle, background: "#ef4444", marginLeft: 4, padding: "4px 8px", fontSize: 11 }} onClick={() => handleDelete(s._id)}>Suppr.</button>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="8" style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Aucun étudiant</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} style={paginationButton}>◀</button>
              <span style={{ padding: "6px 14px", fontSize: 13 }}>Page {currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={paginationButton}>▶</button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════
         *  MODAL INSCRIPTION / MODIFICATION
         * ═══════════════════════════════════════ */}
        {showModal && (
          <div style={modalStyle}>
            <div style={{ ...modalContentStyle, width: "560px", maxHeight: "90vh", overflowY: "auto" }}>
              <h2>{editingStudent ? "Modifier l'étudiant" : "Inscrire un étudiant"}</h2>

              {/* Section identité */}
              <div style={sectionHeader}>Identité</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="text" name="firstname" placeholder="Prénom *" value={formData.firstname} onChange={handleChange} style={{ ...inputStyle, flex: 1 }} />
                <input type="text" name="lastname" placeholder="Nom *" value={formData.lastname} onChange={handleChange} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="text" name="username" placeholder="Username" value={formData.username} onChange={handleChange} style={{ ...inputStyle, flex: 1, background: editingStudent ? "#fff" : "#f3f4f6" }} disabled={!editingStudent} />
                <input type="text" name="matricule" placeholder="Matricule" value={formData.matricule} onChange={handleChange} style={{ ...inputStyle, flex: 1, background: editingStudent ? "#fff" : "#f3f4f6" }} disabled={!editingStudent} />
              </div>
              <input type="email" name="email" placeholder="Email *" value={formData.email} onChange={handleChange} style={inputStyle} />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="tel" name="phone" placeholder="Téléphone" value={formData.phone} onChange={handleChange} style={{ ...inputStyle, flex: 1 }} />
                <select name="status" value={formData.status} onChange={handleChange} style={{ ...inputStyle, flex: 1 }}>
                  <option value="active">Actif</option>
                  <option value="suspended">Suspendu</option>
                </select>
              </div>
              <textarea name="address" placeholder="Adresse" value={formData.address} onChange={handleChange} style={inputStyle} rows="2" />

              {/* Section classe */}
              <div style={sectionHeader}>Classe</div>
              <select name="classId" value={formData.classId} onChange={handleChange} style={inputStyle}>
                <option value="">🏫 Sélectionner une classe</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>{c.name} - {c.academicYear || ""}</option>
                ))}
              </select>

              {/* Section scolarité */}
              <div style={sectionHeader}>Scolarité & paiement</div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Année académique</label>
                  <input type="text" name="academicYear" placeholder="ex: 2025-2026" value={formData.academicYear} onChange={handleChange} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Frais totaux (FCFA)</label>
                  <input type="number" name="totalFees" placeholder="ex: 500000" value={formData.totalFees} onChange={handleChange} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Montant payé (FCFA)</label>
                  <input type="number" name="paidAmount" placeholder="ex: 250000" value={formData.paidAmount} onChange={handleChange} style={inputStyle} />
                </div>
              </div>

              {/* Aperçu paiement */}
              {(formData.totalFees || formData.paidAmount) && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 10,
                  background: "#f0fdf4", border: "1px solid #bbf7d0",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Reste à payer :</span>
                    <span style={{ fontWeight: 700, color: (Number(formData.totalFees) - Number(formData.paidAmount)) > 0 ? "#ef4444" : "#22c55e" }}>
                      {(Math.max(0, (Number(formData.totalFees) || 0) - (Number(formData.paidAmount) || 0))).toLocaleString()} FCFA
                    </span>
                  </div>
                  {/* Barre */}
                  <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3, marginTop: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: `${Math.min(100, Number(formData.totalFees) > 0 ? (Number(formData.paidAmount) / Number(formData.totalFees)) * 100 : 0)}%`,
                      background: Number(formData.paidAmount) >= Number(formData.totalFees) ? "#22c55e" : "#f59e0b",
                    }} />
                  </div>
                </div>
              )}

              <textarea name="scolariteNotes" placeholder="Notes sur la scolarité (optionnel)" value={formData.scolariteNotes} onChange={handleChange} style={inputStyle} rows="2" />

              {/* Boutons */}
              <div style={{ marginTop: 15, display: "flex", gap: 10 }}>
                <button style={{ ...buttonStyle, padding: "12px 24px" }} onClick={handleSubmit}>
                  {editingStudent ? "Mettre à jour" : "✅ Inscrire"}
                </button>
                <button style={{ ...buttonStyle, background: "#aaa" }} onClick={() => { setShowModal(false); resetForm(); }}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
         *  MODAL DÉTAIL ÉTUDIANT
         * ═══════════════════════════════════════ */}
        {showDetailModal && detailStudent && (
          <div style={modalStyle}>
            <div style={{ ...modalContentStyle, width: "500px", maxHeight: "85vh", overflowY: "auto" }}>
              <h2>📋 Fiche étudiant</h2>

              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                {/* Avatar placeholder */}
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", background: "#dbeafe",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, fontWeight: 700, color: "#2563eb",
                }}>
                  {detailStudent.firstname?.[0]}{detailStudent.lastname?.[0]}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{detailStudent.firstname} {detailStudent.lastname}</h3>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>@{detailStudent.username} - {detailStudent.matricule}</p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>{detailStudent.email}</p>
                </div>
              </div>

              <div style={sectionHeader}>Classe & cours</div>
              <p><strong>Classe :</strong> {detailStudent.class?.name || "Aucune"}</p>
              {detailStudent.enrolledCourses?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {detailStudent.enrolledCourses.map((c, i) => (
                    <span key={i} style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, background: "#dbeafe", color: "#1e40af" }}>
                      {c.title || c}
                    </span>
                  ))}
                </div>
              )}

              {detailStudent.scolarites?.length > 0 && (
                <>
                  <div style={sectionHeader}>Scolarité</div>
                  {detailStudent.scolarites.map((sco, i) => (
                    <div key={i} style={{ padding: 10, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", marginBottom: 8, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Année : <strong>{sco.academicYear}</strong></span>
                        {paymentBadge(sco.paymentStatus)}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 20 }}>
                        <span>Frais : {(sco.totalFees || 0).toLocaleString()} F</span>
                        <span>Payé : <strong style={{ color: "#22c55e" }}>{(sco.paidAmount || 0).toLocaleString()} F</strong></span>
                        <span>Reste : <strong style={{ color: "#ef4444" }}>{(sco.remainingAmount || 0).toLocaleString()} F</strong></span>
                      </div>
                      <div style={{ height: 5, background: "#e5e7eb", borderRadius: 3, marginTop: 6 }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${sco.totalFees > 0 ? Math.min(100, (sco.paidAmount / sco.totalFees) * 100) : 0}%`,
                          background: sco.paymentStatus === "paye" ? "#22c55e" : "#f59e0b",
                        }} />
                      </div>
                      {sco.notes && <div style={{ marginTop: 4, color: "#6b7280", fontStyle: "italic" }}>{sco.notes}</div>}
                    </div>
                  ))}
                </>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button style={editButtonStyle} onClick={() => { setShowDetailModal(false); handleEdit(detailStudent); }}>Modifier</button>
                <button style={{ ...buttonStyle, background: "#aaa" }} onClick={() => setShowDetailModal(false)}>Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const titleStyle = { marginBottom: "20px" };
const sidebarStyle = { width: "200px", background: "#0f172a", color: "#fff", padding: "20px" };
const sidebarItemStyle = { padding: "12px", marginBottom: "10px", borderRadius: "8px", cursor: "pointer", background: "#1e3a8a" };
const cardStyle = { background: "#fff", padding: "5px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const buttonStyle = { padding: "10px 15px", background: "#2563eb", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "10px" };
const editButtonStyle = { ...buttonStyle, background: "#10b981" };
const inputStyle = { padding: "10px", marginBottom: "10px", width: "100%", borderRadius: "5px", border: "1px solid #ccc", boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const sectionHeader = { fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 14, marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #e5e7eb" };
const modalStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle = { background: "#fff", padding: "20px", borderRadius: "10px", width: "500px", maxWidth: "90vw" };
const filterContainer = { display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px", padding: "15px", background: "#ffffff", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" };
const filterInput = { padding: "10px 12px", borderRadius: "8px", border: "1px solid #e5e7eb", minWidth: "180px", fontSize: "14px", outline: "none" };
const statCard = { background: "white", padding: "14px", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", textAlign: "center" };
const paginationButton = { padding: "6px 12px", background: "#e5e7eb", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" };