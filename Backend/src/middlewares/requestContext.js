import { AsyncLocalStorage } from "node:async_hooks";

// Contexte "ambiant" par requête HTTP - permet à logAudit() (appelée depuis ~70 endroits
// dans les routes, sans jamais recevoir `req`) de connaître la plateforme d'origine de la
// requête en cours, sans avoir à faire passer `req` explicitement partout.
export const requestContext = new AsyncLocalStorage();

export function getPlateformeOrigine() {
  return requestContext.getStore()?.plateforme || null;
}

// Déduit la plateforme depuis l'en-tête Origin/Referer de la requête - le seul signal
// vraiment fiable : un rôle peut être utilisé des deux côtés (façade bet-elearning), un
// module peut être générique, mais l'app qui a réellement émis la requête ne ment jamais.
// Convention de ports en dev (voir dash/.env et bet-elearning/.env) : dash = 3001,
// bet-elearning = 3002. En prod (voir Backend/.env.vercel, ALLOWED_ORIGINS) : domaines
// distincts app.binnie... (dash) vs e-learning... (bet-elearning).
export function plateformeDepuisOrigine(req) {
  const src = req.headers.origin || req.headers.referer || "";
  if (!src) return null;
  if (/e-learning\.|:3002\b/.test(src)) return "bet-elearning";
  if (/app\.binnie\.|:3001\b/.test(src)) return "dash";
  return null;
}
