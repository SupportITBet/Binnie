import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserContext } from '../contexts/UserContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useUserContext();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('login');
  const [role, setRole] = useState('student');

  const [form, setForm] = useState({
    identifier: '', // email, matricule, code, username
    password: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ================= LOGIN ================= */
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:8080/${role}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      const user = result.student || result.teacher || result.admin;

      if (response.ok && user?._id) {
        login(user, result.token, result.token, result.expiresAt);
        toast.success(`Bienvenue ${user.fullname}`);
        navigate('/AdminDashboard');
      } else {
        toast.error(result.message || 'Échec connexion');
      }
    } catch {
      toast.error('Erreur serveur');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Examify</h1>
        <p style={styles.subtitle}>Plateforme de gestion des examens en ligne</p>

        {/* ROLE SWITCH */}
        <div style={styles.roleSwitch}>
          {['student','prof','admin'].map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                ...styles.roleButton,
                backgroundColor: role === r ? '#2563eb' : '#e2e8f0',
                color: role === r ? '#fff' : '#000',
              }}
            >
              {r === 'student' ? 'Étudiant' : r === 'prof' ? 'Professeur' : 'Admin'}
            </button>
          ))}
        </div>

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="text"
            name="identifier"
            placeholder={
              role === 'student'
                ? 'Email ou Matricule'
                : 'Email ou Code'
            }
            value={form.identifier}
            onChange={handleChange}
            style={styles.input}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={handleChange}
            style={styles.input}
            required
          />
          <button type="submit" style={styles.button}>Se connecter</button>
        </form>

        {/* EXAM REDIRECT */}
        {role === 'student' && (
          <button
            style={{ ...styles.button, marginTop: '20px', background: '#16a34a' }}
            onClick={() => navigate('/exam-session')}
          >
            Accéder à l'espace examen
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', fontFamily: 'Segoe UI, sans-serif' },
  card: { background: 'white', width: '420px', padding: '40px', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', textAlign: 'center' },
  logo: { fontSize: '26px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '10px' },
  subtitle: { fontSize: '14px', color: '#64748b', marginBottom: '20px' },
  roleSwitch: { display: 'flex', marginBottom: '20px' },
  roleButton: { flex: 1, padding: '10px', margin: '0 2px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  form: { display: 'flex', flexDirection: 'column' },
  input: { padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' },
  button: { padding: '12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(90deg,#1e3a8a,#2563eb)', color: 'white', fontWeight: 'bold', cursor: 'pointer' },
};