import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Les deux populations affichées sur le site public. `coach` est la valeur par défaut
// en base : les 146 lignes existantes en relèvent sans avoir été touchées.
const CATEGORIES = ["coach", "administration"];
const categorieValide = (v) => (CATEGORIES.includes(v) ? v : "coach");

/**
 * La colonne `categorie` peut ne pas exister encore - le SQL est livré séparément et
 * s'exécute quand l'équipe le décide. Plutôt que de renvoyer une erreur incompréhensible
 * jusque-là, on retombe sur le comportement d'avant : tout le monde est coach.
 * Postgres renvoie 42703 pour une colonne inconnue.
 */
const colonneAbsente = (err) =>
  err && (err.code === "42703" || /categorie|fonction/.test(err.message || ""));

/* ══════════════════════════════════════════════════════════════════════════
   VITESSE DE DÉFILEMENT DE LA SECTION COACHS

   La section « équipe coachs » du site public n'est PAS un carrousel : c'est un
   défilement continu, deux rangées qui glissent sans jamais s'arrêter. Une durée par
   photo n'y aurait aucun sens - aucune photo ne s'y arrête. Ce qui se règle, c'est le
   temps que met une rangée à faire un tour complet, jusqu'ici figé à 50 secondes dans
   la feuille de style du site.

   RANGÉ DANS `parametres` (clé/valeur JSON), pas dans une colonne : ce réglage porte sur
   la SECTION, pas sur une photo. L'écrire sur chacune des 146 lignes obligerait à les
   tenir toutes d'accord, et la première divergence serait silencieuse. Aucune migration
   n'est donc nécessaire.
══════════════════════════════════════════════════════════════════════════ */
const PARAM_DEFILEMENT = "defilement_equipe_coachs";
// Sous 10 secondes les visages deviennent illisibles ; au-delà de 180 le visiteur ne
// perçoit plus aucun mouvement et croit la section figée.
const DEFIL_MIN = 10, DEFIL_MAX = 180, DEFIL_DEFAUT = 50;
const defilementValide = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(DEFIL_MAX, Math.max(DEFIL_MIN, n)) : DEFIL_DEFAUT;
};

// ── Public : la cadence lue par le site ─────────────────────
// Route distincte plutôt qu'un champ ajouté à `/publics` : cette réponse-là est un
// tableau brut, consommé tel quel par deux sections du site. En changer la forme les
// casserait toutes les deux pour un réglage qui ne concerne que l'une d'elles.
router.get("/defilement", async (_req, res) => {
  try {
    const { data } = await supabase
      .from("parametres").select("valeur").eq("cle", PARAM_DEFILEMENT).maybeSingle();
    res.json({ duree: defilementValide(data?.valeur?.duree ?? DEFIL_DEFAUT) });
  } catch {
    // Le site doit défiler même si le paramètre est illisible : on rend la cadence
    // d'origine plutôt qu'une erreur qui laisserait la section immobile.
    res.json({ duree: DEFIL_DEFAUT });
  }
});

// ── Admin : régler la cadence ───────────────────────────────
router.put("/defilement", authenticateAdmin, requirePermission("equipe_coachs", "update"), async (req, res) => {
  try {
    const duree = defilementValide(req.body?.duree);
    const { error } = await supabase.from("parametres").upsert(
      { cle: PARAM_DEFILEMENT, valeur: { duree }, updated_at: new Date().toISOString() },
      { onConflict: "cle" },
    );
    if (error) throw error;
    res.json({ duree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public : photos actives pour l'Accueil ──────────────────
router.get("/publics", async (req, res) => {
  // Sans paramètre, la réponse reste EXACTEMENT celle d'avant : la section coachs du
  // site public appelle cette route sans rien savoir des catégories, et ne doit pas
  // se mettre à afficher les dirigeants au milieu des coachs.
  const categorie = req.query.categorie ? categorieValide(req.query.categorie) : "coach";
  try {
    let q = supabase
      .from("equipe_photos")
      .select("id, photo_url, nom, titre, fonction, ordre, categorie")
      .eq("actif", true)
      .eq("categorie", categorie)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });

    let { data, error } = await q;
    if (error && colonneAbsente(error)) {
      // Migration pas encore jouée : on sert les coachs comme avant.
      const repli = await supabase
        .from("equipe_photos")
        .select("id, photo_url, nom, titre, ordre")
        .eq("actif", true)
        .order("ordre", { ascending: true })
        .order("created_at", { ascending: true });
      data = categorie === "coach" ? (repli.data || []) : [];
      error = repli.error;
    }
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : liste complète ───────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    let q = supabase
      .from("equipe_photos")
      .select("*")
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });
    // L'écran d'administration demande une catégorie à la fois : mélanger 146 coachs
    // et une dizaine de dirigeants dans la même liste rendrait la recherche inutile.
    if (req.query.categorie) q = q.eq("categorie", categorieValide(req.query.categorie));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : ajouter une photo ────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("equipe_coachs","create"), async (req, res) => {
  const { photo_url, nom, titre, ordre, categorie, fonction } = req.body;
  if (!photo_url) return res.status(400).json({ error: "photo_url requis" });
  try {
    const ligne = {
      photo_url, nom: nom || null, titre: titre || null,
      ordre: ordre || 0, actif: true,
      categorie: categorieValide(categorie),
      fonction: fonction || null,
    };
    let { data, error } = await supabase.from("equipe_photos").insert(ligne).select().single();
    if (error && colonneAbsente(error)) {
      // Sans la migration, Postgres rejette TOUTE la ligne à cause des deux colonnes
      // inconnues. On réessaie sans elles plutôt que de perdre la photo déjà envoyée.
      const { categorie: _c, fonction: _f, ...sansCat } = ligne;
      ({ data, error } = await supabase.from("equipe_photos").insert(sansCat).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : modifier (nom, titre, actif, ordre) ──────────────
router.patch("/:id", authenticateAdmin, requirePermission("equipe_coachs","update"), async (req, res) => {
  const allowed = ["photo_url", "nom", "titre", "ordre", "actif", "categorie", "fonction"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  try {
    if (updates.categorie) updates.categorie = categorieValide(updates.categorie);
    let { data, error } = await supabase
      .from("equipe_photos").update(updates).eq("id", req.params.id).select().single();
    if (error && colonneAbsente(error)) {
      const { categorie: _c, fonction: _f, ...sansCat } = updates;
      ({ data, error } = await supabase
        .from("equipe_photos").update(sansCat).eq("id", req.params.id).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : supprimer ────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("equipe_coachs","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("equipe_photos").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
