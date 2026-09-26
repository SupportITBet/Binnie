import React from "react";
import { urlDocument, extensionDe } from "../utils/urlDocument";
import { urlEmbedVideo, estFichierVideo, estFichierAudio } from "../utils/urlVideo";

/**
 * Le contenu INTÉGRAL d'un module e-learning, tel que le superviseur doit pouvoir le lire.
 *
 * Deux écarts assumés avec la vue de l'apprenant, et ils découlent du rôle :
 *
 *  · LES BONNES RÉPONSES DES QUIZ SONT AFFICHÉES d'emblée. Le superviseur audite la
 *    qualité du contenu, il ne passe pas le test - lui cacher le corrigé l'empêcherait
 *    précisément de juger si les questions tiennent debout.
 *
 *  · LES MÉDIAS SE LISENT SUR PLACE, au lieu d'un lien à ouvrir dans un onglet.
 *    Vérifier la qualité d'un enregistrement suppose de l'entendre.
 *
 * Les brouillons sont inclus : un contenu en préparation est justement celui sur lequel
 * une remarque vaut encore la peine d'être faite.
 */

const TYPES_BLOC = {
  texte:     { ico: "📝", lib: "Cours",     coul: "#3b82f6" },
  exercice:  { ico: "✏️", lib: "Exercice",  coul: "#ec4899" },
  quiz:      { ico: "🧩", lib: "Quiz",      coul: "#f97316" },
  qcm:       { ico: "🧩", lib: "QCM",       coul: "#f97316" },
  video:     { ico: "🎬", lib: "Vidéo",     coul: "#8b5cf6" },
  audio:     { ico: "🎧", lib: "Audio",     coul: "#10b981" },
  listening: { ico: "🎧", lib: "Listening", coul: "#10b981" },
  speaking:  { ico: "🗣", lib: "Speaking",  coul: "#0ea5e9" },
  lien:      { ico: "🔗", lib: "Lien",      coul: "#06b6d4" },
  document:  { ico: "📄", lib: "Document",  coul: "#f59e0b" },
  image:     { ico: "🖼️", lib: "Image",     coul: "#db2777" },
};
const typeBloc = (t) => TYPES_BLOC[t] || { ico: "📦", lib: t || "Bloc", coul: "#64748b" };

/** Les sections d'un bloc texte/exercice, chacune selon son niveau. */
function Sections({ sections, coul }) {
  if (!sections?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sections.map((sec, i) => (
        <div key={sec.id || i}>
          {sec.niveau === "h2" && (
            <h4 style={{ margin: "0 0 6px", fontSize: 14.5, color: "#0f172a", fontWeight: 800,
              borderBottom: `2px solid ${coul}30`, paddingBottom: 5 }}>{sec.titre}</h4>
          )}
          {sec.niveau === "note" && (
            <div style={{ background: "#fffbeb", borderLeft: "3px solid #f59e0b",
              borderRadius: "0 8px 8px 0", padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4, fontSize: 12 }}>{sec.titre}</div>
              <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{sec.contenu}</div>
            </div>
          )}
          {sec.niveau === "ul" && (
            <div>
              {sec.titre && <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{sec.titre}</div>}
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {String(sec.contenu || "").split("\n").filter(l => l.trim()).map((l, li) => (
                  <li key={li} style={{ fontSize: 13, color: "#374151", lineHeight: 1.8 }}>{l.replace(/^-\s*/, "")}</li>
                ))}
              </ul>
            </div>
          )}
          {!["h2", "note", "ul"].includes(sec.niveau) && sec.contenu && (
            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sec.contenu}</p>
          )}
          {sec.niveau === "h2" && sec.contenu && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{sec.contenu}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Un quiz, corrigé apparent. */
function Quiz({ questions }) {
  if (!questions?.length) {
    return <div style={{ fontSize: 12.5, color: "#9ca3af", fontStyle: "italic" }}>Aucune question saisie.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {questions.map((q, qi) => (
        <div key={q.id || qi} style={{ padding: "12px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>{qi + 1}. {q.texte}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(q.options || []).map((opt, oi) => {
              const bonne = opt === q.correct;
              return (
                <div key={oi} style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  border: `1.5px solid ${bonne ? "#6ee7b7" : "#e2e8f0"}`,
                  background: bonne ? "#f0fdf4" : "#fff",
                  color: bonne ? "#065f46" : "#475569",
                  fontWeight: bonne ? 700 : 400,
                  display: "flex", alignItems: "center", gap: 8 }}>
                  {bonne && <span>✅</span>}
                  {opt}
                </div>
              );
            })}
          </div>
          {q.explication && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>💡 {q.explication}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Le corps d'un bloc, selon son type. */
function CorpsBloc({ b, coul }) {
  const url = b.url || b.fichier_url || b.fichierUrl || null;

  if ((b.type === "texte" || b.type === "exercice") && b.sections?.length) {
    return <Sections sections={b.sections} coul={coul} />;
  }

  if (b.type === "video") {
    if (!url) return <Absent quoi="vidéo" />;
    /* Les coachs déposent indifféremment un fichier .mp4 et un lien YouTube dans le même
       champ. `<video src="https://youtu.be/…">` recevait du HTML au lieu d'un flux et le
       navigateur répondait « No video with supported format and MIME type found » : le
       superviseur voyait un lecteur noir et ne pouvait pas contrôler le contenu. */
    const embed = urlEmbedVideo(url);
    if (embed) {
      return (
        <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
            <iframe src={embed} title={b.titre || "Vidéo"} allowFullScreen
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
          </div>
          <div style={{ padding: "8px 12px" }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#a5b4fc" }}>Ouvrir dans un onglet ↗</a>
          </div>
        </div>
      );
    }
    if (estFichierVideo(url)) {
      // Lu sur place : juger la qualite d'une video suppose de la voir, pas d'ouvrir
      // un onglet. `controls` sans `autoPlay` - rien ne demarre sans un clic.
      return (
        <div style={{ background: "#0f172a", borderRadius: 10, overflow: "hidden" }}>
          <video src={url} controls preload="metadata" style={{ width: "100%", maxHeight: "55vh", display: "block" }} />
          <div style={{ padding: "8px 12px" }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#a5b4fc" }}>Ouvrir dans un onglet ↗</a>
          </div>
        </div>
      );
    }
    // Ni plateforme connue ni fichier vidéo : le dire, plutôt qu'un lecteur noir qu'on
    // prendrait pour une panne.
    return <LienNonLisible url={url} quoi="vidéo" />;
  }

  if (b.type === "audio" || b.type === "listening") {
    if (!url) return <Absent quoi="audio" />;
    const embedAudio = urlEmbedVideo(url); // un « audio » déposé sous forme de lien YouTube
    return (
      <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "14px 16px" }}>
        {embedAudio ? (
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 8, overflow: "hidden" }}>
            <iframe src={embedAudio} title={b.titre || "Audio"} allowFullScreen
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
          </div>
        ) : estFichierAudio(url) ? (
          <audio src={url} controls preload="metadata" style={{ width: "100%" }} />
        ) : (
          <LienNonLisible url={url} quoi="audio" />
        )}
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#059669", display: "inline-block", marginTop: 6 }}>Ouvrir dans un onglet ↗</a>
        {b.questions?.length > 0 && <div style={{ marginTop: 12 }}><Quiz questions={b.questions} /></div>}
      </div>
    );
  }

  if (b.type === "document") {
    const nomDoc = b.fichier || b.titre || "Document";
    const estPdf = extensionDe(nomDoc || url) === "pdf";
    return url ? (
      <div style={{ background: "#fff7ed", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: estPdf ? 12 : 0 }}>
          <span style={{ fontSize: 30 }}>📄</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13, wordBreak: "break-word" }}>{nomDoc}</div>
            {/* Par le RELAIS : Cloudinary refuse la livraison publique des PDF sur ce
                compte et répondait 401 - tous les documents étaient inaccessibles. */}
            <a href={urlDocument(url, { nom: nomDoc })} target="_blank" rel="noreferrer"
              style={{ fontSize: 12.5, color: "#b45309", fontWeight: 600 }}>Ouvrir le document ↗</a>
          </div>
        </div>
        {/* Le superviseur contrôle ce que le coach publie : devoir télécharger chaque PDF
            pour le lire transformerait une vérification de dix secondes en corvée. */}
        {estPdf && (
          <iframe title={nomDoc} src={urlDocument(url, { nom: nomDoc, inline: true })}
            style={{ width: "100%", height: "60vh", border: "1px solid #fed7aa", borderRadius: 8, background: "#fff" }} />
        )}
      </div>
    ) : <Absent quoi="document" />;
  }

  /* IMAGE - type absent de ce rendu : une image déposée par le coach n'apparaissait pas
     dans la vue superviseur, qui est pourtant censée montrer « tout le contenu ». */
  if (b.type === "image") {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
        <img src={url} alt={b.titre || "Illustration"} loading="lazy"
          style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", borderRadius: 10, background: "#f1f5f9", display: "block" }} />
      </a>
    ) : <Absent quoi="image" />;
  }

  if (b.type === "lien") {
    return url ? (
      <div style={{ background: "#e0f2fe", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 26 }}>🔗</span>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#0369a1", fontWeight: 600, wordBreak: "break-all" }}>{url}</a>
      </div>
    ) : <Absent quoi="lien" />;
  }

  if (b.type === "quiz" || b.type === "qcm") return <Quiz questions={b.questions} />;

  if (b.type === "speaking") {
    return (
      <div style={{ background: "#f0f9ff", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#0c4a6e", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
        {b.consigne || b.contenu || "Exercice oral - l'apprenant enregistre sa réponse."}
      </div>
    );
  }

  // Type inconnu : plutot que de ne rien montrer, on rend ce que le bloc porte. Un
  // contenu invisible serait pire qu'un contenu mal presente - le superviseur doit
  // pouvoir constater l'anomalie.
  return (
    <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
      {b.contenu || b.consigne || (
        <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Bloc « {b.type} » - aucun contenu textuel à afficher.</span>
      )}
      {b.sections?.length > 0 && <div style={{ marginTop: 10 }}><Sections sections={b.sections} coul={coul} /></div>}
      {b.questions?.length > 0 && <div style={{ marginTop: 10 }}><Quiz questions={b.questions} /></div>}
    </div>
  );
}

const Absent = ({ quoi }) => (
  <div style={{ background: "#fef2f2", border: "1px dashed #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#b91c1c" }}>
    ⚠️ Aucun fichier rattaché à ce bloc {quoi} - le coach ne l'a pas encore déposé.
  </div>
);

/** Un lien qui n'est ni une plateforme connue ni un fichier lisible : on le dit et on l'ouvre. */
const LienNonLisible = ({ url, quoi }) => (
  <div style={{ background: "#fffbeb", border: "1px dashed #fcd34d", borderRadius: 10, padding: "12px 16px", fontSize: 12.5, color: "#92400e" }}>
    <div style={{ fontWeight: 700, marginBottom: 4 }}>Ce lien ne peut pas être lu ici</div>
    <div style={{ marginBottom: 6 }}>Le coach a déposé une adresse qui n'est ni un fichier {quoi} ni une vidéo YouTube/Vimeo.</div>
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "#b45309", fontWeight: 700, wordBreak: "break-all" }}>{url} ↗</a>
  </div>
);

export default function ContenuElearningDetail({ contenu, coachNom, onClose, accent = "#0891b2" }) {
  if (!contenu) return null;

  const blocs   = contenu.blocs || [];
  const classes = contenu.groupe_noms || [];
  const publie  = contenu.statut === "publie";
  const objectifs = contenu.objectifs || [];

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 10050,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* 90 % de l'écran : ces contenus portent des vidéos, des PDF et des images que le
          superviseur doit juger, pas seulement survoler. */}
      <div style={{ background: "#fff", borderRadius: 16, width: "90vw", height: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* En-tete */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>{contenu.titre || "Sans titre"}</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                  background: publie ? "#dcfce7" : "#fef9c3", color: publie ? "#15803d" : "#a16207" }}>
                  {publie ? "Publié" : "Brouillon"}
                </span>
                {classes.length
                  ? classes.map(n => (
                      <span key={n} style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1e40af" }}>🏫 {n}</span>
                    ))
                  : <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#b91c1c" }}>⚠️ Aucune classe destinataire</span>}
                <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#64748b" }}>
                  {blocs.length} partie{blocs.length !== 1 ? "s" : ""}
                </span>
                <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#64748b" }}>
                  ⏱ {contenu.dureeEstimee || 0} min
                </span>
                {contenu.created_at && (
                  <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#64748b" }}>
                    📅 {new Date(contenu.created_at).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>
              {coachNom && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 7 }}>Créé par {coachNom}</div>}
            </div>
            <button onClick={onClose}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "1px solid #e2e8f0",
                background: "#fff", cursor: "pointer", fontSize: 16, color: "#64748b", lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {objectifs.length > 0 && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1e40af", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".05em" }}>🎯 Objectifs</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {objectifs.map((o, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.8 }}>{typeof o === "string" ? o : (o?.texte || "")}</li>
                ))}
              </ul>
            </div>
          )}

          {blocs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 50, background: "#f8fafc", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 600, color: "#374151" }}>Ce contenu ne porte aucune partie</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Le coach l'a créé sans y ajouter de bloc.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {blocs.map((b, i) => {
                const t = typeBloc(b.type);
                return (
                  <div key={b.id || i} style={{ borderRadius: 14, border: `1px solid ${t.coul}30`, overflow: "hidden" }}>
                    <div style={{ padding: "11px 16px", background: `${t.coul}0d`, borderBottom: `1px solid ${t.coul}20`,
                      display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{t.ico}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>{b.titre || "Sans titre"}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {t.lib}{b.dureeMin ? ` · ${b.dureeMin} min` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>#{i + 1}</span>
                    </div>
                    <div style={{ padding: "14px 16px", background: "#fff" }}>
                      <CorpsBloc b={b} coul={t.coul} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pied */}
        <div style={{ padding: "11px 22px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            🔎 Vue superviseur - contenu intégral, corrigés des quiz apparents.
          </span>
          <button onClick={onClose}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: accent, color: "#fff",
              fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
