import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

// Empêche d'atteindre /e-learning-staff-access sans être passé par le code du portail
// "/access/bet-learning" -
// re-vérifié côté serveur à chaque chargement (signature + expiration du token),
// sinon n'importe qui pourrait poser une valeur arbitraire dans sessionStorage pour bypasser.
const RequireGateAccess = ({ children }) => {
  const [status, setStatus] = useState('checking'); // checking | valid | invalid

  useEffect(() => {
    const token = sessionStorage.getItem('bet_gate_token');
    if (!token) { setStatus('invalid'); return; }

    fetch(`${API_URL}/api/access-gate/check-token`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setStatus(d.valid ? 'valid' : 'invalid'))
      .catch(() => setStatus('invalid'));
  }, []);

  if (status === 'checking') return null;
  if (status === 'invalid') {
    sessionStorage.removeItem('bet_gate_token');
    return <Navigate to="/access/bet-learning" replace />;
  }
  return children;
};

export default RequireGateAccess;
