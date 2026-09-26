import React, { useState, useEffect, useCallback } from "react";

/**
 * Tableau de bord de l'assistant marketing.
 *
 * Tout ce qui est affiché vient de données RÉELLES. Un tableau de bord qui montre des
 * valeurs simulées est pire qu'un tableau vide : on y prend des décisions.
 *
 * Quand un chiffre n'est pas mesurable, il est dit tel quel - « - » et non « 0 % ».
 * Zéro réponse sur zéro visite n'est pas un taux de 0 %, c'est une absence de mesure, et
 * les confondre ferait condamner un canal qui n'a simplement pas encore servi.
 */

const ROSE = "#db2777";

const nb = (n) => (n ?? 0).toLocaleString("fr-FR");
const duree = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`);

const SUPPORTS = {
  affiche: "Affiche", flyer: "Flyer", stand: "Stand", whatsapp: "WhatsApp",
  reseaux: "Réseaux", email: "E-mail", sms: "SMS", site: "Site web", autre: "Autre",
};

export default function TableauBordMarketing({ apiUrl }) {
  const [jours, setJours] = useState(30);
  const [d, setD] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    setChargement(true); setErreur("");
    try {
      const r = await fetch(`${apiUrl}/api/marketing/kpis?jours=${jours}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || "Chargement impossible"); return; }
      setD(j);
    } catch { setErreur("Connexion impossible."); }
    finally { setChargement(false); }
  }, [apiUrl, jours]);

  useEffect(() => { charger(); }, [charger]);

  const carte = { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 };
  const titreBloc = { fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 3 };
  const sousTitre = { fontSize: 12, color: "#94a3b8", marginBottom: 16 };

  if (chargement && !d) {
    return <div style={{ textAlign: "center", padding: 70, color: "#9ca3af", fontSize: 13 }}>Calcul des indicateurs…</div>;
  }
  if (erreur) {
    return (
      <div style={{ ...carte, textAlign: "center", padding: 44 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontWeight: 700, color: "#374151", marginBottom: 14 }}>{erreur}</div>
        <button onClick={charger} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: ROSE, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Réessayer</button>
      </div>
    );
  }
  if (!d) return null;

  const { trafic, collecte, newsletter, boutique, contenu, acquisition } = d;

  /* La courbe : un SVG dessiné à la main, sans librairie. Une dépendance de plus pour
     quatre-vingt lignes de tracé ne se justifie pas. */
  const maxVues = Math.max(1, ...trafic.courbe.map(p => p.vues));
  const larg = 760, haut = 140;
  const pointX = (i) => (i / Math.max(1, trafic.courbe.length - 1)) * larg;
  const pointY = (v) => haut - (v / maxVues) * (haut - 14);
  const ligne = trafic.courbe.map((p, i) => `${i === 0 ? "M" : "L"}${pointX(i).toFixed(1)},${pointY(p.vues).toFixed(1)}`).join(" ");
  const aire = `${ligne} L${larg},${haut} L0,${haut} Z`;

  const Kpi = ({ valeur, libelle, detail, couleur = "#0f172a", grand }) => (
    <div style={{ ...carte, flex: "1 1 170px", minWidth: 150 }}>
      <div style={{ fontSize: grand ? 32 : 26, fontWeight: 900, color: couleur, lineHeight: 1.1 }}>{valeur}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", marginTop: 4 }}>{libelle}</div>
      {detail && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3 }}>{detail}</div>}
    </div>
  );

  const Barre = ({ valeur, max, couleur = ROSE }) => (
    <div style={{ height: 7, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${max ? Math.max(3, (valeur / max) * 100) : 0}%`, height: "100%", background: couleur, borderRadius: 99 }} />
    </div>
  );

  const maxPage = Math.max(1, ...trafic.top_pages.map(p => p.vues));

  return (
    <div>
      {/* ── En-tête et période ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>📊 Tableau de bord</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Audience du site, collecte par QR, newsletter et boutique - sur {jours} jours.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[7, 30, 90].map(j => (
            <button key={j} onClick={() => setJours(j)}
              style={{ padding: "8px 15px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${jours === j ? ROSE : "#e2e8f0"}`,
                background: jours === j ? "#fdf2f8" : "#fff",
                color: jours === j ? ROSE : "#64748b" }}>{j} j</button>
          ))}
          <button onClick={charger} style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 13 }}>↻</button>
        </div>
      </div>

      {/* ── Les chiffres du haut ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi grand valeur={nb(trafic.visiteurs)} libelle="Visiteurs" couleur={ROSE}
          detail={`${nb(trafic.vues)} pages vues`} />
        <Kpi grand valeur={trafic.pages_par_visite} libelle="Pages par visite"
          detail={`${duree(trafic.duree_mediane_s)} par page (médiane)`} />
        <Kpi grand valeur={nb(collecte.reponses)} libelle="Réponses collectées" couleur="#0891b2"
          detail={collecte.taux_conversion !== null ? `${collecte.taux_conversion} % des scans` : "aucun scan encore"} />
        <Kpi grand valeur={nb(newsletter.abonnes)} libelle="Abonnés newsletter" couleur="#15803d"
          detail={`${newsletter.campagnes_envoyees} campagne${newsletter.campagnes_envoyees > 1 ? "s" : ""} envoyée${newsletter.campagnes_envoyees > 1 ? "s" : ""}`} />
      </div>

      {/* ── Courbe d'audience ── */}
      <div style={{ ...carte, marginBottom: 20 }}>
        <div style={titreBloc}>Audience du site</div>
        <div style={sousTitre}>Pages vues par jour. Le creux d'un week-end est normal ; une chute qui dure ne l'est pas.</div>
        {trafic.vues === 0 ? (
          <div style={{ textAlign: "center", padding: 34, color: "#cbd5e1", fontSize: 13 }}>Aucune visite enregistrée sur la période.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${larg} ${haut + 6}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
              aria-label={`Courbe des pages vues sur ${jours} jours, maximum ${maxVues}`}>
              <defs>
                <linearGradient id="grad-audience" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ROSE} stopOpacity=".22" />
                  <stop offset="100%" stopColor={ROSE} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={aire} fill="url(#grad-audience)" />
              <path d={ligne} fill="none" stroke={ROSE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {/* Le point le plus haut est marqué : c'est celui qu'on cherche des yeux. */}
              {(() => {
                const i = trafic.courbe.findIndex(p => p.vues === maxVues);
                return i < 0 ? null : <circle cx={pointX(i)} cy={pointY(maxVues)} r="4" fill={ROSE} stroke="#fff" strokeWidth="2" />;
              })()}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              <span>{trafic.courbe[0]?.jour}</span>
              <span>pic : {nb(maxVues)} vues</span>
              <span>{trafic.courbe[trafic.courbe.length - 1]?.jour}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Pages et référents ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 20 }}>
        <div style={carte}>
          <div style={titreBloc}>Pages les plus vues</div>
          <div style={sousTitre}>Ce que les visiteurs cherchent réellement.</div>
          {trafic.top_pages.length === 0 ? (
            <div style={{ color: "#cbd5e1", fontSize: 13, padding: "14px 0" }}>Rien à afficher.</div>
          ) : trafic.top_pages.map((p, i) => (
            <div key={i} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#0f172a", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.page}</span>
                <span style={{ color: "#64748b", flexShrink: 0, marginLeft: 10 }}>{nb(p.vues)}</span>
              </div>
              <Barre valeur={p.vues} max={maxPage} />
            </div>
          ))}
        </div>

        <div style={carte}>
          <div style={titreBloc}>D'où viennent les visiteurs</div>
          <div style={sousTitre}>Sites externes uniquement - la navigation interne ne dit rien sur l'acquisition.</div>
          {trafic.top_referents.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "14px 0", lineHeight: 1.6 }}>
              Aucun référent externe mesuré. Les visiteurs arrivent en direct, par un lien
              partagé, ou depuis une application qui ne transmet pas l'origine - c'est le
              cas de WhatsApp.
            </div>
          ) : trafic.top_referents.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < trafic.top_referents.length - 1 ? "1px solid #f1f5f9" : "none", fontSize: 13.5 }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{r.source}</span>
              <span style={{ color: "#64748b" }}>{nb(r.vues)} vues</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Collecte par canal ── */}
      <div style={{ ...carte, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={titreBloc}>Collecte par QR code</div>
            <div style={sousTitre}>Quel support amène réellement des inscriptions.</div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
            <span><strong style={{ fontSize: 17, color: "#0f172a" }}>{nb(collecte.visites)}</strong> scans</span>
            <span><strong style={{ fontSize: 17, color: "#0891b2" }}>{nb(collecte.reponses)}</strong> réponses</span>
            <span><strong style={{ fontSize: 17, color: "#15803d" }}>{nb(collecte.avec_consentement)}</strong> joignables</span>
            {collecte.nouvelles > 0 && <span><strong style={{ fontSize: 17, color: "#1d4ed8" }}>{nb(collecte.nouvelles)}</strong> non lues</span>}
          </div>
        </div>

        {collecte.canaux.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#94a3b8", fontSize: 13 }}>
            Aucun canal de diffusion créé. Rendez-vous dans <strong>Campagnes &amp; Newsletters</strong> pour générer vos premiers QR.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                  {["Canal", "Support", "Scans", "Réponses", "Taux", "Converties"].map(h => (
                    <th key={h} style={{ padding: "8px 12px 10px", textAlign: h === "Canal" || h === "Support" ? "left" : "right", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collecte.canaux.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f8fafc", opacity: c.actif ? 1 : .5 }}>
                    <td style={{ padding: "11px 12px", fontWeight: 700, color: "#0f172a" }}>
                      {c.libelle}
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: ROSE, marginLeft: 7 }}>{c.code}</span>
                    </td>
                    <td style={{ padding: "11px 12px", color: "#64748b" }}>{SUPPORTS[c.support] || c.support}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", color: "#64748b" }}>{nb(c.visites)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700, color: "#0891b2" }}>{nb(c.reponses)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 700,
                      color: c.taux === null ? "#cbd5e1" : c.taux >= 30 ? "#15803d" : c.taux >= 10 ? "#b45309" : "#b91c1c" }}>
                      {/* « - » et non « 0 % » : sans scan, il n'y a pas de taux à calculer. */}
                      {c.taux === null ? "-" : `${c.taux} %`}
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right", color: c.converties ? "#15803d" : "#cbd5e1", fontWeight: c.converties ? 700 : 400 }}>{nb(c.converties)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Newsletter, boutique, contenu ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        <div style={carte}>
          <div style={titreBloc}>📩 Newsletter</div>
          <div style={sousTitre}>Base d'abonnés et envois.</div>
          <Ligne l="Abonnés" v={nb(newsletter.abonnes)} fort />
          <Ligne l="Campagnes envoyées" v={nb(newsletter.campagnes_envoyees)} />
          <Ligne l="Destinataires cumulés" v={nb(newsletter.destinataires_total)} />
          {newsletter.derniere && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b" }}>
              Dernière : <strong style={{ color: "#0f172a" }}>{newsletter.derniere.sujet}</strong>
              {newsletter.derniere.date && <> · {new Date(newsletter.derniere.date).toLocaleDateString("fr-FR")}</>}
            </div>
          )}
        </div>

        <div style={carte}>
          <div style={titreBloc}>🛍️ Boutique</div>
          <div style={sousTitre}>Sur les {jours} derniers jours.</div>
          <Ligne l="Commandes" v={nb(boutique.commandes)} fort />
          <Ligne l="Payées" v={nb(boutique.payees)} couleur="#15803d" />
          <Ligne l="En attente" v={nb(boutique.en_attente)} couleur={boutique.en_attente ? "#b45309" : "#94a3b8"} />
          <Ligne l="Encaissé" v={`${nb(boutique.ca_paye)} F`} fort couleur="#15803d" />
        </div>

        <div style={carte}>
          <div style={titreBloc}>🖼️ Contenu publié</div>
          <div style={sousTitre}>Ce que le site affiche aujourd'hui.</div>
          <Ligne l="Slides actives" v={nb(contenu.slides)} />
          <Ligne l="Partenaires" v={nb(contenu.partenaires)} />
          <Ligne l="Photos d'équipe" v={nb(contenu.equipe)} />
          {acquisition.total > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 7 }}>Sources déclarées</div>
              {acquisition.sources.slice(0, 4).map((s, i) => (
                <Ligne key={i} l={s.source} v={nb(s.n)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Ligne({ l, v, fort, couleur }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", fontSize: 13.5 }}>
      <span style={{ color: "#64748b" }}>{l}</span>
      <span style={{ fontWeight: fort ? 800 : 600, fontSize: fort ? 16 : 13.5, color: couleur || "#0f172a" }}>{v}</span>
    </div>
  );
}
