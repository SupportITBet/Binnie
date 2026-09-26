// Ouvre bet-elearning via un ticket SSO court (45s, usage unique) émis par le Backend,
// au lieu de transmettre le token de session + le profil en clair dans l'URL.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export async function openElearningSSO(elearningUrl, targetId) {
  // Ouvrir l'onglet tout de suite (synchrone, dans le geste utilisateur) pour éviter
  // que le navigateur bloque le popup après l'attente du fetch.
  const win = window.open("", "_blank");
  try {
    const token   = localStorage.getItem("admin_token")   || localStorage.getItem("coach_token")   || "";
    const refresh = localStorage.getItem("admin_refresh") || localStorage.getItem("coach_refresh") || "";
    const r = await fetch(`${API_URL}/api/admin/sso/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refresh, targetId }),
    });
    if (!r.ok) { if (win) win.close(); return; }
    const { ticket } = await r.json();
    if (win) win.location.href = `${elearningUrl}/sso?ticket=${encodeURIComponent(ticket)}`;
  } catch {
    if (win) win.close();
  }
}
