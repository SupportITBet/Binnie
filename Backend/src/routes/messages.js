import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser } from "../middlewares/requireAdmin.js";

const router = express.Router();

console.log("✅ Route messages chargée");

// ── Helper : vérifier que l'user est bien dans la conv ──────
async function isParticipant(convId, userId) {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", convId)
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .single();
  return !!data;
}

// ── GET /contacts → pour les apprenants : coach + commercial + onboarding + admins ──
router.get("/contacts", authenticateUser, async (req, res, next) => {
  if (req.role === "apprenant") {
    try {
      const userId = req.user.id;
      const email  = req.user.email || "";

      // 1. Coach via groupes_apprenants → groupes.coach_id (lien principal BET)
      // neq "retire" (pas eq "actif") pour qu'un apprenant d'une classe clôturée
      // (statut "archive") garde son coach comme contact.
      const [gaById, gaByEmail] = await Promise.all([
        supabase.from("groupes_apprenants")
          .select("groupes(coach_id)")
          .eq("apprenant_id", userId)
          .neq("statut", "retire"),
        supabase.from("groupes_apprenants")
          .select("groupes(coach_id)")
          .ilike("email_apprenant", email)
          .neq("statut", "retire"),
      ]);
      const gaRows = [...(gaById.data || []), ...(gaByEmail.data || [])];
      const coachIds = [...new Set(gaRows.map(r => r.groupes?.coach_id).filter(Boolean))];

      // 2. Commercial via assignations_parcours (par apprenant_id, email ou téléphone)
      const [apById, apByEmail] = await Promise.all([
        supabase.from("assignations_parcours")
          .select("commercial_id, onboarding_id")
          .eq("apprenant_id", userId)
          .limit(5),
        supabase.from("assignations_parcours")
          .select("commercial_id, onboarding_id")
          .ilike("prospect_email", email)
          .limit(5),
      ]);
      const apRows = [...(apById.data || []), ...(apByEmail.data || [])];
      const commercialIds = [...new Set(apRows.map(r => r.commercial_id).filter(Boolean))];
      const onbIds2       = [...new Set(apRows.map(r => r.onboarding_id).filter(Boolean))];

      // 3. Admins / managers visibles
      const { data: admins } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, email, role, avatar_url")
        .in("role", ["super_admin", "admin", "manager", "gestionnaire", "customer_care"])
        .eq("actif", true)
        .limit(10);

      // 4. Récupérer les profils des personnes assignées
      const assignedIds = [...new Set([...coachIds, ...commercialIds, ...onbIds2])];
      let assignedContacts = [];
      if (assignedIds.length) {
        const { data } = await supabase
          .from("utilisateurs")
          .select("id, nom, prenom, email, role, avatar_url")
          .in("id", assignedIds)
          .eq("actif", true);
        assignedContacts = data || [];
      }

      // Merge avec dédoublonnage - assignés en premier
      const seen = new Set();
      const contacts = [];
      for (const c of [...assignedContacts, ...(admins || [])]) {
        if (!seen.has(c.id)) { contacts.push(c); seen.add(c.id); }
      }

      return res.json({ contacts });
    } catch (err) {
      console.error("[contacts apprenant]", err.message);
      return res.status(500).json({ error: "Erreur interne" });
    }
  }

  // Pour les profils admin : comportement existant ↓
  return next();
});

// ── GET /contacts → liste des autres utilisateurs à contacter (admin) ─
router.get("/contacts", authenticateAdmin, async (req, res) => {
  try {
    const me       = req.user.id;
    const myRole   = req.role;
    const myScope  = req.profil?.scope || [];
    const NATIONAL_ROLES = ["super_admin", "admin", "manager", "superviseur", "deputy_superviseur", "rh"];
    const isNational = NATIONAL_ROLES.includes(myRole) || myScope.includes("national");

    // Table utilisateurs (commerciaux, managers, responsables…)
    const { data: utilisateurs } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, scope, actif, avatar_url")
      .neq("id", me)
      .eq("actif", true)
      .order("nom");

    // Table profils_admin (super_admin et anciens rôles)
    const { data: profilsAdmin } = await supabase
      .from("profils_admin")
      .select("id, nom, prenom, email, profil_type, actif")
      .neq("id", me)
      .eq("actif", true)
      .order("nom");

    const fromUtilisateurs = (utilisateurs || []);
    const fromProfilsAdmin = (profilsAdmin || []).map(p => ({
      id:     p.id,
      nom:    p.nom,
      prenom: p.prenom,
      email:  p.email,
      role:   p.profil_type,
      scope:  ["national"],
      actif:  p.actif,
    }));

    // Fusionner en évitant les doublons
    const seen = new Set(fromUtilisateurs.map(u => u.id));
    let merged = [
      ...fromUtilisateurs,
      ...fromProfilsAdmin.filter(p => !seen.has(p.id)),
    ].sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));

    // Restriction par centre
    if (!isNational) {
      merged = merged.filter((c) => {
        const cScope = c.scope || [];
        if (cScope.includes("national")) return true;
        return cScope.some((s) => myScope.includes(s));
      });
    }

    // Pour les coachs : ajouter leurs apprenants en coaching privé (qui ont un compte Supabase)
    let apprenantContacts = [];
    if (myRole === "coach") {
      try {
        // auth_user_id est dans acces_apprenant->auth_user_id
        const { data: apRows } = await supabase
          .from("assignations_parcours")
          .select("acces_apprenant, prospect_nom, prospect_email")
          .contains("suivi_demarrage", { coach_id: me })
          .not("acces_apprenant", "is", null);

        if (apRows?.length) {
          const seenAll = new Set(merged.map(u => u.id));
          apprenantContacts = apRows
            .map(a => ({
              id:     a.acces_apprenant?.auth_user_id || null,
              nom:    (a.prospect_nom || "").split(" ").slice(1).join(" ") || a.prospect_nom || "",
              prenom: (a.prospect_nom || "").split(" ")[0] || "",
              email:  a.acces_apprenant?.email || a.prospect_email || "",
              role:   "apprenant",
              actif:  true,
            }))
            .filter(a => a.id && !seenAll.has(a.id));
        }
      } catch (e) {
        console.warn("[contacts/coach] Erreur apprenants privés:", e.message);
      }
    }

    // Retirer le champ scope de la réponse
    res.json({ contacts: [...merged.map(({ scope: _, ...rest }) => rest), ...apprenantContacts] });
  } catch (err) {
    console.error("[contacts/admin] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /conversations → mes conversations ──────────────────
router.get("/conversations", authenticateUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
      .order("last_message_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Compter les messages non lus pour chaque conv
    const enriched = await Promise.all((data || []).map(async (conv) => {
      const { count } = await supabase
        .from("messages_chat")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("lu", false)
        .neq("from_id", uid);
      return { ...conv, non_lus: count || 0 };
    }));

    res.json({ conversations: enriched });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /conversations → ouvrir/trouver une conv avec un user
router.post("/conversations", authenticateUser, async (req, res) => {
  try {
    const me = req.user.id;
    const { to_id } = req.body;
    if (!to_id) return res.status(400).json({ error: "to_id requis" });

    // Chercher conv existante dans les deux sens
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .or(`and(user1_id.eq.${me},user2_id.eq.${to_id}),and(user1_id.eq.${to_id},user2_id.eq.${me})`)
      .maybeSingle();

    if (existing) return res.json({ conversation: existing });

    // Récupérer infos du destinataire
    const { data: toProfil } = await supabase
      .from("utilisateurs")
      .select("nom, prenom, role, email")
      .eq("id", to_id)
      .maybeSingle();

    const meProfil = req.profil;

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        user1_id:    me,
        user1_name:  `${meProfil.prenom || ""} ${meProfil.nom || ""}`.trim() || meProfil.email,
        user1_role:  req.role,
        user2_id:    to_id,
        user2_name:  toProfil ? `${toProfil.prenom || ""} ${toProfil.nom || ""}`.trim() || toProfil.email : to_id,
        user2_role:  toProfil?.role || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ conversation: created });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /conversations/:id/messages ─────────────────────────
router.get("/conversations/:id/messages", authenticateUser, async (req, res) => {
  try {
    if (!(await isParticipant(req.params.id, req.user.id))) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const { data, error } = await supabase
      .from("messages_chat")
      .select("*")
      .eq("conversation_id", req.params.id)
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /conversations/:id/messages → envoyer un message ───
router.post("/conversations/:id/messages", authenticateUser, async (req, res) => {
  try {
    const convId = req.params.id;
    if (!(await isParticipant(convId, req.user.id))) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Contenu vide" });

    const meProfil = req.profil;
    const fromName = `${meProfil.prenom || ""} ${meProfil.nom || ""}`.trim() || meProfil.email;

    const { data, error } = await supabase
      .from("messages_chat")
      .insert({
        conversation_id: convId,
        from_id:         req.user.id,
        from_name:       fromName,
        from_role:       req.role,
        content:         content.trim(),
        lu:              false,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Mettre à jour last_message sur la conv
    await supabase
      .from("conversations")
      .update({ last_message: content.trim().slice(0, 100), last_message_at: new Date().toISOString() })
      .eq("id", convId);

    res.status(201).json({ message: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /conversations/:id/read → marquer lu ──────────────
router.patch("/conversations/:id/read", authenticateUser, async (req, res) => {
  try {
    const convId = req.params.id;
    if (!(await isParticipant(convId, req.user.id))) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    await supabase
      .from("messages_chat")
      .update({ lu: true })
      .eq("conversation_id", convId)
      .neq("from_id", req.user.id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
