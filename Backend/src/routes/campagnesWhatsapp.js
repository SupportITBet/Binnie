import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

/**
 * Campagnes WhatsApp - relance des prospects collectés par formulaire.
 *
 * Deux règles de Meta gouvernent tout ce fichier. Elles ne sont pas négociables, et les
 * ignorer ferait échouer la première campagne - au mieux.
 *
 *  · LA FENÊTRE DE 24 HEURES. Passé 24 h depuis le dernier message de la personne, on ne
 *    peut plus écrire librement : seul un MODÈLE PRÉ-APPROUVÉ par Meta passe. Une campagne
 *    sortante est toujours dans ce cas. D'où `whatsapp_modeles`, qui n'est pas un confort
 *    mais une condition d'existence.
 *
 *  · LE CONSENTEMENT, SOUS PEINE DE BANNISSEMENT. Écrire à un numéro qui ne l'a pas demandé
 *    fait signaler l'expéditeur, et un numéro trop signalé est banni DÉFINITIVEMENT, avec
 *    le compte WhatsApp Business de BET. Les destinataires sans opt-in sont donc EXCLUS et
 *    comptés à part - jamais ignorés en silence.
 */

const ROLES_WA = ["marketing", "super_admin", "admin", "manager"];
const requireWa = (req, res, next) => {
  if (!ROLES_WA.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à l'équipe marketing" });
  }
  next();
};

/** Même normalisation que le formulaire public : un numéro, une écriture. */
const PAYS_DEFAUT = "225";
function normaliserTelephone(brut) {
  if (!brut) return null;
  let t = String(brut).trim();
  const plus = t.startsWith("+") || t.startsWith("00");
  t = t.replace(/\D/g, "");
  if (t.startsWith("00")) t = t.slice(2);
  if (!plus && (t.length === 8 || t.length === 10)) t = PAYS_DEFAUT + t;
  if (t.length < 8 || t.length > 15) return null;
  return "+" + t;
}

/** Remplace {{1}}, {{2}}… par les valeurs fournies. */
const rendreModele = (corps, variables = {}) =>
  String(corps || "").replace(/\{\{(\d+)\}\}/g, (_, n) => variables[n] ?? variables[`var${n}`] ?? `{{${n}}}`);

/* ══════════════════════════════════════════════════════════════
   MODÈLES
══════════════════════════════════════════════════════════════ */

router.get("/modeles", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("whatsapp_modeles").select("*").order("created_at", { ascending: false });
    if (error) { if (error.code === "42P01") return res.json({ modeles: [] }); throw error; }
    res.json({ modeles: data || [] });
  } catch (err) {
    console.error("[wa/modeles GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.post("/modeles", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { nom, corps, langue, categorie, variables } = req.body || {};
    if (!nom?.trim() || !corps?.trim()) {
      return res.status(400).json({ error: "Le nom et le corps du message sont requis" });
    }
    // Le nom doit correspondre EXACTEMENT à celui déposé chez Meta : c'est lui que l'API
    // reçoit, et une majuscule de trop fait échouer l'envoi sans message clair.
    const { data, error } = await supabase.from("whatsapp_modeles").insert({
      nom: nom.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      corps: corps.trim(),
      langue: langue || "fr",
      categorie: categorie || "MARKETING",
      variables: Array.isArray(variables) ? variables : [],
      statut: "brouillon",
    }).select().single();
    if (error) throw error;
    res.status(201).json({ modele: data });
  } catch (err) {
    console.error("[wa/modeles POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

router.patch("/modeles/:id", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const maj = {};
    for (const c of ["nom", "corps", "langue", "categorie", "variables", "statut", "motif_rejet"]) {
      if (req.body[c] !== undefined) maj[c] = req.body[c];
    }
    if (!Object.keys(maj).length) return res.status(400).json({ error: "Aucune modification" });
    const { data, error } = await supabase
      .from("whatsapp_modeles").update(maj).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ modele: data });
  } catch (err) {
    console.error("[wa/modeles PATCH]", err.message || err);
    res.status(500).json({ error: "Modification impossible" });
  }
});

router.delete("/modeles/:id", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { error } = await supabase.from("whatsapp_modeles").delete().eq("id", req.params.id);
    // Un modèle utilisé par une campagne est protégé par ON DELETE RESTRICT : on le dit.
    if (error) {
      if (error.code === "23503") {
        return res.status(409).json({ error: "Ce modèle a servi à une campagne : il ne peut plus être supprimé." });
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[wa/modeles DELETE]", err.message || err);
    res.status(500).json({ error: "Suppression impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   APERÇU DE L'AUDIENCE - avant de créer quoi que ce soit
══════════════════════════════════════════════════════════════ */

/**
 * Qui recevrait la campagne, et surtout qui ne la recevrait PAS.
 *
 * L'écart entre les deux est l'information utile : une base sans consentement ne se
 * découvre pas au moment de l'envoi.
 */
async function calculerAudience(filtres = {}) {
  const { formulaire_id, diffusion_id, statut, du, au } = filtres;

  let q = supabase.from("campagne_reponses")
    .select("id, nom, telephone, consentement, diffusion_id, created_at, formulaire_id")
    .not("telephone", "is", null);
  if (formulaire_id) q = q.eq("formulaire_id", formulaire_id);
  if (diffusion_id)  q = q.eq("diffusion_id", diffusion_id);
  if (statut)        q = q.eq("statut", statut);
  if (du) q = q.gte("created_at", `${du}T00:00:00`);
  if (au) q = q.lte("created_at", `${au}T23:59:59`);

  const { data: reps, error } = await q;
  if (error) throw error;

  // Un numéro, une personne : le même prospect peut avoir répondu à deux formulaires.
  const parNumero = new Map();
  for (const r of reps || []) {
    const tel = normaliserTelephone(r.telephone);
    if (!tel) continue;
    // `formulaire_id` suit le destinataire : une campagne peut viser plusieurs
    // récoltes, et sans lui on ne saurait pas laquelle a fourni ce numéro.
    if (!parNumero.has(tel)) parNumero.set(tel, { telephone: tel, nom: r.nom, reponse_id: r.id, formulaire_id: r.formulaire_id || null, consentement: !!r.consentement });
    else if (r.consentement) parNumero.get(tel).consentement = true;
  }

  // L'opt-in en base PRIME sur la case cochée : quelqu'un qui s'est désinscrit depuis
  // ne doit plus être joint, même si sa réponse portait un consentement.
  const numeros = [...parNumero.keys()];
  if (numeros.length) {
    const { data: optins } = await supabase
      .from("whatsapp_optin").select("telephone, consenti").in("telephone", numeros);
    (optins || []).forEach(o => {
      const e = parNumero.get(o.telephone);
      if (e) e.consentement = o.consenti === true;
    });
  }

  const tous = [...parNumero.values()];
  const joignables = tous.filter(d => d.consentement);

  return {
    total: tous.length,
    joignables: joignables.length,
    sans_optin: tous.length - joignables.length,
    destinataires: joignables,
    apercu_exclus: tous.filter(d => !d.consentement).slice(0, 20),
  };
}

router.post("/audience", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const a = await calculerAudience(req.body || {});
    // La liste complète ne sort pas de l'API : l'écran affiche des compteurs et un
    // échantillon, pas 500 numéros qu'il n'a aucune raison de manipuler.
    res.json({ ...a, destinataires: a.destinataires.slice(0, 20) });
  } catch (err) {
    console.error("[wa/audience POST]", err.message || err);
    res.status(500).json({ error: "Calcul de l'audience impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   CAMPAGNES
══════════════════════════════════════════════════════════════ */

router.get("/", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("campagnes_whatsapp").select("*").order("created_at", { ascending: false });
    if (error) { if (error.code === "42P01") return res.json({ campagnes: [] }); throw error; }

    const modIds = [...new Set((data || []).map(c => c.modele_id).filter(Boolean))];
    const { data: mods } = modIds.length
      ? await supabase.from("whatsapp_modeles").select("id, nom, corps, statut").in("id", modIds)
      : { data: [] };
    const mapM = Object.fromEntries((mods || []).map(m => [m.id, m]));

    res.json({ campagnes: (data || []).map(c => ({ ...c, modele: mapM[c.modele_id] || null })) });
  } catch (err) {
    console.error("[wa GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/**
 * Crée la campagne et FIGE ses destinataires.
 *
 * Les envois sont écrits tout de suite, en `en_attente`. Recalculer l'audience au moment
 * de l'envoi la ferait changer entre la préparation et le départ - une réponse arrivée
 * entre-temps, un consentement retiré - et personne ne saurait plus à qui le message est
 * réellement parti.
 */
router.post("/", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { nom, modele_id, variables, filtres, campagne_id } = req.body || {};
    if (!nom?.trim()) return res.status(400).json({ error: "Donnez un nom à la campagne" });
    if (!modele_id)   return res.status(400).json({ error: "Choisissez un modèle de message" });

    const { data: modele } = await supabase
      .from("whatsapp_modeles").select("*").eq("id", modele_id).maybeSingle();
    if (!modele) return res.status(404).json({ error: "Modèle introuvable" });

    // Un modèle non approuvé par Meta est refusé à l'envoi : autant le dire maintenant,
    // pendant qu'on prépare, plutôt qu'au moment du départ.
    if (modele.statut !== "approuve") {
      return res.status(409).json({
        error: `Le modèle « ${modele.nom} » n'est pas encore approuvé par Meta. Une campagne sortante ne peut partir qu'avec un modèle approuvé.`,
      });
    }

    // Appel DIRECT et non un aller-retour HTTP vers sa propre API : passer par le réseau
    // pour se parler à soi-même ajoute une latence, une dépendance au port configuré, et
    // un point de panne supplémentaire.
    const aud = await calculerAudience(filtres || {});
    if (!aud.joignables) {
      return res.status(409).json({
        error: aud.total
          ? `Aucun des ${aud.total} contacts n'a donné son consentement. Écrire sans accord ferait bannir le numéro WhatsApp de BET.`
          : "Aucun destinataire ne correspond à ces filtres.",
      });
    }

    const base = {
      nom: nom.trim(),
      campagne_id: campagne_id || null,
      modele_id,
      variables: variables && typeof variables === "object" ? variables : {},
      destinataires: filtres || {},
      statut: "brouillon",
      total_destinataires: aud.joignables,
      nb_sans_optin: aud.sans_optin,
      created_by: req.profil?.id || null,
    };
    // Les récoltes réellement touchées, relevées sur les destinataires figés.
    const recoltes = [...new Set((aud.destinataires || []).map(d => d.formulaire_id).filter(Boolean))];

    /* La colonne `formulaire_ids` vient d'une migration qui n'est peut-être pas encore
       jouée sur cette base. On tente AVEC, et on retombe SANS plutôt que de casser la
       création de campagne : perdre l'attribution multi-récoltes est un désagrément,
       ne plus pouvoir créer de campagne du tout en est un autre. */
    let camp = null;
    {
      const essai = await supabase.from("campagnes_whatsapp")
        .insert({ ...base, formulaire_ids: recoltes }).select().single();
      if (essai.error?.code === "42703") {
        console.warn("[wa] colonne formulaire_ids absente - jouez campagnes_email_historique.sql");
        const repli = await supabase.from("campagnes_whatsapp").insert(base).select().single();
        if (repli.error) throw repli.error;
        camp = repli.data;
      } else {
        if (essai.error) throw essai.error;
        camp = essai.data;
      }
    }

    const lignes = (aud.destinataires || []).map(d => ({
      campagne_wa_id: camp.id,
      telephone: d.telephone,
      reponse_id: d.reponse_id || null,
      formulaire_id: d.formulaire_id || null,
      statut: "en_attente",
    }));
    if (lignes.length) {
      const env = await supabase.from("whatsapp_envois").insert(lignes);
      if (env.error?.code === "42703") {
        await supabase.from("whatsapp_envois")
          .insert(lignes.map(({ formulaire_id, ...reste }) => reste));
      }
    }

    res.status(201).json({ campagne: camp, destinataires: lignes.length, sans_optin: aud.sans_optin });
  } catch (err) {
    console.error("[wa POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   ENVOI
══════════════════════════════════════════════════════════════ */

/**
 * Envoie un message WhatsApp via Brevo.
 *
 * Brevo plutôt que l'API Cloud de Meta en direct : la clé est déjà configurée et en
 * production pour l'e-mail, un seul compte et une seule facture. Meta en direct est moins
 * cher au volume, mais c'est une intégration entière à écrire et à maintenir.
 *
 * Renvoie `{ ok, message_id, erreur }` - jamais d'exception : un destinataire en échec ne
 * doit pas arrêter la campagne pour les autres.
 */
async function envoyerViaBrevo({ telephone, modele, variables }) {
  const cle = process.env.BREVO_API_KEY;
  const expediteur = process.env.BREVO_WHATSAPP_SENDER;

  if (!cle) return { ok: false, erreur: "BREVO_API_KEY absente de la configuration" };
  if (!expediteur) return { ok: false, erreur: "BREVO_WHATSAPP_SENDER absent - numéro WhatsApp Business non configuré" };

  try {
    const r = await fetch("https://api.brevo.com/v3/whatsapp/sendMessage", {
      method: "POST",
      headers: { "api-key": cle, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        senderNumber: expediteur,
        contactNumbers: [telephone.replace("+", "")],
        templateId: modele.nom,
        params: variables || {},
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erreur: d.message || `Brevo a répondu ${r.status}` };
    return { ok: true, message_id: d.messageId || d.id || null };
  } catch (e) {
    return { ok: false, erreur: e.message || "Appel Brevo impossible" };
  }
}

router.post("/:id/envoyer", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { data: camp } = await supabase
      .from("campagnes_whatsapp").select("*").eq("id", req.params.id).maybeSingle();
    if (!camp) return res.status(404).json({ error: "Campagne introuvable" });
    if (camp.statut === "envoyee" || camp.statut === "en_cours") {
      return res.status(409).json({ error: "Cette campagne a déjà été envoyée." });
    }

    const { data: modele } = await supabase
      .from("whatsapp_modeles").select("*").eq("id", camp.modele_id).maybeSingle();
    if (!modele || modele.statut !== "approuve") {
      return res.status(409).json({ error: "Le modèle n'est plus approuvé - envoi refusé." });
    }

    const { data: envois } = await supabase
      .from("whatsapp_envois").select("id, telephone, statut").eq("campagne_wa_id", camp.id).eq("statut", "en_attente");
    if (!envois?.length) return res.status(409).json({ error: "Aucun destinataire en attente." });

    await supabase.from("campagnes_whatsapp")
      .update({ statut: "en_cours", date_envoi: new Date().toISOString() }).eq("id", camp.id);

    let envoyes = 0, echecs = 0;
    const erreurs = [];
    for (const e of envois) {
      const r = await envoyerViaBrevo({ telephone: e.telephone, modele, variables: camp.variables });
      await supabase.from("whatsapp_envois").update({
        statut: r.ok ? "envoye" : "echec",
        message_id: r.message_id || null,
        erreur: r.ok ? null : (r.erreur || "").slice(0, 300),
        envoye_le: r.ok ? new Date().toISOString() : null,
      }).eq("id", e.id);
      if (r.ok) envoyes++;
      else { echecs++; if (erreurs.length < 3) erreurs.push(r.erreur); }
    }

    // « envoyee » seulement si au moins un message est parti : une campagne dont TOUT a
    // échoué n'est pas envoyée, et l'afficher ainsi masquerait une configuration absente.
    await supabase.from("campagnes_whatsapp").update({
      statut: envoyes > 0 ? "envoyee" : "echouee",
      nb_envoyes: envoyes, nb_echecs: echecs,
      updated_at: new Date().toISOString(),
    }).eq("id", camp.id);

    res.json({
      ok: envoyes > 0, envoyes, echecs,
      erreurs: [...new Set(erreurs)],
      message: envoyes > 0
        ? `${envoyes} message${envoyes > 1 ? "s" : ""} envoyé${envoyes > 1 ? "s" : ""}${echecs ? `, ${echecs} en échec` : ""}.`
        : "Aucun message n'a pu partir.",
    });
  } catch (err) {
    console.error("[wa envoyer]", err.message || err);
    res.status(500).json({ error: "Envoi impossible" });
  }
});

router.get("/:id/envois", authenticateAdmin, requireWa, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("whatsapp_envois").select("*").eq("campagne_wa_id", req.params.id).order("created_at");
    if (error) throw error;
    res.json({ envois: data || [] });
  } catch (err) {
    console.error("[wa envois GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/**
 * L'état de la configuration d'envoi.
 *
 * L'écran doit pouvoir dire CE QUI MANQUE avant qu'on prépare une campagne pour rien.
 */
router.get("/configuration", authenticateAdmin, requireWa, async (req, res) => {
  const { count } = await supabase
    .from("whatsapp_modeles").select("*", { count: "exact", head: true }).eq("statut", "approuve");
  res.json({
    brevo_cle:       !!process.env.BREVO_API_KEY,
    numero_expediteur: !!process.env.BREVO_WHATSAPP_SENDER,
    modeles_approuves: count || 0,
    pret: !!process.env.BREVO_API_KEY && !!process.env.BREVO_WHATSAPP_SENDER && (count || 0) > 0,
  });
});

export { rendreModele };
export default router;
