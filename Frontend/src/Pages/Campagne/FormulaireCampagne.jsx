import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import SEO from "../Components/SEO/SEO";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * Le formulaire de campagne, tel qu'un prospect le découvre.
 *
 * C'est la page qu'ouvre le QR collé sur une affiche, ou le lien partagé dans un groupe
 * WhatsApp. Elle vit sur le SITE PUBLIC et non sur le dashboard : la personne qui scanne
 * n'a pas de compte et ne doit rien avoir à se connecter.
 *
 * Le paramètre `?d=CODE` identifie le canal. Il voyage jusqu'à la réponse, et c'est lui
 * qui permettra de dire « cette affiche a produit sept inscriptions ». Il est conservé
 * même si la personne recharge la page.
 *
 * La validation faite ici est un CONFORT - elle évite un aller-retour pour un champ
 * oublié. C'est le serveur qui décide : il relit les champs en base, et un formulaire
 * modifié pendant que l'onglet était ouvert ne laisse pas passer une réponse invalide.
 */

const CHAMPS_SANS_REPONSE = new Set(["section", "information"]);

/**
 * La présentation de l'offre, telle que le marketing l'écrit.
 *
 * Pas un éditeur riche : une mise en forme minimale, celle qu'on emploie déjà sur
 * WhatsApp - `**gras**`, sauts de ligne, emojis. Un vrai éditeur HTML ouvrirait la porte
 * à du balisage collé depuis Word sur une page publique, pour un gain nul ici.
 */
function Presentation({ texte, couleur }) {
  if (!texte) return null;
  const lignes = String(texte).split("\n");
  return (
    <div style={{ fontSize: 15.5, color: "#374151", lineHeight: 1.75 }}>
      {lignes.map((ligne, i) => {
        if (!ligne.trim()) return <div key={i} style={{ height: 10 }} />;
        const puce = /^\s*[-•*]\s+/.test(ligne);
        const contenu = ligne.replace(/^\s*[-•*]\s+/, "");
        const morceaux = contenu.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const rendu = morceaux.map((m, j) =>
          m.startsWith("**") && m.endsWith("**")
            ? <strong key={j} style={{ color: "#0f172a" }}>{m.slice(2, -2)}</strong>
            : <span key={j}>{m}</span>);
        return puce ? (
          <div key={i} style={{ display: "flex", gap: 9, marginBottom: 3 }}>
            <span style={{ color: couleur, flexShrink: 0 }}>•</span>
            <span>{rendu}</span>
          </div>
        ) : <div key={i} style={{ marginBottom: 3 }}>{rendu}</div>;
      })}
    </div>
  );
}

/* ── Habillage commun ──────────────────────────────────────────────────────────
   DÉFINI AU NIVEAU MODULE, et ce n'est pas un détail de style : `Cadre` enveloppe TOUT
   le formulaire, y compris les champs. Déclaré à l'intérieur du composant, il était
   recréé à chaque frappe ; React, qui identifie un composant par sa référence, démontait
   alors l'ensemble du formulaire et le remontait à neuf. Le champ en cours de saisie
   était détruit à chaque lettre - le curseur sautait et, sur mobile, le clavier se
   refermait. Un prospect ne recommence pas deux fois. ── */
const Cadre = ({ children }) => (
  <div style={{ minHeight: "100vh", background: "#f4f6fa", padding: "40px 16px 80px" }}>
    <div style={{ maxWidth: 680, margin: "0 auto" }}>{children}</div>
  </div>
);

export default function FormulaireCampagne() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const codeDiffusion = params.get("d") || "";

  const [etat, setEtat]         = useState("chargement"); // chargement | pret | ferme | introuvable | envoye | erreur
  const [form, setForm]         = useState(null);
  const [champs, setChamps]     = useState([]);
  const [valeurs, setValeurs]   = useState({});
  const [autres, setAutres]     = useState({});           // texte libre de l'option « Autre »
  const [consent, setConsent]   = useState(false);
  const [manquants, setManquants] = useState([]);
  const [envoi, setEnvoi]       = useState(false);
  const [message, setMessage]   = useState("");
  const [erreur, setErreur]     = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const url = `${API_URL}/api/public/formulaires/${encodeURIComponent(slug)}${codeDiffusion ? `?d=${encodeURIComponent(codeDiffusion)}` : ""}`;
        const r = await fetch(url);
        if (annule) return;
        if (r.status === 404) { setEtat("introuvable"); return; }
        const d = await r.json();
        if (!r.ok) { setErreur(d.error || "Formulaire indisponible."); setEtat("erreur"); return; }
        setForm(d.formulaire);
        setChamps(d.champs || []);
        setEtat(d.formulaire?.ouvert ? "pret" : "ferme");
      } catch {
        if (!annule) { setErreur("Connexion impossible. Vérifiez votre réseau."); setEtat("erreur"); }
      }
    })();
    return () => { annule = true; };
  }, [slug, codeDiffusion]);

  const poser = useCallback((id, v) => {
    setValeurs(p => ({ ...p, [id]: v }));
    setManquants(m => m.filter(x => x !== id));
  }, []);

  const accent = form?.couleur || "#1B3080";

  const envoyer = async (e) => {
    e.preventDefault();
    if (envoi) return;
    setErreur("");

    // Contrôle local : signaler TOUS les champs manquants d'un coup plutôt qu'un par un.
    const absents = champs
      .filter(c => !CHAMPS_SANS_REPONSE.has(c.type) && c.obligatoire)
      .filter(c => {
        const v = valeurs[c.id];
        return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      })
      .map(c => c.id);
    if (absents.length) {
      setManquants(absents);
      setErreur(`Merci de remplir ${absents.length} champ${absents.length > 1 ? "s" : ""} obligatoire${absents.length > 1 ? "s" : ""}.`);
      document.getElementById(`champ-${absents[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // L'option « Autre » remplace la valeur par le texte saisi : c'est la réponse réelle.
    const envoyees = { ...valeurs };
    for (const c of champs) {
      const libre = (autres[c.id] || "").trim();
      if (!libre) continue;
      if (Array.isArray(envoyees[c.id])) {
        envoyees[c.id] = envoyees[c.id].map(v => (v === "__autre__" ? libre : v));
      } else if (envoyees[c.id] === "__autre__") {
        envoyees[c.id] = libre;
      }
    }

    setEnvoi(true);
    try {
      const r = await fetch(`${API_URL}/api/public/formulaires/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reponses: envoyees, diffusion_code: codeDiffusion, consentement: consent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(d.error || "Envoi impossible. Réessayez.");
        if (Array.isArray(d.champs_manquants)) {
          const libs = new Set(d.champs_manquants);
          setManquants(champs.filter(c => libs.has(c.libelle)).map(c => c.id));
        }
        return;
      }
      setMessage(d.message || "Merci !");
      setEtat("envoye");
      // La redirection laisse le temps de lire le remerciement : basculer aussitôt
      // donnerait l'impression que l'envoi a échoué.
      if (d.redirection_url) setTimeout(() => { window.location.href = d.redirection_url; }, 2500);
    } catch {
      setErreur("Connexion interrompue. Votre réponse n'a pas été envoyée.");
    } finally {
      setEnvoi(false);
    }
  };

  /* ── Rendu d'un champ, selon son type ─────────────────────────────── */
  const rendreChamp = (c) => {
    const v = valeurs[c.id];
    const rate = manquants.includes(c.id);
    const bord = rate ? "#dc2626" : "#d7dce5";
    const base = {
      width: "100%", padding: "13px 15px", fontSize: 15.5, borderRadius: 10,
      border: `1.5px solid ${bord}`, outline: "none", boxSizing: "border-box",
      background: "#fff", color: "#111827", fontFamily: "inherit",
    };

    if (c.type === "section") {
      return (
        <div key={c.id} style={{ margin: "34px 0 4px", paddingTop: 22, borderTop: "1px solid #e5e9f0" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{c.libelle}</div>
          {c.aide && <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>{c.aide}</div>}
        </div>
      );
    }
    if (c.type === "information") {
      return (
        <div key={c.id} style={{ background: `${accent}0d`, border: `1px solid ${accent}33`, borderRadius: 10, padding: "14px 16px", margin: "6px 0" }}>
          <div style={{ fontWeight: 700, color: accent, fontSize: 14.5 }}>{c.libelle}</div>
          {c.aide && <div style={{ fontSize: 14, color: "#4b5563", marginTop: 4, lineHeight: 1.6 }}>{c.aide}</div>}
        </div>
      );
    }

    const options = Array.isArray(c.options) ? c.options : [];
    let controle = null;

    switch (c.type) {
      case "texte_long":
        controle = <textarea id={`champ-${c.id}`} rows={4} value={v || ""} placeholder={c.placeholder || ""}
          onChange={e => poser(c.id, e.target.value)} style={{ ...base, resize: "vertical" }} />;
        break;

      case "email":
        controle = <input id={`champ-${c.id}`} type="email" inputMode="email" autoComplete="email"
          value={v || ""} placeholder={c.placeholder || "vous@exemple.com"}
          onChange={e => poser(c.id, e.target.value)} style={base} />;
        break;

      case "telephone":
        // `inputMode` et non `type=tel` seul : sur mobile c'est lui qui ouvre le pavé
        // numérique, et c'est de loin le champ le plus saisi sur ce formulaire.
        controle = <input id={`champ-${c.id}`} type="tel" inputMode="tel" autoComplete="tel"
          value={v || ""} placeholder={c.placeholder || "07 00 00 00 00"}
          onChange={e => poser(c.id, e.target.value)} style={base} />;
        break;

      case "nombre":
        controle = <input id={`champ-${c.id}`} type="number" inputMode="numeric" value={v ?? ""}
          placeholder={c.placeholder || ""} onChange={e => poser(c.id, e.target.value)} style={base} />;
        break;

      case "date":
        controle = <input id={`champ-${c.id}`} type="date" value={v || ""}
          onChange={e => poser(c.id, e.target.value)} style={base} />;
        break;

      case "heure":
        controle = <input id={`champ-${c.id}`} type="time" value={v || ""}
          onChange={e => poser(c.id, e.target.value)} style={base} />;
        break;

      case "liste":
        controle = (
          <select id={`champ-${c.id}`} value={v || ""} onChange={e => poser(c.id, e.target.value)} style={base}>
            <option value="">- Choisissez -</option>
            {options.map((o, i) => <option key={i} value={String(o)}>{String(o)}</option>)}
          </select>
        );
        break;

      case "oui_non":
        controle = (
          <div style={{ display: "flex", gap: 10 }}>
            {["Oui", "Non"].map(o => (
              <button key={o} type="button" onClick={() => poser(c.id, o)}
                style={{ flex: 1, padding: "13px 10px", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700,
                  border: `1.5px solid ${v === o ? accent : bord}`,
                  background: v === o ? `${accent}12` : "#fff",
                  color: v === o ? accent : "#4b5563" }}>{o}</button>
            ))}
          </div>
        );
        break;

      case "choix_unique":
      case "centre":
        controle = (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {options.map((o, i) => {
              const val = String(o);
              const actif = v === val;
              return (
                <button key={i} type="button" onClick={() => poser(c.id, val)}
                  style={{ textAlign: "left", padding: "13px 15px", borderRadius: 10, cursor: "pointer", fontSize: 15,
                    border: `1.5px solid ${actif ? accent : bord}`,
                    background: actif ? `${accent}10` : "#fff",
                    color: actif ? accent : "#374151", fontWeight: actif ? 700 : 400,
                    display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${actif ? accent : "#cbd5e1"}`, display: "inline-flex",
                    alignItems: "center", justifyContent: "center" }}>
                    {actif && <span style={{ width: 9, height: 9, borderRadius: "50%", background: accent }} />}
                  </span>
                  {val}
                </button>
              );
            })}
            {c.autre_autorise && (
              <button type="button" onClick={() => poser(c.id, "__autre__")}
                style={{ textAlign: "left", padding: "13px 15px", borderRadius: 10, cursor: "pointer", fontSize: 15,
                  border: `1.5px solid ${v === "__autre__" ? accent : bord}`,
                  background: v === "__autre__" ? `${accent}10` : "#fff", color: "#374151" }}>
                Autre…
              </button>
            )}
            {c.autre_autorise && v === "__autre__" && (
              <input autoFocus value={autres[c.id] || ""} placeholder="Précisez"
                onChange={e => setAutres(p => ({ ...p, [c.id]: e.target.value }))} style={base} />
            )}
          </div>
        );
        break;

      case "choix_multiple": {
        const liste = Array.isArray(v) ? v : [];
        const basculer = (val) => poser(c.id, liste.includes(val) ? liste.filter(x => x !== val) : [...liste, val]);
        controle = (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {options.map((o, i) => {
              const val = String(o);
              const actif = liste.includes(val);
              return (
                <button key={i} type="button" onClick={() => basculer(val)}
                  style={{ textAlign: "left", padding: "13px 15px", borderRadius: 10, cursor: "pointer", fontSize: 15,
                    border: `1.5px solid ${actif ? accent : bord}`,
                    background: actif ? `${accent}10` : "#fff",
                    color: actif ? accent : "#374151", fontWeight: actif ? 700 : 400,
                    display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${actif ? accent : "#cbd5e1"}`, background: actif ? accent : "#fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 12, fontWeight: 900 }}>{actif ? "✓" : ""}</span>
                  {val}
                </button>
              );
            })}
            {c.autre_autorise && (
              <>
                <button type="button" onClick={() => basculer("__autre__")}
                  style={{ textAlign: "left", padding: "13px 15px", borderRadius: 10, cursor: "pointer", fontSize: 15,
                    border: `1.5px solid ${liste.includes("__autre__") ? accent : bord}`,
                    background: liste.includes("__autre__") ? `${accent}10` : "#fff", color: "#374151" }}>
                  Autre…
                </button>
                {liste.includes("__autre__") && (
                  <input autoFocus value={autres[c.id] || ""} placeholder="Précisez"
                    onChange={e => setAutres(p => ({ ...p, [c.id]: e.target.value }))} style={base} />
                )}
              </>
            )}
          </div>
        );
        break;
      }

      case "echelle": {
        const min = Number(c.validation?.min ?? 1), max = Number(c.validation?.max ?? 10);
        const pas = [];
        for (let i = min; i <= max; i++) pas.push(i);
        controle = (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pas.map(n => (
              <button key={n} type="button" onClick={() => poser(c.id, n)}
                style={{ minWidth: 44, height: 44, borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700,
                  border: `1.5px solid ${v === n ? accent : bord}`,
                  background: v === n ? accent : "#fff", color: v === n ? "#fff" : "#4b5563" }}>{n}</button>
            ))}
          </div>
        );
        break;
      }

      case "note":
        controle = (
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => poser(c.id, n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 34, lineHeight: 1, padding: 0,
                  color: (v || 0) >= n ? "#f59e0b" : "#d7dce5" }}>★</button>
            ))}
          </div>
        );
        break;

      case "fichier":
        // Le dépôt de fichier n'est pas ouvert au public : accepter des envois anonymes
        // sur une adresse imprimée sur une affiche serait une porte grande ouverte.
        controle = (
          <div style={{ padding: "13px 15px", borderRadius: 10, border: "1.5px dashed #d7dce5", color: "#9ca3af", fontSize: 14 }}>
            Envoi de fichier non disponible depuis ce formulaire.
          </div>
        );
        break;

      default:
        controle = <input id={`champ-${c.id}`} type="text" value={v || ""} placeholder={c.placeholder || ""}
          onChange={e => poser(c.id, e.target.value)} style={base} />;
    }

    return (
      <div key={c.id} id={`champ-${c.id}`} style={{ marginBottom: 22 }}>
        <label style={{ display: "block", fontSize: 15.5, fontWeight: 600, color: "#111827", marginBottom: 7 }}>
          {c.libelle}
          {c.obligatoire && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
        </label>
        {c.aide && <div style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 9, lineHeight: 1.5 }}>{c.aide}</div>}
        {c.image_url && (
          <img src={c.image_url} alt="" style={{ width: "100%", maxWidth: 420, borderRadius: 10, marginBottom: 10, display: "block" }} />
        )}
        {controle}
        {rate && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 6 }}>Ce champ est obligatoire.</div>}
      </div>
    );
  };

  if (etat === "chargement") {
    return <Cadre><div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>Chargement…</div></Cadre>;
  }

  if (etat === "introuvable") {
    return (
      <Cadre>
        <SEO title="Formulaire introuvable - BET" noindex />
        <div style={{ background: "#fff", borderRadius: 16, padding: 44, textAlign: "center", boxShadow: "0 2px 16px rgba(15,23,42,.06)" }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>🔍</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 10px" }}>Ce formulaire n'existe pas</h1>
          <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, margin: "0 0 22px" }}>
            Le lien est peut-être incomplet. Vérifiez l'adresse, ou contactez-nous directement.
          </p>
          <a href="/contact" style={{ display: "inline-block", padding: "12px 26px", borderRadius: 10, background: "#1B3080", color: "#fff", fontWeight: 700, textDecoration: "none" }}>
            Nous contacter
          </a>
        </div>
      </Cadre>
    );
  }

  if (etat === "erreur") {
    return (
      <Cadre>
        <div style={{ background: "#fff", borderRadius: 16, padding: 44, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>⚠️</div>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: "#0f172a", margin: "0 0 10px" }}>Formulaire indisponible</h1>
          <p style={{ color: "#6b7280", fontSize: 15, margin: "0 0 22px" }}>{erreur}</p>
          <button onClick={() => window.location.reload()}
            style={{ padding: "12px 26px", borderRadius: 10, background: "#1B3080", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      </Cadre>
    );
  }

  /* Un formulaire fermé accueille quand même : le QR de l'affiche survit à la campagne. */
  if (etat === "ferme") {
    return (
      <Cadre>
        <SEO title={`${form?.titre || "Campagne"} - BET`} noindex />
        <div style={{ background: "#fff", borderRadius: 16, padding: 44, textAlign: "center", boxShadow: "0 2px 16px rgba(15,23,42,.06)" }}>
          <div style={{ fontSize: 46, marginBottom: 14 }}>🗓️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 10px" }}>{form?.titre}</h1>
          <p style={{ color: "#4b5563", fontSize: 15.5, lineHeight: 1.7, margin: "0 0 24px" }}>{form?.message_ferme}</p>
          <a href="/contact" style={{ display: "inline-block", padding: "13px 28px", borderRadius: 10, background: accent, color: "#fff", fontWeight: 700, textDecoration: "none" }}>
            Nous contacter
          </a>
        </div>
      </Cadre>
    );
  }

  if (etat === "envoye") {
    return (
      <Cadre>
        <SEO title={`Merci - ${form?.titre || "BET"}`} noindex />
        <div style={{ background: "#fff", borderRadius: 16, padding: 48, textAlign: "center", boxShadow: "0 2px 16px rgba(15,23,42,.06)" }}>
          <div style={{ width: 74, height: 74, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 38 }}>✓</div>
          <h1 style={{ fontSize: 23, fontWeight: 800, color: "#0f172a", margin: "0 0 12px" }}>C'est envoyé !</h1>
          <p style={{ color: "#4b5563", fontSize: 16, lineHeight: 1.7, margin: 0 }}>{message}</p>
        </div>
      </Cadre>
    );
  }

  /* ── Le formulaire ─────────────────────────────────────────────────── */
  return (
    <Cadre>
      <SEO title={`${form.titre} - BET`} description={form.description || ""} noindex />

      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(15,23,42,.06)" }}>
        <div style={{ height: 7, background: accent }} />
        {form.image_url && (
          <img src={form.image_url} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
        )}
        <div style={{ padding: "30px 26px 10px" }}>
          <h1 style={{ fontSize: 25, fontWeight: 800, color: "#0f172a", margin: "0 0 10px", lineHeight: 1.25, textAlign: "left" }}>
            {form.titre}
          </h1>
          <Presentation texte={form.description} couleur={accent} />
        </div>

        {/* L'illustration se place APRÈS la présentation et AVANT les questions : elle
            illustre ce qu'on vient de lire, et n'a plus rien à dire une fois qu'on
            remplit le formulaire. */}
        {form.illustration_url && (
          <img src={form.illustration_url} alt="" style={{ width: "100%", display: "block", marginTop: 6 }} />
        )}

        <div style={{ padding: "16px 26px 22px", fontSize: 13, color: "#9ca3af" }}>
          <span style={{ color: "#dc2626" }}>*</span> Champs obligatoires
        </div>
      </div>

      <form onSubmit={envoyer} style={{ background: "#fff", borderRadius: 16, padding: "28px 26px", marginTop: 16, boxShadow: "0 2px 16px rgba(15,23,42,.06)" }}>
        {champs.map(rendreChamp)}

        <label style={{ display: "flex", alignItems: "flex-start", gap: 11, marginTop: 8, padding: "14px 16px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e5e9f0", cursor: "pointer" }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: accent }} />
          <span style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>{form.texte_consentement}</span>
        </label>

        {erreur && (
          <div style={{ marginTop: 16, padding: "13px 16px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 14.5 }}>
            {erreur}
          </div>
        )}

        <button type="submit" disabled={envoi}
          style={{ width: "100%", marginTop: 20, padding: "15px", borderRadius: 11, border: "none",
            background: envoi ? "#94a3b8" : accent, color: "#fff", fontSize: 16.5, fontWeight: 800,
            cursor: envoi ? "not-allowed" : "pointer" }}>
          {envoi ? "Envoi en cours…" : "Envoyer ma réponse"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12.5, color: "#9ca3af", marginTop: 16 }}>
          Binnie's English Training - vos informations restent confidentielles.
        </div>
      </form>
    </Cadre>
  );
}
