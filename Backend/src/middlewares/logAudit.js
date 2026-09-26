import supabase from "../config/supabase.js";
import { resolvePlateforme } from "./plateformeParModule.js";
import { getPlateformeOrigine } from "./requestContext.js";

/**
 * logAudit - utility to write an entry to the audit_logs table.
 * Never throws: all errors are swallowed with console.warn.
 *
 * @param {object} params
 * @param {string}  [params.acteur_id]     - UUID of the actor (user/admin)
 * @param {string}  [params.acteur_nom]    - Display name
 * @param {string}  [params.acteur_email]  - Email address
 * @param {string}  [params.acteur_role]   - Role (defaults to "system")
 * @param {string}   params.action_type    - e.g. "LOGIN_SUCCESS", "USER_CREATED"
 * @param {string}  [params.module]        - e.g. "auth", "users", "paiements"
 * @param {string}  [params.entite_type]   - Type of target entity
 * @param {string}  [params.entite_id]     - ID of target entity
 * @param {string}  [params.centre]        - Centre slug/name
 * @param {string}  [params.detail]        - Human-readable description (truncated to 500 chars)
 * @param {object}  [params.metadata]      - Extra structured data (jsonb)
 * @param {string}  [params.ip_address]    - Caller IP
 * @param {string}  [params.user_agent]    - Caller User-Agent
 * @param {string}  [params.statut]        - "success" | "warning" | "danger" | "info" (defaults to "success")
 * @param {string}  [params.plateforme]    - "dash" | "bet-elearning" - laisser vide pour un module
 *   partagé entre les deux apps admin (reste visible des deux côtés dans /api/audit/logs).
 */
export async function logAudit({
  acteur_id,
  acteur_nom,
  acteur_email,
  acteur_role,
  action_type,
  module,
  entite_type,
  entite_id,
  centre,
  detail,
  metadata,
  ip_address,
  user_agent,
  statut,
  plateforme,
} = {}) {
  // Truncate detail to 500 chars
  const detailSafe =
    typeof detail === "string" && detail.length > 500
      ? detail.slice(0, 500)
      : detail || null;

  const row = {
    acteur_id:    acteur_id    || null,
    acteur_nom:   acteur_nom   || null,
    acteur_email: acteur_email || null,
    acteur_role:  acteur_role  || "system",
    action_type:  action_type,
    module:       module       || "system",
    entite_type:  entite_type  || null,
    entite_id:    entite_id    ? String(entite_id) : null,
    centre:       centre       || null,
    detail:       detailSafe,
    metadata:     metadata     || {},
    ip_address:   ip_address   || null,
    user_agent:   user_agent   || null,
    statut:       statut       || "success",
  };

  // Si l'appelant ne précise pas explicitement la plateforme, on la déduit dans l'ordre :
  // origine réelle de la requête HTTP (fiable - indépendante du rôle, qui peut légitimement
  // être utilisé depuis les deux apps via le système de "façade" de bet-elearning) > rôle
  // de l'acteur (seulement pour les ~15 rôles confirmés exclusifs) > module en dernier
  // recours. Voir plateformeParModule.js pour le détail de cette hiérarchie.
  const plateformeEffective = resolvePlateforme(plateforme, row.module, row.acteur_role, getPlateformeOrigine());

  try {
    const { error } = await supabase.from("audit_logs").insert({ ...row, plateforme: plateformeEffective });
    if (error) throw error;
  } catch (err) {
    // Tant que la migration audit_plateforme_migration.sql n'a pas été exécutée, la colonne
    // "plateforme" n'existe pas encore - on retente sans elle plutôt que de perdre le log.
    if (/plateforme/.test(err?.message || "")) {
      try { await supabase.from("audit_logs").insert(row); return; } catch (err2) {
        console.warn("[logAudit] Failed to insert audit log:", err2?.message || err2);
      }
      return;
    }
    console.warn("[logAudit] Failed to insert audit log:", err?.message || err);
  }
}
