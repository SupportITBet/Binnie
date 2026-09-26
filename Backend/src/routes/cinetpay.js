import express from "express";
import { v4 as uuidv4 } from "uuid";
import { CinetPayClient, CHANNELS, parseNotification, verifyNotification } from "cinetpay-js";
import supabase from "../config/supabase.js";
import { marquerConverti } from "../services/cycleProspect.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route cinetpay chargée");

// ── SDK cinetpay-js ───────────────────────────────────────────
const COUNTRY      = process.env.CINETPAY_COUNTRY || "CI";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const BACKEND_URL  = process.env.BACKEND_URL  || "http://localhost:5001";

const cinetpayClient = new CinetPayClient({
  credentials: {
    [COUNTRY]: {
      apiKey:      process.env.CINETPAY_APIKEY,
      apiPassword: process.env.CINETPAY_APIPASSWORD,
    },
  },
  debug: process.env.NODE_ENV !== "production",
});

// ── POST /initiate ────────────────────────────────────────────
// Le frontend appelle cette route pour démarrer un paiement CinetPay
// Body : { client_nom, client_prenom, client_email, client_telephone, client_ville,
//          offre_key, offre_label, offre_formule, offre_type, niveau, objectif, message, montant }
router.post("/initiate", async (req, res) => {
  try {
    const {
      client_nom, client_prenom, client_email, client_telephone, client_ville,
      offre_key, offre_label, offre_formule, offre_type,
      niveau, objectif, message,
      montant,
    } = req.body;

    if (!client_nom?.trim())  return res.status(400).json({ error: "Nom du client requis" });
    if (!client_email?.trim()) return res.status(400).json({ error: "Email du client requis" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const transaction_id = `BET-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // 1. Initier le paiement auprès de CinetPay
    let cpResponse;
    try {
      cpResponse = await cinetpayClient.payment.initialize({
        currency:              "XOF",
        merchantTransactionId: transaction_id,
        amount:                Number(montant),
        lang:                  "fr",
        designation:           `${offre_label || "Formation BET"} - ${client_nom.trim()}`.slice(0, 100),
        clientEmail:           client_email.trim().toLowerCase(),
        clientFirstName:       (client_prenom?.trim() || client_nom.trim()).slice(0, 255),
        clientLastName:        client_nom.trim().slice(0, 255),
        successUrl:            `${FRONTEND_URL}/paiement/retour?transaction_id=${transaction_id}`,
        failedUrl:             `${FRONTEND_URL}/paiement/retour?transaction_id=${transaction_id}`,
        notifyUrl:             `${BACKEND_URL}/api/cinetpay/notify`,
        channel:               CHANNELS.PUSH,
      }, COUNTRY);
    } catch (cpErr) {
      console.error("Erreur CinetPay initiate:", cpErr);
      return res.status(502).json({ error: cpErr.description || cpErr.message || "Erreur CinetPay" });
    }

    // 2. Sauvegarder en base (statut: en_attente), avec le notify_token pour vérifier
    //    l'authenticité du webhook plus tard (fallback si la colonne n'existe pas encore)
    const payloadFull = {
      transaction_id,
      client_nom:       client_nom.trim(),
      client_prenom:    client_prenom?.trim()    || null,
      client_email:     client_email.trim().toLowerCase(),
      client_telephone: client_telephone?.trim() || null,
      client_ville:     client_ville?.trim()     || null,
      offre_key:        offre_key                || null,
      offre_label:      offre_label              || null,
      offre_formule:    offre_formule            || null,
      offre_type:       offre_type               || null,
      niveau:           niveau?.trim()           || null,
      objectif:         objectif?.trim()         || null,
      message:          message?.trim()          || null,
      montant:          Number(montant),
      statut:           "en_attente",
      notify_token:     cpResponse.notifyToken,
    };

    let { error: dbErr } = await supabase.from("paiements_cinetpay").insert(payloadFull);

    if (dbErr?.code === "PGRST204" || dbErr?.code === "42703") {
      // Colonne notify_token pas encore migrée (voir sql/cinetpay_notify_token.sql) → réessai sans elle
      console.warn("⚠️ Colonne notify_token manquante, réessai sans elle:", dbErr.message);
      const { notify_token, ...payloadSansToken } = payloadFull;
      ({ error: dbErr } = await supabase.from("paiements_cinetpay").insert(payloadSansToken));
    }

    if (dbErr) {
      console.error("Erreur DB initiate:", dbErr);
      return res.status(500).json({ error: dbErr.message });
    }

    res.json({
      transaction_id,
      payment_url:   cpResponse.paymentUrl,
      payment_token: cpResponse.paymentToken,
    });
  } catch (err) {
    console.error("Erreur /cinetpay/initiate:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /notify ──────────────────────────────────────────────
// Webhook appelé automatiquement par CinetPay quand le paiement est confirmé
// IMPORTANT : cette route est publique (pas d'auth), CinetPay l'appelle directement
router.post("/notify", async (req, res) => {
  try {
    let notification;
    try {
      notification = parseNotification(req.body);
    } catch (parseErr) {
      console.error("Notification CinetPay illisible:", parseErr, req.body);
      return res.status(400).json({ error: "Notification invalide" });
    }

    const { data: existing } = await supabase
      .from("paiements_cinetpay")
      .select("id, client_nom, client_email, client_telephone, offre_label, offre_formule, montant, assistante_id, message, notify_token")
      .eq("transaction_id", notification.merchantTransactionId)
      .single();

    if (!existing) {
      console.error("Transaction inconnue:", notification.merchantTransactionId);
      return res.status(404).json({ error: "Transaction inconnue" });
    }

    // Vérifie l'authenticité du webhook si le notify_token a été stocké à l'initiation
    if (existing.notify_token && !verifyNotification(existing.notify_token, notification.notifyToken)) {
      console.error("Notify token invalide pour", notification.merchantTransactionId);
      return res.status(401).json({ error: "Token invalide" });
    }

    // 1. Vérifier le statut réel auprès de CinetPay (ne pas se fier au seul webhook)
    const status = await cinetpayClient.payment.getStatus(notification.transactionId, COUNTRY);
    const isValid = status.status === "SUCCESS";

    // 2. Mettre à jour le statut en base
    await supabase.from("paiements_cinetpay").update({
      statut:       isValid ? "validé" : "échoué",
      cinetpay_ref: notification.transactionId,
    }).eq("transaction_id", notification.merchantTransactionId);

    // 3. Si validé : créer une entrée dans paiements_parcours
    if (isValid) {
      // Détecter si c'est un paiement apprenant (metadata JSON dans message)
      let apprMeta = null;
      try { apprMeta = existing.message ? JSON.parse(existing.message) : null; } catch (_) {}
      const isApprenantPaiement = apprMeta?.context === "apprenant" && apprMeta?.assignation_id;

      const inscriptionLabel = isApprenantPaiement
        ? "Paiement formation - Espace apprenant"
        : ([
            existing.offre_label   ? `offre::${existing.offre_label}`  : null,
            existing.offre_formule ? existing.offre_formule             : null,
          ].filter(Boolean).join("||") || null);

      await supabase.from("paiements_parcours").insert({
        commercial_id:   existing.assistante_id || (isApprenantPaiement ? apprMeta.apprenant_id : "00000000-0000-0000-0000-000000000000"),
        client:          existing.client_nom,
        email:           existing.client_email,
        telephone:       existing.client_telephone || null,
        inscription:     inscriptionLabel,
        assignation_id:  isApprenantPaiement ? apprMeta.assignation_id : null,
        montant_du:      existing.montant,
        montant_recu:    existing.montant,
        date_paiement:   new Date().toISOString().slice(0, 10),
        mode_paiement:   "CinetPay",
        statut:          "validé",
        ref_transaction: notification.merchantTransactionId,
        notes:           `Paiement en ligne CinetPay - ref: ${notification.transactionId}`,
      });

      // Même règle que sur TouchPoint : un paiement confirmé acquiert le dossier.
      if (isApprenantPaiement && apprMeta.assignation_id) await marquerConverti(apprMeta.assignation_id);

      // Si paiement apprenant : mettre à jour la tranche + notifier le commercial
      if (isApprenantPaiement) {
        const { data: assignation } = await supabase
          .from("assignations_parcours")
          .select("plan_paiement, commercial_id")
          .eq("id", apprMeta.assignation_id)
          .maybeSingle();

        if (assignation?.plan_paiement?.tranches && apprMeta.tranche_id) {
          const tranches = assignation.plan_paiement.tranches.map(t =>
            t.id === apprMeta.tranche_id
              ? { ...t, statut: "payé", date_paiement_effectif: new Date().toISOString().slice(0, 10) }
              : t
          );
          await supabase.from("assignations_parcours")
            .update({ plan_paiement: { ...assignation.plan_paiement, tranches } })
            .eq("id", apprMeta.assignation_id);
        }

        // Notifier le commercial responsable
        const commercialId = assignation?.commercial_id || existing.assistante_id;
        if (commercialId) {
          const trancheLabel = (() => {
            const t = assignation?.plan_paiement?.tranches?.find(t => t.id === apprMeta.tranche_id);
            return t?.label || "Paiement formation";
          })();
          await supabase.from("notifications").insert({
            user_id: commercialId,
            type:    "paiement",
            titre:   `Paiement reçu - ${existing.client_nom}`,
            message: `${existing.client_nom} a payé ${existing.montant.toLocaleString()} FCFA (${trancheLabel}) via CinetPay.`,
            lu:      false,
            meta: {
              transaction_id:  notification.merchantTransactionId,
              assignation_id:  apprMeta.assignation_id,
              apprenant_id:    apprMeta.apprenant_id,
              montant:         existing.montant,
              tranche_id:      apprMeta.tranche_id || null,
            },
          });
        }
      }
    }

    // CinetPay attend un 200 OK pour ne pas renotifier
    res.status(200).json({ message: "OK" });
  } catch (err) {
    console.error("Erreur /cinetpay/notify:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /verify ──────────────────────────────────────────────
// Le frontend peut vérifier manuellement le statut après retour
router.post("/verify", async (req, res) => {
  try {
    const { transaction_id } = req.body;
    if (!transaction_id) return res.status(400).json({ error: "transaction_id requis" });

    const { data, error } = await supabase
      .from("paiements_cinetpay")
      .select("transaction_id, statut, montant, offre_label, offre_formule, client_nom, client_email, created_at")
      .eq("transaction_id", transaction_id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Transaction introuvable" });

    res.json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /admin/all ────────────────────────────────────────────
// Dashboard admin/assistante : tous les paiements CinetPay reçus
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const { statut, traitee } = req.query;

    let q = supabase
      .from("paiements_cinetpay")
      .select("*")
      .order("created_at", { ascending: false });

    if (statut)  q = q.eq("statut", statut);
    if (traitee !== undefined) q = q.eq("traitee", traitee === "true");

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    res.json({ paiements: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /admin/:id/traiter ──────────────────────────────────
// Le Super Admin assigne un paiement à une assistante et le marque traité
router.patch("/admin/:id/traiter", authenticateAdmin, async (req, res) => {
  try {
    const { notes_assistante, assistante_id } = req.body;

    // Récupérer le nom de l'assistante pour l'audit
    let assistante_nom = null;
    if (assistante_id) {
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("prenom, nom")
        .eq("id", assistante_id)
        .maybeSingle();
      if (u) assistante_nom = `${u.prenom||""} ${u.nom||""}`.trim();
    }

    const { data, error } = await supabase
      .from("paiements_cinetpay")
      .update({
        traitee:          true,
        assistante_id:    assistante_id || req.user.id,
        assistante_nom:   assistante_nom,
        notes_assistante: notes_assistante?.trim() || null,
        date_traitement:  new Date().toISOString(),
        assigned_by:      req.profil?.id,
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
