import { Navigate, Outlet } from "react-router-dom";
import { useUserContext } from "../contexts/UserContext";

export default function ProtectedRoute({ children, roles = [] }) {
  const { user } = useUserContext();

  // 🔒 1️⃣ Pas de connexion → redirection vers page d’accueil
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // 👤 2️⃣ Si des rôles sont définis et que le rôle du user n’en fait pas partie
  if (roles.length && !roles.includes(user.role)) {
    // Cas particulier : l’admin a accès à tout par défaut
    if (user.role === "admin") {
      return children || <Outlet />;
    }

    // Sinon, refus d’accès
    return <Navigate to="/unauthorized" replace />;
  }

  // 🛡️ 3️⃣ Si c’est un admin → autorisé automatiquement
  if (user.role === "admin") {
    return children || <Outlet />;
  }

  // ✅ 4️⃣ Sinon, utilisateur standard autorisé (si aucune restriction)
  return children || <Outlet />;
}