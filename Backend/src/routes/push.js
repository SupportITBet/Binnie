import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.js";
import { estJetonExpo } from "../services/pushNotifications.js";

/**
 * L'APPAREIL SE DÉCLARE, pour qu'on sache où envoyer.
 *
 * Sans ces deux routes, le serveur ne connaît aucun téléphone et aucune notification ne peut
 * atteindre un écran verrouillé — c'était l'état jusqu'au 15/10/2026.
 *
 * OUVERTES À TOUT UTILISATEUR CONNECTÉ, et non aux seuls apprenants : un coach, une
 * assistante ou un superviseur utilisant l'application doit être joignable de la même façon.
 * `authenticateUser` suffit donc, et c'est LUI qui fixe le propriétaire du jeton — jamais le
 * corps de la requête. Accepter un `user_id` envoyé par le client permettrait de faire
 * rediriger les notifications de n'importe qui vers son propre téléphone.
 */

const router = express.Router();

/**
 * POST /api/push/enregistrer
 * body : { token, plateforme?, appareil? }
 *
 * UN `upsert` SUR `token`, et c'est le point délicat. Un téléphone prêté, puis reconnecté
 * avec un autre compte, doit CHANGER de propriétaire : sans cette contrainte d'unicité sur
 * le jeton, la table accumulerait deux lignes et l'ancien titulaire continuerait de recevoir
 * les notifications du nouveau. Réécrire `user_id` sur le même jeton est la seule lecture
 * correcte de « cet appareil appartient maintenant à cette personne ».
 */
router.post("/enregistrer", authenticateUser, async (req, res) => {
  const { token, plateforme, appareil } = req.body || {};

  /* Le format est vérifié ICI, à l'entrée. Un jeton mal formé accepté en base ne se verrait
     qu'au premier envoi, sous la forme d'un lot entier refusé par Expo — très loin de sa
     cause. */
  if (!estJetonExpo(token)) {
    return res.status(400).json({ error: "Jeton Expo invalide" });
  }

  try {
    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: req.user.id,
          token: String(token).trim(),
          plateforme: plateforme || null,
          appareil: appareil || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );
    if (error) throw error;
    res.json({ message: "Appareil enregistré" });
  } catch (err) {
    console.error("[push/enregistrer]", err.message);
    /* Le cas le plus probable d'un échec ici est la migration non passée. On le NOMME,
       plutôt que de rendre un « erreur serveur » qui enverrait chercher ailleurs. */
    const indice = /relation .*push_tokens.* does not exist|schema cache/i.test(err.message)
      ? " — la table push_tokens n'existe pas : exécuter Backend/sql/push_notifications.sql"
      : "";
    res.status(500).json({ error: err.message + indice });
  }
});

/**
 * DELETE /api/push/desinscrire
 * body : { token }
 *
 * À LA DÉCONNEXION. Sans ça, un téléphone rendu ou partagé continue de recevoir les
 * notifications du compte précédent jusqu'à ce qu'Expo le déclare `DeviceNotRegistered` —
 * ce qui n'arrive jamais tant que l'application reste installée.
 */
router.delete("/desinscrire", authenticateUser, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Jeton requis" });
  try {
    /* Borné à SES jetons : un utilisateur ne supprime pas l'appareil d'un autre, même en
       devinant le jeton. */
    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("token", String(token).trim())
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ message: "Appareil désinscrit" });
  } catch (err) {
    console.error("[push/desinscrire]", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
