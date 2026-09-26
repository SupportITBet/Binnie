import { createContext, useContext, useState, useEffect } from 'react';

const LangueContext = createContext();

export function LangueProvider({ children }) {
  const [langue, setLangue] = useState(
    () => localStorage.getItem('bet_langue') || 'fr'
  );

  // Synchronise Weglot au premier chargement
  useEffect(() => {
    const appliquer = () => {
      if (window.Weglot) {
        window.Weglot.switchTo(langue);
      }
    };
    // Weglot peut ne pas être encore initialisé
    if (window.Weglot) {
      appliquer();
    } else {
      window.addEventListener('weglot:initialized', appliquer, { once: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changerLangue(l) {
    setLangue(l);
    localStorage.setItem('bet_langue', l);
    if (window.Weglot) {
      window.Weglot.switchTo(l);
    }
  }

  // Écoute les changements initiés par Weglot (ex: détection automatique)
  useEffect(() => {
    function syncDepuisWeglot(newLang) {
      setLangue(newLang);
      localStorage.setItem('bet_langue', newLang);
    }
    if (window.Weglot) {
      window.Weglot.on('languageChanged', syncDepuisWeglot);
    } else {
      window.addEventListener('weglot:initialized', () => {
        window.Weglot.on('languageChanged', syncDepuisWeglot);
      }, { once: true });
    }
  }, []);

  return (
    <LangueContext.Provider value={{ langue, changerLangue }}>
      {children}
    </LangueContext.Provider>
  );
}

export function useLangue() {
  return useContext(LangueContext);
}
