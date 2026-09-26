// Packages commerciaux - persistés en base (table packages_commerciaux), utilisés
// dans GestionConfiguration (CRUD admin) ET GestionEntreprises (calcul CA/versements
// à la création/renouvellement d'un contrat entreprise).
//
// `GestionEntreprises.jsx` lit les packages de façon SYNCHRONE à de nombreux endroits
// (dans le corps du rendu, pas via useState/useEffect à chaque emplacement) - pour éviter
// un refactor massif de tous ces appels, on garde `lirePackages()` synchrone, adossée à un
// cache mémoire + localStorage (résilience hors-ligne uniquement, plus la source de vérité).
// `chargerPackages()` doit être appelée au montage de chaque page qui utilise ces packages
// pour rafraîchir ce cache depuis la base.

import { PACKAGES as PACKAGES_DEFAUT } from '../mock/entreprises';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const LS_CACHE_KEY = 'bet_packages_cache';

let _cache = null;

function lireCacheLocal() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    return raw ? JSON.parse(raw) : PACKAGES_DEFAUT;
  } catch { return PACKAGES_DEFAUT; }
}

function ecrireCacheLocal(pkgs) {
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(pkgs)); } catch {}
}

export function lirePackages() {
  if (_cache) return _cache;
  return lireCacheLocal();
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function chargerPackages(token) {
  try {
    const r = await fetch(`${API_URL}/api/packages-commerciaux`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return lirePackages();
    const d = await r.json();
    _cache = d.packages || [];
    ecrireCacheLocal(_cache);
    return _cache;
  } catch {
    return lirePackages();
  }
}

export async function creerPackageCommercial(payload, token) {
  const r = await fetch(`${API_URL}/api/packages-commerciaux`, {
    method: 'POST', headers: authHeaders(token), body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return chargerPackages(token);
}

export async function modifierPackageCommercial(id, payload, token) {
  const r = await fetch(`${API_URL}/api/packages-commerciaux/${id}`, {
    method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return chargerPackages(token);
}

export async function supprimerPackageCommercial(id, token) {
  const r = await fetch(`${API_URL}/api/packages-commerciaux/${id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return chargerPackages(token);
}
