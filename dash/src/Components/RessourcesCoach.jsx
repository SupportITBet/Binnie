import React, { useState, useEffect, useCallback } from "react";
import { urlEmbedVideo, estFichierVideo, estFichierAudio } from "../utils/urlVideo";
import { urlDocument } from "../utils/urlDocument";

/** Un lien qui n'est ni une plateforme connue ni un fichier lisible : on le dit, on l'ouvre. */
const NonLisible = ({ url, quoi, ico }) => (
  <div style={{ textAlign: "center", padding: 28, background: "#fffbeb", border: "1px dashed #fcd34d", borderRadius: 10, color: "#92400e", fontSize: 13 }}>
    <div style={{ fontSize: 34, marginBottom: 8 }}>{ico}</div>
    <div style={{ fontWeight: 700, marginBottom: 6 }}>Ce lien ne peut pas être lu ici</div>
    <div style={{ marginBottom: 8 }}>Ce n'est ni un fichier {quoi} ni une vidéo YouTube/Vimeo.</div>
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "#b45309", fontWeight: 700, wordBreak: "break-all" }}>{url} ↗</a>
  </div>
);

/**
 * Les ressources qu'un coach met à la disposition de ses apprenants - vue superviseur.
 *
 * DEUX ORIGINES réunies, parce que le superviseur veut savoir ce qui circule et non par
 * quel écran c'est passé : les fichiers déposés dans la conversation d'une classe, et les
 * médias qui vivent À L'INTÉRIEUR des modules e-learning. L'onglet « Modules e-learning »
 * montre les modules ; celui-ci montre les fichiers. Un coach peut avoir publié trois
 * modules contenant douze documents - la liste des modules ne le dit pas.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const NATURES = {
  image:    { l: "Image",    i: "🖼️", c: "#7c3aed" },
  audio:    { l: "Audio",    i: "🎧", c: "#0891b2" },
  video:    { l: "Vidéo",    i: "🎬", c: "#dc2626" },
  pdf:      { l: "PDF",      i: "📄", c: "#b45309" },
  document: { l: "Document", i: "📎", c: "#475569" },
};
const nature = (n) => NATURES[n] || NATURES.document;

const poidsLisible = (ko) =>
  !ko ? null : ko >= 1024 ? `${(ko / 1024).toFixed(1)} Mo` : `${ko} ko`;

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "-");

export default function RessourcesCoach({ coachId, coachNom, accent = "#0891b2", authHdrs }) {
  const [ressources, setRessources] = useState([]);
  const [totaux, setTotaux] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [filtreOrigine, setFiltreOrigine] = useState("");
  const [filtreNature, setFiltreNature] = useState("");
  const [ouverte, setOuverte] = useState(null);

  const charger = useCallback(async () => {
    if (!coachId) return;
    setChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/coachs/${coachId}/ressources`, { headers: authHdrs() });
      const d = r.ok ? await r.json() : { ressources: [], totaux: null };
      setRessources(d.ressources || []);
      setTotaux(d.totaux || null);
    } catch { setRessources([]); }
    finally { setChargement(false); }
  }, [coachId, authHdrs]);

  useEffect(() => { charger(); }, [charger]);

  const visibles = ressources.filter(r =>
    (!filtreOrigine || r.origine === filtreOrigine) &&
    (!filtreNature || r.nature === filtreNature));

  const Compteur = ({ n, l, c }) => (
    <div style={{ flex: 1, minWidth: 96, background: "#f8fafc", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 21, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{l}</div>
    </div>
  );

  if (chargement) {
    return <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>Chargement des ressources…</div>;
  }

  return (
    <div>
      {totaux && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <Compteur n={totaux.total} l="ressources" c="#0f172a" />
          <Compteur n={totaux.chat} l="dans les classes" c={accent} />
          <Compteur n={totaux.modules} l="dans les modules" c="#7c3aed" />
          {/* Le poids n'est connu que pour les fichiers du chat : les médias d'un module
              ne portent pas leur taille. On le dit plutôt que d'additionner un total faux. */}
          <Compteur n={poidsLisible(totaux.poids_ko) || "-"} l="poids (classes)" c="#64748b" />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtreOrigine} onChange={e => setFiltreOrigine(e.target.value)}
          style={{ padding: "8px 11px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
          <option value="">Toutes origines</option>
          <option value="chat">Partagé en classe</option>
          <option value="module">Dans un module</option>
        </select>
        <select value={filtreNature} onChange={e => setFiltreNature(e.target.value)}
          style={{ padding: "8px 11px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
          <option value="">Tous les types</option>
          {Object.entries(NATURES).map(([k, v]) => <option key={k} value={k}>{v.i} {v.l}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#64748b" }}>
          <strong style={{ color: "#0f172a" }}>{visibles.length}</strong> sur {ressources.length}
        </span>
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 44, background: "#f8fafc", borderRadius: 12, border: "1px dashed #e2e8f0", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 700, color: "#374151" }}>
            {ressources.length ? "Aucune ressource ne correspond à ces filtres" : "Aucune ressource partagée"}
          </div>
          {!ressources.length && (
            <div style={{ fontSize: 12.5, marginTop: 5 }}>
              {coachNom || "Ce coach"} n'a encore déposé aucun fichier en classe ni dans un module.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
          {visibles.map(r => {
            const n = nature(r.nature);
            return (
              <button key={r.id} onClick={() => setOuverte(r)}
                style={{ textAlign: "left", background: "#fff", border: `1px solid ${n.c}25`, borderRadius: 12, padding: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{n.i}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {n.l}{r.taille_ko ? ` · ${poidsLisible(r.taille_ko)}` : ""} · {dateFr(r.created_at)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                    background: r.origine === "chat" ? "#e0f2fe" : "#ede9fe",
                    color: r.origine === "chat" ? "#0369a1" : "#6d28d9" }}>
                    {r.origine === "chat" ? "💬 Classe" : "🧩 Module"}
                  </span>
                  {(r.classes || []).slice(0, 2).map(c => (
                    <span key={c} style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "#f1f5f9", color: "#475569" }}>🏫 {c}</span>
                  ))}
                  {/* Un fichier masqué ou un module en brouillon reste visible du
                      superviseur - c'est une information de contrôle - mais annoncé
                      comme tel, pour qu'il ne le croie pas accessible aux apprenants. */}
                  {r.masque && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#fef3c7", color: "#92400e" }}>
                      {r.origine === "chat" ? "masqué" : "brouillon"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {ouverte && <ModalRessource ressource={ouverte} onFermer={() => setOuverte(null)} accent={accent} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Consultation d'une ressource
══════════════════════════════════════════════════════════════ */

/**
 * La ressource se consulte SUR PLACE quand c'est possible - image, audio, vidéo, PDF.
 * Obliger à télécharger pour vérifier ce qu'un coach a partagé transformerait un contrôle
 * de dix secondes en une manipulation de fichiers.
 */
function ModalRessource({ ressource, onFermer, accent }) {
  const n = nature(ressource.nature);

  const apercu = () => {
    const s = { width: "100%", borderRadius: 10, background: "#0f172a" };
    switch (ressource.nature) {
      case "image":
        return <img src={ressource.url} alt={ressource.nom} style={{ ...s, maxHeight: "68vh", objectFit: "contain", background: "#f1f5f9" }} />;
      case "audio":
        /* Un « audio » peut être un lien YouTube : `<audio>` recevrait du HTML et le
           navigateur répondrait « MIME type non supporté ». */
        return urlEmbedVideo(ressource.url) ? (
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "#0f172a" }}>
            <iframe src={urlEmbedVideo(ressource.url)} title={ressource.nom} allowFullScreen
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
          </div>
        ) : estFichierAudio(ressource.url) ? (
          <audio controls preload="metadata" src={ressource.url} style={{ width: "100%" }} />
        ) : <NonLisible url={ressource.url} quoi="audio" ico={n.i} />;
      case "video":
        /* Idem : les liens YouTube/Vimeo passent par une intégration, les fichiers par
           `<video>`, et tout le reste est annoncé comme non lisible au lieu d'un
           lecteur noir qu'on prendrait pour une panne. */
        return urlEmbedVideo(ressource.url) ? (
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden", background: "#0f172a" }}>
            <iframe src={urlEmbedVideo(ressource.url)} title={ressource.nom} allowFullScreen
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
          </div>
        ) : estFichierVideo(ressource.url) ? (
          <video controls preload="metadata" src={ressource.url} style={{ ...s, maxHeight: "68vh" }} />
        ) : <NonLisible url={ressource.url} quoi="vidéo" ico={n.i} />;
      case "pdf":
        // `<iframe>` et non `<embed>` : c'est le seul que tous les navigateurs rendent
        // avec leur visionneuse intégrée, barre d'outils comprise.
        // Et PAR LE RELAIS : Cloudinary répond 401 sur les PDF de ce compte, l'aperçu
        // restait donc blanc même quand le format était correctement reconnu.
        return <iframe src={urlDocument(ressource.url, { nom: ressource.nom, inline: true })} title={ressource.nom} style={{ width: "100%", height: "68vh", border: "1px solid #e5e7eb", borderRadius: 10 }} />;
      default:
        return (
          <div style={{ textAlign: "center", padding: 34, background: "#f8fafc", borderRadius: 10, color: "#64748b", fontSize: 13 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>{n.i}</div>
            Ce format ne se prévisualise pas dans le navigateur.
          </div>
        );
    }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      {/* 90 % de l'écran - un PDF ou une vidéo se juge en grand. */}
      <div style={{ background: "#fff", borderRadius: 14, width: "90vw", height: "90vh", overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
              <span>{n.i}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ressource.nom}</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
              {n.l}
              {ressource.taille_ko ? ` · ${poidsLisible(ressource.taille_ko)}` : ""}
              {" · "}{dateFr(ressource.created_at)}
              {ressource.origine === "chat" ? " · partagé dans la conversation de classe" : ""}
            </div>
          </div>
          <button onClick={onFermer}
            style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#374151", fontWeight: 700, fontSize: 13 }}>✕</button>
        </div>

        {/* Le module d'origine : sans lui, on voit un fichier sans savoir dans quel cours
            il sert, et le superviseur ne peut pas juger sa pertinence. */}
        {ressource.contexte && (
          <div style={{ background: "#ede9fe", borderRadius: 9, padding: "10px 13px", marginBottom: 14, fontSize: 12.5, color: "#5b21b6" }}>
            🧩 Extrait du module <strong>« {ressource.contexte.module_titre} »</strong>
            {ressource.contexte.statut !== "publie" && <> - <strong>{ressource.contexte.statut}</strong>, donc non visible des apprenants</>}
          </div>
        )}

        {(ressource.classes || []).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {ressource.classes.map(c => (
              <span key={c} style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "#f1f5f9", color: "#475569" }}>🏫 {c}</span>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>{apercu()}</div>

        {/* Même relais pour l'ouverture : le lien direct échouait sur les PDF. */}
        <a href={urlDocument(ressource.url, { nom: ressource.nom })} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", background: accent, color: "#fff", borderRadius: 9, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
          ⬇ Ouvrir dans un nouvel onglet
        </a>
      </div>
    </div>
  );
}
