import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

const API_URL      = process.env.REACT_APP_API_URL      || "http://localhost:5001";
const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || "https://binniesenglish.net";

/**
 * DEMANDE DE TRANSFERT — un dossier qui traverse trois métiers.
 *
 * Le coach constate qu'un apprenant n'est plus à sa place et le signale. L'agent placement
 * test le fait passer et rend un niveau. L'onboarding, et lui seul, réaffecte. Ce fichier
 * porte les deux écrans de ce parcours - le bouton du coach et la file de travail - plutôt
 * que de les recopier dans les trois tableaux de bord concernés : trois copies d'un même
 * circuit finiraient par décrire trois circuits différents.
 *
 * LE VERROU EST AILLEURS. Le bouton « Réaffecter » est grisé tant que le test n'est pas revenu,
 * mais c'est le serveur qui refuse - un bouton grisé n'est pas un droit retiré.
 */

const MOTIFS = {
  niveau_trop_eleve: "Niveau de la classe trop élevé",
  niveau_trop_bas:   "Niveau de la classe trop bas",
  rythme_inadapte:   "Rythme inadapté",
  horaire:           "Horaires qui ne conviennent plus",
  relation_groupe:   "Difficulté d'intégration dans le groupe",
  autre:             "Autre",
};

const ETATS = {
  en_attente_test: { l: "En attente du test", c: "#b45309", bg: "#fef3c7" },
  test_fait:       { l: "Prêt à réaffecter",  c: "#15803d", bg: "#dcfce7" },
  traitee:         { l: "Réaffecté",          c: "#475569", bg: "#f1f5f9" },
  refusee:         { l: "Refusée",            c: "#b91c1c", bg: "#fee2e2" },
};

const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const champ = { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

/**
 * COMBIEN DE DOSSIERS M'ATTENDENT — pour le badge de l'onglet et la liste des tâches.
 *
 * Sans ce compte, un dossier prêt restait invisible tant que personne n'ouvrait l'onglet :
 * la notification passait, et le transfert attendait qu'on y repense. Un badge rend l'attente
 * visible depuis n'importe quel écran du tableau de bord.
 *
 * CHACUN SON COMPTE. Le placement test attend les dossiers `en_attente_test` - ceux où il doit
 * agir ; l'onboarding et la commerciale attendent les `test_fait` - ceux qu'ils peuvent enfin
 * réaffecter. Compter les mêmes dossiers pour les deux afficherait à chacun le travail de
 * l'autre, et le badge cesserait de vouloir dire « à vous de jouer ».
 */
export function useCompteDemandesTransfert(authHdrs, mode = "onboarding") {
  const [compte, setCompte] = useState(0);
  const statut = mode === "placement" ? "en_attente_test" : "test_fait";

  const relire = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert?statut=${statut}`, { headers: authHdrs() });
      if (!r.ok) return;
      const d = await r.json();
      setCompte((d.demandes || []).length);
    } catch { /* un badge absent ne doit jamais casser l'écran qui le porte */ }
  }, [authHdrs, statut]);

  useEffect(() => {
    relire();
    // Le dossier avance dans un AUTRE tableau de bord : sans relecture, l'onboarding ne
    // verrait le niveau arriver qu'en rechargeant sa page.
    const t = setInterval(relire, 60000);
    return () => clearInterval(t);
  }, [relire]);

  return compte;
}

/* ══════════════════════════════════════════════════════════════
   LE BOUTON DU COACH
══════════════════════════════════════════════════════════════ */
export function BoutonDemandeTransfert({ gaId, nomApprenant, accent = "#b45309", authHdrs, onEmise }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [detail, setDetail] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async () => {
    if (!motif) return;
    setEnvoi(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({ ga_id: gaId, motif, detail: detail.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Demande impossible");
      toast.success("Demande transmise à l'onboarding et au placement test ✓");
      setOuvert(false); setMotif(""); setDetail("");
      onEmise?.(d.demande);
    } catch (e) {
      toast.error(e.message || "Demande impossible");
    } finally { setEnvoi(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
        style={{ padding: "8px 16px", background: "#fff", border: `1.5px solid ${accent}55`, borderRadius: 8,
          color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        🔄 Demande de transfert
      </button>

      {ouvert && (
        <div onClick={e => { if (e.target === e.currentTarget && !envoi) setOuvert(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%", maxWidth: 480 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              Demander le transfert de {nomApprenant}
            </div>
            {/* DIRE CE QUI VA SE PASSER. Le coach n'exécute pas le changement : il ouvre un
                dossier que deux autres métiers vont faire avancer. Sans cette phrase, il
                attend un déplacement immédiat et croit à une panne quand rien ne bouge. */}
            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 16px" }}>
              Votre demande part à l'<strong>équipe onboarding</strong> et à l'<strong>agent placement test</strong>.
              Le test de niveau sera passé d'abord ; c'est son résultat qui déterminera la nouvelle classe.
              Vous serez prévenu à chaque étape.
            </p>

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Motif <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select value={motif} onChange={e => setMotif(e.target.value)} style={{ ...champ, marginBottom: 12 }}>
              <option value="">— Choisir un motif —</option>
              {Object.entries(MOTIFS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Précisions <span style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</span>
            </label>
            <textarea rows={3} value={detail} onChange={e => setDetail(e.target.value)}
              placeholder="Ce que vous avez observé en classe — c'est ce que liront l'onboarding et le placement test."
              style={{ ...champ, marginBottom: 18, resize: "vertical" }} />

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setOuvert(false)} disabled={envoi}
                style={{ flex: 1, padding: 12, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button type="button" onClick={envoyer} disabled={!motif || envoi}
                style={{ flex: 1.4, padding: 12, borderRadius: 9, border: "none", fontFamily: "inherit",
                  background: motif ? accent : "#cbd5e1", color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: motif && !envoi ? "pointer" : "not-allowed" }}>
                {envoi ? "Envoi…" : "Envoyer la demande"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   LA FILE DE TRAVAIL — onboarding et placement test
══════════════════════════════════════════════════════════════ */
export default function FileDemandesTransfert({ accent = "#b45309", authHdrs, mode = "onboarding" }) {
  const [demandes, setDemandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [nonInstalle, setNonInstalle] = useState(false);
  const [filtre, setFiltre] = useState("ouvertes");
  const [action, setAction] = useState(null);     // { demande, type: "test" | "refus" }
  const [valeur, setValeur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [verifie, setVerifie] = useState(null);   // dossier dont on interroge le résultat
  /* Réaffectation : le dossier en cours de traitement et la classe choisie.
     LE BOUTON NE DOIT PAS SE CONTENTER DE CLORE LE DOSSIER. Il le faisait : le dossier passait
     à « Réaffecté » sans que personne ne bouge, et il quittait la file en laissant l'apprenant
     dans sa classe d'origine - une disparition silencieuse, pire que l'absence de bouton. */
  const [reaffectation, setReaffectation] = useState(null);   // { demande }
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classeChoisie, setClasseChoisie] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, { headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lecture impossible");
      setDemandes(d.demandes || []);
      setNonInstalle(!!d.non_installe);
    } catch (e) {
      toast.error(e.message || "Chargement impossible");
    } finally { setChargement(false); }
  }, [authHdrs]);

  useEffect(() => { charger(); }, [charger]);

  const patch = async (demande, corps, succes) => {
    setOccupe(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert/${demande.id}`, {
        method: "PATCH", headers: authHdrs(), body: JSON.stringify(corps),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Mise à jour impossible");
      toast.success(succes);
      setAction(null); setValeur("");
      charger();
    } catch (e) {
      toast.error(e.message || "Mise à jour impossible");
    } finally { setOccupe(false); }
  };

  /* FAIRE PASSER LE TEST — les deux formes, comme pour un nouveau prospect.
     EN LIGNE : un lien pré-rempli du nom et de l'e-mail de l'apprenant. Il le passe lui-même,
     le résultat arrive dans « À corriger » comme n'importe quel candidat, et « Vérifier »
     le rapatrie ici pour débloquer la réaffectation.
     EN PRÉSENTIEL : l'agent teste l'apprenant devant lui et saisit le niveau directement.
     Les deux chemins existent parce que les deux situations existent - n'en offrir qu'un
     obligerait l'agent à contourner l'outil dans la moitié des cas. */
  /* LE LIEN PORTE LA DEMANDE, ET C'EST CE QUI ÉVITE LE MUR DE CONNEXION.
     La page publique du test n'ouvre son formulaire sans compte que si le lien identifie
     déjà son destinataire - jusqu'ici par `assignation_id`, une notion de prospect qu'un
     apprenant déjà en classe n'a pas. Sans `demande`, il tombait sur « Connectez-vous », et
     s'il ouvrait le lien depuis un poste où un autre compte était connecté, il risquait de
     passer le test sous cette identité-là. L'e-mail du lien verrouille aussi le champ. */
  const lienTest = (d) => {
    const p = new URLSearchParams();
    if (d.email_apprenant) p.set("email", d.email_apprenant);
    const nom = [d.prenom_apprenant, d.nom_apprenant].filter(Boolean).join(" ");
    if (nom) p.set("nom", nom);
    p.set("demande", d.id);
    // Le profil est déjà connu - c'est un transfert. Le transmettre évite que l'apprenant
    // arrive sur « Particulier » présélectionné par défaut et le change sans y penser.
    if (d.profil_type) p.set("profil", d.profil_type);
    return `${FRONTEND_URL}/test-niveau?${p}`;
  };

  const copierLien = (d) => {
    navigator.clipboard.writeText(lienTest(d))
      .then(() => toast.success("Lien du test copié — transmettez-le à l'apprenant"))
      .catch(() => toast.error("Copie impossible"));
  };

  const verifierTest = async (d) => {
    if (!d.email_apprenant) {
      toast.error("Aucun e-mail connu pour cet apprenant : saisissez le niveau à la main.");
      return;
    }
    setVerifie(d.id);
    try {
      const r = await fetch(`${API_URL}/api/level-test/result?email=${encodeURIComponent(d.email_apprenant)}`);
      const res = await r.json();
      const niveau = res?.result?.level;
      if (!niveau) {
        toast("⏳ L'apprenant n'a pas encore passé le test — ou il reste à corriger dans « À corriger ».");
        return;
      }
      await patch(d, { niveau_obtenu: niveau, level_test_id: res.result.id || null },
        `Niveau ${niveau} récupéré du test passé ✓`);
    } catch {
      toast.error("Vérification impossible");
    } finally { setVerifie(null); }
  };

  /* Ouvrir la réaffectation : charger les classes où l'apprenant pourrait aller.
     On les charge à l'ouverture et non au montage : la liste des classes change souvent, et
     la recharger à chaque affichage de la file pour un bouton rarement cliqué serait coûteux. */
  const ouvrirReaffectation = async (d) => {
    setReaffectation({ demande: d });
    setClasseChoisie("");
    setClassesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes`, { headers: authHdrs() });
      const j = await r.json();
      const liste = (j.groupes || [])
        // Ni la classe qu'il quitte, ni une classe fermée : les proposer serait proposer
        // de ne rien faire, ou d'envoyer l'apprenant dans une classe qui n'existe plus.
        .filter(g => g.id !== d.groupe_id && g.statut !== "cloture" && g.statut !== "termine")
        .sort((a, b) => {
          // Le niveau rendu par le test d'abord : c'est la raison même de la demande.
          const pa = (a.niveau || "").toUpperCase() === (d.niveau_obtenu || "").toUpperCase() ? 0 : 1;
          const pb = (b.niveau || "").toUpperCase() === (d.niveau_obtenu || "").toUpperCase() ? 0 : 1;
          return pa - pb || String(a.nom || "").localeCompare(String(b.nom || ""));
        });
      setClasses(liste);
    } catch {
      toast.error("Chargement des classes impossible");
      setClasses([]);
    } finally { setClassesLoading(false); }
  };

  /* Exécuter le transfert, PUIS refermer le dossier. Dans cet ordre, et la seconde étape
     seulement si la première a réussi : refermer un dossier dont le déplacement a échoué le
     ferait disparaître de la file sans que rien n'ait bougé. */
  const reaffecter = async () => {
    const d = reaffectation?.demande;
    if (!d || !classeChoisie) return;
    setOccupe(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/transfert`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({
          ga_id: d.ga_id,
          nouveau_groupe_id: classeChoisie,
          motif: MOTIFS[d.motif] || d.motif,
          initiateur: "assistant",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Transfert impossible");

      await patch(d, { statut: "traitee", groupe_cible_id: classeChoisie },
        `${[d.prenom_apprenant, d.nom_apprenant].filter(Boolean).join(" ")} a été transféré ✓`);
      setReaffectation(null);
    } catch (e) {
      toast.error(e.message || "Transfert impossible");
    } finally { setOccupe(false); }
  };

  const visibles = demandes.filter(d =>
    filtre === "toutes" ? true
    : filtre === "ouvertes" ? ["en_attente_test", "test_fait"].includes(d.statut)
    : d.statut === filtre);

  const compte = (f) => f === "toutes" ? demandes.length
    : f === "ouvertes" ? demandes.filter(d => ["en_attente_test", "test_fait"].includes(d.statut)).length
    : demandes.filter(d => d.statut === f).length;

  if (nonInstalle) {
    return (
      <div style={{ textAlign: "center", padding: 50, color: "#9a3412", background: "#fff7ed", borderRadius: 12, border: "1px dashed #fed7aa" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🔄</div>
        <div style={{ fontWeight: 700 }}>Les demandes de transfert ne sont pas encore activées</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>La migration <code>Backend/sql/demandes_transfert.sql</code> doit être jouée sur la base.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>🔄 Dossiers à réaffecter</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9ca3af" }}>
            {mode === "placement"
              ? "Demandes de transfert en attente de votre test de niveau"
              : "Changements de classe et de coaching demandés par les coachs"}
          </p>
        </div>
        <button onClick={charger} style={{ padding: "7px 14px", background: accent + "18", border: `1px solid ${accent}40`, borderRadius: 8, fontSize: 12, color: accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↻ Actualiser
        </button>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {[["ouvertes", "En cours"], ["en_attente_test", "Attente du test"], ["test_fait", "Prêts à réaffecter"], ["traitee", "Réaffectés"], ["refusee", "Refusées"], ["toutes", "Toutes"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)}
            style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${filtre === k ? accent : "#e2e8f0"}`, background: filtre === k ? accent + "18" : "#fff",
              color: filtre === k ? accent : "#64748b" }}>
            {l} <span style={{ opacity: .7 }}>({compte(k)})</span>
          </button>
        ))}
      </div>

      {chargement ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Chargement…</div>
      ) : visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
          <div style={{ fontWeight: 600 }}>Aucun dossier dans cette file</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Les demandes émises par les coachs apparaîtront ici.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibles.map(d => {
            const e = ETATS[d.statut] || ETATS.en_attente_test;
            const nom = [d.prenom_apprenant, d.nom_apprenant].filter(Boolean).join(" ") || "Apprenant";
            const attendTest = d.statut === "en_attente_test";
            return (
              <div key={d.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{nom}</span>
                  <span style={{ background: e.bg, color: e.c, borderRadius: 99, padding: "2px 10px", fontSize: 10.5, fontWeight: 800 }}>{e.l}</span>
                  {d.niveau_actuel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "#1e3a8a", color: "#fff" }}>{d.niveau_actuel}</span>}
                  {d.niveau_obtenu && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: "#dcfce7", color: "#15803d" }}>
                      → {d.niveau_obtenu}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>{fmt(d.created_at)}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "5px 18px", fontSize: 12.5, color: "#334155", marginBottom: 10 }}>
                  <div><span style={{ color: "#94a3b8" }}>Classe : </span><strong>{d.groupe_nom || "-"}</strong></div>
                  <div><span style={{ color: "#94a3b8" }}>Coach : </span><strong>{d.coach_nom || "-"}</strong></div>
                  <div><span style={{ color: "#94a3b8" }}>Motif : </span><strong>{MOTIFS[d.motif] || d.motif}</strong></div>
                </div>

                {d.detail && (
                  <div style={{ background: "#f8fafc", borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
                    « {d.detail} »
                  </div>
                )}
                {d.motif_refus && (
                  <div style={{ background: "#fef2f2", borderLeft: "3px solid #b91c1c", borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.6, marginBottom: 10 }}>
                    Refus : {d.motif_refus}
                  </div>
                )}

                {/* ── Les actions, selon le métier ─────────────────────────────── */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {mode === "placement" && attendTest && (
                    <>
                      {/* EN LIGNE — le lien pré-rempli, exactement comme pour un prospect. */}
                      <button onClick={() => copierLien(d)}
                        title={d.email_apprenant ? `Lien pré-rempli pour ${d.email_apprenant}` : "Aucun e-mail connu : le lien ne sera pas pré-rempli"}
                        style={{ padding: "7px 14px", background: "#fff", border: `1.5px solid ${accent}55`, borderRadius: 8, color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        📋 Copier le lien du test
                      </button>
                      <button onClick={() => verifierTest(d)} disabled={verifie === d.id || occupe}
                        title="Récupérer le résultat si l'apprenant a déjà passé le test en ligne"
                        style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#374151", fontSize: 12, fontWeight: 700, cursor: verifie === d.id ? "wait" : "pointer", fontFamily: "inherit" }}>
                        {verifie === d.id ? "⏳ Vérification…" : "🔄 Vérifier si le test a été passé"}
                      </button>
                      {/* EN PRÉSENTIEL — l'agent teste l'apprenant devant lui et saisit le niveau. */}
                      <button onClick={() => { setAction({ demande: d, type: "test" }); setValeur(""); }}
                        style={{ padding: "7px 14px", background: accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        🧪 Saisir le niveau (test en présentiel)
                      </button>
                    </>
                  )}

                  {mode === "onboarding" && ["en_attente_test", "test_fait"].includes(d.statut) && (
                    <>
                      {/* GRISÉ TANT QUE LE TEST N'EST PAS REVENU, et l'infobulle dit pourquoi :
                          un bouton inerte sans explication passe pour une panne. */}
                      <button
                        disabled={attendTest || occupe}
                        title={attendTest
                          ? "Le test de niveau n'a pas encore été passé par l'agent placement test. C'est son résultat qui détermine la nouvelle classe."
                          : `Réaffecter ${nom} — niveau obtenu : ${d.niveau_obtenu}`}
                        onClick={() => ouvrirReaffectation(d)}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                          background: attendTest ? "#e2e8f0" : accent, color: attendTest ? "#94a3b8" : "#fff",
                          cursor: attendTest ? "not-allowed" : "pointer" }}>
                        {attendTest ? "🔒 " : "✅ "}Changement de groupe
                      </button>
                      <button onClick={() => { setAction({ demande: d, type: "refus" }); setValeur(""); }}
                        style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Refuser
                      </button>
                    </>
                  )}

                  {attendTest && mode === "onboarding" && (
                    <span style={{ fontSize: 11.5, color: "#b45309", alignSelf: "center" }}>
                      ⏳ En attente du test de niveau
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Choix de la nouvelle classe ──────────────────────────────────────── */}
      {reaffectation && (() => {
        const d = reaffectation.demande;
        const nom = [d.prenom_apprenant, d.nom_apprenant].filter(Boolean).join(" ") || "l'apprenant";
        const auNiveau = classes.filter(g => (g.niveau || "").toUpperCase() === (d.niveau_obtenu || "").toUpperCase());
        return (
          <div onClick={ev => { if (ev.target === ev.currentTarget && !occupe) setReaffectation(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%", maxWidth: 540, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
                Réaffecter {nom}
              </div>
              <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 14px" }}>
                Test passé : niveau <strong style={{ color: "#15803d" }}>{d.niveau_obtenu}</strong>
                {d.groupe_nom ? <> · quitte <strong>{d.groupe_nom}</strong></> : null}.
                {" "}Le transfert est immédiat : l'apprenant change de classe et son ancienne inscription
                se referme avec sa date de sortie et le motif.
              </p>

              {classesLoading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Chargement des classes…</div>
              ) : classes.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, background: "#fff7ed", borderRadius: 10, border: "1px dashed #fed7aa", fontSize: 12.5, color: "#9a3412" }}>
                  Aucune autre classe ouverte n'est disponible.
                </div>
              ) : (
                <>
                  {/* Les classes AU BON NIVEAU sont remontées en tête et signalées : c'est le
                      résultat du test qui a motivé toute la demande, il doit guider le choix. */}
                  {auNiveau.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "#15803d", fontWeight: 700, marginBottom: 6 }}>
                      ✓ {auNiveau.length} classe{auNiveau.length > 1 ? "s" : ""} au niveau {d.niveau_obtenu}
                    </div>
                  )}
                  <select value={classeChoisie} onChange={e => setClasseChoisie(e.target.value)}
                    style={{ ...champ, marginBottom: 16 }}>
                    <option value="">— Choisir la nouvelle classe —</option>
                    {classes.map(g => (
                      <option key={g.id} value={g.id}>
                        {(g.niveau || "").toUpperCase() === (d.niveau_obtenu || "").toUpperCase() ? "✓ " : ""}
                        {g.nom}{g.niveau ? ` · ${g.niveau}` : ""}
                        {g.nb_apprenants != null ? ` · ${g.nb_apprenants}/${g.capacite_max || 20}` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                <button onClick={() => setReaffectation(null)} disabled={occupe}
                  style={{ flex: 1, padding: 12, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Annuler
                </button>
                <button onClick={reaffecter} disabled={!classeChoisie || occupe}
                  style={{ flex: 1.5, padding: 12, borderRadius: 9, border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff",
                    background: classeChoisie ? accent : "#cbd5e1",
                    cursor: classeChoisie && !occupe ? "pointer" : "not-allowed" }}>
                  {occupe ? "Transfert…" : "Transférer dans cette classe"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Saisie du niveau, ou du motif de refus ───────────────────────────── */}
      {action && (
        <div onClick={ev => { if (ev.target === ev.currentTarget && !occupe) setAction(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
              {action.type === "test" ? "Niveau obtenu au test" : "Motif du refus"}
            </div>
            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 14px" }}>
              {action.type === "test"
                ? "Ce niveau débloque la réaffectation chez l'onboarding : c'est lui qui désignera la nouvelle classe."
                : "Le coach recevra ce motif. Sans explication, il réémettra la même demande la semaine prochaine."}
            </p>

            {action.type === "test" ? (
              <select value={valeur} onChange={e => setValeur(e.target.value)} style={{ ...champ, marginBottom: 18 }}>
                <option value="">— Choisir le niveau —</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <textarea rows={3} value={valeur} onChange={e => setValeur(e.target.value)}
                placeholder="Pourquoi la demande n'aboutit pas…" style={{ ...champ, marginBottom: 18, resize: "vertical" }} />
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAction(null)} disabled={occupe}
                style={{ flex: 1, padding: 12, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button
                disabled={!valeur.trim() || occupe}
                onClick={() => action.type === "test"
                  ? patch(action.demande, { niveau_obtenu: valeur }, "Niveau enregistré — l'onboarding peut réaffecter ✓")
                  : patch(action.demande, { statut: "refusee", motif_refus: valeur }, "Demande refusée, le coach est prévenu")}
                style={{ flex: 1.4, padding: 12, borderRadius: 9, border: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff",
                  background: valeur.trim() ? (action.type === "test" ? accent : "#b91c1c") : "#cbd5e1",
                  cursor: valeur.trim() && !occupe ? "pointer" : "not-allowed" }}>
                {occupe ? "…" : action.type === "test" ? "Enregistrer" : "Refuser la demande"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
