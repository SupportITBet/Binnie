import express from "express";
import supabase from "../config/supabase.js";
import { bornerAFenetre } from "../services/lectureSequentielle.js";
import { emailAutorise } from "../services/accesApprenant.js";
import { authenticateUser } from "../middlewares/auth.js";

const router = express.Router();

/**
 * PATCH /api/mon-espace/profil - chacun choisit son surnom.
 *
 * Le surnom existait déjà pour le personnel, via `PATCH /api/admin/me`, une route fermée
 * aux comptes non administrateurs. L'apprenant, le coach et le parent en étaient donc
 * exclus alors que la colonne `surnom` vit sur `utilisateurs`, table où ils figurent tous
 * - 189 coachs, 73 apprenants, 19 parents. Rien ne manquait en base, seulement un chemin.
 *
 * La route n'écrit QUE le surnom, et uniquement sur la ligne de l'appelant identifié par
 * son jeton : ni le rôle, ni l'email, ni le périmètre ne sont modifiables ici.
 */
router.patch("/profil", authenticateUser, async (req, res) => {
  try {
    const { surnom } = req.body || {};
    if (surnom !== undefined && surnom !== null && typeof surnom !== "string") {
      return res.status(400).json({ error: "surnom doit être une chaîne" });
    }
    // Une chaîne vide retire le surnom : c'est le seul moyen d'annuler son choix.
    const valeur = (typeof surnom === "string" && surnom.trim()) ? surnom.trim().slice(0, 40) : null;

    const { data, error } = await supabase
      .from("utilisateurs")
      .update({ surnom: valeur })
      .eq("id", req.user.id)
      .select("id, surnom")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Profil introuvable" });

    res.json({ ok: true, surnom: data.surnom });
  } catch (err) {
    console.error("[PATCH /mon-espace/profil]", err.message || err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

/** GET /api/mon-espace/profil - le surnom courant, pour amorcer l'écran. */
router.get("/profil", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, surnom, email, role, avatar_url")
      .eq("id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ profil: data || null });
  } catch (err) {
    console.error("[GET /mon-espace/profil]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

// Helper : récupérer l'assignation_id et le ga_id depuis un email
async function getIds(email) {
  const [{ data: ass }, { data: gaByEmail }] = await Promise.all([
    supabase.from("assignations_parcours")
      .select("id")
      .ilike("prospect_email", email.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("groupes_apprenants")
      .select("id, groupe_id, nom_apprenant, prenom_apprenant, statut, note, date_ajout, date_retrait")
      .ilike("email_apprenant", email.trim())
      .in("statut", ["actif", "archive", "retire"])
      .order("date_ajout", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let ga = gaByEmail || null;
  // Fallback par apprenant_id : l'email de connexion réel (ex : identifiant technique généré
  // pour un enfant sans email propre) peut différer de groupes_apprenants.email_apprenant,
  // qui n'est jamais rétro-mis à jour après la création du compte. Sans ce fallback, ces
  // apprenants ne retrouvent ni leurs présences, ni leurs séances, ni leurs ressources.
  if (!ga) {
    const { data: compte } = await supabase.from("utilisateurs").select("id").ilike("email", email.trim()).maybeSingle();
    if (compte?.id) {
      const { data: gaById } = await supabase.from("groupes_apprenants")
        .select("id, groupe_id, nom_apprenant, prenom_apprenant, statut, note, date_ajout, date_retrait")
        .eq("apprenant_id", compte.id)
        .in("statut", ["actif", "archive", "retire"])
        .order("date_ajout", { ascending: false })
        .limit(1)
        .maybeSingle();
      ga = gaById || null;
    }
  }

  // assignation_id posé dans groupes_apprenants.note à la création de la classe privée -
  // lien direct et fiable, prioritaire sur le match par prospect_email ci-dessus qui échoue
  // pour un coaching privé enfant : prospect_email est celui du PARENT (qui a rempli le
  // formulaire), alors que l'email de connexion ici est celui, propre, de l'ENFANT.
  let assignationIdParNote = null;
  if (ga?.note) {
    try { assignationIdParNote = JSON.parse(ga.note).assignation_id || null; } catch {}
  }

  return { assignation_id: assignationIdParNote || ass?.id || null, ga };
}

// GET /api/mon-espace/seances?email=xxx
router.get("/seances", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { assignation_id, ga } = await getIds(email);
    let data = [];

    // Source actuelle : table unifiée `seances` (remplace seances_privees - le coach
    // l'utilise désormais pour toutes ses séances via groupe_id), sans quoi une séance
    // récente n'apparaît jamais côté apprenant alors qu'elle est bien comptée dans les
    // honoraires du coach.
    if (ga?.groupe_id) {
      let q = supabase
        .from("seances")
        .select("*")
        .eq("groupe_id", ga.groupe_id);
      // Exclut les séances tenues avant l'arrivée de l'apprenant dans cette classe
      // (transfert, ou ajout tardif) - sinon un ancien planning de classe déjà donné
      // avant son arrivée s'affichait dans son propre espace.
      if (ga.date_ajout) q = q.gte("date_seance", ga.date_ajout.slice(0, 10));
      const { data: seancesNew } = await q.order("date_seance", { ascending: false });
      data = seancesNew || [];
    }

    if (data.length === 0 && assignation_id) {
      const { data: seancesOld } = await supabase
        .from("seances_privees")
        .select("*")
        .eq("assignation_id", assignation_id)
        .order("date_seance", { ascending: false });
      data = seancesOld || [];
    }

    // Normaliser date_seance → date_cours + calculer heure_fin depuis duree_h
    const seances = data.map(s => {
      let heure_fin = null;
      if (s.heure_debut && s.duree_h) {
        const [h, m] = s.heure_debut.split(":").map(Number);
        const totalMin = h * 60 + m + Math.round(s.duree_h * 60);
        heure_fin = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
      }
      return { ...s, date_cours: s.date_seance, heure_fin };
    });
    res.json({ seances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/presences?email=xxx
router.get("/presences", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { assignation_id, ga } = await getIds(email);
    let presences = [];

    // 1. Presences privées (coaching privé - séances régulières)
    if (assignation_id) {
      const { data } = await supabase
        .from("presences_privees")
        .select("*, seances_privees(date_seance, heure_debut)")
        .eq("assignation_id", assignation_id)
        .order("date_presence", { ascending: false });
      if (data?.length) {
        presences = data.map(p => ({
          ...p,
          date_seance: p.date_presence || p.seances_privees?.date_seance || null,
          source: "cours",
        }));
      }
    }

    // 2. Présences de groupe (groupe coaching ET sessions live)
    if (ga) {
      const { data: gpData } = await supabase
        .from("groupes_presences")
        .select("*")
        .eq("groupe_id", ga.groupe_id)
        .order("date_seance", { ascending: false });

      const gpFiltered = (gpData || []).filter(p =>
        String(p.ga_id) === String(ga.id) ||
        (p.nom_apprenant === ga.nom_apprenant && p.prenom_apprenant === ga.prenom_apprenant)
      );

      if (gpFiltered.length > 0) {
        /* Croiser avec sessions_live - en RETENANT LA PLATEFORME.
           Seule la date était rapportée, si bien que toute séance issue d'une session
           portait l'étiquette « Session Live » chez l'apprenant, présentiel compris : les
           cinq séances en salle de cette classe s'affichaient comme des visios. */
        const { data: liveSessions } = await supabase
          .from("sessions_live")
          .select("date, plateforme, titre")
          .eq("groupe_id", ga.groupe_id)
          .eq("statut", "terminee");

        const parDate = new Map((liveSessions || []).map(s => [s.date, s]));

        const gpMapped = gpFiltered.map(p => {
          const sl = parDate.get(p.date_seance) || null;
          return {
            ...p,
            source: sl ? "session_live" : "cours",
            // « presentiel » ou le nom du service de visio (zoom, meet, jitsi…) : c'est
            // l'écran qui décide du libellé, pas le serveur.
            plateforme: sl?.plateforme || null,
            session_titre: sl?.titre || null,
          };
        });

        // Fusionner : les présences groupes s'ajoutent aux présences privées (pas de doublon de date)
        const existingDates = new Set(presences.map(p => p.date_seance));
        const toAdd = gpMapped.filter(p => !existingDates.has(p.date_seance));
        presences = [...presences, ...toAdd].sort((a, b) =>
          (b.date_seance || "").localeCompare(a.date_seance || "")
        );
      }
    }

    res.json({ presences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/fichiers?email=xxx
router.get("/fichiers", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { assignation_id, ga } = await getIds(email);
    let fichiers = [];

    if (assignation_id) {
      const { data } = await supabase
        .from("fichiers_prives")
        .select("*")
        .eq("assignation_id", assignation_id)
        .order("created_at", { ascending: false });
      if (data?.length) fichiers = data;
    }

    // Fallback : fichiers du groupe
    if (fichiers.length === 0 && ga?.groupe_id) {
      const { data } = await supabase
        .from("groupes_fichiers")
        .select("*")
        .eq("groupe_id", ga.groupe_id)
        .order("created_at", { ascending: false });
      /* BORNÉ A SA FENÊTRE DE PRÉSENCE, comme les contenus e-learning. Un apprenant qui
         a arrêté recevait encore les ressources déposées par son coach après son départ :
         ses cours se fermaient, ses ressources non. */
      const visibles = bornerAFenetre(data || [], ga, f => f.created_at);
      if (visibles.length) fichiers = visibles.map(f => ({ ...f, nom: f.nom || f.titre, url: f.url }));
    }

    res.json({ fichiers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/cours-groupe?email=xxx
// Cours du groupe (coaching groupe) - séances planifiées par le coach
router.get("/cours-groupe", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { ga } = await getIds(email);
    if (!ga?.groupe_id) return res.json({ cours: [], groupe: null });

    // Exclut les cours tenus avant l'arrivée de l'apprenant dans cette classe
    // (transfert, ou ajout tardif) - même logique que /seances.
    let coursQuery = supabase.from("groupes_cours")
      .select("id, date_cours, objectif, grammaire, sujet_discussion, statut, commentaire, created_at")
      .eq("groupe_id", ga.groupe_id);
    if (ga.date_ajout) coursQuery = coursQuery.gte("date_cours", ga.date_ajout.slice(0, 10));

    // `groupes_cours` a été remplacée par la table unifiée `seances` : elle est VIDE (0 ligne
    // au total), et cette route n'interrogeait qu'elle. Résultat : l'onglet Planning de tout
    // apprenant en groupe était vide, alors que son coach y avait bien programmé ses séances.
    // On fusionne les deux sources, exactement comme GET /api/groupes/:id/cours.
    let seancesQuery = supabase.from("seances")
      .select("id, date_seance, heure_debut, heure_fin, titre, objectif, statut, notes, duree_h")
      .eq("groupe_id", ga.groupe_id)
      .neq("statut", "corbeille");
    if (ga.date_ajout) seancesQuery = seancesQuery.gte("date_seance", ga.date_ajout.slice(0, 10));

    const [{ data: cours }, { data: seancesNew }, { data: groupe }] = await Promise.all([
      coursQuery.order("date_cours", { ascending: false }),
      seancesQuery.order("date_seance", { ascending: false }),
      supabase.from("groupes")
        .select("id, nom, niveau, filiere, horaire, type_cours, coach_id, utilisateurs(nom, prenom)")
        .eq("id", ga.groupe_id)
        .maybeSingle(),
    ]);

    // L'écran de l'apprenant trie et affiche sur `date_cours` : on expose ce nom plutôt que
    // de faire porter le renommage à chaque lecteur.
    const tous = [
      ...(cours || []),
      ...(seancesNew || []).map((s) => ({
        ...s,
        date_cours: s.date_seance,
        objectif: s.objectif || s.titre,
        commentaire: s.notes || null,
      })),
    ].sort((a, b) => String(b.date_cours || "").localeCompare(String(a.date_cours || "")));

    res.json({ cours: tous, groupe: groupe || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
