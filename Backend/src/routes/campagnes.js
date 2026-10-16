import express from "express";
import { randomUUID } from "node:crypto";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { sendNewsletterCampaign } from "../services/emailService.js";

const router = express.Router();

/**
 * Campagnes de collecte - administration.
 *
 * Remplace Google Forms pour les campagnes BET. L'enjeu n'est pas la saisie : c'est de
 * savoir QUEL support a amené l'inscription. Chaque canal de diffusion - une affiche, un
 * flyer, un lien WhatsApp - porte un code qui voyage avec la réponse jusqu'au dossier.
 *
 * La partie PUBLIQUE (celle qu'ouvre le QR) vit dans `campagnesPubliques.js` : elle
 * n'exige aucun jeton et n'expose rien de ce fichier.
 */

/** Rôles autorisés. Le marketing pilote les campagnes ; le commercial exploite les réponses. */
const ROLES_CAMPAGNES = [
  "marketing", "super_admin", "admin", "manager",
  "commercial", "admin_commercial", "onboarding",
];
const requireCampagnes = (req, res, next) => {
  if (!ROLES_CAMPAGNES.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à l'équipe marketing et commerciale" });
  }
  next();
};

/** La table peut manquer si le SQL n'a pas été joué : on répond vide plutôt que 500. */
const tableAbsente = (e) => e && (e.code === "42P01" || /campagne/.test(e.message || ""));

/**
 * Un slug lisible, dérivé du titre.
 *
 * Il voyage dans une URL ET sur du papier : il doit rester court, sans accent, sans
 * ambiguïté à la lecture. La contrainte SQL impose `^[a-z0-9][a-z0-9-]{1,60}$`.
 */
const slugifier = (texte) =>
  String(texte || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "formulaire";

/** Un code de diffusion court, lisible, sans caractères qu'on confond à l'oral. */
const codeDiffusion = () => {
  // Ni O/0 ni I/1 : ces codes se dictent au téléphone et se recopient à la main.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
};

/* ══════════════════════════════════════════════════════════════
   CAMPAGNES
══════════════════════════════════════════════════════════════ */

router.get("/", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    let q = supabase.from("campagnes").select("*").order("created_at", { ascending: false });
    if (req.query.statut) q = q.eq("statut", req.query.statut);
    if (req.query.centre_id) q = q.eq("centre_id", req.query.centre_id);

    const { data, error } = await q;
    if (error) { if (tableAbsente(error)) return res.json({ campagnes: [] }); throw error; }

    // Les compteurs sont résolus en DEUX requêtes pour toutes les campagnes, et non une
    // par campagne : la liste en afficherait sinon N+1 allers-retours.
    const ids = (data || []).map(c => c.id);
    const compte = {};
    if (ids.length) {
      const [{ data: forms }, { data: reps }] = await Promise.all([
        supabase.from("campagne_formulaires").select("id, campagne_id").in("campagne_id", ids),
        supabase.from("campagne_reponses").select("id, campagne_id").in("campagne_id", ids),
      ]);
      (forms || []).forEach(f => { (compte[f.campagne_id] ||= { formulaires: 0, reponses: 0 }).formulaires++; });
      (reps  || []).forEach(r => { (compte[r.campagne_id] ||= { formulaires: 0, reponses: 0 }).reponses++; });
    }

    res.json({
      campagnes: (data || []).map(c => ({
        ...c,
        nb_formulaires: compte[c.id]?.formulaires || 0,
        nb_reponses:    compte[c.id]?.reponses || 0,
      })),
    });
  } catch (err) {
    console.error("[campagnes GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.post("/", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { nom, description, statut, date_debut, date_fin, centre_id, objectif_reponses, budget } = req.body || {};
    if (!nom?.trim()) return res.status(400).json({ error: "Le nom de la campagne est requis" });

    const { data, error } = await supabase.from("campagnes").insert({
      nom: nom.trim(),
      description: description || null,
      statut: statut || "planifiee",
      date_debut: date_debut || null,
      date_fin: date_fin || null,
      centre_id: centre_id || null,
      objectif_reponses: objectif_reponses ?? null,
      budget: budget ?? null,
      cree_par_id: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ campagne: data });
  } catch (err) {
    console.error("[campagnes POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

router.patch("/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const maj = {};
    for (const champ of ["nom", "description", "statut", "date_debut", "date_fin", "centre_id", "objectif_reponses", "budget"]) {
      if (req.body[champ] !== undefined) maj[champ] = req.body[champ];
    }
    if (!Object.keys(maj).length) return res.status(400).json({ error: "Aucune modification" });
    maj.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("campagnes").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ campagne: data });
  } catch (err) {
    console.error("[campagnes PATCH]", err.message || err);
    res.status(500).json({ error: err.message || "Modification impossible" });
  }
});

router.delete("/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    /* UNE CAMPAGNE QUI A COLLECTÉ NE SE SUPPRIME PAS PAR MÉGARDE. Les réponses survivent
       - les formulaires sont détachés, pas supprimés (ON DELETE SET NULL) - mais le lien
       entre ces inscriptions et la campagne qui les a produites, lui, disparaît : on perd
       la seule chose que ce dispositif existe pour mesurer, d'où viennent les inscrits.
       Le serveur compte donc AVANT d'effacer et renvoie 409 avec le détail ; l'écran
       affiche ce détail et redemande. `?force=1` n'est posé que par cette seconde
       confirmation - un appel direct ne peut pas contourner l'avertissement sans le
       vouloir explicitement. */
    const { data: formulaires } = await supabase
      .from("campagne_formulaires").select("id").eq("campagne_id", req.params.id);
    const idsForm = (formulaires || []).map(f => f.id);

    let nbReponses = 0, nbVisites = 0;
    if (idsForm.length) {
      const [{ count: cR }, { count: cV }] = await Promise.all([
        supabase.from("campagne_reponses").select("*", { count: "exact", head: true }).in("formulaire_id", idsForm),
        supabase.from("campagne_visites").select("*", { count: "exact", head: true }).in("formulaire_id", idsForm),
      ]);
      nbReponses = cR || 0;
      nbVisites  = cV || 0;
    }

    const force = req.query.force === "1" || req.query.force === "true";
    if (!force && (nbReponses > 0 || idsForm.length > 0)) {
      return res.status(409).json({
        error: "Cette campagne a déjà collecté des données.",
        confirmation_requise: true,
        formulaires: idsForm.length,
        reponses:    nbReponses,
        visites:     nbVisites,
      });
    }

    const { error } = await supabase.from("campagnes").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true, formulaires_detaches: idsForm.length, reponses_conservees: nbReponses });
  } catch (err) {
    console.error("[campagnes DELETE]", err.message || err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   FORMULAIRES
══════════════════════════════════════════════════════════════ */

router.get("/formulaires", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    let q = supabase.from("campagne_formulaires").select("*").order("created_at", { ascending: false });
    if (req.query.campagne_id) q = q.eq("campagne_id", req.query.campagne_id);

    const { data, error } = await q;
    if (error) { if (tableAbsente(error)) return res.json({ formulaires: [] }); throw error; }

    const ids = (data || []).map(f => f.id);
    const stats = {};
    if (ids.length) {
      const [{ data: reps }, { data: diff }] = await Promise.all([
        supabase.from("campagne_reponses").select("id, formulaire_id, statut").in("formulaire_id", ids),
        supabase.from("campagne_diffusions").select("id, formulaire_id, nb_visites").in("formulaire_id", ids),
      ]);
      (reps || []).forEach(r => {
        const s = (stats[r.formulaire_id] ||= { reponses: 0, nouvelles: 0, diffusions: 0, visites: 0 });
        s.reponses++; if (r.statut === "nouvelle") s.nouvelles++;
      });
      (diff || []).forEach(d => {
        const s = (stats[d.formulaire_id] ||= { reponses: 0, nouvelles: 0, diffusions: 0, visites: 0 });
        s.diffusions++; s.visites += d.nb_visites || 0;
      });
    }

    res.json({ formulaires: (data || []).map(f => ({ ...f, ...(stats[f.id] || { reponses: 0, nouvelles: 0, diffusions: 0, visites: 0 }) })) });
  } catch (err) {
    console.error("[formulaires GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/** Le formulaire avec ses champs - l'écran d'édition les charge ensemble. */
router.get("/formulaires/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const [{ data: form }, { data: champs }, { data: diffusions }] = await Promise.all([
      supabase.from("campagne_formulaires").select("*").eq("id", req.params.id).maybeSingle(),
      supabase.from("campagne_formulaire_champs").select("*").eq("formulaire_id", req.params.id).order("ordre"),
      supabase.from("campagne_diffusions").select("*").eq("formulaire_id", req.params.id).order("created_at"),
    ]);
    if (!form) return res.status(404).json({ error: "Formulaire introuvable" });
    res.json({ formulaire: form, champs: champs || [], diffusions: diffusions || [] });
  } catch (err) {
    console.error("[formulaire GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.post("/formulaires", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { titre, campagne_id, description, slug } = req.body || {};
    if (!titre?.trim()) return res.status(400).json({ error: "Le titre est requis" });

    // Un slug déjà pris reçoit un suffixe : il est imprimé sur des QR, deux formulaires
    // ne peuvent pas répondre à la même adresse.
    let base = slugifier(slug || titre);
    let candidat = base;
    for (let i = 2; i <= 40; i++) {
      const { data: pris } = await supabase
        .from("campagne_formulaires").select("id").eq("slug", candidat).maybeSingle();
      if (!pris) break;
      candidat = `${base}-${i}`.slice(0, 60);
    }

    const { data, error } = await supabase.from("campagne_formulaires").insert({
      titre: titre.trim(),
      slug: candidat,
      campagne_id: campagne_id || null,
      description: description || null,
      centre_id: req.body.centre_id || null,
      assignee_id: req.body.assignee_id || null,
      cree_par_id: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ formulaire: data });
  } catch (err) {
    console.error("[formulaires POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

router.patch("/formulaires/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { data: avant } = await supabase
      .from("campagne_formulaires").select("id, slug, statut").eq("id", req.params.id).maybeSingle();
    if (!avant) return res.status(404).json({ error: "Formulaire introuvable" });

    const maj = {};
    for (const champ of ["titre", "description", "statut", "ouvre_le", "ferme_le", "message_merci",
                         "message_ferme", "redirection_url", "couleur", "image_url", "illustration_url",
                         "assignee_id", "centre_id", "campagne_id", "autoriser_doublons", "texte_consentement"]) {
      if (req.body[champ] !== undefined) maj[champ] = req.body[champ];
    }

    /* LE SLUG NE CHANGE PLUS UNE FOIS LE FORMULAIRE PUBLIÉ. Il est encodé dans des QR
       peut-être déjà imprimés et collés : le modifier rendrait ces supports muets, sans
       que personne s'en aperçoive avant de voir les réponses s'arrêter. */
    if (req.body.slug !== undefined && req.body.slug !== avant.slug) {
      if (avant.statut !== "brouillon") {
        return res.status(409).json({
          error: "L'adresse du formulaire ne peut plus changer : des QR codes la contiennent peut-être déjà.",
        });
      }
      maj.slug = slugifier(req.body.slug);
    }

    if (!Object.keys(maj).length) return res.status(400).json({ error: "Aucune modification" });
    maj.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("campagne_formulaires").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ formulaire: data });
  } catch (err) {
    console.error("[formulaires PATCH]", err.message || err);
    res.status(500).json({ error: err.message || "Modification impossible" });
  }
});

router.delete("/formulaires/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { count } = await supabase
      .from("campagne_reponses").select("*", { count: "exact", head: true }).eq("formulaire_id", req.params.id);
    // Supprimer un formulaire emporte ses réponses (CASCADE) : on refuse dès qu'il y en a.
    if (count > 0) {
      return res.status(409).json({
        error: `Ce formulaire porte ${count} réponse${count > 1 ? "s" : ""}. Fermez-le plutôt que de le supprimer.`,
      });
    }
    const { error } = await supabase.from("campagne_formulaires").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[formulaires DELETE]", err.message || err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   CHAMPS DU FORMULAIRE
══════════════════════════════════════════════════════════════ */

/**
 * Remplace l'ensemble des champs d'un formulaire.
 *
 * Un PUT global et non des POST/PATCH champ par champ : l'éditeur manipule une liste
 * qu'on réordonne, où l'on insère et supprime. Synchroniser ligne à ligne aurait multiplié
 * les allers-retours et laissé l'écran désynchronisé au premier échec partiel.
 */
router.put("/formulaires/:id/champs", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const champs = Array.isArray(req.body?.champs) ? req.body.champs : null;
    if (!champs) return res.status(400).json({ error: "champs[] requis" });

    const { data: form } = await supabase
      .from("campagne_formulaires").select("id").eq("id", req.params.id).maybeSingle();
    if (!form) return res.status(404).json({ error: "Formulaire introuvable" });

    // Les identifiants existants sont conservés : les réponses déjà collectées pointent
    // dessus, et les réécrire orphelinerait `campagne_reponse_valeurs.champ_id`.
    const gardes = champs.map(c => c.id).filter(Boolean);
    let suppr = supabase.from("campagne_formulaire_champs").delete().eq("formulaire_id", req.params.id);
    if (gardes.length) suppr = suppr.not("id", "in", `(${gardes.join(",")})`);
    const { error: eSuppr } = await suppr;
    if (eSuppr) throw eSuppr;

    /* CHAQUE LIGNE PORTE UN `id`, Y COMPRIS LES NOUVELLES, et ce n'est pas un détail :
       PostgREST écrit UN SEUL insert pour tout le lot, avec l'union des colonnes
       rencontrées. Dès qu'une seule question existante apporte `id`, les nouvelles — qui
       n'en avaient pas — se voyaient affecter `id: NULL` explicitement, ce qui ÉCRASE le
       DEFAULT de la colonne :

           null value in column "id" of relation "campagne_formulaire_champs"
           violates not-null constraint

       Résultat : ajouter une question à un formulaire qui en avait déjà rendait un 500, et
       « Enregistrer les questions » ne faisait rien. Modifier les questions existantes
       passait, puisque toutes portaient alors leur identifiant. Constaté le 16/10/2026 sur
       « Dernier Challenge 2026 ».

       On génère donc l'identifiant ici plutôt que de le laisser à la base : le lot devient
       homogène, et la route reste juste même si le DEFAULT venait à disparaître. */
    const lignes = champs.map((c, i) => ({
      id: c.id || randomUUID(),
      formulaire_id: req.params.id,
      ordre: i,
      libelle: (c.libelle || "").trim() || "Question",
      aide: c.aide || null,
      type: c.type || "texte",
      obligatoire: !!c.obligatoire,
      options: Array.isArray(c.options) ? c.options : [],
      placeholder: c.placeholder || null,
      validation: c.validation && typeof c.validation === "object" ? c.validation : {},
      role_canonique: c.role_canonique || null,
      image_url: c.image_url || null,
      autre_autorise: !!c.autre_autorise,
    }));

    if (lignes.length) {
      const { error } = await supabase.from("campagne_formulaire_champs").upsert(lignes, { onConflict: "id" });
      if (error) throw error;
    }

    const { data } = await supabase
      .from("campagne_formulaire_champs").select("*").eq("formulaire_id", req.params.id).order("ordre");
    res.json({ champs: data || [] });
  } catch (err) {
    console.error("[champs PUT]", err.message || err);
    res.status(500).json({ error: err.message || "Enregistrement impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   DIFFUSIONS - un canal par support
══════════════════════════════════════════════════════════════ */

router.post("/formulaires/:id/diffusions", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { libelle, format, support, emplacement, centre_id } = req.body || {};
    if (!libelle?.trim()) return res.status(400).json({ error: "Le libellé est requis (« Affiche entrée Angré »)" });

    // Le code doit être unique sur TOUT le parc : il se lit seul dans une URL.
    let code = (req.body.code || "").trim().toUpperCase();
    if (code && !/^[a-zA-Z0-9]{4,16}$/.test(code)) {
      return res.status(400).json({ error: "Le code doit faire 4 à 16 lettres ou chiffres, sans espace." });
    }
    if (!code) {
      for (let i = 0; i < 20; i++) {
        const essai = codeDiffusion();
        const { data: pris } = await supabase
          .from("campagne_diffusions").select("id").eq("code", essai).maybeSingle();
        if (!pris) { code = essai; break; }
      }
    }
    if (!code) return res.status(500).json({ error: "Impossible de générer un code unique" });

    const { data, error } = await supabase.from("campagne_diffusions").insert({
      formulaire_id: req.params.id,
      code,
      libelle: libelle.trim(),
      format: format || "qr",
      support: support || "autre",
      emplacement: emplacement || null,
      centre_id: centre_id || null,
    }).select().single();
    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Ce code est déjà utilisé." });
      throw error;
    }
    res.status(201).json({ diffusion: data });
  } catch (err) {
    console.error("[diffusions POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

router.patch("/diffusions/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const maj = {};
    for (const champ of ["libelle", "format", "support", "emplacement", "centre_id", "actif"]) {
      if (req.body[champ] !== undefined) maj[champ] = req.body[champ];
    }
    // `code` est délibérément absent : il est imprimé sur les supports.
    if (!Object.keys(maj).length) return res.status(400).json({ error: "Aucune modification" });

    const { data, error } = await supabase
      .from("campagne_diffusions").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ diffusion: data });
  } catch (err) {
    console.error("[diffusions PATCH]", err.message || err);
    res.status(500).json({ error: "Modification impossible" });
  }
});

router.delete("/diffusions/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { count } = await supabase
      .from("campagne_reponses").select("*", { count: "exact", head: true }).eq("diffusion_id", req.params.id);
    // Une diffusion qui a produit des réponses se DÉSACTIVE : la supprimer effacerait
    // l'origine de ces réponses, c'est-à-dire toute la mesure qu'on cherche à faire.
    if (count > 0) {
      return res.status(409).json({
        error: `Ce canal a produit ${count} réponse${count > 1 ? "s" : ""}. Désactivez-le plutôt que de le supprimer.`,
      });
    }
    const { error } = await supabase.from("campagne_diffusions").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[diffusions DELETE]", err.message || err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   RÉPONSES
══════════════════════════════════════════════════════════════ */

router.get("/reponses", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const taille = Math.min(200, Number(req.query.limit) || 50);

    let q = supabase.from("campagne_reponses").select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * taille, page * taille - 1);

    if (req.query.formulaire_id) q = q.eq("formulaire_id", req.query.formulaire_id);
    if (req.query.campagne_id)   q = q.eq("campagne_id", req.query.campagne_id);
    if (req.query.diffusion_id)  q = q.eq("diffusion_id", req.query.diffusion_id);
    if (req.query.statut)        q = q.eq("statut", req.query.statut);
    if (req.query.du) q = q.gte("created_at", `${req.query.du}T00:00:00`);
    if (req.query.au) q = q.lte("created_at", `${req.query.au}T23:59:59`);

    const { data, error, count } = await q;
    if (error) { if (tableAbsente(error)) return res.json({ reponses: [], total: 0 }); throw error; }

    // Les écrans affichent le canal d'origine, pas son identifiant : c'est toute la
    // valeur de la donnée collectée.
    const diffIds = [...new Set((data || []).map(r => r.diffusion_id).filter(Boolean))];
    const formIds = [...new Set((data || []).map(r => r.formulaire_id).filter(Boolean))];
    const [{ data: diffs }, { data: forms }] = await Promise.all([
      diffIds.length ? supabase.from("campagne_diffusions").select("id, code, libelle, format, support, centre_id").in("id", diffIds) : { data: [] },
      formIds.length ? supabase.from("campagne_formulaires").select("id, titre, slug").in("id", formIds) : { data: [] },
    ]);
    const mapD = Object.fromEntries((diffs || []).map(d => [d.id, d]));
    const mapF = Object.fromEntries((forms || []).map(f => [f.id, f]));

    res.json({
      reponses: (data || []).map(r => ({
        ...r,
        diffusion:  r.diffusion_id  ? (mapD[r.diffusion_id]  || null) : null,
        formulaire: r.formulaire_id ? (mapF[r.formulaire_id] || null) : null,
      })),
      total: count || 0, page, limit: taille,
    });
  } catch (err) {
    console.error("[reponses GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.get("/reponses/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { data: rep } = await supabase
      .from("campagne_reponses").select("*").eq("id", req.params.id).maybeSingle();
    if (!rep) return res.status(404).json({ error: "Réponse introuvable" });

    const [{ data: valeurs }, { data: diff }, { data: form }] = await Promise.all([
      supabase.from("campagne_reponse_valeurs").select("*").eq("reponse_id", rep.id),
      rep.diffusion_id ? supabase.from("campagne_diffusions").select("*").eq("id", rep.diffusion_id).maybeSingle() : { data: null },
      supabase.from("campagne_formulaires").select("id, titre, slug").eq("id", rep.formulaire_id).maybeSingle(),
    ]);

    // Marquer « vue » à la première ouverture, sans attendre une action : c'est
    // l'ouverture qui fait foi, et personne ne pense à cliquer « j'ai lu ».
    if (rep.statut === "nouvelle") {
      await supabase.from("campagne_reponses")
        .update({ statut: "vue", traitee_par_id: req.profil?.id || null }).eq("id", rep.id);
      rep.statut = "vue";
    }

    res.json({ reponse: rep, valeurs: valeurs || [], diffusion: diff, formulaire: form });
  } catch (err) {
    console.error("[reponse GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.patch("/reponses/:id", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const maj = {};
    if (req.body.statut !== undefined)       maj.statut = req.body.statut;
    if (req.body.note_interne !== undefined) maj.note_interne = req.body.note_interne;
    if (!Object.keys(maj).length) return res.status(400).json({ error: "Aucune modification" });
    maj.traitee_par_id = req.profil?.id || null;
    maj.traitee_le = new Date().toISOString();

    const { data, error } = await supabase
      .from("campagne_reponses").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ reponse: data });
  } catch (err) {
    console.error("[reponses PATCH]", err.message || err);
    res.status(500).json({ error: "Modification impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PERFORMANCE PAR CANAL
══════════════════════════════════════════════════════════════ */

/**
 * Le tableau qui répond à « quelle affiche convertit ? ».
 *
 * L'écart entre visites et réponses instruit autant que les réponses elles-mêmes : un
 * canal très ouvert mais peu converti accuse le formulaire, pas le canal.
 */
router.get("/performance", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    let q = supabase.from("v_campagne_performance_diffusion").select("*");
    if (req.query.formulaire_id) q = q.eq("formulaire_id", req.query.formulaire_id);

    const { data, error } = await q;
    // La vue peut ne pas exister sur une base pas encore migrée : on recalcule alors
    // depuis les tables, plutôt que de renvoyer un écran vide sans explication.
    if (error) {
      const { data: diffs } = await supabase.from("campagne_diffusions").select("*")
        .eq(req.query.formulaire_id ? "formulaire_id" : "actif", req.query.formulaire_id || true);
      const ids = (diffs || []).map(d => d.id);
      const { data: reps } = ids.length
        ? await supabase.from("campagne_reponses").select("diffusion_id, assignation_id").in("diffusion_id", ids)
        : { data: [] };
      const parDiff = {};
      (reps || []).forEach(r => {
        const s = (parDiff[r.diffusion_id] ||= { reponses: 0, converties: 0 });
        s.reponses++; if (r.assignation_id) s.converties++;
      });
      return res.json({
        performance: (diffs || []).map(d => ({
          ...d,
          nb_reponses: parDiff[d.id]?.reponses || 0,
          nb_converties: parDiff[d.id]?.converties || 0,
          taux_conversion: d.nb_visites ? Math.round(((parDiff[d.id]?.reponses || 0) / d.nb_visites) * 100) : null,
        })),
      });
    }
    res.json({ performance: data || [] });
  } catch (err) {
    console.error("[performance GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   CAMPAGNE E-MAIL sur les réponses collectées
══════════════════════════════════════════════════════════════ */

/**
 * L'audience e-mail d'une sélection de réponses.
 *
 * Pendant exact du calcul WhatsApp, mais la contrainte n'est PAS la même : l'e-mail
 * n'exige ni modèle approuvé ni fenêtre de 24 h. Le consentement reste demandé - une
 * relance non sollicitée finit en spam, et c'est la réputation du domaine de BET qui
 * s'abîme, pas seulement une campagne.
 */
async function audienceEmail(filtres = {}) {
  const { formulaire_id, diffusion_id, statut, du, au } = filtres;

  let q = supabase.from("campagne_reponses")
    .select("id, nom, email, telephone, consentement, created_at, formulaire_id");
  if (formulaire_id) q = q.eq("formulaire_id", formulaire_id);
  if (diffusion_id)  q = q.eq("diffusion_id", diffusion_id);
  if (statut)        q = q.eq("statut", statut);
  if (du) q = q.gte("created_at", `${du}T00:00:00`);
  if (au) q = q.lte("created_at", `${au}T23:59:59`);

  const { data, error } = await q;
  if (error) throw error;

  // Une adresse, une personne : le même prospect peut avoir répondu deux fois.
  const par = new Map();
  let sansEmail = 0;
  for (const r of data || []) {
    const mail = String(r.email || "").trim().toLowerCase();
    if (!mail.includes("@")) { sansEmail++; continue; }
    // `reponse_id` et `formulaire_id` voyagent avec le destinataire : sans eux,
    // l'historique d'envoi ne saurait pas de quelle récolte vient la personne -
    // et une campagne peut viser plusieurs récoltes à la fois.
    if (!par.has(mail)) par.set(mail, {
      email: mail, nom: r.nom, consentement: !!r.consentement,
      reponse_id: r.id, formulaire_id: r.formulaire_id || null,
    });
    else if (r.consentement) par.get(mail).consentement = true;
  }
  const tous = [...par.values()];
  const joignables = tous.filter(x => x.consentement);
  return {
    reponses: (data || []).length,
    total: tous.length,
    joignables: joignables.length,
    sans_consentement: tous.length - joignables.length,
    // Le champ e-mail est rarement obligatoire : beaucoup ne laissent qu'un téléphone.
    // Le dire evite de croire que la moitie des reponses a disparu.
    sans_email: sansEmail,
    destinataires: joignables,
  };
}

router.post("/email/audience", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const a = await audienceEmail(req.body || {});
    res.json({ ...a, destinataires: a.destinataires.slice(0, 20) });
  } catch (err) {
    console.error("[campagnes/email/audience]", err.message || err);
    res.status(500).json({ error: "Calcul de l'audience impossible" });
  }
});

/**
 * Écrit la campagne e-mail et ses lignes d'envoi.
 *
 * Ne LÈVE JAMAIS : l'historique est une trace, pas une condition de l'envoi. Les messages
 * sont déjà partis quand cette fonction s'exécute ; faire échouer la réponse HTTP parce
 * que la table manque ferait croire à l'utilisateur que rien n'a été envoyé - c'est le
 * mensonge le plus coûteux qu'on puisse lui servir ici.
 */
async function enregistrerCampagneEmail({ nom, sujet, contenu, filtres, piece_jointe_url, piece_jointe_nom, audience, resultat, auteur }) {
  try {
    const envoyes = resultat?.sent || 0;
    const echecs  = resultat?.failed || 0;

    // Les récoltes RÉELLEMENT touchées, relevées sur les destinataires. Une campagne
    // peut viser plusieurs récoltes à la fois : le seul `filtres.formulaire_id`
    // mentirait sur un envoi non filtré.
    const formulaires = [...new Set((audience?.destinataires || [])
      .map(d => d.formulaire_id).filter(Boolean))];

    const { data: camp, error } = await supabase.from("campagnes_email").insert({
      nom: nom?.trim() || null,
      formulaire_id: filtres?.formulaire_id || null,
      formulaire_ids: formulaires,
      sujet, contenu,
      piece_jointe_url: piece_jointe_url || null,
      piece_jointe_nom: piece_jointe_nom || null,
      filtres,
      statut: echecs === 0 ? "envoyee" : envoyes === 0 ? "echouee" : "partielle",
      total_destinataires: audience?.joignables || 0,
      nb_envoyes: envoyes,
      nb_echecs: echecs,
      nb_sans_consentement: audience?.sans_consentement || 0,
      nb_sans_email: audience?.sans_email || 0,
      erreurs: resultat?.erreurs || [],
      created_by: auteur,
    }).select().single();
    if (error) throw error;

    // Une ligne par destinataire, avec le motif exact quand l'envoi a échoué.
    const parEmail = Object.fromEntries((audience?.destinataires || []).map(d => [d.email, d]));
    const lignes = (resultat?.details || []).map(d => {
      const src = parEmail[d.email] || {};
      return {
        campagne_email_id: camp.id,
        email: d.email,
        nom: src.nom || null,
        reponse_id: src.reponse_id || null,
        formulaire_id: src.formulaire_id || null,
        statut: d.ok ? "envoye" : "echec",
        erreur: d.erreur || null,
      };
    });
    if (lignes.length) await supabase.from("email_envois").insert(lignes);

    return camp;
  } catch (e) {
    console.error("[campagnes/email historique] écriture impossible :", e.message || e);
    return null;
  }
}

router.post("/email/envoyer", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { nom, sujet, contenu, filtres, piece_jointe_url, piece_jointe_nom } = req.body || {};
    if (!sujet?.trim())  return res.status(400).json({ error: "L'objet du message est requis" });
    if (!contenu?.trim()) return res.status(400).json({ error: "Le message est requis" });

    const a = await audienceEmail(filtres || {});
    if (!a.joignables) {
      return res.status(409).json({
        error: a.total
          ? `Aucun des ${a.total} contacts n'a donné son consentement. Une relance non sollicitée finit en spam et abîme la réputation du domaine de BET.`
          : "Aucune adresse e-mail dans cette sélection.",
      });
    }

    // Le même envoi que la newsletter : une seconde implémentation aurait fini par
    // diverger sur la mise en page, le pied de page et la gestion des pièces jointes.
    const r = await sendNewsletterCampaign({
      emails: a.destinataires.map(d => d.email),
      sujet: sujet.trim(),
      contenu: contenu.trim(),
      piece_jointe_url: piece_jointe_url || null,
      piece_jointe_nom: piece_jointe_nom || null,
      tagCampagne: `collecte-${(filtres?.formulaire_id || "").slice(0, 8) || "tous"}`,
    });

    // ── L'HISTORIQUE. Sans lui, un envoi ne laissait AUCUNE trace : ni qui avait reçu,
    // ni pourquoi les autres n'avaient rien reçu. Il a fallu lire les journaux de Brevo
    // pour comprendre un échec. Il est écrit APRÈS l'envoi, et son échec n'invalide pas
    // l'envoi lui-même - les messages sont partis, on ne va pas prétendre le contraire.
    const historique = await enregistrerCampagneEmail({
      nom, sujet, contenu, filtres: filtres || {},
      piece_jointe_url, piece_jointe_nom,
      audience: a, resultat: r, auteur: req.profil?.id || null,
    });

    res.json({
      campagne_id: historique?.id || null,
      ok: (r?.sent || 0) > 0,
      envoyes: r?.sent || 0,
      echecs: r?.failed || 0,
      sans_consentement: a.sans_consentement,
      // La RAISON de l'échec, et pas seulement son compte : un « 0 envoyé » muet a déjà
      // coûté une campagne entière - Brevo refusait la pièce jointe, rien ne le disait.
      raisons: r?.erreurs || [],
      message: (r?.sent || 0) > 0
        ? `${r.sent} e-mail${r.sent > 1 ? "s" : ""} envoyé${r.sent > 1 ? "s" : ""}${r.failed ? `, ${r.failed} en échec` : ""}.`
        : `Aucun e-mail n'a pu partir.${r?.erreurs?.length ? ` Motif : ${r.erreurs[0]}` : ""}`,
    });
  } catch (err) {
    console.error("[campagnes/email/envoyer]", err.message || err);
    res.status(500).json({ error: "Envoi impossible" });
  }
});

/**
 * Les réponses filtrées, APLATIES, prêtes à exporter.
 *
 * Une colonne par question du formulaire, dans l'ordre où elles sont posées. Le
 * navigateur ne peut pas construire ça seul : il faudrait une requête par réponse pour
 * aller chercher ses valeurs, soit N allers-retours pour un seul clic sur « Exporter ».
 *
 * Volontairement SANS pagination, contrairement à la liste : un export partiel qui ne
 * dit pas qu'il est partiel est un piège. Le plafond est posé haut et annoncé.
 */
router.get("/export/reponses", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { formulaire_id, diffusion_id, statut, du, au } = req.query;
    const PLAFOND = 5000;

    let q = supabase.from("campagne_reponses").select("*").order("created_at", { ascending: false }).limit(PLAFOND);
    if (formulaire_id) q = q.eq("formulaire_id", formulaire_id);
    if (diffusion_id)  q = q.eq("diffusion_id", diffusion_id);
    if (statut)        q = q.eq("statut", statut);
    if (du) q = q.gte("created_at", `${du}T00:00:00`);
    if (au) q = q.lte("created_at", `${au}T23:59:59`);

    const { data: reps, error } = await q;
    if (error) { if (tableAbsente(error)) return res.json({ colonnes: [], lignes: [] }); throw error; }

    const ids = (reps || []).map(r => r.id);
    const formIds = [...new Set((reps || []).map(r => r.formulaire_id).filter(Boolean))];
    const diffIds = [...new Set((reps || []).map(r => r.diffusion_id).filter(Boolean))];

    const [{ data: valeurs }, { data: champs }, { data: diffs }, { data: forms }] = await Promise.all([
      ids.length ? supabase.from("campagne_reponse_valeurs").select("reponse_id, champ_id, libelle_champ, valeur_texte, valeurs").in("reponse_id", ids) : { data: [] },
      formIds.length ? supabase.from("campagne_formulaire_champs").select("id, formulaire_id, libelle, ordre").in("formulaire_id", formIds).order("ordre") : { data: [] },
      diffIds.length ? supabase.from("campagne_diffusions").select("id, libelle, code, support").in("id", diffIds) : { data: [] },
      formIds.length ? supabase.from("campagne_formulaires").select("id, titre").in("id", formIds) : { data: [] },
    ]);

    const mapD = Object.fromEntries((diffs || []).map(d => [d.id, d]));
    const mapF = Object.fromEntries((forms || []).map(f => [f.id, f.titre]));

    // L'ordre des questions vient des champs ACTUELS ; une question supprimée depuis
    // conserve sa colonne, en fin de tableau, grâce au libellé figé dans la valeur.
    const colonnes = [];
    const vues = new Set();
    (champs || []).forEach(c => { if (!vues.has(c.libelle)) { vues.add(c.libelle); colonnes.push(c.libelle); } });

    const parReponse = {};
    (valeurs || []).forEach(v => {
      const txt = Array.isArray(v.valeurs) && v.valeurs.length ? v.valeurs.join(", ") : (v.valeur_texte || "");
      (parReponse[v.reponse_id] ||= {})[v.libelle_champ] = txt;
      if (!vues.has(v.libelle_champ)) { vues.add(v.libelle_champ); colonnes.push(v.libelle_champ); }
    });

    const lignes = (reps || []).map(r => ({
      recue_le: r.created_at,
      formulaire: mapF[r.formulaire_id] || "",
      nom: r.nom || "",
      email: r.email || "",
      telephone: r.telephone || "",
      canal: mapD[r.diffusion_id]?.libelle || "Lien direct",
      code_canal: mapD[r.diffusion_id]?.code || "",
      support: mapD[r.diffusion_id]?.support || "",
      statut: r.statut,
      consentement: r.consentement ? "Oui" : "Non",
      convertie: r.assignation_id ? "Oui" : "Non",
      note_interne: r.note_interne || "",
      reponses: parReponse[r.id] || {},
    }));

    res.json({
      colonnes, lignes,
      total: lignes.length,
      // Dit franchement que l'export est tronqué plutôt que de laisser croire au total.
      tronque: lignes.length >= PLAFOND,
    });
  } catch (err) {
    console.error("[campagnes/export]", err.message || err);
    res.status(500).json({ error: "Export impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   STATISTIQUES DES CAMPAGNES (e-mail + WhatsApp)
══════════════════════════════════════════════════════════════ */

/**
 * L'historique des relances, les deux canaux réunis.
 *
 * Une récolte reçoit PLUSIEURS campagnes, et une campagne peut viser PLUSIEURS récoltes :
 * la liste est donc globale, et `formulaire_id` ne fait que la filtrer. Attribuer une
 * campagne à une seule récolte aurait rendu invisibles tous les envois croisés.
 *
 * Le filtrage se fait en mémoire : ces tables comptent des dizaines de lignes, pas des
 * millions, et une expression PostgREST sur un tableau `uuid[]` échoue en silence quand
 * la colonne vient d'être ajoutée - un écran vide sans message est pire qu'une boucle.
 */
router.get("/statistiques", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { formulaire_id, du, au } = req.query;

    const vide = { data: [] };
    const sur = (p) => p.then(r => (r?.error ? vide : r), () => vide);

    const [mails, waCamps, formsR] = await Promise.all([
      sur(supabase.from("campagnes_email").select("*").order("date_envoi", { ascending: false }).limit(300)),
      sur(supabase.from("campagnes_whatsapp").select("*").order("created_at", { ascending: false }).limit(300)),
      sur(supabase.from("campagne_formulaires").select("id, titre, slug")),
    ]);

    const titres = Object.fromEntries((formsR.data || []).map(f => [f.id, f.titre]));

    /** Une campagne concerne la récolte si elle l'a touchée, ou si elle la filtrait. */
    const concerne = (c) => {
      if (!formulaire_id) return true;
      const ids = Array.isArray(c.formulaire_ids) ? c.formulaire_ids : [];
      if (ids.includes(formulaire_id)) return true;
      if (c.formulaire_id === formulaire_id) return true;
      // Les campagnes antérieures à cette colonne : leur filtre d'origine fait foi.
      return (c.destinataires?.formulaire_id || c.filtres?.formulaire_id) === formulaire_id;
    };
    const dansLaPeriode = (d) => {
      if (!d) return true;
      const j = String(d).slice(0, 10);
      return (!du || j >= du) && (!au || j <= au);
    };
    const recoltes = (c) => {
      const ids = (Array.isArray(c.formulaire_ids) && c.formulaire_ids.length)
        ? c.formulaire_ids
        : [c.formulaire_id || c.destinataires?.formulaire_id || c.filtres?.formulaire_id].filter(Boolean);
      return ids.map(id => titres[id] || "Récolte supprimée");
    };

    const email = (mails.data || [])
      .filter(c => concerne(c) && dansLaPeriode(c.date_envoi))
      .map(c => ({
        id: c.id, canal: "email",
        nom: c.nom || c.sujet,
        sujet: c.sujet,
        date: c.date_envoi,
        statut: c.statut,
        recoltes: recoltes(c),
        destinataires: c.total_destinataires || 0,
        envoyes: c.nb_envoyes || 0,
        echecs: c.nb_echecs || 0,
        sans_consentement: c.nb_sans_consentement || 0,
        sans_contact: c.nb_sans_email || 0,
        piece_jointe: c.piece_jointe_nom || null,
        erreurs: Array.isArray(c.erreurs) ? c.erreurs : [],
      }));

    const whatsapp = (waCamps.data || [])
      .filter(c => concerne(c) && dansLaPeriode(c.date_envoi || c.created_at))
      .map(c => ({
        id: c.id, canal: "whatsapp",
        nom: c.nom,
        sujet: null,
        date: c.date_envoi || c.created_at,
        statut: c.statut,
        recoltes: recoltes(c),
        destinataires: c.total_destinataires || 0,
        envoyes: c.nb_envoyes || 0,
        // Propres à WhatsApp : l'e-mail n'a pas d'accusé de lecture.
        delivres: c.nb_delivres || 0,
        lus: c.nb_lus || 0,
        echecs: c.nb_echecs || 0,
        sans_consentement: c.nb_sans_optin || 0,
        sans_contact: 0,
        erreurs: [],
      }));

    const cumul = (liste) => liste.reduce((t, c) => ({
      campagnes: t.campagnes + 1,
      destinataires: t.destinataires + c.destinataires,
      envoyes: t.envoyes + c.envoyes,
      echecs: t.echecs + c.echecs,
      sans_consentement: t.sans_consentement + c.sans_consentement,
      lus: t.lus + (c.lus || 0),
    }), { campagnes: 0, destinataires: 0, envoyes: 0, echecs: 0, sans_consentement: 0, lus: 0 });

    const tEmail = cumul(email);
    const tWa = cumul(whatsapp);

    res.json({
      email: { campagnes: email, totaux: tEmail },
      whatsapp: { campagnes: whatsapp, totaux: tWa },
      // La liste fusionnée, du plus récent au plus ancien : c'est ce que l'écran affiche.
      toutes: [...email, ...whatsapp].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      totaux: {
        campagnes: tEmail.campagnes + tWa.campagnes,
        destinataires: tEmail.destinataires + tWa.destinataires,
        envoyes: tEmail.envoyes + tWa.envoyes,
        echecs: tEmail.echecs + tWa.echecs,
        sans_consentement: tEmail.sans_consentement + tWa.sans_consentement,
        // Le taux n'a de sens qu'avec des destinataires : 0/0 n'est pas 0 %.
        taux_reussite: (tEmail.destinataires + tWa.destinataires)
          ? Math.round(((tEmail.envoyes + tWa.envoyes) / (tEmail.destinataires + tWa.destinataires)) * 100)
          : null,
      },
    });
  } catch (err) {
    console.error("[campagnes/statistiques]", err.message || err);
    res.status(500).json({ error: "Lecture des statistiques impossible" });
  }
});

/**
 * Le détail des destinataires d'une campagne - qui a reçu, qui a échoué et pourquoi.
 * Alimente la feuille « Destinataires » de l'export.
 */
router.get("/statistiques/:canal/:id/envois", authenticateAdmin, requireCampagnes, async (req, res) => {
  try {
    const { canal, id } = req.params;
    if (canal === "email") {
      const { data, error } = await supabase.from("email_envois")
        .select("email, nom, statut, erreur, envoye_le").eq("campagne_email_id", id);
      if (error) throw error;
      return res.json({ envois: data || [] });
    }
    const { data, error } = await supabase.from("whatsapp_envois")
      .select("telephone, statut, erreur, envoye_le, delivre_le, lu_le").eq("campagne_wa_id", id);
    if (error) throw error;
    res.json({ envois: data || [] });
  } catch (err) {
    console.error("[campagnes/statistiques envois]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

export default router;
