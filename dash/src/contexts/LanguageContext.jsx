// src/contexts/LanguageContext.jsx
import React, { createContext, useContext, useState, useCallback } from "react";
import translations from "../i18n/translations";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("bet_lang") || "FR";
  });

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === "FR" ? "EN" : "FR";
      localStorage.setItem("bet_lang", next);
      return next;
    });
  }, []);

  // t("loginAdmin", "email") → valeur traduite
  const t = useCallback((section, key) => {
    return translations[section]?.[lang]?.[key] ?? translations[section]?.["FR"]?.[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
