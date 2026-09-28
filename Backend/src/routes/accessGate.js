import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { authenticateAdmin, requireSuperAdmin } from "../middlewares/requireAdmin.js";
import { accessGateLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // Un serveur ne detient pas de session : sans ces options, le client garde en memoire
  // celle du dernier connecte et lance un rafraichissement de fond. Voir config/supabase.js.
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);
// Même pattern que SSO_TICKET_SECRET (adminRoutes.js) - réutilise le service key, pas de nouvel env var.
const GATE_TOKEN_SECRET = process.env.SUPABASE_SERVICE_KEY;

// GET - Super Admin uniquement, indique juste si un code est déjà défini (jamais le code/hash)
router.get("/", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("access_gate_config")
    .select("code_hash, updated_at")
    .eq("id", 1)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ hasCode: !!data.code_hash, updated_at: data.updated_at });
});

// PUT - Super Admin uniquement, définit/change le code
router.put("/", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string" || code.trim().length < 4) {
    return res.status(400).json({ error: "Le code doit contenir au moins 4 caractères." });
  }
  const code_hash = await bcrypt.hash(code.trim(), 10);
  const { error } = await supabase
    .from("access_gate_config")
    .upsert({ id: 1, code_hash, updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST - public - vérifie le code saisi sur "/"
// accessGateLimiter (20 essais / 15 min) est le vrai garde-fou anti brute-force ; le blocage
// à 3 essais affiché côté client (AccessGate.jsx) n'est qu'un frein visuel, contournable.
router.post("/verify", accessGateLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") return res.json({ ok: false });

  const { data, error } = await supabase
    .from("access_gate_config")
    .select("code_hash")
    .eq("id", 1)
    .single();
  if (error || !data?.code_hash) return res.json({ ok: false });

  const match = await bcrypt.compare(code.trim(), data.code_hash);
  if (!match) return res.json({ ok: false });

  const token = jwt.sign({ gate: true }, GATE_TOKEN_SECRET, { expiresIn: "2h" });
  res.json({ ok: true, token });
});

// GET - public, appelé par /bet-staff-access avant d'afficher le formulaire de connexion.
// Vérifie que le token présenté a bien été émis par /verify (signature + expiration) -
// sans ce contrôle, n'importe qui pourrait poser une valeur arbitraire dans le storage
// du navigateur et atteindre la page sans jamais connaître le code.
router.get("/check-token", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.json({ valid: false });
  try {
    jwt.verify(token, GATE_TOKEN_SECRET);
    res.json({ valid: true });
  } catch {
    res.json({ valid: false });
  }
});

export default router;
