// src/Pages/Components/Password/UpdatePassword.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../config/supabase"
import SEO from "../SEO/SEO";

const UpdatePassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const handleReset = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const errorDesc = hashParams.get("error_description");

      if (errorDesc) {
        setError(decodeURIComponent(errorDesc));
        setLoading(false);
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setError("Le lien est invalide ou a expiré. Veuillez demander un nouveau lien.");
        } else {
          setMessage("Session établie. Vous pouvez maintenant définir un nouveau mot de passe.");
        }
      } else {
        setError("Aucun token trouvé. Le lien est peut-être corrompu.");
      }
      setLoading(false);
    };

    handleReset();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage("Mot de passe mis à jour avec succès ! Redirection...");
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div style={styles.container}>Vérification du lien...</div>;
  }

  return (
    <div style={styles.container}>
      <SEO title="Réinitialiser mon mot de passe - BET" description="Réinitialisez votre mot de passe BET." canonicalUrl="/update-password" noindex />
      <h2>Nouveau mot de passe</h2>
      {error && <p style={styles.error}>{error}</p>}
      {message && <p style={styles.success}>{message}</p>}
      {!error && (
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Nouveau mot de passe (min 6 caractères)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={styles.input}
            required
          />
          <button type="submit" style={styles.button}>Modifier</button>
        </form>
      )}
    </div>
  );
};

const styles = {
  container: { maxWidth: 400, margin: "100px auto", padding: 20, fontFamily: "Arial" },
  input: { width: "100%", padding: 8, marginBottom: 12, borderRadius: 4, border: "1px solid #ccc" },
  button: { width: "100%", padding: 10, background: "#0c33ac", color: "white", border: "none", borderRadius: 4, cursor: "pointer" },
  error: { color: "red", marginBottom: 12 },
  success: { color: "green", marginBottom: 12 }
};

export default UpdatePassword;