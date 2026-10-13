import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

/**
 * Appréciation d'un cours par l'apprenant - bandeau de rappel et formulaire.
 *
 * Le bandeau ne se ferme pas. C'est délibéré : une notification qu'on peut écarter est
 * écartée, et le taux de réponse tombe à quelques pour cent. Il disparaît quand la
 * dernière séance a été notée, et pas avant.
 *
 * Seules les séances où l'apprenant était PRÉSENT remontent ici - le serveur ne renvoie
 * que celles-là, et revérifie la présence à l'enregistrement.
 *
 * Ces notes ne sont jamais montrées au coach. C'est écrit dans le formulaire, parce que
 * c'est la seule chose qui rend une réponse sincère possible.
 */

/**
 * L'échelle, telle que rédigée par BET. Chaque niveau décrit quatre dimensions -
 * objectifs, clarté, occasions de s'exprimer, interactivité - plutôt que de les poser
 * en quatre questions : après un cours, on choisit la phrase qui correspond.
 */
export const NIVEAUX_APPRECIATION = [
  {
    note: 5, titre: "Excellent", emoji: "🌟",
    couleur: "#15803d", fond: "#dcfce7", bord: "#86efac",
    texte: "Les objectifs du cours étaient clairs, les explications du coach étaient claires et faciles à comprendre, j'ai eu suffisamment d'occasions de m'exprimer en anglais, les activités étaient interactives et utiles, j'ai appris de nouveaux mots. Dans l'ensemble, je suis satisfait(e) de ce cours.",
  },
  {
    note: 4, titre: "Bon", emoji: "👍",
    couleur: "#0369a1", fond: "#e0f2fe", bord: "#7dd3fc",
    texte: "Les objectifs du cours étaient clairs, les explications du coach étaient claires et faciles à comprendre, j'ai eu un nombre acceptable d'occasions de m'exprimer en anglais, les activités étaient interactives et utiles, j'ai appris de nouveaux mots. Dans l'ensemble, je suis satisfait(e) de ce cours.",
  },
  {
    note: 3, titre: "Acceptable", emoji: "🙂",
    couleur: "#a16207", fond: "#fef9c3", bord: "#fde047",
    texte: "Les objectifs du cours étaient clairs, les explications du coach étaient parfois difficiles à comprendre, j'ai eu un nombre acceptable d'occasions de m'exprimer en anglais, les activités n'étaient pas suffisamment interactives, j'ai appris quelques nouveaux mots. Dans l'ensemble, je suis plus ou moins satisfait(e) de ce cours.",
  },
  {
    note: 2, titre: "Insuffisant", emoji: "😕",
    couleur: "#b91c1c", fond: "#fee2e2", bord: "#fca5a5",
    texte: "Les explications du coach étaient difficiles à comprendre. Je n'ai pas eu suffisamment d'occasions de m'exprimer en anglais, les activités n'étaient pas interactives. Dans l'ensemble, je ne suis pas satisfait(e) de ce cours.",
  },
];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "-";

/** Lit les séances restant à noter. Exporté : l'écran hôte en a besoin pour le badge. */
export function useSeancesANoter(apiUrl, jeton) {
  const [seances, setSeances] = useState([]);
  const [chargement, setChargement] = useState(false);

  const recharger = useCallback(async () => {
    const token = typeof jeton === "function" ? jeton() : jeton;
    if (!token) return;
    setChargement(true);
    try {
      /* `X-Plateforme` EST CE QUI REND CET ÉCRAN FONCTIONNEL ICI. Sans lui, le serveur
         cherche les séances de l'apprenant dans `groupes_apprenants` / `seances` —
         les tables du présentiel — où un apprenant e-learning n'existe pas : la liste
         revenait donc toujours vide et il n'a jamais pu noter son coach.
         Ce composant ne vit que dans bet-elearning ; l'en-tête y est donc constant. */
      const r = await fetch(`${apiUrl}/api/appreciations/a-noter`, {
        headers: { Authorization: `Bearer ${token}`, "X-Plateforme": "bet-elearning" },
      });
      const d = r.ok ? await r.json() : { seances: [] };
      setSeances(d.seances || []);
    } catch {
      // Silencieux : un réseau indisponible ne doit pas empêcher l'apprenant
      // d'utiliser le reste de son espace.
      setSeances([]);
    } finally {
      setChargement(false);
    }
  }, [apiUrl, jeton]);

  useEffect(() => { recharger(); }, [recharger]);
  return { seances, chargement, recharger };
}

/** Le bandeau fixe. Ne se ferme pas tant qu'il reste une séance à noter. */
export function BandeauAppreciation({ nb, onOuvrir, accent = "#7c3aed" }) {
  if (!nb) return null;
  return (
    <div
      onClick={onOuvrir}
      role="button"
      style={{
        position: "sticky", top: 0, zIndex: 900, cursor: "pointer",
        background: "linear-gradient(90deg,#fef3c7,#fde68a)",
        borderBottom: "2px solid #f59e0b",
        padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 20 }}>⭐</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#92400e" }}>
          {nb === 1
            ? "Vous avez 1 cours à évaluer"
            : `Vous avez ${nb} cours à évaluer`}
        </div>
        <div style={{ fontSize: 12, color: "#a16207" }}>
          Votre avis aide BET à améliorer la qualité des cours - il n'est jamais transmis au coach.
        </div>
      </div>
      <span style={{
        background: accent, color: "#fff", borderRadius: 8, padding: "7px 16px",
        fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap",
      }}>
        Donner mon avis →
      </span>
    </div>
  );
}

/** Le formulaire, une séance à la fois. */
export default function AppreciationSeance({ seances, apiUrl, jeton, onFerme, onEnvoye, accent = "#7c3aed" }) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState(null);
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  // La note ne peut pas etre modifiee apres coup - l'index unique (seance, apprenant)
  // l'interdit. Une confirmation s'impose donc avant l'envoi, pas apres.
  const [confirmation, setConfirmation] = useState(false);

  const seance = seances?.[index];

  // Chaque séance repart d'un formulaire vierge : garder la note précédente
  // inviterait à valider la même sans lire.
  useEffect(() => { setNote(null); setCommentaire(""); setConfirmation(false); }, [index]);

  if (!seance) return null;

  const envoyer = async () => {
    if (!note || envoi) return;
    setConfirmation(false);
    setEnvoi(true);
    try {
      const token = typeof jeton === "function" ? jeton() : jeton;
      const r = await fetch(`${apiUrl}/api/appreciations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Plateforme": "bet-elearning" },
        body: JSON.stringify({ seance_id: seance.id, note, commentaire }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error || "Envoi impossible"); return; }

      toast.success("Merci pour votre retour !");
      onEnvoye?.(seance.id);
      // Enchaîner sur la suivante plutôt que refermer : il en reste souvent
      // plusieurs, et rouvrir le formulaire à chaque fois décourage.
      if (index < seances.length - 1) setIndex(i => i + 1);
      else onFerme?.();
    } catch {
      toast.error("Serveur injoignable");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,.72)", zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFerme?.(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 18, width: "100%", maxWidth: 620,
        maxHeight: "92vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,.4)",
      }}>
        <div style={{ background: `linear-gradient(135deg, ${accent}, #4c1d95)`, padding: "20px 24px", color: "#fff" }}>
          <div style={{ fontSize: 11, opacity: .8, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
            Appréciation du cours
            {seances.length > 1 && ` · ${index + 1} / ${seances.length}`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 5 }}>{seance.titre || "Séance"}</div>
          <div style={{ fontSize: 12.5, opacity: .9, marginTop: 3 }}>
            {fmtDate(seance.date_seance)}
            {seance.groupe_nom ? ` · ${seance.groupe_nom}` : ""}
            {seance.coach_nom ? ` · avec ${seance.coach_nom}` : ""}
          </div>
        </div>

        <div style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 14, lineHeight: 1.55 }}>
            Choisissez la description qui correspond le mieux à ce cours.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {NIVEAUX_APPRECIATION.map(n => {
              const choisi = note === n.note;
              return (
                <button
                  key={n.note}
                  type="button"
                  onClick={() => setNote(n.note)}
                  style={{
                    textAlign: "left", cursor: "pointer", borderRadius: 12,
                    border: `2px solid ${choisi ? n.couleur : "#e2e8f0"}`,
                    background: choisi ? n.fond : "#fff",
                    padding: "12px 14px", transition: "border-color .15s, background .15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 17 }}>{n.emoji}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: n.couleur }}>
                      {n.note === 2 ? "1 / 2" : n.note} - {n.titre}
                    </span>
                    {choisi && <span style={{ marginLeft: "auto", color: n.couleur, fontWeight: 800 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5 }}>{n.texte}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5 }}>
              Souhaitez-vous ajouter un mot ? <span style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</span>
            </label>
            <textarea
              rows={3}
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              maxLength={1000}
              placeholder="Ce qui vous a plu, ce qui pourrait être amélioré…"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {/* La promesse qui rend une réponse sincère possible. */}
          <div style={{
            marginTop: 14, background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#64748b", lineHeight: 1.5,
          }}>
            🔒 Votre coach ne verra jamais cette note. Elle est lue par le superviseur et le
            conseiller pédagogique, pour améliorer la qualité des cours.
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <button
              onClick={() => onFerme?.()}
              style={{
                padding: "10px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0",
                background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Plus tard
            </button>
            <button
              onClick={() => setConfirmation(true)}
              disabled={!note || envoi}
              style={{
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: note && !envoi ? accent : "#e2e8f0",
                color: note && !envoi ? "#fff" : "#94a3b8",
                fontSize: 13, fontWeight: 800, cursor: note && !envoi ? "pointer" : "not-allowed",
              }}
            >
              {envoi ? "Envoi…" : index < seances.length - 1 ? "Valider et suivant →" : "Envoyer mon avis"}
            </button>
          </div>
        </div>
      </div>

      {confirmation && (() => {
        const niveau = NIVEAUX_APPRECIATION.find(n => n.note === note);
        return (
          <div
            onClick={e => { if (e.target === e.currentTarget) setConfirmation(false); }}
            style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.6)", zIndex:2100,
              display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          >
            <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:430,
              boxShadow:"0 24px 64px rgba(0,0,0,.35)", overflow:"hidden" }}>
              <div style={{ padding:"20px 22px 16px" }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:8 }}>
                  Confirmer votre avis ?
                </div>

                {/* Rappeler le choix : entre le clic sur une carte et le bouton, on a pu
                    en sélectionner une autre sans s'en rendre compte. */}
                {niveau && (
                  <div style={{ background:niveau.fond, border:`1.5px solid ${niveau.bord}`,
                    borderRadius:10, padding:"10px 13px", marginBottom:12 }}>
                    <div style={{ fontWeight:800, fontSize:13.5, color:niveau.couleur }}>
                      {niveau.emoji} {niveau.note === 2 ? "1 / 2" : niveau.note} - {niveau.titre}
                    </div>
                  </div>
                )}

                {commentaire.trim() && (
                  <div style={{ fontSize:12.5, color:"#475569", background:"#f8fafc",
                    borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.5 }}>
                    « {commentaire.trim()} »
                  </div>
                )}

                <div style={{ fontSize:12.5, color:"#b45309", background:"#fffbeb",
                  border:"1px solid #fde68a", borderRadius:8, padding:"9px 12px", lineHeight:1.5 }}>
                  ⚠️ Cet avis est définitif : vous ne pourrez plus le modifier une fois envoyé.
                </div>
              </div>

              <div style={{ display:"flex", gap:10, justifyContent:"flex-end",
                padding:"0 22px 20px" }}>
                <button onClick={() => setConfirmation(false)}
                  style={{ padding:"9px 16px", borderRadius:9, border:"1.5px solid #e2e8f0",
                    background:"#fff", color:"#64748b", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  Modifier
                </button>
                <button onClick={envoyer} disabled={envoi}
                  style={{ padding:"9px 20px", borderRadius:9, border:"none",
                    background: envoi ? "#e2e8f0" : accent, color: envoi ? "#94a3b8" : "#fff",
                    fontSize:13, fontWeight:800, cursor: envoi ? "not-allowed" : "pointer" }}>
                  {envoi ? "Envoi…" : "Confirmer et envoyer"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
