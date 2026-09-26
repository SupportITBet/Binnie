// Toutes les requêtes passent par le backend Node.js (port 5001)
// qui utilise la SUPABASE_SERVICE_KEY - contourne le RLS.

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

const post = async (endpoint, data) => {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
};

export const insertDemandeDevis        = (data) => post("/api/devis/submit",                   data);
export const insertContact             = (data) => post("/api/contact/submit",                 data);
export const insertDemandeEntreprise   = (data) => post("/api/entreprise/submit",              data);
export const insertLeadParticulier     = (data) => post("/api/leads/submit",                   data);
export const insertInscriptionAdulte   = (data) => post("/api/inscriptions/adulte/submit",     data);
export const insertInscriptionEnfant   = (data) => post("/api/inscriptions/enfant/submit",     data);
export const insertInscriptionEtudiant = (data) => post("/api/inscriptions/etudiant/submit",   data);
export const insertTestNiveau          = (data) => post("/api/level-test/submit",              data);
export const insertSimulateurFormation = (data) => post("/api/simulateur/submit",              data);
