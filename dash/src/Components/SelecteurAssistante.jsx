import React, { useState, useEffect, useMemo, useRef } from "react";

/**
 * À QUI CONFIER CE DOSSIER.
 *
 * CE QU'IL REMPLACE : un `<select>` natif listant quatorze noms en majuscules, sans rien
 * d'autre. Trois défauts, et ils se cumulaient.
 *
 *   · AUCUNE INFORMATION POUR CHOISIR. Des noms nus ne disent pas qui est déjà surchargée.
 *     Sans cela, c'est toujours la première de la liste qui reçoit tout - et la répartition
 *     dérive sans que personne ne s'en aperçoive.
 *
 *   · LE CHOIX ÉTAIT L'ACTION. Le `onChange` d'un `<select>` déclenchait l'attribution
 *     immédiatement : un clic de travers confiait l'apprenant à quelqu'un, sans retour
 *     possible depuis cet écran. Une liste déroulante n'est pas un endroit où l'on engage
 *     quelque chose.
 *
 *   · QUATORZE OPTIONS SANS RECHERCHE. La liste native dépasse la fenêtre et se parcourt à
 *     l'aveugle quand on sait déjà quel nom on cherche.
 *
 * D'OÙ DEUX TEMPS DANS UN SEUL MODAL : on choisit, puis on confirme en voyant ce qu'on
 * engage. Deux modals superposés auraient posé le même problème de z-index que la fiche
 * apprenant, et un seul écran de confirmation suffit à rendre le geste délibéré.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const libelleCanal = (c) =>
  c === "en_ligne" ? "En ligne" : c === "presentiel" ? "Présentiel"
  : c === "hybride" || c === "les_deux" ? "Hybride" : null;

/** Les initiales, quand il n'y a pas de photo. Jamais un rond vide. */
const initiales = (a) =>
  ((a?.prenom?.[0] || "") + (a?.nom?.[0] || "")).toUpperCase() || "?";

/**
 * @param {boolean}  ouvert
 * @param {Function} onFermer
 * @param {object}   apprenant   { nom, classe, niveau, canal, telephone, email, mensualite }
 * @param {Function} onConfirmer (assistante) => Promise — l'appelant fait l'écriture
 * @param {boolean}  enCours     true pendant l'écriture : fige les deux boutons
 * @param {string}   accent
 */
export default function SelecteurAssistante({
  ouvert, onFermer, apprenant, onConfirmer, enCours = false, accent = "#7c3aed",
}) {
  const [assistantes, setAssistantes] = useState([]);
  const [charge, setCharge] = useState({});
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [choisie, setChoisie] = useState(null);
  const champRef = useRef(null);

  /* Rechargé à chaque ouverture, et non une fois pour toutes : entre deux attributions, la
     charge a bougé - c'est même le propre de l'écran de la faire bouger. */
  useEffect(() => {
    if (!ouvert) return;
    setChoisie(null); setRecherche(""); setChargement(true);
    const jeton = { Authorization: `Bearer ${localStorage.getItem("admin_token")}` };
    Promise.all([
      fetch(`${API_URL}/api/parcours/assistantes-ligne`).then(r => r.ok ? r.json() : { assistantes: [] }).catch(() => ({ assistantes: [] })),
      fetch(`${API_URL}/api/parcours/assistantes-ligne/charge`, { headers: jeton }).then(r => r.ok ? r.json() : { charge: {} }).catch(() => ({ charge: {} })),
    ]).then(([a, c]) => {
      setAssistantes(a.assistantes || []);
      setCharge(c.charge || {});
    }).finally(() => setChargement(false));
  }, [ouvert]);

  // Le curseur dans la recherche à l'ouverture : on sait presque toujours quel nom on cherche.
  useEffect(() => { if (ouvert && !chargement) champRef.current?.focus(); }, [ouvert, chargement]);

  // Échap ferme, comme partout ailleurs - mais jamais pendant l'écriture.
  useEffect(() => {
    if (!ouvert) return;
    const h = (e) => { if (e.key === "Escape" && !enCours) onFermer?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ouvert, enCours, onFermer]);

  /* Triées par charge CROISSANTE : la moins chargée en tête. L'ordre est lui-même une
     recommandation - c'est ce que l'ordre alphabétique ne disait pas. */
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return assistantes
      .filter(a => !q || `${a.prenom || ""} ${a.nom || ""} ${a.email || ""}`.toLowerCase().includes(q))
      .sort((x, y) => (charge[x.id] || 0) - (charge[y.id] || 0)
        || `${x.prenom || ""} ${x.nom || ""}`.localeCompare(`${y.prenom || ""} ${y.nom || ""}`));
  }, [assistantes, charge, recherche]);

  const chargeMax = useMemo(
    () => Math.max(1, ...assistantes.map(a => charge[a.id] || 0)), [assistantes, charge]);

  if (!ouvert) return null;

  const nomDe = (a) => `${a?.prenom || ""} ${a?.nom || ""}`.trim() || "—";

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !enCours) onFermer?.(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", backdropFilter: "blur(3px)",
        zIndex: 9600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* AGRANDI (520 → 720 px, 86 → 92 vh). La liste des assistantes se lit en balayant trois
          informations à la fois — le nom, la jauge de charge et le nombre de dossiers — et à
          520 px les noms composés de ce parc (« KOFFI KADY JUDITH épouse PULBERE ») serraient la
          jauge contre le compteur. Plus de hauteur, c'est aussi deux ou trois assistantes de
          plus visibles sans faire défiler : le choix se fait par comparaison, et comparer
          suppose de voir ensemble. */}
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh",
        display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,.3)", overflow: "hidden" }}>

        {/* ── En-tête : de QUI parle-t-on ──
            Le nom de l'apprenant reste affiché pendant tout le choix. Sans lui, on ouvre
            quatre fois le même écran sans savoir lequel des quatre dossiers on traite. */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>
                Confier {apprenant?.nom || "ce dossier"}
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3 }}>
                {[apprenant?.classe, apprenant?.niveau, libelleCanal(apprenant?.canal)].filter(Boolean).join(" · ") || "Dossier sans classe"}
              </div>
            </div>
            <button onClick={() => !enCours && onFermer?.()} disabled={enCours}
              style={{ background: "#f1f5f9", border: "none", borderRadius: 9, width: 30, height: 30, fontSize: 15,
                cursor: enCours ? "not-allowed" : "pointer", color: "#475569", lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* ── Temps 1 : choisir ── */}
        {!choisie && (
          <>
            <div style={{ padding: "12px 20px 0" }}>
              <input ref={champRef} value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="🔍 Rechercher une assistante…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e5e7eb",
                  fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "#94a3b8", margin: "7px 0 4px" }}>
                Classées de la moins chargée à la plus chargée.
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "4px 20px 16px" }}>
              {chargement ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
              ) : visibles.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  {assistantes.length ? "Aucune assistante ne correspond." : "Aucune assistante en ligne active."}
                </div>
              ) : visibles.map(a => {
                const n = charge[a.id] || 0;
                return (
                  <button key={a.id} onClick={() => setChoisie(a)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 11px",
                      marginBottom: 6, borderRadius: 11, border: "1.5px solid #e5e7eb", background: "#fff",
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = "#fafaff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fff"; }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                      background: `${accent}1a`, color: accent, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                      {a.photo_url ? <img src={a.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initiales(a)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomDe(a)}</div>
                      {/* LA CHARGE EN BARRE AUTANT QU'EN CHIFFRE : « 18 » ne dit rien tant qu'on
                          ne sait pas si les autres en ont 2 ou 40. La barre donne le rapport
                          d'un coup d'œil, le chiffre donne la précision. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                        <div style={{ flex: "0 1 110px", height: 4, borderRadius: 99, background: "#f1f5f9", overflow: "hidden" }}>
                          <div style={{ width: `${Math.round((n / chargeMax) * 100)}%`, height: "100%",
                            background: n === 0 ? "#16a34a" : n >= chargeMax ? "#f59e0b" : accent }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                          {n === 0 ? "aucun dossier" : `${n} dossier${n > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>

                    {a.profil === "b2b" && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", background: "#dbeafe",
                        borderRadius: 99, padding: "2px 7px", flexShrink: 0 }}>B2B</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Temps 2 : confirmer ──
            On montre ce qu'on engage, pas « êtes-vous sûr ». La conséquence réelle - elle
            verra ce dossier, lui seule - est ce qui permet de dire si on s'est trompé. */}
        {choisie && (
          <>
            <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px",
                background: "#faf8ff", border: `1.5px solid ${accent}33`, borderRadius: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                  background: `${accent}1a`, color: accent, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, fontWeight: 800 }}>
                  {choisie.photo_url ? <img src={choisie.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initiales(choisie)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{nomDe(choisie)}</div>
                  <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                    {(charge[choisie.id] || 0) === 0
                      ? "Aucun dossier pour l'instant"
                      : `${charge[choisie.id]} dossier${charge[choisie.id] > 1 ? "s" : ""} en cours`}
                    {choisie.email && <> · {choisie.email}</>}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.65, marginTop: 14 }}>
                <strong style={{ color: "#0f172a" }}>{apprenant?.nom || "Ce dossier"}</strong> lui sera rattaché.
                Elle le verra dans sa liste d'apprenants, suivra ses paiements et son démarrage.
                {apprenant?.classe && <> Sa classe <strong>{apprenant.classe}</strong> ne change pas.</>}
              </div>

              <div style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.6, marginTop: 10 }}>
                {/* Dire que c'est réversible évite l'hésitation sur un geste qui l'est : la
                    peur de se tromper est ce qui fait remettre l'attribution à plus tard. */}
                Réversible : vous pourrez confier ce dossier à quelqu'un d'autre depuis la fiche
                de l'apprenant.
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb", display: "flex",
              gap: 9, justifyContent: "flex-end", background: "#fcfcfd" }}>
              <button onClick={() => setChoisie(null)} disabled={enCours}
                style={{ padding: "9px 15px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "#fff",
                  fontSize: 12.5, fontWeight: 700, color: "#475569", fontFamily: "inherit",
                  cursor: enCours ? "not-allowed" : "pointer" }}>
                ← Choisir une autre
              </button>
              <button onClick={() => onConfirmer?.(choisie)} disabled={enCours}
                style={{ padding: "9px 18px", borderRadius: 9, border: "none",
                  background: enCours ? "#cbd5e1" : accent, color: "#fff", fontSize: 12.5, fontWeight: 800,
                  fontFamily: "inherit", cursor: enCours ? "not-allowed" : "pointer" }}>
                {enCours ? "Attribution…" : "Confirmer l'attribution"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
