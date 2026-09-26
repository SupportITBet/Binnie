// src/contexts/UserContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import toast from 'react-hot-toast';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // 🔹 Charger depuis localStorage au démarrage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // 🔹 Connexion
  const login = ({ user: userData, token }) => {
    const userWithToken = { ...userData, token }; // ajouter le token dans l'objet user
    setUser(userWithToken);
    localStorage.setItem('user', JSON.stringify(userWithToken));

    toast.success(`Bienvenue ${userWithToken.name || userWithToken.nom} 👋`);
  };

  // 🔹 Déconnexion
  const logout = () => {
    const name = user?.name || user?.nom || 'Utilisateur';
    setUser(null);
    localStorage.removeItem('user');

    toast(`👋 ${name}, vous êtes déconnecté(e).`, { icon: '🚪' });
  };

  // 🔹 Headers d'authentification pour fetch/axios
  const getAuthHeaders = () => {
    if (!user?.token) return {};
    return {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
    };
  };

  return (
    <UserContext.Provider value={{ user, login, logout, setUser, getAuthHeaders }}>
      {children}
    </UserContext.Provider>
  );
};

// Hook pour accéder au contexte
export const useUser = () => useContext(UserContext);