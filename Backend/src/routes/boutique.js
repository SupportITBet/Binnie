import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.js";
import { emailAutorise } from "../services/accesApprenant.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

// Enrichit des commandes payées en ligne avec le détail complet de leur
// transaction TouchPoint (reference_transaction stocke l'order_number) -
// commandes.mode_paiement ne garde qu'un résumé ("TouchPoint"), le détail
// (token, opérateur exact, horodatage de confirmation, assistante) vit sur
// paiements_touchpoint. `avecAssistante` n'expose le nom de la commerciale que
// pour la vue admin - l'apprenant n'a pas à voir cette info sur ses achats.
async function enrichirAvecTouchPoint(commandes, { avecAssistante = false } = {}) {
  const refs = [...new Set((commandes || []).map(c => c.reference_transaction).filter(Boolean))];
  if (!refs.length) return (commandes || []).map(c => ({ ...c, touchpoint: null }));

  const { data: tpRows } = await supabase
    .from("paiements_touchpoint")
    .select("order_number, payment_token, payment_mode, assistante_id, created_at, updated_at")
    .in("order_number", refs);

  let nomsParId = {};
  if (avecAssistante) {
    const assistanteIds = [...new Set((tpRows || []).map(t => t.assistante_id).filter(Boolean))];
    if (assistanteIds.length) {
      const { data: assistantesRows } = await supabase
        .from("assistantes").select("id, nom, prenom").in("id", assistanteIds);
      nomsParId = Object.fromEntries((assistantesRows || []).map(a => [a.id, `${a.prenom||""} ${a.nom||""}`.trim()]));
    }
  }

  const touchpointParRef = Object.fromEntries((tpRows || []).map(t => [t.order_number, {
    order_number:   t.order_number,
    payment_token:  t.payment_token,
    payment_mode:   t.payment_mode,
    assistante_nom: avecAssistante ? (nomsParId[t.assistante_id] || null) : undefined,
    created_at:     t.created_at,
    updated_at:     t.updated_at,
  }]));

  return (commandes || []).map(c => ({
    ...c,
    touchpoint: c.reference_transaction ? (touchpointParRef[c.reference_transaction] || null) : null,
  }));
}

// ─── PRODUITS ────────────────────────────────────────────────────────────────

// GET /api/boutique/produits - tous les produits (public)
router.get("/produits", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boutique/produits/actifs - produits actifs seulement (public vitrine)
router.get("/produits/actifs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("produits")
      .select("*")
      .eq("actif", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boutique/produits - créer un produit (admin)
router.post("/produits", authenticateAdmin, requirePermission("boutique","create"), async (req, res) => {
  try {
    const { nom, description, prix, stock, categorie, image_url, images } = req.body;
    if (!nom || prix === undefined) {
      return res.status(400).json({ error: "nom et prix sont requis" });
    }
    const imagesArr = Array.isArray(images) ? images : (image_url ? [image_url] : []);
    const { data, error } = await supabase
      .from("produits")
      .insert({ nom, description, prix: Number(prix), stock: Number(stock) || 0, categorie: categorie || "Autre", image_url: imagesArr[0] || null, images: imagesArr, actif: true })
      .select()
      .single();
    if (error) throw error;

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "admin",
      plateforme:   "dash",
      action_type:  "PRODUIT_CREATED",
      module:       "boutique",
      entite_type:  "produit",
      entite_id:    data.id,
      detail:       `Produit créé : ${nom} (prix : ${prix}, stock : ${stock || 0})`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/boutique/produits/:id - modifier un produit (admin)
router.patch("/produits/:id", authenticateAdmin, requirePermission("boutique","update"), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["nom", "description", "prix", "stock", "categorie", "image_url", "images", "actif"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.prix !== undefined) updates.prix = Number(updates.prix);
    if (updates.stock !== undefined) updates.stock = Number(updates.stock);
    const { data, error } = await supabase
      .from("produits")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "admin",
      plateforme:   "dash",
      action_type:  "PRODUIT_UPDATED",
      module:       "boutique",
      entite_type:  "produit",
      entite_id:    id,
      detail:       `Produit ${id} mis à jour - champs : ${Object.keys(updates).join(", ")}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boutique/produits/:id - supprimer un produit (admin)
router.delete("/produits/:id", authenticateAdmin, requirePermission("boutique","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("produits").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "admin",
      plateforme:   "dash",
      action_type:  "PRODUIT_DELETED",
      module:       "boutique",
      entite_type:  "produit",
      entite_id:    req.params.id,
      detail:       `Produit ${req.params.id} supprimé`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "warning",
    }).catch(() => {});

    res.json({ message: "Produit supprimé" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COMMANDES ───────────────────────────────────────────────────────────────

// GET /api/boutique/mes-commandes - historique des commandes d'un client par
// email (utilisé par l'Espace Apprenant pour afficher ses propres achats -
// même modèle d'accès scopé-par-email que les autres endpoints "mon-espace").
router.get("/mes-commandes", authenticateUser, async (req, res) => {
  try {
    // Une commande porte un nom, une adresse et un montant : l'e-mail en clair dans l'URL
    // ne peut pas tenir lieu de preuve d'identité.
    const autorise = await emailAutorise(req.user, req.query.email);
    if (!autorise) return res.status(403).json({ error: "Accès refusé à ces commandes" });
    const email = autorise.trim().toLowerCase();
    const { data, error } = await supabase
      .from("commandes")
      .select("*")
      .ilike("client_email", email)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(await enrichirAvecTouchPoint(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boutique/commandes - toutes les commandes (admin)
router.get("/commandes", authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.query;
    let query = supabase.from("commandes").select("*").order("created_at", { ascending: false });
    if (statut && statut !== "tous") query = query.eq("statut", statut);
    const { data, error } = await query;
    if (error) throw error;
    res.json(await enrichirAvecTouchPoint(data, { avecAssistante: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boutique/commandes - créer une commande (public)
router.post("/commandes", async (req, res) => {
  try {
    const { client_nom, client_email, client_telephone, items, notes } = req.body;
    if (!client_nom || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "client_nom et items sont requis" });
    }
    const total = items.reduce((sum, i) => sum + (Number(i.prix_unitaire) * Number(i.quantite)), 0);
    const { data, error } = await supabase
      .from("commandes")
      .insert({ client_nom, client_email, client_telephone, items, total, notes, statut: "en_attente" })
      .select()
      .single();
    if (error) throw error;

    logAudit({
      acteur_email: client_email || null,
      acteur_nom:   client_nom   || null,
      plateforme:   "dash",
      action_type:  "COMMANDE_CREATED",
      module:       "boutique",
      entite_type:  "commande",
      entite_id:    data.id,
      detail:       `Nouvelle commande de ${client_nom} - total : ${total} FCFA (${items.length} article(s))`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.status(201).json(data);
    await notifyRole(["admin", "super_admin"], {
      type: "commande",
      titre: "🛒 Nouvelle commande boutique",
      message: `${client_nom} - ${items.length} article(s), total ${total} FCFA.`,
      meta: { commande_id: data.id },
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/boutique/commandes/:id - changer le statut (admin)
router.patch("/commandes/:id", authenticateAdmin, requirePermission("boutique","update"), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["statut", "notes"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabase
      .from("commandes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    logAudit({
      acteur_id:    req.user?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || req.user?.email,
      acteur_role:  req.role || "admin",
      plateforme:   "dash",
      action_type:  "COMMANDE_UPDATED",
      module:       "boutique",
      entite_type:  "commande",
      entite_id:    id,
      detail:       `Commande ${id} mise à jour - champs : ${Object.keys(updates).join(", ")}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boutique/commandes/:id - supprimer une commande (admin)
router.delete("/commandes/:id", authenticateAdmin, requirePermission("boutique","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("commandes").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Commande supprimée" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
