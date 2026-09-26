// src/contexts/UserContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { clearAllSessionStorage } from "../utils/session";

const UserContext = createContext();

export function UserProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("prestationSession")) || null;
    } catch {
      return null;
    }
  });

  /* =====================================================
     🔐 LOGIN
  ===================================================== */
  const login = (userData, token, sessionToken, expiresAt) => {
    if (!token || !sessionToken) {
      toast.error("Erreur session.");
      return;
    }

    const finalExpires =
      expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const newSession = {
      user: userData,
      token,
      sessionToken,
      expiresAt: finalExpires,
    };

    setSession(newSession);
    localStorage.setItem("prestationSession", JSON.stringify(newSession));
  };

  /* =====================================================
     🔐 LOGOUT
  ===================================================== */
  const logout = () => {
    setSession(null);
    clearAllSessionStorage();
    window.location.href = "/";
  };

  /* =====================================================
     🔐 HEADERS AUTH
  ===================================================== */
  const getAuthHeaders = () => {
    if (!session?.token) {
      return {
        "Content-Type": "application/json",
      };
    }

    return {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };
  };

  /* =====================================================
     🔄 AUTO LOGOUT SI SESSION EXPIRÉE
  ===================================================== */
  useEffect(() => {
    if (!session?.expiresAt) return;

    const expires = new Date(session.expiresAt).getTime();
    const now = Date.now();

    if (expires <= now) {
      logout();
      return;
    }

    const timeout = setTimeout(() => {
      toast.error("Votre session a expiré. Vous allez être déconnecté automatiquement.");
      logout();
    }, expires - now);

    return () => clearTimeout(timeout);
  }, [session]);

  return (
    <UserContext.Provider
      value={{
        user: session?.user || null,
        token: session?.token || null,
        sessionToken: session?.sessionToken || null,
        login,
        logout,
        getAuthHeaders,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUserContext = () => useContext(UserContext);