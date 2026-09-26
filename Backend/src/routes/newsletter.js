import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { sendNewsletterCampaign, getBrevoStatsForTag, sendNotificationEmail } from "../services/emailService.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════════════════
   DÉSINSCRIPTION - le lien au bas de chaque newsletter.

   Il visait jusqu'ici `FRONT_URL/newsletter/unsubscribe`, une page qui N'A JAMAIS EXISTÉ
   ni dans le site public ni ailleurs : l'abonné qui cliquait tombait sur une erreur, et
   la mention légale de désinscription n'était donc pas tenue.

   SERVIE PAR LE SERVEUR, et en HTML brut : un lien d'email doit fonctionner depuis
   n'importe quel client mail, sans dépendre du chargement d'une application React.

   EN GET, sans confirmation : les clients mail ne savent pas envoyer autre chose depuis un
   lien, et demander un second clic pour se désabonner est précisément ce que la règle
   interdit. Le geste reste réversible - `is_active` repasse à vrai à la ré-inscription,
   l'adresse n'est pas effacée.
══════════════════════════════════════════════════════════════════════════ */
const pageDesinscription = (titre, message, ton = "ok") => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px 32px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.06)">
    <div style="font-size:40px;line-height:1;margin-bottom:14px">${ton === "ok" ? "👋" : "⚠️"}</div>
    <h1 style="margin:0 0 10px;font-size:19px;color:#0f172a">${titre}</h1>
    <p style="margin:0;font-size:14px;line-height:1.65;color:#475569">${message}</p>
  </div>
</body></html>`;

router.get("/unsubscribe", async (req, res) => {
  const envoyer = (code, titre, message, ton) =>
    res.status(code).type("html").send(pageDesinscription(titre, message, ton));
  try {
    const { token } = req.query;
    let email = "";
    try { email = Buffer.from(String(token || ""), "base64").toString("utf8").trim().toLowerCase(); } catch {}
    if (!email || !email.includes("@")) {
      return envoyer(400, "Lien invalide",
        "Ce lien de désinscription n'est pas valide. Répondez simplement à l'un de nos emails et nous vous retirerons de la liste.", "ko");
    }

    const { data, error } = await supabase
      .from("newsletter").update({ is_active: false }).ilike("email", email).select("email");
    if (error) throw error;

    // Une adresse inconnue n'est pas une erreur pour celui qui clique : dans les deux cas,
    // il ne recevra plus rien. Lui montrer un message d'échec l'inquiéterait pour rien.
    if (!data?.length) {
      return envoyer(200, "Vous êtes désinscrit",
        `L'adresse <strong>${email}</strong> ne figure plus dans notre liste de diffusion.`);
    }
    return envoyer(200, "Désinscription enregistrée",
      `<strong>${email}</strong> ne recevra plus nos newsletters.<br><br>
       Vous pouvez vous réinscrire à tout moment depuis notre site.`);
  } catch (err) {
    console.error("[newsletter/unsubscribe]", err.message || err);
    return envoyer(500, "Une erreur est survenue",
      "Nous n'avons pas pu enregistrer votre désinscription. Répondez à cet email et nous le ferons manuellement.", "ko");
  }
});

// ── Inscription publique ──────────────────────────────────
router.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const { data, error } = await supabase
      .from("newsletter")
      .insert({ email: email.toLowerCase(), ip_address: ipAddress, user_agent: userAgent })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        /* Déjà présent : s'il s'était désinscrit, ce nouvel envoi du formulaire EST sa
           réinscription. Sans cette reprise, une adresse désinscrite restait inactive pour
           toujours et le visiteur n'avait aucun moyen de revenir. */
        const { data: reactive } = await supabase
          .from("newsletter").update({ is_active: true })
          .ilike("email", email.toLowerCase()).eq("is_active", false).select("email");
        if (reactive?.length) {
          return res.status(200).json({ message: "Votre inscription à la newsletter est réactivée." });
        }
        return res.status(409).json({ error: "Cet email est déjà inscrit." });
      }
      return res.status(500).json({ error: "Erreur lors de l'inscription" });
    }

    await sendNotificationEmail({
      email: data.email,
      titre: "🎉 Bienvenue dans la newsletter Binnie's English Training",
      message: "Merci de vous être inscrit(e) ! Vous recevrez désormais nos actualités, nouveaux cours et offres directement dans votre boîte mail.",
      tag: "newsletter_bienvenue",
    }).catch(err => console.error("[newsletter/subscribe] email confirmation:", err.message));

    res.status(201).json({ message: "Inscription réussie à la newsletter", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Liste des abonnés (admin) ─────────────────────────────
router.get("/subscribers", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("newsletter")
      .select("id, email, subscribed_at, ip_address")
      .order("subscribed_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ subscribers: data || [], total: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Supprimer un abonné (admin) ───────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("communication","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("newsletter")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Abonné supprimé" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Un apprenant profil "enfant" n'a pas d'email propre (prospect_email est celui du parent,
// souvent vide) - l'email réel à contacter est alors email_parent.
const emailDossier = (a) => (a.profil_type === "enfant" ? a.email_parent : a.prospect_email) || a.prospect_email || a.email_parent || null;

// ── Apprenants par type de coaching (admin) - pour le sélecteur de destinataires ──
router.get("/apprenants", authenticateAdmin, async (req, res) => {
  try {
    const { type_coaching } = req.query; // "groupe" | "prive" | undefined (tous)
    let q = supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, email_parent, profil_type, type_coaching")
      .eq("statut", "converti");
    if (type_coaching) q = q.eq("type_coaching", type_coaching);
    const { data, error } = await q.order("prospect_nom", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    const apprenants = (data || [])
      .map(a => ({ id: a.id, nom: a.prospect_nom, email: emailDossier(a), type_coaching: a.type_coaching }))
      .filter(a => a.email);
    res.json({ apprenants, total: apprenants.length });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// destinataires : { mode:"newsletter" } (défaut, abonnés du formulaire public)
//               | { mode:"segment", type_coaching:"groupe"|"prive" } (tous les apprenants convertis de ce type)
//               | { mode:"apprenant", assignation_id } (un seul apprenant précis)
async function resoudreEmails(destinataires) {
  const mode = destinataires?.mode || "newsletter";
  if (mode === "segment" || mode === "apprenant") {
    let q = supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, email_parent, profil_type, type_coaching")
      .eq("statut", "converti");
    if (mode === "segment") {
      if (!["groupe", "prive"].includes(destinataires?.type_coaching)) {
        throw new Error("type_coaching invalide (groupe ou prive)");
      }
      q = q.eq("type_coaching", destinataires.type_coaching);
    } else {
      if (!destinataires?.assignation_id) throw new Error("assignation_id requis");
      q = q.eq("id", destinataires.assignation_id);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return [...new Set((data || []).map(emailDossier).filter(Boolean))];
  }
  /* LES DÉSINSCRITS SONT EXCLUS. `is_active` existait dans la table mais n'était filtré
     NULLE PART : se désinscrire n'aurait rien changé, les campagnes seraient parties
     quand même. `neq(false)` plutôt que `eq(true)` : les lignes antérieures à cette
     colonne ont `is_active` à NULL, et elles sont bien des abonnées. */
  const { data: subscribers, error } = await supabase
    .from("newsletter")
    .select("email")
    .neq("is_active", false)
    .order("subscribed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (subscribers || []).map(s => s.email);
}

// Envoie réellement une campagne déjà créée (brouillon ou programmée) et met à jour son statut.
// Exportée pour être appelée aussi bien depuis la route manuelle que depuis le job cron.
export async function envoyerCampagneParId(id) {
  const { data: c, error } = await supabase.from("newsletter_campagnes").select("*").eq("id", id).single();
  if (error || !c) throw new Error("Campagne introuvable");
  if (c.statut === "envoyee") throw new Error("Campagne déjà envoyée");
  if (c.statut === "annulee") throw new Error("Campagne annulée");

  const emails = await resoudreEmails(c.destinataires);
  if (!emails.length) throw new Error("Aucun destinataire à contacter pour cette sélection");

  const { sent, failed } = await sendNewsletterCampaign({
    emails,
    sujet: c.sujet,
    contenu: c.contenu,
    piece_jointe_url: c.piece_jointe_url,
    piece_jointe_nom: c.piece_jointe_nom,
    tagCampagne: c.tag_brevo,
  });

  await supabase.from("newsletter_campagnes").update({
    statut: "envoyee",
    date_envoi: new Date().toISOString(),
    total_destinataires: emails.length,
    nb_envoyes: sent,
    nb_echecs: failed,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return { total: emails.length, sent, failed };
}

// ── Créer une campagne : brouillon, programmée, ou envoi immédiat ─
// action: "draft" | "schedule" (avec date_programmee) | "send" (immédiat)
router.post("/campaigns", authenticateAdmin, requirePermission("communication","create"), async (req, res) => {
  try {
    const { sujet, contenu, piece_jointe_url, piece_jointe_nom, destinataires, action, date_programmee } = req.body;
    if (!sujet || !contenu) return res.status(400).json({ error: "Sujet et contenu requis" });
    if (action === "schedule" && !date_programmee) return res.status(400).json({ error: "date_programmee requise pour programmer" });

    let emails = [];
    try { emails = await resoudreEmails(destinataires); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!emails.length) return res.status(404).json({ error: "Aucun destinataire à contacter pour cette sélection" });

    const statut = action === "schedule" ? "programmee" : action === "draft" ? "brouillon" : "envoyee";
    const insertPayload = {
      sujet, contenu,
      piece_jointe_url: piece_jointe_url || null,
      piece_jointe_nom: piece_jointe_nom || null,
      destinataires: destinataires || { mode: "newsletter" },
      statut: action === "send" ? "brouillon" : statut, // "brouillon" temporaire, on bascule à "envoyee" après l'envoi effectif
      date_programmee: action === "schedule" ? date_programmee : null,
      total_destinataires: emails.length,
      created_by: req.admin?.nom || req.admin?.email || null,
    };
    const { data: created, error: insErr } = await supabase.from("newsletter_campagnes").insert(insertPayload).select().single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    const tag = `campagne_${created.id}`;
    await supabase.from("newsletter_campagnes").update({ tag_brevo: tag }).eq("id", created.id);

    if (action !== "send") {
      return res.status(201).json({ message: action === "schedule" ? "Campagne programmée" : "Brouillon enregistré", campagne: { ...created, tag_brevo: tag } });
    }

    const { sent, failed } = await sendNewsletterCampaign({
      emails, sujet, contenu,
      piece_jointe_url: piece_jointe_url || null,
      piece_jointe_nom: piece_jointe_nom || null,
      tagCampagne: tag,
    });
    await supabase.from("newsletter_campagnes").update({
      statut: "envoyee", date_envoi: new Date().toISOString(), nb_envoyes: sent, nb_echecs: failed, updated_at: new Date().toISOString(),
    }).eq("id", created.id);

    res.json({ message: "Campagne envoyée", total: emails.length, sent, failed, campagne_id: created.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la création/l'envoi de la campagne" });
  }
});

// ── Liste paginée des campagnes, filtrable par date ───────
router.get("/campaigns", authenticateAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const from = (page - 1) * limit, to = from + limit - 1;

    let q = supabase.from("newsletter_campagnes").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (req.query.date_debut) q = q.gte("created_at", req.query.date_debut);
    if (req.query.date_fin) q = q.lte("created_at", req.query.date_fin + "T23:59:59");
    if (req.query.statut) q = q.eq("statut", req.query.statut);

    const { data, error, count } = await q.range(from, to);
    if (error) return res.status(500).json({ error: error.message });

    // KPIs agrégés sur l'ensemble des campagnes correspondant aux filtres (pas seulement la page
    // affichée) - une seconde requête légère, sans les colonnes texte volumineuses.
    let kq = supabase.from("newsletter_campagnes").select("statut, nb_envoyes, nb_echecs, total_destinataires");
    if (req.query.date_debut) kq = kq.gte("created_at", req.query.date_debut);
    if (req.query.date_fin)   kq = kq.lte("created_at", req.query.date_fin + "T23:59:59");
    if (req.query.statut)     kq = kq.eq("statut", req.query.statut);
    const { data: kData } = await kq;
    const kpis = (kData || []).reduce((acc, c) => {
      acc.total++;
      acc[c.statut] = (acc[c.statut] || 0) + 1;
      acc.total_envoyes += c.nb_envoyes || 0;
      acc.total_echecs += c.nb_echecs || 0;
      acc.total_destinataires += c.total_destinataires || 0;
      return acc;
    }, { total: 0, brouillon: 0, programmee: 0, envoyee: 0, annulee: 0, total_envoyes: 0, total_echecs: 0, total_destinataires: 0 });

    res.json({ campagnes: data || [], total: count || 0, page, limit, total_pages: Math.max(1, Math.ceil((count || 0) / limit)), kpis });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Détail d'une campagne + statistiques Brevo (ouvertures/clics) ─
router.get("/campaigns/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: c, error } = await supabase.from("newsletter_campagnes").select("*").eq("id", req.params.id).single();
    if (error || !c) return res.status(404).json({ error: "Campagne introuvable" });
    const stats = c.tag_brevo ? await getBrevoStatsForTag(c.tag_brevo) : null;
    res.json({ campagne: c, stats });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Modifier une campagne (brouillon ou programmée uniquement) ─
router.patch("/campaigns/:id", authenticateAdmin, requirePermission("communication","update"), async (req, res) => {
  try {
    const { data: c, error } = await supabase.from("newsletter_campagnes").select("statut").eq("id", req.params.id).single();
    if (error || !c) return res.status(404).json({ error: "Campagne introuvable" });
    if (!["brouillon", "programmee"].includes(c.statut)) return res.status(400).json({ error: "Seules les campagnes en brouillon ou programmées peuvent être modifiées" });

    const { sujet, contenu, piece_jointe_url, piece_jointe_nom, destinataires, date_programmee } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (sujet !== undefined) patch.sujet = sujet;
    if (contenu !== undefined) patch.contenu = contenu;
    if (piece_jointe_url !== undefined) patch.piece_jointe_url = piece_jointe_url || null;
    if (piece_jointe_nom !== undefined) patch.piece_jointe_nom = piece_jointe_nom || null;
    if (date_programmee !== undefined) { patch.date_programmee = date_programmee || null; patch.statut = date_programmee ? "programmee" : "brouillon"; }
    if (destinataires !== undefined) {
      let emails = [];
      try { emails = await resoudreEmails(destinataires); } catch (e) { return res.status(400).json({ error: e.message }); }
      patch.destinataires = destinataires;
      patch.total_destinataires = emails.length;
    }

    const { data: updated, error: updErr } = await supabase.from("newsletter_campagnes").update(patch).eq("id", req.params.id).select().single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    res.json({ message: "Campagne mise à jour", campagne: updated });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Annuler une campagne programmée ou un brouillon ───────
router.post("/campaigns/:id/annuler", authenticateAdmin, requirePermission("communication","update"), async (req, res) => {
  try {
    const { data: c, error } = await supabase.from("newsletter_campagnes").select("statut").eq("id", req.params.id).single();
    if (error || !c) return res.status(404).json({ error: "Campagne introuvable" });
    if (!["brouillon", "programmee"].includes(c.statut)) return res.status(400).json({ error: "Cette campagne ne peut plus être annulée" });
    const { data: updated, error: updErr } = await supabase.from("newsletter_campagnes").update({ statut: "annulee", updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single();
    if (updErr) return res.status(500).json({ error: updErr.message });
    res.json({ message: "Campagne annulée", campagne: updated });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Envoyer maintenant un brouillon ou une campagne programmée ─
router.post("/campaigns/:id/envoyer", authenticateAdmin, requirePermission("communication","create"), async (req, res) => {
  try {
    const r = await envoyerCampagneParId(req.params.id);
    res.json({ message: "Campagne envoyée", ...r });
  } catch (err) {
    res.status(400).json({ error: err.message || "Erreur lors de l'envoi" });
  }
});

export default router;
