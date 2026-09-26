import rateLimit from "express-rate-limit";

// Formulaires publics (devis, contact, entreprise, leads, inscriptions, simulateur,
// test de niveau...) - évite le spam automatisé sans gêner un usage normal.
export const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Veuillez réessayer dans quelques minutes." },
});

// Authentification (login, register, forgot-password) - protège contre le brute-force
// de mots de passe / la création massive de comptes.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Veuillez réessayer dans quelques minutes." },
});

// Portail à code sur "/" - garde-fou serveur contre le brute-force (le blocage à 3 essais
// affiché côté client est purement cosmétique et contournable). Volontairement plus large
// que 3 pour ne jamais gêner un usage normal derrière une IP partagée (bureau, wifi commun).
export const accessGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes.", locked: true },
});
