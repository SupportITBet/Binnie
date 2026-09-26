import React, { useEffect, useState, useMemo } from "react";
import Navbar from "./Navbar/Navbar";
import Footer from "./Footer";
import { useUserContext } from "../contexts/UserContext";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function Accueil() {
  const { user, token, clearUser } = useUserContext();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [devis, setDevis] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [totalDepenses, setTotalDepenses] = useState(0);
  const [depensesMois, setDepensesMois] = useState(0);
  const [dashboard, setDashboard] = useState({
    lastDevis: [],
    topClients: [],
    prestations: [],
    caByMonth: {},
  });

  const [monthStats, setMonthStats] = useState({
    devisCount: 0,
    chiffreAffaires: 0,
    marge: 0,
  });

  // ================= FETCH CLIENTS =================
  useEffect(() => {
    if (!token || !user?._id) return;

    const fetchClients = async () => {
      try {
        const res = await fetch(`http://localhost:8080/get/clients`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          toast.error("Session expirée");
          clearUser();
          navigate("/");
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur serveur");

        setClients(data.clients || []);
      } catch (err) {
        console.error("Erreur fetchClients:", err);
        toast.error("Erreur chargement clients");
        setClients([]);
      }
    };

    fetchClients();
  }, [token, user, clearUser, navigate]);

  // ================= FETCH DEVIS =================
  useEffect(() => {
    if (!token || !user?._id || clients.length === 0) return;

    const fetchDevis = async () => {
      try {
        const res = await fetch(`http://localhost:8080/get/devis?adminId=${user._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          toast.error("Session expirée");
          clearUser();
          navigate("/");
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur serveur");

        setDevis(data);

        // KPI du mois en cours
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const devisMois = data.filter(d => {
          const date = new Date(d.createdAt);
          return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        const caMois = devisMois.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
        const margeMois = devisMois.reduce((sum, d) => sum + (Number(d.marge) || 0), 0);

        setMonthStats({
          devisCount: devisMois.length,
          chiffreAffaires: caMois,
          marge: margeMois,
        });
      } catch (err) {
        console.error("Erreur fetchDevis:", err);
        toast.error("Erreur chargement devis");
      }
    };

    fetchDevis();
  }, [token, user, clients, clearUser, navigate]);

  // ================= FETCH DEPENSES =================
  useEffect(() => {
    if (!token || !user?._id) return;

    const fetchDepenses = async () => {
      try {
        const res = await fetch(`http://localhost:8080/depense/achat?adminId=${user._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          toast.error("Session expirée");
          clearUser();
          navigate("/");
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur serveur");

        setDepenses(data);

        const totalGlobal = data.reduce((sum, d) => sum + (Number(d.montant) || 0), 0);
        setTotalDepenses(totalGlobal);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const totalMois = data
          .filter(d => {
            const date = new Date(d.createdAt);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
          })
          .reduce((sum, d) => sum + (Number(d.montant) || 0), 0);

        setDepensesMois(totalMois);
      } catch (err) {
        console.error("Erreur fetchDepenses:", err);
        toast.error("Erreur chargement dépenses");
      }
    };

    fetchDepenses();
  }, [token, user, clearUser, navigate]);

  // ================= FETCH DASHBOARD =================
  useEffect(() => {
    if (!token || !user?._id) return;

    const fetchDashboard = async () => {
      try {
        const res = await fetch(`http://localhost:8080/dashboard/${user._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Erreur dashboard");

        setDashboard(data);
      } catch (err) {
        console.error("Erreur fetchDashboard:", err);
        toast.error("Erreur chargement dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [token, user]);

  // ================= KPIs =================
  const totalDevis = useMemo(() => devis.length, [devis]);
  const caGlobal = useMemo(
    () => devis.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0),
    [devis]
  );
  const margeGlobal = useMemo(
    () => devis.reduce((sum, d) => sum + (Number(d.marge) || 0), 0),
    [devis]
  );

const topClients = useMemo(() => {
  const clientsMap = {};

  // On parcourt tous les devis
  devis.forEach(d => {
    const clientId = d.client?._id || d.client?.id;
    if (!clientId) return;

    // On initialise le client dans le map si inexistant
    if (!clientsMap[clientId]) {
      clientsMap[clientId] = { ...d.client, devisCount: 0, acceptedCount: 0 };
    }

    // On compte tous les devis
    clientsMap[clientId].devisCount += 1;

    // On compte seulement les devis acceptés
    if (d.status === "accepté") {
      clientsMap[clientId].acceptedCount += 1;
    }
  });

  // On trie par devis acceptés, puis par total de devis si égalité
  return Object.values(clientsMap)
    .sort((a, b) => {
      if (b.acceptedCount !== a.acceptedCount) return b.acceptedCount - a.acceptedCount;
      return b.devisCount - a.devisCount;
    })
    .slice(0, 5); // top 5 clients

}, [devis]);

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <>
      <Navbar />

      <div className="dashboard-wrapper">
        <h1 className="dashboard-title">📊 Tableau de bord</h1>

        {/* ================= KPI ================= */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <h4>💰 Chiffre d'affaires global</h4>
            <p className="kpi-value">{caGlobal.toLocaleString()} FCFA</p>
          </div>

          <div className="kpi-card">
            <h4>📝 Total devis</h4>
            <p className="kpi-value">{totalDevis}</p>
          </div>

          <div className="kpi-card">
            <h4>📈 Marge globale</h4>
            <p className="kpi-value">{margeGlobal.toLocaleString()} FCFA</p>
          </div>

          <div className="kpi-card">
            <h4>💸 Dépenses (mois)</h4>
            <p className="kpi-value">{depensesMois.toLocaleString()} FCFA</p>
          </div>
        </div>

        {/* ================= TABLEAUX ================= */}
        <div className="grid-2">
          {/* Derniers devis */}
          <div className="card">
            <h3>🧾 Derniers devis</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>N° Devis</th>
                  <th>Client</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.lastDevis.map(d => (
                  <tr key={d._id}>
                    <td>{new Date(d.createdAt).toLocaleDateString("fr-FR")}</td>
                    <td>{d.numeroDevis}</td>
                    <td>{d.client?.name || "N/A"}</td>
                    <td>{(d.totalAmount || 0).toLocaleString()} FCFA</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top clients */}
          <div className="card">
            <h3>👑 Top clients</h3>
            {topClients.length === 0 ? (
              <p className="empty">Aucun client enregistré</p>
            ) : (
             <ul className="list">
  {topClients.length === 0 ? (
    <p className="empty">Aucun client enregistré</p>
  ) : (
    topClients.map((c, i) => (
      <li key={i}>
        <strong>{c.name} {c.surname}</strong>
        <span>
          {c.acceptedCount} devis acceptés • {c.devisCount} total •
          {(c.totalAmount || 0).toLocaleString()} FCFA
        </span>
      </li>
    ))
  )}
</ul>
            )}
          </div>
        </div>

        {/* Dépenses détaillées */}
        <div className="grid-2">
          <div className="card">
            <h3>💸 Dépenses</h3>
            <p style={{ fontWeight: "bold", marginBottom: 10 }}>
              Total global : {totalDepenses.toLocaleString()} FCFA
            </p>
            <p style={{ fontWeight: "bold", marginBottom: 0 }}>
              Ce mois-ci : {depensesMois.toLocaleString()} FCFA
            </p>
          </div>
        </div>
      </div>

      <Footer />

      <style>{`
        .dashboard-wrapper {
          padding: 30px;
          background: #f5f7fb;
          min-height: 100vh;
        }
        .dashboard-title { font-size: 1.8rem; margin-bottom: 25px; }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .kpi-card { background: white; padding: 20px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        .kpi-card h4 { font-size: 0.95rem; color: #666; }
        .kpi-value { font-size: 1.6rem; font-weight: bold; margin-top: 8px; }
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px; }
        .card { background: white; padding: 20px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
        th { background: #fafafa; font-weight: 600; }
        .list { list-style: none; padding: 0; margin-top: 10px; }
        .list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .loading { padding: 100px; text-align: center; font-size: 1.2rem; }
        .empty { margin-top: 12px; padding: 14px; background: #fafafa; border-radius: 10px; text-align: center; color: #999; font-style: italic; }
      `}</style>
    </>
  );
}