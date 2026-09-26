// components/PrivateRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserContext } from '../contexts/UserContext';

export default function PrivateRoute({ children }) {
  const { user } = useUserContext();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}