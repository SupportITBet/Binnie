// components/PublicRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserContext } from '../contexts/UserContext';

export default function PublicRoute({ children }) {
  const { user } = useUserContext();

  if (user) {
    return <Navigate to="/Accueil" replace />;
  }

  return children;
}