import express from "express";
import crypto from "crypto";
import supabase from "../config/supabase.js";

const router = express.Router();

/**
 * Le formulaire de campagne, côté PUBLIC.
 *
 * C'est ce que le QR ouvre. Aucun jeton, aucun compte : un prospect qui scanne une
 * affiche dans la rue n'a rien à se connecter. D'où trois précautions qui n'ont pas
 * d'équivalent dans le reste de l'application.
 *
 *  · RIEN D'INTERNE NE SORT. La réponse ne contient que ce qu'il faut pour afficher le
 *    formulaire - pas d'identifiants de campagne, pas d'assignee, pas de statistiques.
 *
 *  · LA SOUMISSION EST LIMITÉE EN DÉBIT, par empreinte d'adresse. Une adresse publique
 *    sans limite se fait remplir de bruit en une nuit.
 *
 *  · LES CHAMPS SONT RELUS EN BASE à la soumission. Ce que le client envoie ne décide de
 *    rien : ni les questions posées, ni ce qui est obligatoire, ni le formulaire ouvert.
 */

/** L'IP n'est jamais conservée en clair : son empreinte suffit à repérer un robot. */
const empreinte = (req) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
  return ip ? crypto.createHash("sha256").update(ip + (process.env.SUPABASE_SERVICE_KEY || "sel")).digest("hex").slice(0, 32) : null;
};

/* ── Limitation de débit, en mémoire ─────────────────────────────────────
   Volontairement simple : par instance, remise à zéro au redémarrage. Ce n'est pas une
   défense contre une attaque déterminée - c'est un garde-fou contre le remplissage
   automatique, qui est le risque réel sur une adresse imprimée sur une affiche. */
const FENETRE_MS = 10 * 60 * 1000;
const MAX_PAR_FENETRE = 5;
const envois = new Map(); // empreinte -> number[] (horodatages)

function tropDEnvois(cle) {
  if (!cle) return false;
  const maintenant = Date.now();
  const recents = (envois.get(cle) || []).filter(t => maintenant - t < FENETRE_MS);
  if (recents.length >= MAX_PAR_FENETRE) { envois.set(cle, recents); return true; }
  recents.push(maintenant);
  envois.set(cle, recents);
  if (envois.size > 5000) envois.clear();   // garde-fou memoire
  return false;
}

/**
 * Le téléphone au format international, sans espace ni séparateur.
 *
 * `whatsapp_optin` impose `^\+[0-9]{8,15}$` - et pour cause : c'est la clé qui identifie
 * un correspondant. « 07 94 44 43 05 », « +225 0794444305 » et « 0794444305 » désignent
 * la même personne, et la garder sous trois écritures ferait trois lignes d'opt-in, trois
 * envois, et un signalement pour spam.
 *
 * Renvoie `null` quand le numéro n'est pas exploitable : mieux vaut pas d'opt-in qu'un
 * opt-in sur un numéro inventé.
 */
const PAYS_DEFAUT = "225";   // Côte d'Ivoire
function normaliserTelephone(brut) {
  if (!brut) return null;
  let t = String(brut).trim();
  const plus = t.startsWith("+") || t.startsWith("00");
  t = t.replace(/\D/g, "");
  if (t.startsWith("00")) t = t.slice(2);
  // Numéro local ivoirien (8 ou 10 chiffres) : on prefixe l'indicatif. Sans le `+`
  // d'origine, on ne suppose rien d'autre - un numéro etranger mal saisi resterait faux.
  if (!plus && (t.length === 8 || t.length === 10)) t = PAYS_DEFAUT + t;
  if (t.length < 8 || t.length > 15) return null;
  return "+" + t;
}

/** Les types qui n'attendent aucune réponse : ils structurent la page. */
const SANS_REPONSE = new Set(["section", "information"]);

/* ══════════════════════════════════════════════════════════════
   GET /api/public/formulaires/:slug - ce que le QR ouvre
══════════════════════════════════════════════════════════════ */
router.get("/formulaires/:slug", async (req, res) => {
  try {
    const { data: form } = await supabase
      .from("campagne_formulaires")
      .select("id, slug, titre, description, statut, ouvre_le, ferme_le, message_merci, message_ferme, couleur, image_url, illustration_url, texte_consentement, redirection_url")
      .eq("slug", req.params.slug)
      .maybeSingle();

    if (!form) return res.status(404).json({ error: "Ce formulaire n'existe pas." });

    // Un brouillon n'est pas public : il n'a pas encore d'existence pour le monde.
    if (form.statut === "brouillon") return res.status(404).json({ error: "Ce formulaire n'existe pas." });

    /* UN FORMULAIRE FERMÉ RÉPOND QUAND MÊME. Un QR imprimé survit à la campagne :
       quelqu'un scannera une affiche oubliée dans six mois, et lui renvoyer une erreur
       serait le pire accueil possible. On affiche le message de clôture. */
    const maintenant = new Date();
    const pasEncore = form.ouvre_le && new Date(form.ouvre_le) > maintenant;
    const deja      = form.ferme_le && new Date(form.ferme_le) < maintenant;
    const ouvert    = form.statut === "publie" && !pasEncore && !deja;

    // La visite est enregistrée même sur un formulaire fermé : savoir qu'une affiche est
    // encore scannée après la campagne dit quelque chose sur ce support.
    const code = (req.query.d || "").trim();
    let diffusion = null;
    if (code) {
      const { data } = await supabase
        .from("campagne_diffusions").select("id, code, actif")
        .eq("formulaire_id", form.id).eq("code", code).maybeSingle();
      diffusion = data || null;
    }

    // Après la réponse : la visite ne doit pas retarder l'affichage du formulaire.
    res.json({
      formulaire: {
        slug: form.slug, titre: form.titre, description: form.description,
        couleur: form.couleur, image_url: form.image_url,
        illustration_url: form.illustration_url,
        texte_consentement: form.texte_consentement,
        redirection_url: form.redirection_url,
        ouvert,
        message_ferme: ouvert ? null : (pasEncore
          ? "Ce formulaire n'est pas encore ouvert. Revenez bientôt !"
          : form.message_ferme),
      },
      champs: ouvert ? await champsPublics(form.id) : [],
      diffusion_code: diffusion?.code || null,
    });

    // Après la réponse, et sans la bloquer : la visite ne doit pas retarder l'affichage.
    if (diffusion) {
      try {
        await supabase.from("campagne_visites").insert({
          diffusion_id: diffusion.id, formulaire_id: form.id,
          ip_hash: empreinte(req),
          user_agent: (req.headers["user-agent"] || "").slice(0, 300),
          referent: (req.headers.referer || "").slice(0, 300),
        });
        // Le compteur est un confort d'affichage ; `campagne_visites` reste la source de
        // vérité, et c'est elle qui sert aux vues de performance.
        const { data: d } = await supabase
          .from("campagne_diffusions").select("nb_visites").eq("id", diffusion.id).maybeSingle();
        await supabase.from("campagne_diffusions")
          .update({ nb_visites: (d?.nb_visites || 0) + 1 }).eq("id", diffusion.id);
      } catch (e) {
        console.warn("[public/visite] non enregistrée:", e.message);
      }
    }
  } catch (err) {
    console.error("[public/formulaire GET]", err.message || err);
    res.status(500).json({ error: "Formulaire momentanément indisponible." });
  }
});

/** Les champs, sans rien d'interne : ni `role_canonique`, ni identifiants de gestion. */
async function champsPublics(formulaireId) {
  const { data } = await supabase
    .from("campagne_formulaire_champs")
    .select("id, ordre, libelle, aide, type, obligatoire, options, placeholder, validation, image_url, autre_autorise")
    .eq("formulaire_id", formulaireId).order("ordre");
  return data || [];
}

/* ══════════════════════════════════════════════════════════════
   POST /api/public/formulaires/:slug - la soumission
══════════════════════════════════════════════════════════════ */
router.post("/formulaires/:slug", async (req, res) => {
  try {
    const cle = empreinte(req);
    if (tropDEnvois(cle)) {
      return res.status(429).json({ error: "Trop d'envois depuis cet appareil. Réessayez dans quelques minutes." });
    }

    const { data: form } = await supabase
      .from("campagne_formulaires")
      .select("id, campagne_id, statut, ouvre_le, ferme_le, message_merci, redirection_url, autoriser_doublons, centre_id, assignee_id")
      .eq("slug", req.params.slug).maybeSingle();
    if (!form) return res.status(404).json({ error: "Ce formulaire n'existe pas." });

    const maintenant = new Date();
    const ouvert = form.statut === "publie"
      && !(form.ouvre_le && new Date(form.ouvre_le) > maintenant)
      && !(form.ferme_le && new Date(form.ferme_le) < maintenant);
    if (!ouvert) return res.status(409).json({ error: "Ce formulaire n'accepte plus de réponses." });

    /* LES CHAMPS SONT RELUS EN BASE. Ce que le client envoie ne décide de rien : un
       formulaire modifié peut être ouvert depuis dix minutes dans un onglet, et un client
       malveillant enverrait n'importe quoi. */
    const { data: champs } = await supabase
      .from("campagne_formulaire_champs")
      .select("id, libelle, type, obligatoire, options, role_canonique, validation")
      .eq("formulaire_id", form.id).order("ordre");

    const envoi = (req.body?.reponses && typeof req.body.reponses === "object") ? req.body.reponses : {};
    const manquants = [];
    const donnees = {};
    const valeurs = [];
    const canoniques = {};

    for (const c of champs || []) {
      if (SANS_REPONSE.has(c.type)) continue;
      const brut = envoi[c.id];
      const vide = brut === undefined || brut === null || brut === ""
        || (Array.isArray(brut) && brut.length === 0);

      if (c.obligatoire && vide) { manquants.push(c.libelle); continue; }
      if (vide) continue;

      donnees[c.libelle] = brut;
      const ligne = { champ_id: c.id, libelle_champ: c.libelle };

      if (c.type === "choix_multiple") {
        ligne.valeurs = (Array.isArray(brut) ? brut : [brut]).map(String).slice(0, 50);
      } else if (c.type === "nombre" || c.type === "echelle" || c.type === "note") {
        const n = Number(brut);
        if (Number.isFinite(n)) ligne.valeur_nombre = n;
        ligne.valeur_texte = String(brut);
      } else if (c.type === "date") {
        ligne.valeur_date = String(brut).slice(0, 10);
        ligne.valeur_texte = String(brut);
      } else {
        ligne.valeur_texte = String(brut).slice(0, 4000);
      }
      valeurs.push(ligne);

      if (c.role_canonique) canoniques[c.role_canonique] = Array.isArray(brut) ? brut.join(", ") : String(brut);
    }

    if (manquants.length) {
      return res.status(400).json({
        error: `Merci de remplir : ${manquants.slice(0, 4).join(", ")}${manquants.length > 4 ? "…" : ""}`,
        champs_manquants: manquants,
      });
    }

    // Le canal d'origine. C'est TOUTE la valeur de ce dispositif : sans lui, on collecte
    // des réponses sans savoir quel support les a produites.
    let diffusion = null;
    const code = (req.body?.diffusion_code || req.query.d || "").trim();
    if (code) {
      const { data } = await supabase
        .from("campagne_diffusions").select("id, centre_id")
        .eq("formulaire_id", form.id).eq("code", code).maybeSingle();
      diffusion = data || null;
    }

    // Le numero est conserve TEL QUE SAISI dans la reponse - c'est ce que la personne a
    // ecrit - mais normalise pour le dedoublonnage et pour l'opt-in.
    const telephoneSaisi = (canoniques.telephone || "").trim() || null;
    const telephone = normaliserTelephone(telephoneSaisi) || telephoneSaisi;
    const email     = (canoniques.email || "").trim().toLowerCase() || null;

    // Doublon : même formulaire, même téléphone (ou même e-mail). Sur un stand on veut
    // plusieurs réponses depuis un même appareil, d'où le réglage par formulaire.
    if (!form.autoriser_doublons && (telephone || email)) {
      let q = supabase.from("campagne_reponses").select("id").eq("formulaire_id", form.id);
      q = telephone ? q.eq("telephone", telephone) : q.eq("email", email);
      const { data: deja } = await q.limit(1);
      if (deja?.length) {
        return res.status(409).json({
          error: "Vous avez déjà répondu à ce formulaire. Nous vous recontactons très vite !",
          deja_repondu: true,
        });
      }
    }

    const { data: reponse, error } = await supabase.from("campagne_reponses").insert({
      formulaire_id: form.id,
      campagne_id:   form.campagne_id || null,
      diffusion_id:  diffusion?.id || null,
      nom:       (canoniques.nom || "").trim() || null,
      email, telephone,
      donnees,
      consentement:    !!req.body?.consentement,
      consentement_le: req.body?.consentement ? new Date().toISOString() : null,
      ip_hash: cle,
      user_agent: (req.headers["user-agent"] || "").slice(0, 300),
    }).select().single();
    if (error) throw error;

    if (valeurs.length) {
      await supabase.from("campagne_reponse_valeurs")
        .insert(valeurs.map(v => ({ ...v, reponse_id: reponse.id })));
    }

    res.status(201).json({
      ok: true,
      message: form.message_merci,
      redirection_url: form.redirection_url || null,
    });

    // Le consentement WhatsApp est tracé à part : c'est lui qui autorisera la relance,
    // et il doit rester consultable même si la réponse est plus tard supprimée.
    const telWhatsapp = normaliserTelephone(telephoneSaisi);
    if (req.body?.consentement && telWhatsapp) {
      const { error: eOptin } = await supabase.from("whatsapp_optin").upsert({
        telephone: telWhatsapp,
        consenti: true,
        source: "formulaire",
        reponse_id: reponse.id,
        consenti_le: new Date().toISOString(),
      }, { onConflict: "telephone" });
      // Trace plutot que silence : un opt-in perdu, c'est un prospect qu'on ne pourra
      // pas relancer, et personne ne s'en apercevra avant la campagne.
      if (eOptin) console.warn("[public/optin] non enregistré:", eOptin.message);
    }
  } catch (err) {
    console.error("[public/formulaire POST]", err.message || err);
    res.status(500).json({ error: "Envoi impossible pour le moment. Réessayez." });
  }
});

export default router;
