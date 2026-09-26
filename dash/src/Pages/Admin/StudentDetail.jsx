// src/pages/StudentDetail.jsx
import React, { useEffect, useState } from "react";
import { useUserContext } from "../../contexts/UserContext";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

const API = "http://localhost:8080";

const EXAM_TYPE_MAP = {
  examen_final: { label: "Examen final", color: "#ef4444", icon: "🎓" },
  partiel: { label: "Partiel", color: "#f59e0b", icon: "📝" },
  devoir: { label: "Devoir", color: "#3b82f6", icon: "📋" },
  interro_surprise: { label: "Interro", color: "#8b5cf6", icon: "⚡" },
  rattrapage: { label: "Rattrapage", color: "#10b981", icon: "🔄" },
};

const METHOD_LABELS = {
  especes: "Espèces", virement: "Virement", mobile_money: "Mobile Money",
  cheque: "Chèque", carte: "Carte", autre: "Autre",
};

const paymentBadge = (status) => {
  const m = {
    paye: { bg: "#dcfce7", c: "#166534", l: "Soldé" },
    partiel: { bg: "#fef3c7", c: "#92400e", l: "Partiel" },
    non_paye: { bg: "#fee2e2", c: "#991b1b", l: "Non payé" },
  };
  const s = m[status] || m.non_paye;
  return <span style={{ padding: "4px 10px", borderRadius: 14, fontSize: 12, fontWeight: 700, background: s.bg, color: s.c }}>{s.l}</span>;
};

/* ================= SIDEBAR ================= */
const Sidebar = () => {
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
      <h2 style={{ marginBottom: 30, color: "#fff" }}>Menu</h2>
      {items.map((it, i) => (
        <div key={i} style={sidebarItemStyle} onClick={() => navigate(it.path)}>{it.name}</div>
      ))}
    </div>
  );
};

/* ================= PAGE ================= */
export default function StudentDetail() {
  const { id } = useParams();
  const { getAuthHeaders } = useUserContext();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("info");
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "especes", note: "" });
  const [paying, setPaying] = useState(false);
  const [showCreateScoModal, setShowCreateScoModal] = useState(false);
  const [createScoForm, setCreateScoForm] = useState({ academicYear: "", totalFees: "", classId: "" });
  const [selectedScolariteId, setSelectedScolariteId] = useState(null);
  const [classesList, setClassesList] = useState([]);
  // États pour le reçu
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`${API}/get/student/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      const result = await res.json();
      setData(result);
      if (result.student?.scolarites?.length > 0) {
        setSelectedScolariteId(result.student.scolarites[0]._id);
      }
    } catch {
      toast.error("Erreur chargement fiche étudiant");
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch(`${API}/get/classes`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setClassesList(data);
      }
    } catch (err) {
      console.error("Erreur chargement classes", err);
    }
  };

  useEffect(() => {
    fetchDetail();
    fetchClasses();
  }, [id]);

  const getSelectedScolarite = () => {
    if (!data?.student?.scolarites) return null;
    return data.student.scolarites.find(s => s._id === selectedScolariteId) || data.student.scolarites[0];
  };

  const sco = getSelectedScolarite();

  const handleAddPayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error("Montant invalide"); return;
    }
    if (!sco) { toast.error("Aucune scolarité trouvée"); return; }

    setPaying(true);
    try {
      const res = await fetch(`${API}/add/payment/${sco._id}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payForm),
      });
      const result = await res.json();
      if (res.ok) {
        toast.success(result.message);
        setShowPayModal(false);
        setPayForm({ amount: "", method: "especes", note: "" });
        fetchDetail();
      } else {
        toast.error(result.message || "Erreur");
      }
    } catch { toast.error("Erreur serveur"); }
    finally { setPaying(false); }
  };

  // ----- Fonctions pour le reçu -----
  const openReceipt = (payment) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const getReceiptHTML = () => {
    if (!selectedPayment) return '';
    return `
      <div style="max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; border-radius: 10px; font-family: Arial, sans-serif;">
        <h2 style="text-align: center;">REÇU DE PAIEMENT</h2>
        <hr />
        <p><strong>Étudiant :</strong> ${student.firstname} ${student.lastname}</p>
        <p><strong>Matricule :</strong> ${student.matricule || '-'}</p>
        <p><strong>Classe :</strong> ${cls?.name || '-'}</p>
        <p><strong>Année scolaire :</strong> ${sco?.academicYear || '-'}</p>
        <hr />
        <p><strong>Référence :</strong> ${selectedPayment.reference}</p>
        <p><strong>Date :</strong> ${new Date(selectedPayment.date).toLocaleString('fr-FR')}</p>
        <p><strong>Montant :</strong> ${selectedPayment.amount.toLocaleString()} FCFA</p>
        <p><strong>Mode :</strong> ${METHOD_LABELS[selectedPayment.method] || selectedPayment.method}</p>
        <p><strong>Reçu par :</strong> ${selectedPayment.receivedBy || '-'}</p>
        ${selectedPayment.note ? `<p><strong>Note :</strong> ${selectedPayment.note}</p>` : ''}
        <hr />
        <p style="text-align: center;">Merci pour votre paiement</p>
      </div>
    `;
  };

  const getReceiptText = () => {
    return `REÇU DE PAIEMENT\n
Étudiant : ${student.firstname} ${student.lastname}
Matricule : ${student.matricule || '-'}
Classe : ${cls?.name || '-'}
Année scolaire : ${sco?.academicYear || '-'}
--------------------
Référence : ${selectedPayment.reference}
Date : ${new Date(selectedPayment.date).toLocaleString('fr-FR')}
Montant : ${selectedPayment.amount.toLocaleString()} FCFA
Mode : ${METHOD_LABELS[selectedPayment.method] || selectedPayment.method}
Reçu par : ${selectedPayment.receivedBy || '-'}
${selectedPayment.note ? `Note : ${selectedPayment.note}` : ''}
--------------------
Merci pour votre paiement`;
  };

  const printReceipt = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <html>
        <head><title>Reçu de paiement</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">${getReceiptHTML()}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const sendByEmail = () => {
    const subject = `Reçu de paiement - ${selectedPayment.reference}`;
    const body = encodeURIComponent(getReceiptText());
    window.location.href = `mailto:${student.email}?subject=${subject}&body=${body}`;
  };

  const sendByWhatsApp = () => {
    const text = encodeURIComponent(getReceiptText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };
  // --------------------------------

  if (loading) return <div style={{ display: "flex", minHeight: "100vh" }}><Sidebar /><div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>Chargement...</div></div>;
  if (!data?.student) return <div style={{ display: "flex", minHeight: "100vh" }}><Sidebar /><div style={{ flex: 1, padding: 40 }}>Étudiant non trouvé. <button onClick={() => navigate("/student")} style={btnPrimary}>Retour</button></div></div>;

  const { student, examResults, stats } = data;
  const cls = student.class;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      <Sidebar />
      <div style={{ flex: 1, padding: 20 }}>

        {/* HEADER (inchangé) */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <button onClick={() => navigate("/student")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#2563eb" }}>
            {student.firstname?.[0]}{student.lastname?.[0]}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{student.firstname} {student.lastname}</h1>
            <div style={{ color: "#6b7280", fontSize: 13 }}>@{student.username} - {student.matricule} - {student.email}</div>
            <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
              <span style={{ ...badge, background: student.status === "active" ? "#dcfce7" : "#fee2e2", color: student.status === "active" ? "#166534" : "#991b1b" }}>
                {student.status === "active" ? "Actif" : "Suspendu"}
              </span>
              {cls && <span style={{ ...badge, background: "#dbeafe", color: "#1e40af" }}>{cls.name}</span>}
              {sco && paymentBadge(sco.paymentStatus)}
            </div>
          </div>
        </div>

        {/* STATS CARDS (inchangé) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
          <StatCard label="Moyenne" value={stats.averageScore !== null ? `${stats.averageScore}/20` : "-"} color="#2563eb" />
          <StatCard label="Examens passés" value={`${stats.examsTaken} / ${stats.totalExams}`} color="#8b5cf6" />
          <StatCard label="Meilleure note" value={stats.bestScore !== null ? `${Math.round(stats.bestScore * 10) / 10}/20` : "-"} color="#22c55e" />
          <StatCard label="Plus basse" value={stats.worstScore !== null ? `${Math.round(stats.worstScore * 10) / 10}/20` : "-"} color="#ef4444" />
          <StatCard label="Payé" value={sco ? `${((sco.paidAmount / Math.max(1, sco.totalFees)) * 100).toFixed(0)}%` : "-"} color="#f59e0b" />
          <StatCard label="Reste" value={sco ? `${sco.remainingAmount.toLocaleString()} F` : "-"} color="#ef4444" />
        </div>

        {/* TABS (inchangé) */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {[
            { key: "info", label: "Informations" },
            { key: "exams", label: `Résultats (${examResults?.length || 0})` },
            { key: "payments", label: `Paiements (${sco?.payments?.length || 0})` },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "10px 20px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
              background: activeTab === tab.key ? "#fff" : "#e5e7eb",
              color: activeTab === tab.key ? "#1e40af" : "#6b7280",
              boxShadow: activeTab === tab.key ? "0 -2px 6px rgba(0,0,0,0.06)" : "none",
            }}>{tab.label}</button>
          ))}
        </div>

        <div style={card}>
          {/* TAB INFORMATIONS (inchangé) */}
          {activeTab === "info" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <h3 style={sectionTitle}>Informations personnelles</h3>
                <InfoRow label="Prénom" value={student.firstname} />
                <InfoRow label="Nom" value={student.lastname} />
                <InfoRow label="Email" value={student.email} />
                <InfoRow label="Téléphone" value={student.phone || "-"} />
                <InfoRow label="Adresse" value={student.address || "-"} />
                <InfoRow label="Matricule" value={student.matricule} />
                <InfoRow label="Username" value={`@${student.username}`} />
                <InfoRow label="Inscrit le" value={student.createdAt ? new Date(student.createdAt).toLocaleDateString("fr-FR") : "-"} />
              </div>
              <div>
                <h3 style={sectionTitle}>Classe & formation</h3>
                {cls ? (
                  <>
                    <InfoRow label="Classe" value={cls.name} />
                    <InfoRow label="Niveau" value={cls.level || "-"} />
                    <InfoRow label="Année" value={cls.academicYear || "-"} />
                    <InfoRow label="Salle" value={cls.room?.name || "-"} />
                    <InfoRow label="Bâtiment" value={cls.building?.name || "-"} />
                    <InfoRow label="Prof principal" value={cls.mainTeacher?.fullname || cls.mainTeacher?.name || "-"} />
                    <InfoRow label="Effectif" value={cls.students?.length || "-"} />
                  </>
                ) : (
                  <p style={{ color: "#9ca3af" }}>Aucune classe assignée</p>
                )}
                <h3 style={{ ...sectionTitle, marginTop: 20 }}>Cours inscrits ({student.enrolledCourses?.length || 0})</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {student.enrolledCourses?.length > 0 ? student.enrolledCourses.map((c, i) => (
                    <span key={i} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, background: "#ede9fe", color: "#5b21b6" }}>
                      {c.title} {c.teacherInfo ? `(${c.teacherInfo.fullname || c.teacherInfo.name})` : ""}
                    </span>
                  )) : <span style={{ color: "#9ca3af", fontSize: 12 }}>Aucun cours</span>}
                </div>
              </div>
            </div>
          )}

          {/* TAB RÉSULTATS (inchangé) */}
          {activeTab === "exams" && (
            <div>
              {examResults?.length > 0 ? (
                <table style={tableStyle}>
                  <thead><tr><th style={th}>Type</th><th style={th}>Titre</th><th style={th}>Cours</th><th style={th}>Date</th><th style={th}>Note</th><th style={th}>/ 20</th><th style={th}>Statut</th></tr></thead>
                  <tbody>
                    {examResults.map((e) => {
                      const t = EXAM_TYPE_MAP[e.examType] || EXAM_TYPE_MAP.devoir;
                      const note20 = e.score !== null ? Math.round((e.score / e.totalPoints) * 20 * 100) / 100 : null;
                      return (
                        <tr key={e._id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: t.color + "18", color: t.color }}>{t.icon} {t.label}</span></td>
                          <td style={{ ...td, fontWeight: 500 }}>{e.title}</td>
                          <td style={td}>{e.course?.title || "-"}</td>
                          <td style={td}>{e.date ? new Date(e.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "-"}</td>
                          <td style={td}>{e.score !== null ? <span style={{ fontWeight: 700, fontSize: 15, color: note20 >= 10 ? "#22c55e" : "#ef4444" }}>{e.score}/{e.totalPoints}</span> : <span style={{ color: "#9ca3af", fontSize: 12 }}>Non noté</span>}</td>
                          <td style={td}>{note20 !== null ? <span style={{ fontWeight: 600, color: note20 >= 10 ? "#22c55e" : "#ef4444" }}>{note20}</span> : "-"}</td>
                          <td style={td}>{e.hasTaken ? <span style={{ ...badge, background: "#dcfce7", color: "#166534" }}>Passé</span> : <span style={{ ...badge, background: "#fee2e2", color: "#991b1b" }}>Non passé</span>}</td>
                          </tr>
                      
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>Aucun examen trouvé pour cet étudiant</p>
              )}
            </div>
          )}

          {/* TAB PAIEMENTS (modifié pour ajouter le bouton "Voir reçu") */}
          {activeTab === "payments" && (
            <div>
              {student.scolarites?.length > 1 && (
                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Année académique :</label>
                  <select
                    value={selectedScolariteId || ""}
                    onChange={(e) => setSelectedScolariteId(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  >
                    {student.scolarites.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.academicYear} {s.classId ? `- ${s.classId.name || "Classe"}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!sco && (
                <div style={{ padding: 16, borderRadius: 10, background: "#fef3c7", border: "1px solid #f59e0b", marginBottom: 16 }}>
                  <p style={{ marginBottom: 12, fontWeight: 500 }}>⚠️ Aucune scolarité enregistrée pour cet étudiant.</p>
                  <button onClick={() => {
                    setCreateScoForm({
                      academicYear: student.class?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
                      totalFees: "",
                      classId: student.class?._id || ""
                    });
                    setShowCreateScoModal(true);
                  }} style={btnPrimary}>
                    + Créer une scolarité
                  </button>
                </div>
              )}

              {sco && (
                <>
                  <div style={{ padding: 16, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>Scolarité {sco.academicYear}</span>
                        {sco.classId && <span style={{ marginLeft: 10, fontSize: 12, color: "#4b5563" }}>(Classe : {sco.classId.name || sco.classId})</span>}
                        <span style={{ marginLeft: 10 }}>{paymentBadge(sco.paymentStatus)}</span>
                      </div>
                      <button onClick={() => setShowPayModal(true)} style={{ ...btnPrimary, marginTop: 0 }} disabled={sco.paymentStatus === "paye"}>
                        + Ajouter un paiement
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 30, fontSize: 13 }}>
                      <span>Total : <strong>{sco.totalFees.toLocaleString()} F</strong></span>
                      <span>Payé : <strong style={{ color: "#22c55e" }}>{sco.paidAmount.toLocaleString()} F</strong></span>
                      <span>Reste : <strong style={{ color: sco.remainingAmount > 0 ? "#ef4444" : "#22c55e" }}>{sco.remainingAmount.toLocaleString()} F</strong></span>
                    </div>
                    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, marginTop: 10 }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${sco.totalFees > 0 ? Math.min(100, (sco.paidAmount / sco.totalFees) * 100) : 0}%`, background: sco.paymentStatus === "paye" ? "#22c55e" : "#f59e0b", transition: "width 0.3s" }} />
                    </div>
                  </div>

                  {sco.payments?.length > 0 ? (
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={th}>#</th><th style={th}>Date</th><th style={th}>Montant</th>
                          <th style={th}>Mode</th><th style={th}>Référence</th><th style={th}>Note</th><th style={th}>Reçu par</th><th style={th}>Reçu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...sco.payments].reverse().map((p, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={td}>{sco.payments.length - i}</td>
                            <td style={td}>{p.date ? new Date(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                            <td style={{ ...td, fontWeight: 700, color: "#22c55e", fontSize: 14 }}>+{p.amount.toLocaleString()} F</td>
                            <td style={td}><span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 11, background: "#f1f5f9", color: "#374151" }}>{METHOD_LABELS[p.method] || p.method}</span></td>
                            <td style={{ ...td, fontSize: 12, color: "#6b7280" }}>{p.reference || "-"}</td>
                            <td style={{ ...td, fontSize: 12, color: "#6b7280" }}>{p.note || "-"}</td>
                            <td style={td}>{p.receivedBy || "-"}</td>
                            <td style={td}>
                              <button
                                onClick={() => openReceipt(p)}
                                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 18 }}
                                title="Voir le reçu"
                              >
                                🧾
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Aucun versement enregistré</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* MODAL AJOUT PAIEMENT (inchangé, mais on enlève le champ reference) */}
        {showPayModal && sco && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3>Ajouter un versement</h3>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                {student.firstname} {student.lastname} - Année {sco.academicYear}
                {sco.classId && <span> - Classe : {sco.classId.name || sco.classId}</span>}
                <br />
                Reste à payer : <strong style={{ color: "#ef4444" }}>{sco.remainingAmount.toLocaleString()} FCFA</strong>
              </p>
              <label style={labelSt}>Montant (FCFA) *</label>
              <input type="number" placeholder="ex: 100000" value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                style={inputSt} max={sco.remainingAmount} />
              <label style={labelSt}>Mode de paiement</label>
              <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={inputSt}>
                <option value="especes">Espèces</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="virement">Virement bancaire</option>
                <option value="cheque">Chèque</option>
                <option value="carte">Carte bancaire</option>
                <option value="autre">Autre</option>
              </select>
              <label style={labelSt}>Note (optionnel)</label>
              <input type="text" placeholder="ex: 2ème tranche" value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} style={inputSt} />
              {payForm.amount && Number(payForm.amount) > 0 && (
                <div style={{ padding: 10, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, marginBottom: 10 }}>
                  Après ce versement : <strong>{(sco.paidAmount + Number(payForm.amount)).toLocaleString()} / {sco.totalFees.toLocaleString()} FCFA</strong>
                  - Reste : <strong style={{ color: sco.remainingAmount - Number(payForm.amount) <= 0 ? "#22c55e" : "#ef4444" }}>
                    {Math.max(0, sco.remainingAmount - Number(payForm.amount)).toLocaleString()} FCFA
                  </strong>
                  {sco.remainingAmount - Number(payForm.amount) <= 0 && " - Scolarité soldée !"}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={handleAddPayment} disabled={paying} style={{ ...btnPrimary, opacity: paying ? 0.6 : 1 }}>
                  {paying ? "En cours..." : "Enregistrer le paiement"}
                </button>
                <button onClick={() => setShowPayModal(false)} style={btnSecondary}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CRÉATION SCOLARITÉ (inchangé) */}
        {showCreateScoModal && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3>Créer une scolarité</h3>
              <label style={labelSt}>Année académique</label>
              <input type="text" placeholder="ex: 2025-2026" value={createScoForm.academicYear}
                onChange={(e) => setCreateScoForm({ ...createScoForm, academicYear: e.target.value })} style={inputSt} />
              <label style={labelSt}>Frais totaux (FCFA)</label>
              <input type="number" placeholder="ex: 500000" value={createScoForm.totalFees}
                onChange={(e) => setCreateScoForm({ ...createScoForm, totalFees: e.target.value })} style={inputSt} />
              <label style={labelSt}>Classe (optionnelle)</label>
              <select
                value={createScoForm.classId}
                onChange={(e) => setCreateScoForm({ ...createScoForm, classId: e.target.value })}
                style={inputSt}
              >
                <option value="">Aucune classe</option>
                {classesList.map((cls) => (
                  <option key={cls._id} value={cls._id}>
                    {cls.name} ({cls.academicYear})
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={async () => {
                  try {
                    const res = await fetch(`${API}/create/scolarite/${student._id}`, {
                      method: "POST",
                      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                      body: JSON.stringify(createScoForm),
                    });
                    if (res.ok) {
                      toast.success("Scolarité créée");
                      setShowCreateScoModal(false);
                      fetchDetail();
                    } else {
                      const err = await res.json();
                      toast.error(err.message);
                    }
                  } catch { toast.error("Erreur réseau"); }
                }} style={btnPrimary}>Créer</button>
                <button onClick={() => setShowCreateScoModal(false)} style={btnSecondary}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL REÇU (NOUVEAU) */}
        {showReceiptModal && selectedPayment && (
          <div style={modalOverlay}>
            <div style={{ ...modalBox, width: 500 }}>
              <div dangerouslySetInnerHTML={{ __html: getReceiptHTML() }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                <button onClick={printReceipt} style={btnPrimary}>🖨️ Imprimer</button>
                <button onClick={printReceipt} style={btnPrimary}>📄 Télécharger (PDF)</button>
                <button onClick={sendByEmail} style={btnPrimary}>📧 Envoyer par mail</button>
                <button onClick={sendByWhatsApp} style={btnPrimary}>💬 WhatsApp</button>
                <button onClick={() => setShowReceiptModal(false)} style={btnSecondary}>Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Sous-composants (inchangés) ═══ */
function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#fff", padding: 14, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
      <span style={{ width: 140, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span style={{ flex: 1, fontWeight: 400 }}>{value}</span>
    </div>
  );
}

/* ═══ STYLES (inchangés) ═══ */
const sidebarStyle = { width: 200, background: "#0f172a", color: "#fff", padding: 20 };
const sidebarItemStyle = { padding: 12, marginBottom: 10, borderRadius: 8, cursor: "pointer", background: "#1e3a8a" };
const card = { background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" };
const badge = { padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 600 };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#6b7280", background: "#f9fafb", fontWeight: 600 };
const td = { padding: "10px 12px" };
const btnPrimary = { padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, marginTop: 10 };
const btnSecondary = { padding: "10px 18px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, marginTop: 10 };
const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalBox = { background: "#fff", padding: 24, borderRadius: 12, width: 440, maxWidth: "90vw" };
const inputSt = { padding: 10, marginBottom: 10, width: "100%", borderRadius: 6, border: "1px solid #d1d5db", boxSizing: "border-box", fontSize: 13 };
const labelSt = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };