import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Remplace useState pour les onglets - persiste l'onglet actif dans l'URL (?tab=xxx).
 * Le rechargement de la page restaure l'onglet automatiquement.
 *
 * @param {string} defaultTab  - Onglet affiché si aucun paramètre n'est dans l'URL
 * @param {string} paramName   - Nom du query param (défaut : "tab")
 */
export function useTabState(defaultTab, paramName = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get(paramName) || defaultTab;

  const setTab = useCallback((newTab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set(paramName, newTab);
      return next;
    }, { replace: true });
  }, [setSearchParams, paramName]);

  return [tab, setTab];
}
