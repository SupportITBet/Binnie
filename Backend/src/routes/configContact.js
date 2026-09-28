import express from "express";
import { createClient } from "@supabase/supabase-js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router  = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // Un serveur ne detient pas de session : sans ces options, le client garde en memoire
  // celle du dernier connecte et lance un rafraichissement de fond. Voir config/supabase.js.
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// GET public - lu par WhatsAppButton, Footer, Contact
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("config_contact")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT admin - enregistré depuis SuperAdminDashboard
router.put("/", authenticateAdmin, requirePermission("communication","update"), async (req, res) => {
  const {
    whatsapp_number, whatsapp_number_2, whatsapp_number_3,
    whatsapp_message, email_central, localisation, maps_embed_url,
    social_facebook,  social_facebook_visible,
    social_instagram, social_instagram_visible,
    social_linkedin,  social_linkedin_visible,
    social_tiktok,    social_tiktok_visible,
    social_twitter,   social_twitter_visible,
  } = req.body;
  const champs = {
      id: 1,
      whatsapp_number,
      whatsapp_message,
      email_central,
      localisation:              localisation              ?? "",
      maps_embed_url:            maps_embed_url            ?? "",
      social_facebook:           social_facebook           ?? "",
      social_facebook_visible:   social_facebook_visible   !== false,
      social_instagram:          social_instagram          ?? "",
      social_instagram_visible:  social_instagram_visible  !== false,
      social_linkedin:           social_linkedin           ?? "",
      social_linkedin_visible:   social_linkedin_visible   !== false,
      social_tiktok:             social_tiktok             ?? "",
      social_tiktok_visible:     social_tiktok_visible     !== false,
      social_twitter:            social_twitter            ?? "",
      social_twitter_visible:    social_twitter_visible    !== false,
      updated_at: new Date().toISOString(),
  };

  const enregistrer = (corps) =>
    supabase.from("config_contact").upsert(corps).select().single();

  // Les deux lignes supplémentaires, vides par défaut : « ?? "" » plutôt que undefined,
  // sans quoi upsert laisserait la colonne inchangée au lieu de l'effacer quand le
  // SuperAdmin vide le champ pour retirer un numéro.
  let { data, error } = await enregistrer({
    ...champs,
    whatsapp_number_2: whatsapp_number_2 ?? "",
    whatsapp_number_3: whatsapp_number_3 ?? "",
  });

  // Tant que la migration n'a pas été jouée, ces colonnes n'existent pas et Postgres rejette
  // TOUT l'enregistrement : le SuperAdmin ne pouvait plus sauvegarder ne serait-ce que son
  // email ou ses réseaux sociaux. On réessaie alors sans elles, pour que l'ordre entre le
  // déploiement du code et l'exécution du SQL cesse d'avoir de l'importance.
  if (error && /whatsapp_number_[23]/.test(error.message || "")) {
    console.warn("[config-contact] colonnes whatsapp_number_2/3 absentes - executer "
      + "Backend/sql/config_contact_numeros_supplementaires.sql. "
      + "Enregistrement des autres champs en attendant.");
    ({ data, error } = await enregistrer(champs));
  }

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
