import { utilisateurDuJeton } from "../services/cacheAuth.js";

export const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant ou invalide" });
  }
  const token = authHeader.split(" ")[1];
  // Verification mise en cache 30 s : c'est un appel RESEAU (~175 ms), paye sur chaque
  // requete authentifiee, et le meme jeton designe forcement le meme utilisateur.
  const user = await utilisateurDuJeton(token);
  if (!user) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
  req.user = user;
  next();
};