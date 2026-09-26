import { useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "bet_dernier_vu_";

function lastSeenKey(tabId, userId) {
  return `${STORAGE_PREFIX}${userId || "anon"}_${tabId}`;
}

/**
 * Badge "nouveau depuis la dernière visite" - pour les listes sans notion
 * d'action en attente (pas de statut "en_attente"/"non traité" côté backend),
 * où un simple total figé n'a pas de sens sur un onglet.
 *
 * Le badge se remet à zéro dès que l'onglet est ouvert, et ne réapparaît que
 * si de nouveaux éléments (par leur date) arrivent ensuite.
 *
 * @param {string} tabId identifiant stable de l'onglet (clé de stockage)
 * @param {Array} items liste d'éléments à surveiller
 * @param {string} activeTab l'onglet actuellement affiché dans le dashboard
 * @param {object} [options]
 * @param {string} [options.userId] pour scoper le "vu" par compte sur un même navigateur
 * @param {string} [options.dateKey="created_at"] champ date de chaque élément
 * @returns {number|null} nombre de nouveautés, ou null si aucune
 */
export function useNouveauteBadge(tabId, items, activeTab, { userId, dateKey = "created_at" } = {}) {
  const key = lastSeenKey(tabId, userId);
  const [lastSeen, setLastSeen] = useState(() => {
    try { return localStorage.getItem(key); } catch { return null; }
  });

  useEffect(() => {
    if (activeTab !== tabId) return;
    const now = new Date().toISOString();
    try { localStorage.setItem(key, now); } catch {}
    setLastSeen(now);
  }, [activeTab, tabId, key]);

  return useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return null;
    if (!lastSeen) return items.length;
    const count = items.filter(it => {
      const d = it?.[dateKey];
      return d && new Date(d) > new Date(lastSeen);
    }).length;
    return count || null;
  }, [items, lastSeen, dateKey]);
}
