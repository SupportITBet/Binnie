import React, { useEffect, useState } from "react";
import DerouleReel from "./DerouleReel";

/**
 * Le détail d'une séance réalisée : ce qui était prévu, ce qui s'est réellement passé,
 * et qui était là.
 *
 * Il existait une seule version de cette vue, chez le PA, et elle affichait les colonnes
 * d'origine de `seances` - sans le chronomètre de la salle ni la reprogrammation, pourtant
 * enregistrés depuis. Le superviseur, lui, n'avait aucune vue de ce genre.
 *
 * Le composant vit ici plutôt que recopié dans chaque dashboard : c'est la même séance,
 * et deux copies divergent toujours - c'est exactement ce qui s'est passé pour le bloc
 * « déroulé réel », d'où l'existence de DerouleReel.
 *
 * Attend une séance au format de la table `seances` (`date_seance`, `heure_debut`,
 * `duree_h`…), enrichie côté serveur par les routes de `seances.js` : `groupe_nom`,
 * `demarree_at` / `terminee_at` / `duree_reelle_s`, `plateforme`, `duree_prevue_min`.
 */

const STATUT_HONORAIRE = {
  en_attente: { lib: "En attente", bg: "#FEF3C7", c: "#92400E" },
  valide:     { lib: "Validée",    bg: "#DCFCE7", c: "#166534" },
  rejete:     { lib: "Rejetée",    bg: "#FEE2E2", c: "#991B1B" },
};

const STATUT_PRESENCE = {
  present: { lib: "Présent",   bg: "#dcfce7", c: "#166534" },
  retard:  { lib: "En retard", bg: "#fef3c7", c: "#92400e" },
  excuse:  { lib: "Excusé",    bg: "#dbeafe", c: "#1e40af" },
  absent:  { lib: "Absent",    bg: "#fee2e2", c: "#991b1b" },
};

const fmtMontant = (n) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} FCFA`;

/** Fin de créneau déduite de l'heure de début et de la durée prévue. */
function heureFinPrevue(seance) {
  if (!seance?.heure_debut) return null;
  const [h, m] = seance.heure_debut.split(":").map(Number);
  const total = h * 60 + (m || 0) + Math.round((parseFloat(seance.duree_h) || 0) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const Champ = ({ label, children, accent }) => (
  <div style={{
    background: accent ? "#f0fdf4" : "#f8fafc", borderRadius: 8, padding: "10px 12px",
    border: `1px solid ${accent ? "#bbf7d0" : "#e2e8f0"}`,
  }}>
    <div style={{ fontSize: 9, color: accent ? "#15803d" : "#9ca3af", fontWeight: 700, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{children}</div>
  </div>
);

const Bloc = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{children}</div>
  </div>
);

export default function SeanceDetailModal({
  seance,
  onClose,
  apiUrl,
  authHeaders,
  /** Présences déjà chargées par l'appelant - sinon le composant les charge lui-même. */
  presences: presencesExternes,
  presencesLoading: presencesLoadingExterne,
  /** Le montant d'honoraire n'a de sens que là où il est instruit. */
  afficherHonoraire = true,
  /** Actions propres à l'écran appelant (Valider / Refuser chez le PA). */
  actions,
}) {
  const externe = presencesExternes !== undefined;
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (externe || !seance?.id || !apiUrl) return;
    let annule = false;
    setLoading(true);
    fetch(`${apiUrl}/api/seances/${seance.id}/presences`, { headers: authHeaders ? authHeaders() : {} })
      .then(r => (r.ok ? r.json() : { presences: [] }))
      .then(d => { if (!annule) setPresences(d.presences || []); })
      .catch(() => { if (!annule) setPresences([]); })
      .finally(() => { if (!annule) setLoading(false); });
    return () => { annule = true; };
  }, [seance?.id, apiUrl, externe]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seance) return null;

  const listePresences = externe ? (presencesExternes || []) : presences;
  const chargement     = externe ? !!presencesLoadingExterne : loading;
  const st   = STATUT_HONORAIRE[seance.honoraire_statut] || STATUT_HONORAIRE.en_attente;
  const fin  = heureFinPrevue(seance);
  const taux = listePresences.length
    ? Math.round(listePresences.filter(p => p.statut === "present" || p.statut === "retard").length / listePresences.length * 100)
    : null;

  // Une séance déplacée garde la trace de sa date d'origine : sans elle, un cours du 25
  // initialement prévu le 15 est indiscernable d'un cours normalement planifié.
  const reprogrammee = seance.date_seance_initiale && seance.date_seance_initiale !== seance.date_seance;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1700, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{seance.titre || "Séance"}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              {seance.date_seance
                ? new Date(seance.date_seance).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : "-"}
            </div>
          </div>
          <button onClick={() => onClose?.()} aria-label="Fermer" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {afficherHonoraire && (
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.c }}>{st.lib}</span>
            )}
            {/* La note de rejet est le motif d'une décision d'honoraire : elle suit le même
                interrupteur, sinon elle apparaîtrait seule, sans le statut qu'elle explique. */}
            {afficherHonoraire && seance.honoraire_statut_note && (
              <span style={{ fontSize: 11, color: "#b91c1c" }}>- {seance.honoraire_statut_note}</span>
            )}
            {seance.remplacement_absent_nom && (
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#EDE9FE", color: "#5B21B6" }}>
                🔄 Remplacement de {seance.remplacement_absent_nom}
              </span>
            )}
          </div>

          {reprogrammee && (
            <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#9A3412" }}>
                🔁 Séance reprogrammée - initialement prévue le {new Date(seance.date_seance_initiale).toLocaleDateString("fr-FR")}
              </div>
              {seance.reprogrammee_motif && (
                <div style={{ fontSize: 12, color: "#7C2D12", marginTop: 4, lineHeight: 1.5 }}>{seance.reprogrammee_motif}</div>
              )}
              {seance.reprogrammee_le && (
                <div style={{ fontSize: 11, color: "#C2410C", marginTop: 3 }}>
                  Déplacée le {new Date(seance.reprogrammee_le).toLocaleDateString("fr-FR")}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
            <Champ label="Créneau">{seance.heure_debut?.slice(0, 5) || "-"}{fin ? ` – ${fin}` : ""}</Champ>
            <Champ label="Durée prévue">{parseFloat(seance.duree_h || 0).toFixed(1)}h</Champ>
            <Champ label="Classe / Circuit">
              {seance.groupe_nom || (seance.circuit === "prive" ? "Coaching privé" : seance.circuit || "-")}
            </Champ>
            <Champ label="Niveau / Type">{[seance.niveau, seance.type_cours].filter(Boolean).join(" · ") || "-"}</Champ>
            {seance.lieu && <Champ label="Lieu">{seance.lieu}</Champ>}
            {afficherHonoraire && (
              <Champ label="Montant honoraire" accent>
                <span style={{
                  fontSize: 14, fontWeight: 800,
                  color: seance.honoraire_statut === "rejete" ? "#9ca3af" : "#15803d",
                  textDecoration: seance.honoraire_statut === "rejete" ? "line-through" : "none",
                }}>
                  {fmtMontant(seance.honoraire_montant)}
                </span>
              </Champ>
            )}
          </div>

          {/* Ce qui s'est réellement passé en salle - la règle vit dans DerouleReel. */}
          <DerouleReel seance={seance} />

          {seance.objectif && <Bloc label="Objectif de la séance">{seance.objectif}</Bloc>}
          {seance.notes    && <Bloc label="Notes">{seance.notes}</Bloc>}

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase" }}>Présences</div>
              {taux != null && (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "2px 10px", borderRadius: 20,
                  background: taux >= 80 ? "#dcfce7" : taux >= 50 ? "#fef3c7" : "#fee2e2",
                  color:      taux >= 80 ? "#166534" : taux >= 50 ? "#92400e" : "#991b1b",
                }}>
                  {taux}% présent{taux > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {chargement ? (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Chargement…</div>
            ) : listePresences.length === 0 ? (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Aucune présence enregistrée pour cette séance.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {listePresences.map((p, i) => {
                  const sp = STATUT_PRESENCE[p.statut] || { lib: p.statut || "-", bg: "#f1f5f9", c: "#475569" };
                  return (
                    <div key={p.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#f8fafc", borderRadius: 7, border: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{p.nom_apprenant || "-"}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: sp.bg, color: sp.c }}>{sp.lib}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {actions && <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>{actions}</div>}
        </div>
      </div>
    </div>
  );
}
