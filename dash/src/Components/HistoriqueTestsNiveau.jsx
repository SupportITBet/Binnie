import React, { useEffect, useState } from "react";
import EvolutionNiveauTests from "./EvolutionNiveauTests";

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * TOUS LES TESTS DE NIVEAU D'UN APPRENANT — l'affichage partagé par tous les écrans
 * ════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN COMPOSANT, ET PAS SEPT BLOCS. Le coach, le superviseur, le PA,
 * l'onboarding, l'admin, le superadmin et l'apprenant lui-même doivent tous voir
 * l'ancien niveau à côté du nouveau. Écrire sept fois le rapprochement d'un test à son
 * apprenant, c'est garantir sept comportements divergents le jour où l'un des sept
 * change. Le rapprochement vit côté serveur (`GET /api/level-test/historique`), la mise
 * en forme vit ici, et chaque écran ne fait que poser le composant.
 *
 * DEUX MODES.
 *   compact  un encart : la frise d'évolution et les deux derniers passages. Pour les
 *            écrans de consultation - coach, superviseur, espace apprenant - où le test
 *            éclaire une décision sans en être le sujet.
 *   complet  la liste intégrale, une ligne par passage. Pour un onglet dédié.
 *
 * CE QU'IL N'AFFICHE PAS. Ni le détail des réponses, ni les audios : ils servent à
 * CORRIGER un test, ce que font la commerciale, l'onboarding et l'agent placement test
 * depuis leurs propres écrans. Ailleurs, le niveau, le score, la date et l'origine
 * suffisent à comprendre d'où vient le classement de l'apprenant.
 */

const CEFR = {
  A1: "#94a3b8", A2: "#f59e0b", B1: "#1e3a8a",
  B2: "#7c3aed", C1: "#059669", C2: "#dc2626",
};

const jour = (d) => d
  ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
  : "-";

/** Le texte brut de l'historique, pour les exports PDF qui n'affichent pas de JSX. */
export function lignesTestsPourPDF(historique = []) {
  return (historique || []).map(t => [
    jour(t.submitted_at),
    (t.level || "-").toUpperCase(),
    t.score != null ? `${t.score}%` : "-",
    t.source === "oral" ? "Évalué en présentiel" : "Passé en ligne",
  ]);
}

/**
 * Charge l'historique d'un apprenant. À utiliser quand l'écran a besoin de la donnée
 * elle-même - un export PDF, un compteur d'onglet - et pas seulement de son affichage.
 * Identifiants acceptés, du plus fiable au moins fiable : dossier, inscription, e-mail.
 */
export function useHistoriqueTests({ apiUrl, authHeaders, assignationId, gaId, email, actif = true }) {
  const [historique, setHistorique] = useState([]);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    if (!actif || (!assignationId && !gaId && !email)) { setHistorique([]); return; }
    let annule = false;
    const p = new URLSearchParams();
    if (assignationId) p.set("assignation_id", assignationId);
    if (gaId)          p.set("ga_id", gaId);
    if (email)         p.set("email", email);

    setChargement(true);
    fetch(`${apiUrl}/api/level-test/historique?${p}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { historique: [] })
      .then(d => { if (!annule) setHistorique(d.historique || []); })
      .catch(() => { if (!annule) setHistorique([]); })
      .finally(() => { if (!annule) setChargement(false); });

    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, assignationId, gaId, email, actif]);

  return { historique, chargement };
}

function Passage({ t, actuel, avecScore }) {
  const n = String(t.level || "").toUpperCase();
  const c = CEFR[n] || "#475569";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, padding: "11px 14px", borderRadius: 10,
      background: "#fff", border: actuel ? `2px solid ${c}` : "1px solid #e5e7eb",
    }}>
      <div style={{ minWidth: 54, textAlign: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: c, lineHeight: 1.1 }}>{n || "-"}</div>
        {avecScore && t.score != null && (
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{t.score}%</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937" }}>{jour(t.submitted_at)}</span>
          {actuel && (
            <span style={{ fontSize: 9, fontWeight: 800, color: "#15803d", background: "#dcfce7", padding: "2px 7px", borderRadius: 99 }}>
              NIVEAU ACTUEL
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: 99 }}>
            {t.source === "oral" ? "Évalué en présentiel" : "Passé en ligne"}
          </span>
        </div>
        {avecScore && (t.correct_answers != null || t.notes_oral) && (
          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.correct_answers != null && t.total_questions
              ? `${t.correct_answers}/${t.total_questions} bonnes réponses` : ""}
            {t.notes_oral ? (t.correct_answers != null && t.total_questions ? " · " : "") + t.notes_oral : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoriqueTestsNiveau({
  apiUrl, authHeaders,
  assignationId = null, gaId = null, email = null,
  mode = "complet",        // "complet" (onglet) | "compact" (encart)
  avecScore = true,        // false pour l'apprenant : sa progression, pas sa note
  titre = "🎓 Tests de niveau",
  actif = true,
  historique: fourni = null,   // un écran qui a déjà chargé la donnée évite un second appel
  chargement: chargementFourni = false,
}) {
  const charge = useHistoriqueTests({ apiUrl, authHeaders, assignationId, gaId, email, actif: actif && !fourni });
  const historique = fourni || charge.historique;
  // Un tableau vide fourni est une donnée (« chargé, aucun test »), pas une absence : sans
  // ce second signal, l'écran annonce « aucun test » pendant que la requête est en vol.
  const chargement = fourni ? chargementFourni : charge.chargement;
  const compact = mode === "compact";

  if (chargement) {
    return <div style={{ padding: "16px 0", fontSize: 12, color: "#94a3b8" }}>Chargement des tests…</div>;
  }

  if (!historique.length) {
    // En mode compact le composant s'insère dans une fiche déjà dense : un encart vide y
    // ajouterait du bruit sans rien apprendre. En mode onglet il faut au contraire dire
    // pourquoi c'est vide, sinon on croit à une panne.
    if (compact) return null;
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b" }}>Aucun test de niveau enregistré</div>
        <div style={{ fontSize: 12, marginTop: 6, maxWidth: 420, margin: "6px auto 0" }}>
          Lors d'un transfert, c'est l'agent placement test qui fait passer le test ;
          le résultat remonte ici automatiquement.
        </div>
      </div>
    );
  }

  // Trié du plus récent au plus ancien par le serveur ; la frise se lit dans l'autre sens.
  const pourFrise = historique.slice().reverse()
    .map(t => ({ id: t.id, level: t.level, submitted_at: t.submitted_at }));
  const affiches = compact ? historique.slice(0, 2) : historique;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {titre && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color: "#334155" }}>{titre}</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {historique.length} passage{historique.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <EvolutionNiveauTests tests={pourFrise} compact={compact} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {affiches.map((t, i) => (
          <Passage key={t.id || i} t={t} actuel={i === 0} avecScore={avecScore} />
        ))}
      </div>

      {compact && historique.length > affiches.length && (
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          + {historique.length - affiches.length} passage{historique.length - affiches.length > 1 ? "s" : ""} plus ancien{historique.length - affiches.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
