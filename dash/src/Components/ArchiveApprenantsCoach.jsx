import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "react-toastify";
import { exporterArchiveApprenants, libelleMotif } from "../utils/exporterArchiveApprenants";

/**
 * L'archive des apprenants d'un coach - qui il a formé, et qui est parti.
 *
 * Le coach n'avait aucun moyen de retracer son année : la liste d'une classe montre ses
 * inscrits du jour, et un apprenant qui part en disparaît. Au bout de douze mois, personne
 * ne pouvait dire combien il en avait accompagnés.
 *
 * LES PRÉSENTS SONT INCLUS, délibérément. Dix départs sur douze apprenants ou sur cent
 * vingt ne racontent pas la même histoire : sans le dénominateur, une archive se lit comme
 * un acte d'accusation. C'est aussi pour ça que le taux de rétention est affiché en haut.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "-");

const BtnPage = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
      border: "1px solid " + (disabled ? "#e2e8f0" : "#cbd5e1"), background: disabled ? "#f1f5f9" : "#fff",
      color: disabled ? "#cbd5e1" : "#334155", cursor: disabled ? "not-allowed" : "pointer" }}>
    {children}
  </button>
);

export default function ArchiveApprenantsCoach({ coachId, coachNom, accent = "#0891b2", authHdrs }) {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [annee, setAnnee] = useState("");
  const [classeId, setClasseId] = useState("");
  const [statut, setStatut] = useState("");
  const [recherche, setRecherche] = useState("");
  const [exportEnCours, setExportEnCours] = useState(false);

  /* `authHdrs` arrive souvent en fonction fléchée écrite dans le JSX : son identité change
     à chaque rendu. La mettre dans les dépendances de `charger` relancerait donc le fetch
     après CHAQUE réponse - une boucle infinie. On garde la dernière version dans un ref :
     l'appel reste à jour, l'identité ne déclenche plus rien. */
  const hdrsRef = useRef(authHdrs);
  hdrsRef.current = authHdrs;

  const charger = useCallback(async () => {
    if (!coachId) return;
    setChargement(true);
    try {
      const q = annee ? `?annee=${annee}` : "";
      const r = await fetch(`${API_URL}/api/coachs/${coachId}/archive-apprenants${q}`, { headers: hdrsRef.current() });
      setDonnees(r.ok ? await r.json() : { apprenants: [], classes: [], totaux: null });
    } catch { setDonnees({ apprenants: [], classes: [], totaux: null }); }
    finally { setChargement(false); }
  }, [coachId, annee]);

  useEffect(() => { charger(); }, [charger]);

  const tous = donnees?.apprenants || [];
  const nbRevenus = tous.filter(a => !a.parti && a.revenu).length;

  /* Les années présentes dans les données, pas une plage inventée : proposer 2024 quand
     aucun apprenant n'y figure fait cliquer pour rien. */
  const annees = useMemo(() => {
    const s = new Set();
    tous.forEach(a => {
      if (a.date_arrivee) s.add(new Date(a.date_arrivee).getFullYear());
      if (a.date_sortie) s.add(new Date(a.date_sortie).getFullYear());
    });
    return [...s].sort((x, y) => y - x);
  }, [tous]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return tous.filter(a =>
      (!classeId || a.classe_id === classeId) &&
      (!statut || (statut === "parti" ? a.parti : statut === "revenu" ? (!a.parti && a.revenu) : !a.parti)) &&
      (!q || `${a.nom} ${a.classe} ${a.email || ""} ${a.telephone || ""}`.toLowerCase().includes(q)));
  }, [tous, classeId, statut, recherche]);

  /* ── Pagination ──
     Un coach à l'année dépasse vite la centaine d'apprenants, et la liste vit dans un
     modal : tout afficher noyait les filtres et le bouton d'export en haut d'un tableau
     qu'il fallait faire défiler longtemps. */
  const parPage = 20;
  const [page, setPage] = useState(1);
  const nbPages = Math.max(1, Math.ceil(visibles.length / parPage));

  // Filtrer pendant qu'on est page 4 laisserait une page vide : on revient au début dès
  // que le contenu change.
  useEffect(() => { setPage(1); }, [classeId, statut, recherche, annee, tous]);

  // Ceinture et bretelles : si le nombre de pages rétrécit, la page courante suit.
  const pageSure = Math.min(page, nbPages);
  const debut = (pageSure - 1) * parPage;
  const pageVisibles = visibles.slice(debut, debut + parPage);

  const exporter = async () => {
    setExportEnCours(true);
    try {
      // On exporte TOUT LE RÉSULTAT FILTRÉ (`visibles`), pas la page en cours : la
      // pagination sert à lire à l'écran, elle ne doit pas amputer le fichier.
      await exporterArchiveApprenants({
        coachNom, apprenants: visibles, totaux: donnees?.totaux, annee: annee || null,
      });
      toast.success("Archive exportée ✓");
    } catch (e) { toast.error(e.message || "Export impossible"); }
    finally { setExportEnCours(false); }
  };

  const Chiffre = ({ n, l, c }) => (
    <div style={{ flex: 1, minWidth: 100, background: "#f8fafc", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{l}</div>
    </div>
  );

  const champ = { padding: "8px 11px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, background: "#fff", outline: "none", fontFamily: "inherit" };

  if (chargement) {
    return <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>Chargement de l'archive…</div>;
  }

  const t = donnees?.totaux;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Chiffre n={t?.total ?? 0} l="apprenants au total" c="#0f172a" />
        <Chiffre n={t?.actifs ?? 0} l="encore en formation" c="#16a34a" />
        <Chiffre n={t?.partis ?? 0} l="ont arrêté" c={t?.partis ? "#b91c1c" : "#94a3b8"} />
        {/* Affiché seulement s'il y en a : une case « 0 revenu » occupe la place sans rien
            apprendre, sur un tableau de bord qui en compte déjà cinq. */}
        {nbRevenus > 0 && <Chiffre n={nbRevenus} l="sont revenus" c="#9a3412" />}
        {/* Le taux n'a de sens qu'avec des apprenants : 0/0 n'est pas 0 %. */}
        <Chiffre n={t?.taux_retention == null ? "-" : `${t.taux_retention}%`} l="rétention" c={accent} />
        <Chiffre n={t?.duree_moyenne_mois == null ? "-" : `${t.duree_moyenne_mois} mois`} l="durée moyenne" c="#64748b" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="🔍 Nom, classe, contact…" style={{ ...champ, minWidth: 200, flex: "0 1 260px" }} />
        <select value={annee} onChange={e => setAnnee(e.target.value)} style={{ ...champ, cursor: "pointer" }}>
          <option value="">Toutes les années</option>
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={classeId} onChange={e => setClasseId(e.target.value)} style={{ ...champ, cursor: "pointer", maxWidth: 220 }}>
          <option value="">Toutes les classes</option>
          {(donnees?.classes || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select value={statut} onChange={e => setStatut(e.target.value)} style={{ ...champ, cursor: "pointer" }}>
          <option value="">Tous les statuts</option>
          <option value="actif">En formation</option>
          <option value="revenu">Sont revenus</option>
          <option value="parti">Ont arrêté</option>
        </select>

        <button onClick={exporter} disabled={exportEnCours || !visibles.length}
          title="Au format de la feuille ON BREAK de votre classeur"
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
            {tous.length ? "Aucun apprenant ne correspond à ces filtres" : "Aucun apprenant dans les classes de ce coach"}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Apprenant", "Classe", "Niveau", "Arrivé le", "Parti le", "Durée", "Statut", "Motif"].map(h => (
                    <th key={h} style={{ padding: "10px 13px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageVisibles.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9", background: a.parti ? "#fffbfb" : "#fff" }}>
                    <td style={{ padding: "10px 13px" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{a.nom}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.telephone || a.email || "-"}</div>
                    </td>
                    <td style={{ padding: "10px 13px", color: "#475569" }}>{a.classe}</td>
                    <td style={{ padding: "10px 13px" }}>
                      {a.niveau ? <span style={{ fontSize: 11, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", borderRadius: 99, padding: "2px 8px" }}>{a.niveau}</span> : "-"}
                    </td>
                    <td style={{ padding: "10px 13px", color: "#64748b", whiteSpace: "nowrap" }}>{dateFr(a.date_arrivee)}</td>
                    <td style={{ padding: "10px 13px", color: a.parti ? "#b91c1c" : a.revenu ? "#b45309" : "#cbd5e1", whiteSpace: "nowrap" }}>{dateFr(a.date_sortie)}</td>
                    <td style={{ padding: "10px 13px", color: "#475569", whiteSpace: "nowrap" }}>{a.duree_texte || "-"}</td>
                    <td style={{ padding: "10px 13px" }}>
                      {/* Trois états. « Revenu » n'est ni l'un ni l'autre : il est là
                          aujourd'hui, mais il est parti entre-temps - et c'est cela que la
                          feuille ON BREAK existe pour consigner. */}
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: "2px 9px", whiteSpace: "nowrap",
                        background: a.parti ? "#fee2e2" : a.revenu ? "#ffedd5" : "#dcfce7",
                        color:      a.parti ? "#b91c1c" : a.revenu ? "#9a3412" : "#15803d" }}>
                        {a.parti ? "A arrêté" : a.revenu ? "Revenu" : "En formation"}
                      </span>
                      {a.revenu && a.date_reprise && (
                        <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 3 }}>
                          repris le {dateFr(a.date_reprise)}
                          {a.nb_pauses > 1 ? ` · ${a.nb_pauses} pauses` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 13px", color: "#475569", maxWidth: 260 }}>
                      {/* Un départ SANS motif est dit comme tel : une case vide laisse
                          croire à un oubli d'affichage plutôt qu'à un oubli de saisie. */}
                      {(a.parti || a.revenu)
                        ? (a.motif
                          ? <>{libelleMotif(a.motif)}{a.detail_motif && <span style={{ color: "#94a3b8" }}> - {a.detail_motif}</span>}</>
                          : <span style={{ color: "#b45309", fontStyle: "italic" }}>motif non renseigné</span>)
                        : <span style={{ color: "#cbd5e1" }}>-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* La barre reste affichée même sur une seule page : elle porte le décompte,
              qui dit combien de lignes les filtres ont retenues. */}
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
    </div>
  );
}
