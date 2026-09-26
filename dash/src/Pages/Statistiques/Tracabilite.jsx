import React, { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Blocks } from "react-loader-spinner";
import { useUserContext } from "../../contexts/UserContext";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer";

export default function Tracabilite() {
  const { user ,getAuthHeaders} = useUserContext();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [adminPage, setAdminPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const logsPerPage = 15;

  const [viewRole, setViewRole] = useState("all");

  useEffect(() => {
    if (!user?.token) return;

    const fetchTraces = async () => {
      setLoading(true);
      try {
        const res = await fetch("http://localhost:8080/actions", {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success) setLogs(data.traces);
        else toast.error(data.message || "Erreur récupération des traces");
      } catch {
        toast.error("Erreur de chargement des logs");
      } finally {
        setLoading(false);
      }
    };

    fetchTraces();
  }, [user]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const logDate = new Date(log.createdAt);
      if (startDate && logDate < new Date(startDate)) return false;
      if (endDate && logDate > new Date(endDate + "T23:59:59")) return false;
      if (roleFilter && log.performedBy?.role !== roleFilter) return false;
      if (typeFilter && log.type !== typeFilter) return false;
      return true;
    });
  }, [logs, startDate, endDate, roleFilter, typeFilter]);

  const adminLogs = filteredLogs.filter(
    (log) =>
      (log.performedBy?.role?.toLowerCase() === "admin") ||
      (!log.performedBy && log.type === "LOGIN")
  );
  const userLogs = filteredLogs.filter(
    (log) => log.performedBy?.role?.toLowerCase() === "user"
  );

  const actionColors = {
    CREATE: "#D1FAE5",
    UPDATE: "#DBEAFE",
    DELETE: "#FECACA",
    ARCHIVE: "#FEF3C7",
    LOGIN: "#EDE9FE",
    PAYMENT: "#a29db9ff",
  };

  const roleColors = {
    admin: "#b4c3f3ff",
    user: "#70eeb1ff",
  };

  const paginate = (logsArray, page) => {
    const start = (page - 1) * logsPerPage;
    return logsArray.slice(start, start + logsPerPage);
  };

  const totalPages = (logsArray) => Math.ceil(logsArray.length / logsPerPage);

  // 🔹 Fonction pour afficher les champs modifiés
  const renderModifiedFields = (log) => {
    if (!log.modifiedFields || Object.keys(log.modifiedFields).length === 0) return null;
    return (
      <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#f0f9ff", borderRadius: "8px" }}>
        <strong>Champs modifiés :</strong>
        {Object.entries(log.modifiedFields).map(([field, values]) => (
          <p key={field} style={{ margin: "3px 0", fontSize: "0.9rem" }}>
            {field}: <span style={{ color: "#ef4444" }}>Avant: {JSON.stringify(values.old)}</span> →{" "}
            <span style={{ color: "#10b981" }}>Après: {JSON.stringify(values.new)}</span>
          </p>
        ))}
      </div>
    );
  };

  const handlePrevAdmin = () => {
  if (adminPage > 1) setAdminPage(adminPage - 1);
};

const handleNextAdmin = () => {
  if (adminPage < totalPages(adminLogs)) setAdminPage(adminPage + 1);
};

const handlePrevUser = () => {
  if (userPage > 1) setUserPage(userPage - 1);
};

const handleNextUser = () => {
  if (userPage < totalPages(userLogs)) setUserPage(userPage + 1);
};

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: "1200px", margin: "30px auto", padding: "20px" }}>
        <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
          🕵️ Journal de traçabilité
        </h2>

        {/* 🔹 Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px", justifyContent: "center" }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Date début" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="Date fin" />
          {/* <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Tous les rôles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select> */}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tous les types</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="ARCHIVE">ARCHIVE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="UPLOAD">UPLOAD</option>
            <option value="PAYMENT">PAYMENT</option>
            <option value="OTHER">OTHER</option>
          </select>
          <button
            onClick={() => {
              setStartDate(""); setEndDate(""); setRoleFilter(""); setTypeFilter(""); 
              setAdminPage(1); setUserPage(1);
            }}
            style={{ padding: "5px 15px", backgroundColor: "#4f46e5", color: "#fff", borderRadius: "5px", cursor: "pointer" }}
          >
            Réinitialiser
          </button>
        </div>

        {/* 🔹 Boutons de sélection Admin/User */}
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => setViewRole("all")} style={{ padding: "5px 15px", borderRadius: "5px", backgroundColor: viewRole === "all" ? "#4f46e5" : "#e5e7eb", color: viewRole === "all" ? "#fff" : "#000", cursor: "pointer" }}>Tous</button>
          <button onClick={() => setViewRole("admin")} style={{ padding: "5px 15px", borderRadius: "5px", backgroundColor: viewRole === "admin" ? "#4f46e5" : "#e5e7eb", color: viewRole === "admin" ? "#fff" : "#000", cursor: "pointer" }}>Admin</button>
          <button onClick={() => setViewRole("user")} style={{ padding: "5px 15px", borderRadius: "5px", backgroundColor: viewRole === "user" ? "#4f46e5" : "#e5e7eb", color: viewRole === "user" ? "#fff" : "#000", cursor: "pointer" }}>Utilisateurs</button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "50px 0" }}>
            <Blocks visible={true} height="80" width="100%" ariaLabel="loading" />
          </div>
        ) : (
          <>
            {/* 🔹 Affichage Admin */}
            {(viewRole === "all" || viewRole === "admin") && (
              <>
                <h3 style={{ margin: "20px 0 10px" }}>Admin</h3>
                {adminLogs.length === 0 ? (
                  <p style={{ textAlign: "center", fontStyle: "italic", color: "#6b7280" }}>Aucune action admin</p>
                ) : (
                  paginate(adminLogs, adminPage).map((log) => (
                    <div key={log._id} style={{ display: "flex", flexDirection: "column", padding: "15px", borderRadius: "10px", boxShadow: "0 5px 15px rgba(0,0,0,0.05)", backgroundColor: "#f9fafb", marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ backgroundColor: actionColors[log.type] || "#E5E7EB", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>{log.type}</span>
                        <span style={{ backgroundColor: roleColors[log.performedBy?.role] || "#E0E7FF", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>
                          {log.performedBy?.role || "Admin"}
                        </span>
                      </div>
                      <p><strong>Action :</strong> {log.action}</p>
                      <p><strong>Détails :</strong> {log.details}</p>
                      <p><strong>Effectué par :</strong> {log.performedBy?.name || "Admin"}</p>
                      <p><strong>Date :</strong> {new Date(log.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</p>
                      {/* 🔹 Champs modifiés */}
                      {renderModifiedFields(log)}
                    </div>
                  ))
                )}
                {adminLogs.length > logsPerPage && (
  <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "20px" }}>
    <button 
      onClick={handlePrevAdmin} 
      disabled={adminPage === 1} 
      style={{ padding: "8px 20px", borderRadius: "8px", backgroundColor: "#e5e7eb", cursor: adminPage === 1 ? "not-allowed" : "pointer" }}
    >
      ◀ Précédent
    </button>
    <span style={{ alignSelf: "center", fontWeight: "600" }}>{adminPage} / {totalPages(adminLogs)}</span>
    <button 
      onClick={handleNextAdmin} 
      disabled={adminPage === totalPages(adminLogs)} 
      style={{ padding: "8px 20px", borderRadius: "8px", backgroundColor: "#e5e7eb", cursor: adminPage === totalPages(adminLogs) ? "not-allowed" : "pointer" }}
    >
      Suivant ▶
    </button>
  </div>
)}
              </>
            )}

            {/* 🔹 Affichage User */}
            {(viewRole === "all" || viewRole === "user") && (
              <>
                <h3 style={{ margin: "20px 0 10px" }}>Utilisateurs</h3>
                {userLogs.length === 0 ? (
                  <p style={{ textAlign: "center", fontStyle: "italic", color: "#6b7280" }}>Aucune action utilisateur</p>
                ) : (paginate(userLogs, userPage).map((log) => (
                    <div key={log._id} style={{ display: "flex", flexDirection: "column", padding: "15px", borderRadius: "10px", boxShadow: "0 5px 15px rgba(0,0,0,0.05)", backgroundColor: "#f9fafb", marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ backgroundColor: actionColors[log.type] || "#E5E7EB", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>{log.type}</span>
                        <span style={{ backgroundColor: roleColors[log.performedBy?.role] || "#F3F4F6", padding: "4px 10px", borderRadius: "12px", fontWeight: "600" }}>
                          {log.performedBy?.role || "User"}
                        </span>
                      </div>
                      <p><strong>Action :</strong> {log.action}</p>
                      <p><strong>Détails :</strong> {log.details}</p>
                          <p><strong>Effectué par :</strong> {log.performedBy?.name || "Inconnu"} {log.performedBy?.nameRole ? `(${log.performedBy.nameRole})` : ""}</p> {/* ← AJOUT DU nameRole */}
                      <p><strong>Date :</strong> {new Date(log.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</p>
                      {/* 🔹 Champs modifiés */}
                      {renderModifiedFields(log)}
                    </div>
                  ))
                )}
                {userLogs.length > logsPerPage && (
  <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "20px" }}>
    <button 
      onClick={handlePrevUser} 
      disabled={userPage === 1} 
      style={{ padding: "8px 20px", borderRadius: "8px", backgroundColor: "#e5e7eb", cursor: userPage === 1 ? "not-allowed" : "pointer" }}
    >
      ◀ Précédent
    </button>
    <span style={{ alignSelf: "center", fontWeight: "600" }}>{userPage} / {totalPages(userLogs)}</span>
    <button 
      onClick={handleNextUser} 
      disabled={userPage === totalPages(userLogs)} 
      style={{ padding: "8px 20px", borderRadius: "8px", backgroundColor: "#e5e7eb", cursor: userPage === totalPages(userLogs) ? "not-allowed" : "pointer" }}
    >
      Suivant ▶
    </button>
  </div>
)}
              </>
            )}
          </>
        )}
      </div>
      <Footer />
      <style jsx="true">{`
        .tracabilite-container {
          max-width: 1600px;
          margin: 40px auto;
          padding: 30px;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1);
          font-family: "Inter", sans-serif;
          color: #1f2937;
        }

        .title {
          font-size: 2.8rem;
          font-weight: 700;
          margin-bottom: 20px;
          color: #111827;
          text-align: center;
        }

        .filters {
          display: flex;
          gap: 10px;
          margin-bottom: 25px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .filters input,
        .filters select {
          padding: 10px 15px;
          border-radius: 12px;
          border: 1px solid #ccc;
          font-size: 1rem;
        }

        .filters button {
          padding: 10px 20px;
          border-radius: 12px;
          border: none;
          background-color: #4f46e5;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: 0.3s;
        }

        .filters button:hover {
          background-color: #6366f1;
        }

        .loader-wrapper {
          display: flex;
          justify-content: center;
          padding: 50px 0;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .tracabilite-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 1.05rem;
        }

        .tracabilite-table th {
          background: linear-gradient(90deg, #4f46e5, #6366f1);
          color: #fff;
          font-weight: 600;
          padding: 15px 20px;
          text-align: left;
          position: sticky;
          top: 0;
          z-index: 10;
          border-radius: 12px 12px 0 0;
        }

        .tracabilite-table td {
          background: #f9fafb;
          padding: 15px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .tracabilite-table tbody tr:nth-child(even) td {
          background: #f3f4f6;
        }

        .tracabilite-table tbody tr:hover td {
          background: #e0e7ff;
          transition: 0.3s;
        }

        .no-data {
          text-align: center;
          font-style: italic;
          color: #6b7280;
          padding: 30px 0;
        }

        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.85rem;
          margin-right: 5px;
        }

        @media (max-width: 1024px) {
          .tracabilite-container {
            padding: 20px;
            margin: 20px;
          }

          .title {
            font-size: 2.2rem;
          }

          .tracabilite-table th,
          .tracabilite-table td {
            padding: 12px 15px;
          }
        }
      `}</style>
    </>
  );
}