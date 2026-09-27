import React, { useState, useEffect, useCallback } from "react";

/**
 * L'historique des mouvements, sous ses deux angles.
 *
 * `ParcoursApprenant` : la suite des classes d'UN apprenant - où il est passé, quand, et
 * pourquoi il en est parti.
 * `MouvementsClasse` : l'inverse, vu d'UNE classe - qui l'a rejointe, qui l'a quittée.
 *
 * Ces deux lectures existaient déjà chez la commerciale, écrites en ligne dans son fichier.
 * Le coach en a le même besoin - c'est lui qui voit une place se libérer - et recopier
 * deux cents lignes de rendu aurait garanti qu'elles divergent à la première correction.
 * D'où ce composant, et d'où le fait que les deux écrans appellent les MÊMES routes.
 *
 * Trois natures de mouvement, et elles ne se confondent pas :
 *   · une ARRIVÉE par transfert,
 *   · un DÉPART par transfert - il va ailleurs,
 *   · un ARRÊT de formation - il ne va nulle part, et c'est le seul dont le motif soit
 *     réellement saisi à la main, par l'assistante, au moment du geste.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const dateLongue = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "-";
const dateCourte = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const Vide = ({ titre, aide }) => (
  <div style={{ textAlign: "center", padding: 44, color: "#94a3b8" }}>
    <div style={{ fontSize: 30, marginBottom: 10 }}>🕓</div>
    <div style={{ fontWeight: 700, fontSize: 13, color: "#475569" }}>{titre}</div>
    {aide && <div style={{ fontSize: 12, marginTop: 6 }}>{aide}</div>}
  </div>
);

const Chargement = () => (
  <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
);

/** Charge une route d'historique, en gardant `authHdrs` hors des dépendances. */
function useHistorique(url, authHdrs, actif = true) {
  const [donnees, setDonnees] = useState([]);
  const [chargement, setChargement] = useState(true);
  // `authHdrs` est presque toujours une fonction fléchée écrite dans le JSX : son identité
  // change à chaque rendu. Dans les dépendances, elle relancerait le fetch après chaque
  // réponse - une boucle sans fin.
  const hdrs = React.useRef(authHdrs);
  hdrs.current = authHdrs;

  const charger = useCallback(async () => {
    if (!url || !actif) { setChargement(false); return; }
    setChargement(true);
    try {
      const r = await fetch(url, { headers: hdrs.current() });
      const d = r.ok ? await r.json() : { historique: [] };
      setDonnees(d.historique || []);
    } catch { setDonnees([]); }
    finally { setChargement(false); }
  }, [url, actif]);

  useEffect(() => { charger(); }, [charger]);
  return { donnees, chargement };
}

/* ═══════════════════════════════════════════════════════════════
   LE PARCOURS D'UN APPRENANT - ses classes successives
═══════════════════════════════════════════════════════════════ */
export function ParcoursApprenant({ gaId, authHdrs }) {
  const { donnees, chargement } = useHistorique(
    gaId ? `${API_URL}/api/groupes/apprenants/${gaId}/historique` : null, authHdrs, !!gaId);
  const [ouvert, setOuvert] = useState(null);

  if (!gaId) {
    return <Vide titre="Aucune classe liée" aide="Le parcours apparaîtra dès que l'apprenant sera rattaché à une classe." />;
  }
  if (chargement) return <Chargement />;
  if (!donnees.length) {
    return <Vide titre="Aucun historique pour l'instant" aide="Les changements de classe et les arrêts de formation apparaîtront ici." />;
  }

  // Du plus ancien au plus récent : un parcours se lit dans le sens où il a été vécu.
  const lignes = [...donnees].reverse();

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>
        🕓 Parcours de l'apprenant
        <span style={{ fontWeight: 500, fontSize: 11.5, color: "#94a3b8", marginLeft: 8 }}>
          {lignes.length} classe{lignes.length > 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {lignes.map((h, i) => {
          const actuel  = h.statut === "actif" || h.statut === "periode_test";
          const arrete  = h.statut === "retire" || (!!h.date_retrait && h.statut !== "transfere");
          const etat = arrete
            ? { l: "A arrêté",       bg: "#ffedd5", c: "#9a3412", point: "#ea580c" }
            : actuel
            ? { l: "Classe actuelle", bg: "#dcfce7", c: "#166534", point: "#16a34a" }
            : { l: "Transféré",       bg: "#f1f5f9", c: "#6b7280", point: "#cbd5e1" };
          const typeLabel = h.type_cours === "en_ligne" ? "💻 En ligne"
            : h.type_cours === "hybride" ? "⚡ Hybride"
            : h.type_cours ? "🏢 Présentiel" : null;
          const deplie = ouvert === h.id;

          return (
            <div key={h.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 12 }}>
              {/* La ligne de temps */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: etat.point, marginTop: 6, flexShrink: 0 }} />
                {i < lignes.length - 1 && <div style={{ width: 2, flex: 1, background: "#e5e7eb", marginTop: 2 }} />}
              </div>

              <div style={{ paddingBottom: 18 }}>
                <div onClick={() => setOuvert(deplie ? null : h.id)} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{h.groupe_nom}</span>
                    {h.niveau && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 99, background: "#1e3a8a", color: "#fff" }}>{h.niveau}</span>}
                    {typeLabel && <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{typeLabel}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: etat.bg, color: etat.c }}>{etat.l}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>{deplie ? "▲" : "▼"}</span>
                  </div>

                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                    {dateLongue(h.date_ajout)}
                    {h.date_retrait ? ` → ${dateLongue(h.date_retrait)}` : actuel ? " → aujourd'hui" : ""}
                  </div>

                  {/* L'ASSIDUITÉ DE CETTE ÉTAPE. Un transfert clôt une inscription et en ouvre
                      une autre : sans ce rappel, les présences d'avant le dernier changement
                      de classe n'apparaissaient nulle part, et le parcours se réduisait à une
                      liste de noms de classes. `null` = rien n'a été pointé, ce qui n'est pas
                      la même chose que 0 %. */}
                  {h.seances_pointees > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {(() => {
                        const t = h.taux_presence;
                        const c = t >= 80 ? "#15803d" : t >= 60 ? "#b45309" : "#b91c1c";
                        const bg = t >= 80 ? "#dcfce7" : t >= 60 ? "#fef3c7" : "#fee2e2";
                        return (
                          <span title={`${h.presences} présence(s) sur ${h.seances_pointees} séance(s) pointée(s)`}
                            style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: bg, color: c }}>
                            📊 {t}% d'assiduité
                          </span>
                        );
                      })()}
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 9px", borderRadius: 99, background: "#f1f5f9", color: "#475569" }}>
                        {h.presences} présent{h.presences > 1 ? "s" : ""} · {h.absences} absent{h.absences > 1 ? "s" : ""}
                        {h.retards > 0 ? ` · ${h.retards} retard${h.retards > 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                  )}

                  {h.motif && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>💬 {h.motif}</div>}
                </div>

                {deplie && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Coach</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{h.coach_nom || "Non assigné"}</div>
                      {h.coach_telephone && <div style={{ fontSize: 11, color: "#0891b2" }}>📞 {h.coach_telephone}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Assistante</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{h.assistante_nom || "-"}</div>
                    </div>
                    {h.centre_nom && (
                      <div style={{ gridColumn: "1/-1" }}>
                        <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Centre</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>📍 {h.centre_nom}{h.centre_ville ? ` · ${h.centre_ville}` : ""}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LES MOUVEMENTS D'UNE CLASSE - qui arrive, qui part
═══════════════════════════════════════════════════════════════ */
export function MouvementsClasse({ groupeId, authHdrs }) {
  const { donnees, chargement } = useHistorique(
    groupeId ? `${API_URL}/api/groupes/${groupeId}/historique` : null, authHdrs, !!groupeId);

  if (chargement) return <Chargement />;
  if (!donnees.length) {
    return <Vide titre="Aucun mouvement d'apprenant" aide="Les arrivées, les départs par transfert et les arrêts de formation apparaîtront ici." />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>🕓 Mouvements d'apprenants</div>
        <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
          {donnees.length} mouvement{donnees.length > 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {donnees.map((m, i) => {
          const M = {
            arrivee: { teinte: "#16a34a", fond: "#f0fdf4", fleche: "↘", phrase: "a rejoint cette classe" },
            depart:  { teinte: "#b45309", fond: "#fffbeb", fleche: "↗", phrase: "a quitté cette classe" },
            arret:   { teinte: "#9a3412", fond: "#fff7ed", fleche: "🎓", phrase: "a arrêté sa formation" },
          }[m.type] || { teinte: "#64748b", fond: "#f8fafc", fleche: "•", phrase: "mouvement" };

          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: M.fond,
              border: `1px solid ${M.teinte}22`, borderLeft: `3px solid ${M.teinte}`, borderRadius: 8, padding: "12px 14px" }}>
              <span style={{ fontSize: 15, lineHeight: 1.25 }}>{M.fleche}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{m.apprenant}</span>
                  {m.niveau && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: M.teinte, background: "#fff",
                      border: `1px solid ${M.teinte}44`, borderRadius: 99, padding: "1px 7px" }}>{m.niveau}</span>
                  )}
                  <span style={{ fontSize: 12, color: M.teinte, fontWeight: 600 }}>{M.phrase}</span>
                </div>

                {m.classe_liee && (
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
                    {m.type === "arrivee" ? "En provenance de" : "Vers"} <strong>{m.classe_liee}</strong>
                  </div>
                )}

                {/* Un arrêt SANS motif est dit comme tel : une ligne vide laisse croire à un
                    défaut d'affichage plutôt qu'à un motif jamais saisi. */}
                {m.motif
                  ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontStyle: "italic" }}>« {m.motif} »</div>
                  : m.type === "arret" && <div style={{ fontSize: 12, color: "#b45309", marginTop: 3, fontStyle: "italic" }}>motif non renseigné</div>}

                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  {dateCourte(m.date)}{m.par ? ` · par ${m.par}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
