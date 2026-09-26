import express from "express";
import multer  from "multer";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
console.log("✅ Route blog chargée");

// ── Upload d'image vers Supabase Storage ─────────────────
router.post("/upload", authenticateAdmin, requirePermission("contenu_editorial","update"), upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    const ext  = req.file.originalname.split(".").pop().toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("blog")
      .upload(name, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (error) return res.status(500).json({ error: error.message });

    const { data: { publicUrl } } = supabase.storage.from("blog").getPublicUrl(name);
    res.json({ url: publicUrl });
  } catch (err) {
    res.status(500).json({ error: "Erreur upload" });
  }
});

// ── Liste publique (articles publiés uniquement) ─────────
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("articles_blog")
      .select("id, titre, extrait, categorie, image_url, video_url, auteur, read_time, created_at")
      .eq("publie", true)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ articles: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Liste admin (tous, y compris brouillons) ─────────────
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const { data: articles, error } = await supabase
      .from("articles_blog")
      .select("id, titre, extrait, contenu, categorie, image_url, images, video_url, auteur, read_time, publie, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Compter les commentaires en attente par article
    const { data: counts } = await supabase
      .from("commentaires_blog")
      .select("article_id, approuve");

    const commentMap = {};
    (counts || []).forEach(c => {
      if (!commentMap[c.article_id]) commentMap[c.article_id] = { total: 0, pending: 0 };
      commentMap[c.article_id].total++;
      if (!c.approuve) commentMap[c.article_id].pending++;
    });

    const enriched = (articles || []).map(a => ({
      ...a,
      nb_commentaires: commentMap[a.id]?.total || 0,
      nb_en_attente:   commentMap[a.id]?.pending || 0,
    }));

    res.json({ articles: enriched });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Détail d'un article (public) + commentaires approuvés ─
router.get("/:id", async (req, res) => {
  try {
    const { data: article, error } = await supabase
      .from("articles_blog")
      .select("*")
      .eq("id", req.params.id)
      .eq("publie", true)
      .single();

    if (error || !article) return res.status(404).json({ error: "Article introuvable" });

    const { data: commentaires } = await supabase
      .from("commentaires_blog")
      .select("id, nom, commentaire, avatar_url, created_at")
      .eq("article_id", req.params.id)
      .eq("approuve", true)
      .order("created_at", { ascending: false });

    res.json({ article, commentaires: commentaires || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Détail pour l'admin (inclut brouillons) ──────────────
router.get("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: article, error } = await supabase
      .from("articles_blog")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !article) return res.status(404).json({ error: "Article introuvable" });

    const { data: commentaires } = await supabase
      .from("commentaires_blog")
      .select("id, nom, email, commentaire, approuve, created_at")
      .eq("article_id", req.params.id)
      .order("created_at", { ascending: false });

    res.json({ article, commentaires: commentaires || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Créer un article ─────────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("contenu_editorial","create"), async (req, res) => {
  try {
    const { titre, extrait, contenu, categorie, image_url, images, video_url, auteur, read_time, publie } = req.body;
    if (!titre) return res.status(400).json({ error: "Titre requis" });
    const cleanImages = (images || []).filter(u => u && u.trim());

    const { data, error } = await supabase
      .from("articles_blog")
      .insert({ titre, extrait: extrait || null, contenu: contenu || null, categorie: categorie || "Actualités", image_url: image_url || null, images: cleanImages, video_url: video_url || null, auteur: auteur || "Admin", read_time: read_time || null, publie: publie ?? false })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ article: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Modifier un article ───────────────────────────────────
router.put("/:id", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const { titre, extrait, contenu, categorie, image_url, images, video_url, auteur, read_time, publie } = req.body;
    if (!titre) return res.status(400).json({ error: "Titre requis" });
    const cleanImages = (images || []).filter(u => u && u.trim());

    const { data, error } = await supabase
      .from("articles_blog")
      .update({ titre, extrait: extrait || null, contenu: contenu || null, categorie: categorie || "Actualités", image_url: image_url || null, images: cleanImages, video_url: video_url || null, auteur: auteur || "Admin", read_time: read_time || null, publie: publie ?? false })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ article: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Basculer publie/brouillon ─────────────────────────────
router.patch("/:id/publie", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const { publie } = req.body;
    const { error } = await supabase
      .from("articles_blog")
      .update({ publie: !!publie })
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Statut mis à jour" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Supprimer un article ──────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("articles_blog")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Article supprimé" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Poster un commentaire (public, modération avant affichage) ──
router.post("/:id/commentaires", async (req, res) => {
  try {
    const { nom, email, commentaire, avatar_url } = req.body;
    if (!nom?.trim() || !commentaire?.trim()) {
      return res.status(400).json({ error: "Nom et commentaire requis" });
    }

    const { data: article } = await supabase
      .from("articles_blog")
      .select("id")
      .eq("id", req.params.id)
      .eq("publie", true)
      .single();

    if (!article) return res.status(404).json({ error: "Article introuvable" });

    const payload = { article_id: req.params.id, nom: nom.trim(), email: email?.trim() || null, commentaire: commentaire.trim(), approuve: true };
    if (avatar_url) payload.avatar_url = avatar_url;

    let { data: inserted, error } = await supabase
      .from("commentaires_blog")
      .insert(payload)
      .select()
      .single();

    // Si la colonne avatar_url n'existe pas encore, réessayer sans elle
    if (error && avatar_url) {
      delete payload.avatar_url;
      const retry = await supabase.from("commentaires_blog").insert(payload).select().single();
      inserted = retry.data;
      error    = retry.error;
    }

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: "Commentaire publié", commentaire: inserted });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Lister commentaires d'un article (admin, tous statuts) ─
router.get("/:id/commentaires", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("commentaires_blog")
      .select("id, nom, email, commentaire, approuve, created_at")
      .eq("article_id", req.params.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ commentaires: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Approuver / rejeter un commentaire ───────────────────
router.patch("/commentaires/:commentId", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const { approuve } = req.body;
    const { error } = await supabase
      .from("commentaires_blog")
      .update({ approuve: !!approuve })
      .eq("id", req.params.commentId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Commentaire mis à jour" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Tous les commentaires (admin, tous articles) ─────────
router.get("/admin/commentaires/all", authenticateAdmin, async (req, res) => {
  try {
    const { data: comments, error } = await supabase
      .from("commentaires_blog")
      .select("id, nom, email, commentaire, approuve, created_at, article_id")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Récupérer les titres des articles concernés
    const articleIds = [...new Set((comments || []).map(c => c.article_id).filter(Boolean))];
    let titlesMap = {};
    if (articleIds.length > 0) {
      const { data: articles } = await supabase
        .from("articles_blog")
        .select("id, titre")
        .in("id", articleIds);
      (articles || []).forEach(a => { titlesMap[a.id] = a.titre; });
    }

    res.json({
      commentaires: (comments || []).map(c => ({
        ...c,
        article_titre: titlesMap[c.article_id] || "-",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Supprimer un commentaire ─────────────────────────────
router.delete("/commentaires/:commentId", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("commentaires_blog")
      .delete()
      .eq("id", req.params.commentId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Commentaire supprimé" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
