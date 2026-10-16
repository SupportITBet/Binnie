import express from "express";
import supabase from "../config/supabase.js";
import { jetonsDe, expedier } from "../services/pushNotifications.js";

/**
 * EXPÉDIER SUR LES TÉLÉPHONES LES NOTIFICATIONS DÉJÀ ÉCRITES EN BASE.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN JOB, ET PAS UN APPEL À CHAQUE ÉCRITURE
 *
 * `notifications` reçoit des insertions depuis SOIXANTE-DIX-NEUF endroits, répartis dans une
 * douzaine de fichiers — routes, jobs, services. Brancher l'envoi sur chacun voudrait dire
 * modifier ces 79 appels, puis se souvenir de le faire sur le quatre-vingtième. Un oubli ne
 * produirait aucune erreur : juste une notification qui n'arrive pas sur le téléphone, et
 * personne pour s'en apercevoir.
 *
 * Ce job part de la TABLE, pas des appelants. Tout ce qui s'y écrit part, d'où que ça vienne,
 * y compris les insertions futures que personne n'aura pensé à câbler. Le prix est un délai
 * borné par la fréquence du cron.
 *
 * LA FENÊTRE EXISTE POUR NE PAS RÉVEILLER LE PASSÉ. Au tout premier passage, `push_envoye_at`
 * est nul sur TOUTE la table : sans borne de temps, chaque apprenant recevrait d'un coup des
 * mois de notifications. On ne regarde donc que les dernières heures, et les anciennes sont
 * marquées comme traitées sans être envoyées.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

const router = express.Router();

/* Une notification plus vieille que ça n'a plus d'intérêt sur un écran verrouillé : la séance
   a eu lieu, la date limite est passée. On la marque traitée sans l'expédier. */
const FENETRE_HEURES = 6;

/* Garde-fou : un passage n'expédie jamais plus que ça. Protège d'un pic d'insertions (un
   import de classe, une publication à tout un groupe) qui ferait exploser le temps du job. */
const MAX_PAR_PASSAGE = 500;

/** Le `data` embarqué dans la notification : il permet à l'app d'ouvrir le bon écran au tap. */
const donneesDe = (n) => ({
  notification_id: n.id,
  type: n.type || null,
  source: n.source || null,
  ...(n.meta && typeof n.meta === "object" ? { meta: n.meta } : {}),
});

router.get("/push-notifications", async (req, res) => {
  const secret = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const t0 = Date.now();
  try {
    const depuis = new Date(Date.now() - FENETRE_HEURES * 3600 * 1000).toISOString();

    /* DEUX LOTS DISTINCTS, et c'est volontaire :
         · les ANCIENNES sont juste datées, pour ne jamais être relues ;
         · les RÉCENTES partent sur les téléphones, juste en dessous.

       UNE SEULE MISE À JOUR CONDITIONNELLE pour les premières, et non un `select` suivi d'un
       `update` sur les identifiants lus. PostgREST plafonne les LECTURES à 1000 lignes : la
       version précédente vidait donc l'arriéré par paquets de mille, et six passages n'en
       avaient traité que la moitié (11 000 lignes en base au 15/10/2026). L'`update` porte sa
       propre condition et n'a pas cette limite — il solde l'arriéré au premier passage. */
    const { error: eAnciennes, count: anciennesMarquees } = await supabase
      .from("notifications")
      .update({ push_envoye_at: new Date().toISOString() }, { count: "exact" })
      .is("push_envoye_at", null)
      .lt("created_at", depuis);
    if (eAnciennes) throw eAnciennes;

    const { data: aEnvoyer, error } = await supabase
      .from("notifications")
      .select("id, user_id, titre, message, type, meta, source, created_at")
      .is("push_envoye_at", null)
      .gte("created_at", depuis)
      .order("created_at", { ascending: true })
      .limit(MAX_PAR_PASSAGE);
    if (error) throw error;

    const lot = aEnvoyer || [];
    if (!lot.length) {
      return res.json({
        examinees: 0, envoyes: 0, echecs: 0,
        anciennes_marquees: anciennesMarquees || 0,
        duree_ms: Date.now() - t0,
      });
    }

    const parUtilisateur = await jetonsDe(lot.map((n) => n.user_id));

    const messages = [];
    for (const n of lot) {
      for (const to of parUtilisateur[n.user_id] || []) {
        messages.push({
          to,
          sound: "default",
          title: n.titre || "BET",
          body: n.message || "",
          data: donneesDe(n),
        });
      }
    }

    const { envoyes, echecs } = await expedier(messages);

    /* MARQUÉES DANS TOUS LES CAS, y compris pour un destinataire sans appareil. La colonne
       dit « ce job a traité cette ligne », pas « une notification a été reçue » : sans ça,
       les notifications des utilisateurs qui n'ont pas l'application seraient relues à
       chaque passage, indéfiniment. */
    await supabase
      .from("notifications")
      .update({ push_envoye_at: new Date().toISOString() })
      .in("id", lot.map((n) => n.id));

    const resume = {
      examinees: lot.length,
      destinataires_joignables: Object.keys(parUtilisateur).length,
      messages: messages.length,
      envoyes,
      echecs,
      anciennes_marquees: anciennesMarquees || 0,
      duree_ms: Date.now() - t0,
    };
    console.log("[jobsPush]", JSON.stringify(resume));
    res.json(resume);
  } catch (err) {
    console.error("[jobsPush]", err.message);
    const indice = /push_tokens|push_envoye_at|schema cache/i.test(err.message)
      ? " — exécuter Backend/sql/push_notifications.sql"
      : "";
    res.status(500).json({ error: err.message + indice });
  }
});

export default router;
