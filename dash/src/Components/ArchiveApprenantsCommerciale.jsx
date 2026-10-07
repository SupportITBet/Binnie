import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import {
  exporterArchiveCommerciale, LIBELLES_STATUT, LIBELLES_EVENEMENT, libelleCanal, dureeLisible,
} from "../utils/exporterArchiveCommerciale";

/**
 * L'archive des apprenants d'une commerciale - qui elle a eu, et qui est parti.
 *
 * CE QUE L'ONGLET « MES APPRENANTS » NE DIT PAS. Il montre les dossiers `converti`, c'est-à-dire
 * l'instantané du jour. Or le statut d'un dossier ne redescend JAMAIS : un apprenant qui arrête
 * reste `converti` en base, et son départ n'est écrit nulle part côté dossier. La commerciale
 * n'avait donc aucun moyen de dire combien elle en avait accompagnés sur l'année, ni combien
 * elle en avait perdus.
 *
 * LES PRÉSENTS SONT INCLUS, délibérément : deux départs sur dix apprenants ou sur cent vingt ne
 * racontent pas la même histoire. Sans le dénominateur, une archive se lit comme un réquisitoire.
 *
 * ET RIEN N'EST ÉCARTÉ. Chaque ligne se déplie sur le parcours complet - transferts, migrations
 * de canal, pauses, reprises, changements de tarif, demandes encore en attente - parce que ces
 * cinq choses sont écrites à cinq endroits différents de la base et que seule leur mise en ordre
 * raconte ce qui s'est passé. Un apprenant passé du présentiel au en ligne doit se lire comme
 * tel, et non comme un banal changement de groupe.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const dateHeure = (d) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtF = (n) => `${Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " ")} F`;

const COULEURS_STATUT = {
  en_formation: { t: "#15803d", f: "#dcfce7" },
  revenu:       { t: "#9a3412", f: "#ffedd5" },
  a_arrete:     { t: "#b91c1c", f: "#fee2e2" },
  jamais_place: { t: "#475569", f: "#f1f5f9" },
};

/* Chaque nature d'événement a sa marque. Les couleurs ne décorent pas : elles disent la
   différence entre « il a changé de classe » (bleu, interne) et « il est parti » (rouge). */
const MARQUES = {
  inscription:       { icone: "🎓", t: "#0f172a", f: "#f1f5f9" },
  arrivee_transfert: { icone: "↳",  t: "#1d4ed8", f: "#eff6ff" },
  transfert:         { icone: "🔄", t: "#1d4ed8", f: "#dbeafe" },
  migration_canal:   { icone: "🌐", t: "#6d28d9", f: "#ede9fe" },
  changement_centre: { icone: "🏢", t: "#0369a1", f: "#e0f2fe" },
  pause:             { icone: "⏸",  t: "#b45309", f: "#ffedd5" },
  reprise:           { icone: "▶",  t: "#15803d", f: "#dcfce7" },
  arret:             { icone: "⛔", t: "#b91c1c", f: "#fee2e2" },
  changement_tarif:  { icone: "💰", t: "#0f766e", f: "#ccfbf1" },
  demande_en_cours:  { icone: "⏳", t: "#b45309", f: "#fef3c7" },
};

const BtnPage = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
      border: "1px solid " + (disabled ? "#e2e8f0" : "#cbd5e1"), background: disabled ? "#f1f5f9" : "#fff",
      color: disabled ? "#cbd5e1" : "#334155", cursor: disabled ? "not-allowed" : "pointer" }}>
    {children}
  </button>
);

/** Une étape du parcours, telle qu'elle se lit dans la frise dépliée. */
function Etape({ e }) {
  const m = MARQUES[e.type] || MARQUES.inscription;
  const vers = e.type === "changement_tarif"
    ? <><strong>{fmtF(e.de)}</strong> → <strong>{fmtF(e.vers)}</strong></>
    : e.vers_classe
      ? <>vers <strong>{e.vers_classe}</strong>{e.vers_canal && <span style={{ color: "#64748b" }}> ({libelleCanal(e.vers_canal)})</span>}</>
      : e.depuis_classe ? <>depuis <strong>{e.depuis_classe}</strong></> : null;

  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: m.f, color: m.t,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{m.icone}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: m.t }}>
            {LIBELLES_EVENEMENT[e.type] || e.type}
          </span>
          <span style={{ fontSize: 11.5, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{dateHeure(e.date)}</span>
          {/* Le test de niveau n'est dit QUE là où la question se pose. C'est la règle qui
              distingue une migration de canal d'un changement de classe, et la taire ferait
              croire qu'on a oublié de le faire passer. */}
          {e.test_de_niveau === false && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6d28d9", background: "#ede9fe", borderRadius: 99, padding: "1px 7px" }}>
              sans test de niveau
            </span>
          )}
          {e.test_de_niveau === true && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#1d4ed8", background: "#dbeafe", borderRadius: 99, padding: "1px 7px" }}>
              après test de niveau
            </span>
          )}
          {e.statut_demande && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", background: "#fef3c7", borderRadius: 99, padding: "1px 7px" }}>
              {e.statut_demande.replace(/_/g, " ")}
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#475569", marginTop: 3, lineHeight: 1.5 }}>
          {e.classe && <>{e.classe}{e.canal && <span style={{ color: "#94a3b8" }}> · {libelleCanal(e.canal)}</span>}</>}
          {vers && <> {e.classe ? "— " : ""}{vers}</>}
          {e.niveau_avant && e.niveau_apres && e.niveau_avant !== e.niveau_apres && (
            <span style={{ color: "#94a3b8" }}> · niveau {e.niveau_avant} → {e.niveau_apres}</span>
          )}
          {/* LE TRAJET ENTRE CENTRES, dit explicitement. Sans lui, un transfert d'Angré à
              Yopougon se lisait comme un simple changement de classe : la ligne nommait les
              deux classes sans jamais dire que l'apprenant avait changé de ville. */}
          {(e.depuis_centre || e.vers_centre) && (
            <div style={{ color: "#0369a1", marginTop: 2 }}>
              🏢 {e.depuis_centre || "centre d'origine"} → <strong>{e.vers_centre || "nouveau centre"}</strong>
            </div>
          )}
        </div>

        {(e.motif || e.detail) && (
          <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
            {e.motif && <strong style={{ color: "#475569" }}>{e.motif}</strong>}
            {e.detail && <span> — {e.detail}</span>}
          </div>
        )}
        {e.par_nom && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            par {e.par_nom}{e.par_role ? ` · ${e.par_role}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArchiveApprenantsCommerciale({ commercialeNom, accent = "#0891b2", authHdrs }) {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [annee, setAnnee] = useState("");
  const [classeId, setClasseId] = useState("");
  const [statut, setStatut] = useState("");
  const [mouvement, setMouvement] = useState("");
  const [recherche, setRecherche] = useState("");
  const [deplie, setDeplie] = useState(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  /* `authHdrs` arrive presque toujours en fonction fléchée écrite dans le JSX : son identité
     change à chaque rendu. La mettre dans les dépendances de `charger` relancerait le fetch
     après CHAQUE réponse - une boucle sans fin. Le ref garde la dernière version. */
  const hdrsRef = useRef(authHdrs);
  hdrsRef.current = authHdrs;

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const q = annee ? `?annee=${annee}` : "";
      const r = await fetch(`${API_URL}/api/parcours/mes-apprenants/archive${q}`, { headers: hdrsRef.current() });
      setDonnees(r.ok ? await r.json() : { apprenants: [], classes: [], totaux: null });
    } catch { setDonnees({ apprenants: [], classes: [], totaux: null }); }
    finally { setChargement(false); }
  }, [annee]);

  useEffect(() => { charger(); }, [charger]);

  const tous = donnees?.apprenants || [];

  /* Les années présentes dans les données, pas une plage inventée : proposer 2024 quand aucun
     apprenant n'y figure fait cliquer pour rien. */
  const annees = useMemo(() => {
    const s = new Set();
    tous.forEach(a => {
      if (a.date_entree) s.add(new Date(a.date_entree).getFullYear());
      if (a.date_sortie) s.add(new Date(a.date_sortie).getFullYear());
    });
    return [...s].sort((x, y) => y - x);
  }, [tous]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return tous.filter(a =>
      (!statut || a.statut === statut) &&
      (!classeId || (a.evenements || []).some(e => e.classe_id === classeId)) &&
      (!mouvement
        || (mouvement === "transfert"  && a.nb_transferts > 0)
        || (mouvement === "migration"  && a.nb_migrations > 0)
        || (mouvement === "pause"      && a.nb_pauses > 0)
        || (mouvement === "tarif"      && a.nb_changements_tarif > 0)
        || (mouvement === "en_attente" && !!a.demande_en_cours)) &&
      (!q || `${a.nom} ${a.email || ""} ${a.telephone || ""} ${a.classe_actuelle || ""} ${a.derniere_classe || ""}`
        .toLowerCase().includes(q)));
  }, [tous, statut, classeId, mouvement, recherche]);

  const parPage = 15;
  const [page, setPage] = useState(1);
  const nbPages = Math.max(1, Math.ceil(visibles.length / parPage));
  // Filtrer pendant qu'on est page 4 laisserait une page vide.
  useEffect(() => { setPage(1); setDeplie(null); }, [statut, classeId, mouvement, recherche, annee, tous]);
  const pageSure = Math.min(page, nbPages);
  const debut = (pageSure - 1) * parPage;
  const pageVisibles = visibles.slice(debut, debut + parPage);

  const exporter = async () => {
    setExportEnCours(true);
    try {
      // On exporte TOUT LE RÉSULTAT FILTRÉ, pas la page affichée : la pagination sert à lire
      // à l'écran, elle ne doit pas amputer le fichier.
      await exporterArchiveCommerciale({
        commercialeNom, apprenants: visibles, totaux: donnees?.totaux, annee: annee || null,
      });
      toast.success("Archive exportée ✓");
    } catch (e) { toast.error(e.message || "Export impossible"); }
    finally { setExportEnCours(false); }
  };

  const Chiffre = ({ n, l, c, aide }) => (
    <div title={aide} style={{ flex: 1, minWidth: 104, background: "#f8fafc", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{l}</div>
    </div>
  );

  const champ = { padding: "8px 11px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12.5,
    background: "#fff", outline: "none", fontFamily: "inherit" };

  if (chargement) {
    return <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>Chargement de l'archive…</div>;
  }

  const t = donnees?.totaux;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Chiffre n={t?.total ?? 0} l="apprenants au total" c="#0f172a" />
        <Chiffre n={t?.en_formation ?? 0} l="en formation" c="#16a34a" />
        <Chiffre n={t?.partis ?? 0} l="ont arrêté" c={t?.partis ? "#b91c1c" : "#94a3b8"} />
        {/* Affichés seulement s'ils existent : une case à zéro occupe la place sans rien
            apprendre, sur une barre qui en compte déjà six. */}
        {(t?.revenus ?? 0) > 0 && <Chiffre n={t.revenus} l="sont revenus" c="#9a3412" />}
        {(t?.jamais_places ?? 0) > 0 && (
          <Chiffre n={t.jamais_places} l="jamais placés" c="#64748b"
            aide="Dossiers convertis que l'onboarding n'a jamais inscrits en classe. Ils ne comptent pas dans la rétention." />
        )}
        {/* Transferts et migrations à part : ce ne sont PAS des départs. Les fondre dans
            « ont arrêté » ferait baisser la rétention pour des apprenants toujours là. */}
        {(t?.transferts ?? 0) > 0 && <Chiffre n={t.transferts} l="transferts" c="#1d4ed8" aide="Changements de classe — l'apprenant est toujours en formation." />}
        {(t?.migrations ?? 0) > 0 && <Chiffre n={t.migrations} l="migrations de canal" c="#6d28d9" aide="Passages présentiel ↔ en ligne — l'apprenant est toujours en formation." />}
        <Chiffre n={t?.taux_retention == null ? "—" : `${t.taux_retention}%`} l="rétention" c={accent} />
        <Chiffre n={fmtF(t?.ca_encaisse)} l="encaissé" c="#0f766e" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="🔍 Nom, classe, contact…" style={{ ...champ, minWidth: 190, flex: "0 1 230px" }} />
        <select value={annee} onChange={e => setAnnee(e.target.value)} style={{ ...champ, cursor: "pointer" }}>
          <option value="">Toutes les années</option>
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={classeId} onChange={e => setClasseId(e.target.value)} style={{ ...champ, cursor: "pointer", maxWidth: 200 }}>
          <option value="">Toutes les classes</option>
          {(donnees?.classes || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select value={statut} onChange={e => setStatut(e.target.value)} style={{ ...champ, cursor: "pointer" }}>
          <option value="">Tous les statuts</option>
          {Object.entries(LIBELLES_STATUT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {/* Le filtre que l'archive du coach n'a pas : « montre-moi ceux qui ont bougé ». C'est
            la question qu'on se pose en relisant une année. */}
        <select value={mouvement} onChange={e => setMouvement(e.target.value)} style={{ ...champ, cursor: "pointer" }}>
          <option value="">Tous les mouvements</option>
          <option value="transfert">Ont changé de classe</option>
          <option value="migration">Ont migré de canal</option>
          <option value="pause">Ont fait une pause</option>
          <option value="tarif">Ont changé de tarif</option>
          <option value="en_attente">Demande en attente</option>
        </select>

        <button onClick={exporter} disabled={exportEnCours || !visibles.length}
          title="Trois feuilles : les apprenants, leur parcours détaillé, la synthèse"
          style={{ marginLeft: "auto", padding: "8px 16px", border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
            background: exportEnCours || !visibles.length ? "#cbd5e1" : "#16a34a", color: "#fff",
            cursor: exportEnCours || !visibles.length ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {exportEnCours ? "Export…" : "📊 Exporter en Excel"}
        </button>
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 44, background: "#f8fafc", borderRadius: 12, border: "1px dashed #e2e8f0", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📒</div>
          <div style={{ fontWeight: 700, color: "#374151" }}>
            {tous.length ? "Aucun apprenant ne correspond à ces filtres" : "Aucun apprenant dans votre portefeuille"}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["", "Apprenant", "Formule", "Classe", "Entré le", "Parti le", "Durée", "Encaissé", "Statut", "Parcours"].map((h, i) => (
                    <th key={i} style={{ padding: "10px 13px", textAlign: "left", fontSize: 10.5, fontWeight: 700,
                      color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageVisibles.map(a => {
                  const c = COULEURS_STATUT[a.statut] || COULEURS_STATUT.jamais_place;
                  const ouvert = deplie === a.assignation_id;
                  const nbEvts = (a.evenements || []).length;
                  return (
                    <React.Fragment key={a.assignation_id}>
                      <tr onClick={() => setDeplie(ouvert ? null : a.assignation_id)}
                        style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                          background: ouvert ? "#f8fafc" : a.parti ? "#fffbfb" : "#fff" }}>
                        <td style={{ padding: "10px 13px", color: "#94a3b8", width: 24 }}>{ouvert ? "▾" : "▸"}</td>
                        <td style={{ padding: "10px 13px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{a.nom}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.telephone || a.email || "—"}</div>
                        </td>
                        <td style={{ padding: "10px 13px", color: "#475569", whiteSpace: "nowrap" }}>{libelleCanal(a.canal)}</td>
                        <td style={{ padding: "10px 13px", color: "#475569" }}>
                          {a.classe_actuelle || (a.derniere_classe
                            ? <span style={{ color: "#94a3b8" }}>{a.derniere_classe} (quittée)</span>
                            : <span style={{ color: "#cbd5e1" }}>—</span>)}
                        </td>
                        <td style={{ padding: "10px 13px", color: "#64748b", whiteSpace: "nowrap" }}>{dateFr(a.date_entree)}</td>
                        <td style={{ padding: "10px 13px", whiteSpace: "nowrap",
                          color: a.parti ? "#b91c1c" : a.revenu ? "#b45309" : "#cbd5e1" }}>{dateFr(a.date_sortie)}</td>
                        <td style={{ padding: "10px 13px", color: "#475569", whiteSpace: "nowrap" }}>{dureeLisible(a) || "—"}</td>
                        <td style={{ padding: "10px 13px", color: "#0f766e", fontWeight: 700, whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums" }}>{fmtF(a.montant_encaisse)}</td>
                        <td style={{ padding: "10px 13px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: "2px 9px",
                            whiteSpace: "nowrap", background: c.f, color: c.t }}>
                            {LIBELLES_STATUT[a.statut] || a.statut}
                          </span>
                          {a.statut === "a_arrete" && (
                            <div style={{ fontSize: 10.5, marginTop: 3, color: a.motif_sortie ? "#94a3b8" : "#b45309",
                              fontStyle: a.motif_sortie ? "normal" : "italic" }}>
                              {/* Un départ SANS motif est dit comme tel : une case vide laisse
                                  croire à un oubli d'affichage plutôt qu'à un oubli de saisie. */}
                              {a.motif_sortie || "motif non renseigné"}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 13px" }}>
                          {/* Les pastilles disent qu'il s'est passé quelque chose SANS avoir à
                              déplier : une ligne muette laisserait croire à un parcours plat. */}
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {a.nb_transferts > 0 && <Pastille c="#1d4ed8" f="#dbeafe">🔄 {a.nb_transferts}</Pastille>}
                            {a.nb_migrations > 0 && <Pastille c="#6d28d9" f="#ede9fe">🌐 {a.nb_migrations}</Pastille>}
                            {a.nb_changements_centre > 0 && <Pastille c="#0369a1" f="#e0f2fe">🏢 {a.nb_changements_centre}</Pastille>}
                            {a.nb_pauses > 0 && <Pastille c="#b45309" f="#ffedd5">⏸ {a.nb_pauses}</Pastille>}
                            {a.nb_changements_tarif > 0 && <Pastille c="#0f766e" f="#ccfbf1">💰 {a.nb_changements_tarif}</Pastille>}
                            {a.demande_en_cours && <Pastille c="#b45309" f="#fef3c7">⏳ en attente</Pastille>}
                            {!a.nb_transferts && !a.nb_migrations && !a.nb_changements_centre && !a.nb_pauses && !a.nb_changements_tarif && !a.demande_en_cours && (
                              <span style={{ fontSize: 11, color: "#cbd5e1" }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {ouvert && (
                        <tr>
                          <td colSpan={10} style={{ padding: 0, background: "#fcfdfe", borderBottom: "1px solid #e2e8f0" }}>
                            <div style={{ padding: "14px 20px 16px 50px" }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 }}>
                                Parcours complet — {nbEvts} événement{nbEvts > 1 ? "s" : ""}
                              </div>
                              {nbEvts === 0 ? (
                                <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>
                                  Dossier converti, jamais inscrit en classe — il n'y a rien à retracer.
                                </div>
                              ) : (
                                (a.evenements || []).map((e, i) => <Etape key={i} e={e} />)
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* La barre reste affichée même sur une seule page : elle porte le décompte, qui dit
              combien de lignes les filtres ont retenues. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            padding: "10px 13px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
              {debut + 1}–{debut + pageVisibles.length} sur <strong style={{ color: "#0f172a" }}>{visibles.length}</strong> apprenant(s)
              {visibles.length !== tous.length && <span style={{ color: "#94a3b8" }}> · {tous.length} au total</span>}
            </div>
            {nbPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BtnPage onClick={() => setPage(1)} disabled={pageSure === 1}>«</BtnPage>
                <BtnPage onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSure === 1}>‹ Précédent</BtnPage>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", padding: "0 6px", fontVariantNumeric: "tabular-nums" }}>
                  {pageSure} / {nbPages}
                </span>
                <BtnPage onClick={() => setPage(p => Math.min(nbPages, p + 1))} disabled={pageSure === nbPages}>Suivant ›</BtnPage>
                <BtnPage onClick={() => setPage(nbPages)} disabled={pageSure === nbPages}>»</BtnPage>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dit une fois, en bas, plutôt que répété sur chaque ligne : sans cette phrase, un
          lecteur additionne les transferts aux départs et conclut à une hémorragie. */}
      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 10, lineHeight: 1.5 }}>
        Un <strong style={{ color: "#1d4ed8" }}>transfert</strong> ou une{" "}
        <strong style={{ color: "#6d28d9" }}>migration de canal</strong> n'est pas un départ :
        l'apprenant suit toujours ses cours, ailleurs. Seul « a arrêté » compte comme une perte.
      </div>
    </div>
  );
}

const Pastille = ({ c, f, children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 700, color: c, background: f, borderRadius: 99,
    padding: "2px 7px", whiteSpace: "nowrap" }}>{children}</span>
);
