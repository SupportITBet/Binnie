import express from "express";
import supabase from "../config/supabase.js";
import { staffDesClasses } from "../services/staffDesClasses.js";

/**
 * Rappel avant le début d'une séance.
 *
 * Aucun rappel n'existait - ni pour le coach, ni pour l'apprenant, ni pour l'assistante,
 * ni pour le superviseur. La seule notification partait à la CRÉATION de la session,
 * parfois des semaines avant. Le jour venu, personne n'était prévenu, et le lien de
 * visioconférence restait à retrouver dans un écran.
 *
 * Ce job prévient 30 minutes avant, et met le lien DANS la notification : c'est ce qui
 * permet de rejoindre le cours d'un clic, et à l'assistante comme au superviseur de
 * vérifier que le coach l'assure réellement.
 *
 * Deux précautions gouvernent son écriture :
 *
 *  • UN SEUL RAPPEL PAR SÉANCE. Le cron passe toutes les 15 minutes ; sans mémoire, une
 *    séance serait rappelée quatre fois par heure. `rappel_envoye_at` est posé AVANT les
 *    insertions - un passage concurrent trouve alors la colonne remplie et s'abstient.
 *
 *  • LE FUSEAU. `date` et `heure` sont stockés tels que saisis par le coach, sans fuseau.
 *    On compose donc la comparaison sur ces mêmes chaînes plutôt que sur un Date UTC, qui
 *    décalerait les rappels d'une ou plusieurs heures selon l'hébergement.
 */

const router = express.Router();

const MINUTES_AVANT = 30;
// Fenêtre [T-30 ; T-0]. Une fenêtre plus étroite paraît plus propre, mais une simulation
// sur les 1440 horaires d'une journée montre qu'avec [T-30 ; T-10] les séances de 00:00
// à 00:09 n'étaient JAMAIS rappelées : aucun passage du cron ne tombe dans leur fenêtre,
// le précédent appartenant à la veille et la requête ne lisant que la date du jour.
// Aller jusqu'à T-0 couvre les 1440 horaires. Le prix : un rappel peut arriver quelques
// minutes avant plutôt que trente - préférable à pas de rappel du tout.
const FENETRE_MIN   = 30;

/** "HH:MM" → minutes depuis minuit. */
const enMinutes = (heure) => {
  const [h, m] = String(heure || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

router.get("/rappels-seances", async (req, res) => {
  // Même contrat que les autres jobs : Vercel Cron pose l'en-tête Authorization, on
  // accepte aussi ?secret= et x-cron-secret pour un déclenchement manuel.
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = bearer || req.query.secret || req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const resultat = { examinees: 0, rappelees: 0, notifications: 0, ignorees: 0 };

  try {
    const maintenant = new Date();
    const aujourdhui = maintenant.toISOString().slice(0, 10);
    const minutesMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();

    const { data: sessions, error } = await supabase
      .from("sessions_live")
      .select("id, titre, coach_id, groupe_id, date, heure, plateforme, lien, contenu_ids")
      .eq("date", aujourdhui)
      .is("rappel_envoye_at", null)
      .neq("is_corbeille", true)
      .neq("statut", "terminee");
    if (error) throw error;

    for (const s of sessions || []) {
      resultat.examinees++;

      const debut = enMinutes(s.heure);
      if (debut === null) { resultat.ignorees++; continue; }

      // Fenêtre [T-30 ; T-0] : avant, c'est trop tôt ; une fois le cours commencé, le
      // rappel n'a plus d'objet.
      const restant = debut - minutesMaintenant;
      if (restant > MINUTES_AVANT || restant < MINUTES_AVANT - FENETRE_MIN) continue;

      // Réserver AVANT d'écrire : un second passage du cron trouvera la colonne remplie.
      const { error: errMarque } = await supabase
        .from("sessions_live")
        .update({ rappel_envoye_at: new Date().toISOString() })
        .eq("id", s.id)
        .is("rappel_envoye_at", null);
      if (errMarque) { resultat.ignorees++; continue; }

      const destinataires = new Set();
      if (s.coach_id) destinataires.add(s.coach_id);

      if (s.groupe_id) {
        const { data: gas } = await supabase
          .from("groupes_apprenants")
          .select("apprenant_id")
          .eq("groupe_id", s.groupe_id)
          .in("statut", ["actif", "periode_test"])
          .not("apprenant_id", "is", null);
        (gas || []).forEach((g) => destinataires.add(g.apprenant_id));

        // L'assistante qui suit chaque apprenant, et le créateur de la classe.
        (await staffDesClasses([s.groupe_id])).forEach((uid) => destinataires.add(uid));
      }

      // Superviseurs et deputies : ce sont eux qui contrôlent que le cours est assuré.
      const { data: sups } = await supabase
        .from("utilisateurs").select("id")
        .in("role", ["superviseur", "deputy_superviseur", "admin_superviseur"])
        .eq("actif", true);
      (sups || []).forEach((u) => destinataires.add(u.id));

      if (!destinataires.size) continue;

      const enLigne = !!s.lien && !String(s.lien).startsWith("presentiel");
      const plateforme = s.plateforme ? s.plateforme.charAt(0).toUpperCase() + s.plateforme.slice(1) : "en ligne";
      const message = `« ${s.titre} » commence à ${String(s.heure).slice(0, 5)}.`
        + (enLigne ? ` Rejoignez via ${plateforme} : ${s.lien}` : " Séance en présentiel.");

      const { error: errInsert } = await supabase.from("notifications").insert(
        [...destinataires].map((uid) => ({
          user_id: uid,
          type: "rappel_seance",
          titre: restant > 1 ? `⏰ Cours dans ${restant} min : ${s.titre}` : `⏰ Cours imminent : ${s.titre}`,
          message,
          lu: false,
          // Le lien voyage aussi dans `meta` : une interface peut en faire un bouton
          // plutôt que de laisser l'apprenant copier une URL depuis un texte.
          meta: { session_id: s.id, groupe_id: s.groupe_id, lien: s.lien || null, plateforme: s.plateforme || null },
          source: "dash",
        }))
      );
      if (errInsert) { console.warn("[rappels-seances] insert:", errInsert.message); continue; }

      resultat.rappelees++;
      resultat.notifications += destinataires.size;
    }

    console.log("[rappels-seances]", JSON.stringify(resultat));
    res.json({ success: true, ...resultat });
  } catch (e) {
    console.error("[rappels-seances]", e.message);
    res.status(500).json({ error: e.message, ...resultat });
  }
});

export default router;
