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

/* TRANSFERT DE CENTRE À CENTRE — troisième liste, parce que la question posée est encore
   différente : ni le niveau ni le canal ne changent, seul le LIEU. « Déménagement » existe
   bien dans la liste du canal, mais il y désigne un départ vers le en ligne ; ici, il désigne
   un changement de quartier. Doit rester identique à MOTIFS_CHANGEMENT_CENTRE côté serveur,
   qui valide. */
const MOTIFS_CENTRE = {
  demenagement:        "Déménagement",
  rapprochement:       "Rapprochement du domicile ou du lieu de travail",
  horaires_centre:     "Horaires de l'autre centre plus adaptés",
  preference_client:   "Préférence de l'apprenant ou de sa famille",
  places_disponibles:  "Pas de classe à son niveau dans ce centre",
  decision_commerciale:"Décision commerciale",
  autre:               "Autre",
};

/* MIGRATION DE CANAL — liste propre, parce que les motifs ci-dessus parlent tous de niveau,
   de rythme ou de groupe, et qu'aucun ne décrit un déménagement. Doit rester identique à
   MOTIFS_MIGRATION_CANAL dans Backend/src/routes/demandesTransfert.js : le serveur valide
   contre sa propre liste, et un libellé absent d'un côté donnerait un motif refusé. */
const MOTIFS_MIGRATION = {
  demenagement:         "Déménagement ou éloignement du centre",
  horaires_centre:      "Horaires du centre incompatibles",
  preference_client:    "Préférence de l'apprenant ou de sa famille",
  contrainte_connexion: "Contrainte de connexion ou d'équipement",
  decision_commerciale: "Décision commerciale",
  autre:                "Autre (précisé en commentaire)",
};

/** Une demande est-elle une migration de canal ? */
const estMigration = (d) => d?.type_demande === "changement_coaching";
/** Un transfert d'un centre à un autre ? */
const estChangementCentre = (d) => d?.type_demande === "changement_centre";
/* Le libellé du motif, dans la bonne liste — il y en a trois désormais, et piocher dans la
   mauvaise rendait `undefined` : les cloches ont déjà annoncé « Motif : undefined » une fois,
   le jour où la migration a été ajoutée sans toucher à cette ligne. */
const libelleMotif = (d) =>
  (estMigration(d) ? MOTIFS_MIGRATION : estChangementCentre(d) ? MOTIFS_CENTRE : MOTIFS)[d?.motif] || d?.motif;
/** Le canal visé : l'opposé de celui d'où l'on part. Même règle que le serveur. */
const canalCibleDe = (src) => (src === "en_ligne" ? "presentiel" : "en_ligne");
const libelleCanal = (c) => (c === "en_ligne" ? "💻 En ligne" : c === "hybride" ? "⚡ Hybride" : "🏢 Présentiel");

const ETATS = {
  en_attente_test:   { l: "En attente du test",  c: "#b45309", bg: "#fef3c7" },
  en_attente_accord: { l: "Attend un accord",    c: "#7A4BC4", bg: "#f2edfb" },
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
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * LE COMPTE VIENT DU SERVEUR (`a_traiter`), ET C'EST LE POINT.
 *
 * Ce hook interrogeait `?statut=test_fait` et comptait les lignes. C'était juste tant qu'il
 * n'existait que deux circuits. Le transfert DE CENTRE À CENTRE, lui, n'attend pas un test :
 * il attend l'accord du centre d'accueil, et reste donc en `en_attente_accord` — un statut que
 * ce filtre ne voyait pas. Résultat constaté le 07/10/2026 : l'assistante recevait le dossier,
 * le dossier s'affichait dans sa file, et l'onglet ne portait AUCUN badge.
 *
 * Élargir le filtre à deux statuts n'aurait pas suffi : `en_attente_accord` est visible des
 * DEUX côtés — celle qui émet suit l'avancement, celle qui reçoit doit accepter. Compter les
 * deux aurait badgé l'émettrice pour un travail qui n'est pas le sien, et le badge aurait
 * cessé de vouloir dire « à vous de jouer ».
 *
 * Les règles d'autorité vivent toutes sur le serveur (`je_peux_executer_vers`, `mon_centre`,
 * le rôle). C'est donc LUI qui marque chaque demande d'un `a_traiter_par_moi` et en rend le
 * total. Les recopier ici en aurait fait une seconde version à tenir à jour en double — la
 * façon la plus sûre de voir le badge et la liste se contredire au prochain circuit ajouté.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * `mode` n'est plus utilisé pour filtrer : le serveur connaît le rôle de l'appelant et sait
 * donc déjà ce qui l'attend. Il est conservé pour ne pas casser les appels existants.
 */
export function useCompteDemandesTransfert(authHdrs, mode = "onboarding") {   // eslint-disable-line no-unused-vars
  const [compte, setCompte] = useState(0);

  const relire = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, { headers: authHdrs() });
      if (!r.ok) return;
      const d = await r.json();
      /* Repli sur le comptage local si le serveur n'est pas encore à jour : sans lui, le badge
         tomberait à zéro entre le déploiement du dash et celui de l'API. */
      setCompte(
        typeof d.a_traiter === "number"
          ? d.a_traiter
          : (d.demandes || []).filter(x => x.statut === "test_fait").length,
      );
    } catch { /* un badge absent ne doit jamais casser l'écran qui le porte */ }
  }, [authHdrs]);

  useEffect(() => {
    relire();
    // Le dossier avance dans un AUTRE tableau de bord : sans relecture, l'onboarding ne
    // verrait le niveau arriver qu'en rechargeant sa page.
    const t = setInterval(relire, 60000);
    return () => clearInterval(t);
  }, [relire]);

  /* LE BADGE DOIT DISPARAÎTRE DÈS QUE LE DOSSIER EST TRAITÉ, pas à la minute suivante.
     Accepter un transfert se fait dans la file, qui émet alors cet événement ; sans lui, le
     compteur gardait son chiffre jusqu'au prochain battement de la minuterie — l'assistante
     voyait « 1 » sur un onglet qu'elle venait de vider. */
  useEffect(() => {
    const surMaj = () => relire();
    window.addEventListener("bet:demandes-transfert-maj", surMaj);
    return () => window.removeEventListener("bet:demandes-transfert-maj", surMaj);
  }, [relire]);

  return compte;
}

/** Prévenir les badges qu'un dossier vient de changer d'état. Appelé par la file. */
export const signalerMajDemandes = () => {
  try { window.dispatchEvent(new Event("bet:demandes-transfert-maj")); } catch { /* SSR */ }
};

/* ══════════════════════════════════════════════════════════════
   LE BOUTON DU COACH
══════════════════════════════════════════════════════════════ */
/**
 * Demander le transfert d'un apprenant vers une autre classe.
 *
 * PAS SEULEMENT LE COACH, et c'est le point. Le coach voit l'apprenant en séance, mais il
 * n'est pas le seul à qui l'on dit qu'une classe ne convient plus : l'apprenant passe au
 * centre et le dit à l'assistante présentiel, ou il appelle son assistante en ligne. Tant que
 * ce bouton n'existait que chez le coach, ces deux-là n'avaient qu'un message informel à
 * envoyer à l'onboarding - hors circuit, sans trace, sans test de niveau déclenché.
 *
 * LE CIRCUIT NE CHANGE PAS pour autant : la demande part au placement test, le niveau revient,
 * et c'est l'onboarding (en ligne) ou l'assistante du centre (présentiel) qui affecte la
 * nouvelle classe. Celui qui demande n'exécute jamais - d'où la phrase du modal, qui doit
 * rester vraie quel que soit le métier qui l'ouvre.
 *
 * @param {string} demandeur  "coach" | "commerciale" | "onboarding" — n'ajuste QUE le texte,
 *                            jamais les droits : ceux-là sont vérifiés par le serveur.
 */
export function BoutonDemandeTransfert({
  gaId, nomApprenant, accent = "#b45309", authHdrs, onEmise, demandeur = "coach", styleBouton,
  centreActuel = null, affecteElleMeme = false,
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [detail, setDetail] = useState("");
  const [envoi, setEnvoi] = useState(false);

  /* ── DEUX TRANSFERTS SOUS UN SEUL BOUTON ──
     L'assistante présentiel fait face à deux demandes différentes, et un seul bouton ne
     pouvait en exprimer qu'une : « cette classe ne lui convient plus » (question de NIVEAU,
     tranchée par un test) et « il déménage à Yopougon » (question de LIEU, qui n'appelle
     aucun test). Elle n'avait jusqu'ici que la première, et devait faire passer la seconde
     pour l'une d'elles - ou l'envoyer hors circuit.
     Le choix ne s'affiche QUE pour elle : le coach ne gère pas les centres, et l'onboarding
     s'occupe du en ligne, où la question ne se pose pas. */
  const avecChoixCentre = demandeur === "commerciale" && !!centreActuel;
  const [typeDemande, setTypeDemande] = useState("changement_groupe");
  const [centres, setCentres] = useState([]);
  const [centreCible, setCentreCible] = useState("");
  const estCentre = typeDemande === "changement_centre";
  const motifsAffiches = estCentre ? MOTIFS_CENTRE : MOTIFS;

  /* Les centres sont chargés à l'ouverture, et le centre ACTUEL en est retiré : se transférer
     là où l'on est déjà n'a pas de sens, et le proposer invite à l'erreur. */
  useEffect(() => {
    if (!ouvert || !avecChoixCentre || centres.length) return;
    fetch(`${API_URL}/api/parcours/centres`)
      .then(r => r.ok ? r.json() : { centres: [] })
      .then(d => setCentres((d.centres || []).filter(c => String(c.id) !== String(centreActuel))))
      .catch(() => {});
  }, [ouvert, avecChoixCentre, centreActuel, centres.length]);

  // Changer de type invalide le motif : les deux listes n'ont presque aucun code en commun,
  // et un motif resté de l'autre liste serait refusé par le serveur sans que l'écran le dise.
  useEffect(() => { setMotif(""); }, [typeDemande]);

  const envoyer = async () => {
    if (!motif) return;
    if (estCentre && !centreCible) return;
    setEnvoi(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({
          ga_id: gaId, motif, detail: detail.trim() || null,
          ...(estCentre ? { type_demande: "changement_centre", centre_cible_id: centreCible } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Demande impossible");
      toast.success(estCentre
        ? `Demande transmise à ${centres.find(c => String(c.id) === String(centreCible))?.nom || "l'autre centre"} ✓`
        : affecteElleMeme
          ? "Demande ouverte — le placement test est prévenu ✓"
          : "Demande transmise à l'onboarding et au placement test ✓");
      setOuvert(false); setMotif(""); setDetail(""); setCentreCible(""); setTypeDemande("changement_groupe");
      onEmise?.(d.demande);
    } catch (e) {
      toast.error(e.message || "Demande impossible");
    } finally { setEnvoi(false); }
  };

  return (
    <>
      {/* `styleBouton` permet à l'écran hôte d'imposer l'apparence : ce bouton vit tantôt dans
          le corps d'une fiche sur fond clair, tantôt dans un bandeau sombre à côté
          d'« Export PDF ». Le style par défaut couvre le premier cas. */}
      <button type="button" onClick={() => setOuvert(true)}
        style={styleBouton || { padding: "8px 16px", background: "#fff", border: `1.5px solid ${accent}55`,
          borderRadius: 8, color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        🔄 Demande de transfert
      </button>

      {ouvert && (
        <div onClick={e => { if (e.target === e.currentTarget && !envoi) setOuvert(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {/* Un peu plus large qu'avant : le modal porte désormais deux cartes de choix côte à
              côte, et la seconde — « Changer de centre · Même niveau, sans test de niveau » —
              coupait ses mots à 480 px. `maxHeight` + défilement parce que la hauteur, elle,
              dépend du choix fait : le transfert de centre ajoute un sélecteur. */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%",
            maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              {estCentre ? `Transférer ${nomApprenant} vers un autre centre` : `Demander le transfert de ${nomApprenant}`}
            </div>
            {/* DIRE CE QUI VA SE PASSER, ET À QUI. Celui qui demande n'exécute pas le
                changement : il ouvre un dossier que d'autres font avancer. Sans cette phrase,
                il attend un déplacement immédiat et croit à une panne quand rien ne bouge.
                Le texte suit le métier : annoncer à l'onboarding que sa demande « part à
                l'équipe onboarding » lui ferait attendre une réponse d'elle-même. */}
            {/* LE TYPE D'ABORD : il commande la liste de motifs, le circuit et le destinataire.
                Deux cartes plutôt qu'une liste déroulante — ce ne sont pas deux variantes d'une
                même chose mais deux gestes distincts, et la différence qui compte (test de
                niveau ou non) doit se lire sans ouvrir quoi que ce soit. */}
            {avecChoixCentre && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, margin: "0 0 16px" }}>
                {[
                  { k: "changement_groupe", t: "Changer de classe", s: "Dans ce centre · test de niveau requis" },
                  { k: "changement_centre", t: "Changer de centre",  s: "Même niveau · sans test de niveau" },
                ].map(o => {
                  const sel = typeDemande === o.k;
                  return (
                    <button key={o.k} type="button" onClick={() => setTypeDemande(o.k)}
                      style={{ textAlign: "left", padding: "11px 13px", borderRadius: 11, cursor: "pointer",
                        fontFamily: "inherit", background: sel ? "#faf5ff" : "#fff",
                        border: `2px solid ${sel ? "#7c3aed" : "#e5e7eb"}`,
                        boxShadow: sel ? "0 0 0 3px #ddd6fe" : "none" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: sel ? "#5b21b6" : "#0f172a" }}>{o.t}</div>
                      <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 3, lineHeight: 1.4 }}>{o.s}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 16px" }}>
              {/* CE QUI DÉCIDE DU TEXTE N'EST PAS LE MÉTIER, MAIS QUI AFFECTERA LA CLASSE.
                  On disait « commerciale → vous n'avez pas à affecter la classe vous-même » ;
                  c'est faux pour l'assistante PRÉSENTIEL, qui est son propre onboarding et
                  affecte bel et bien la classe de ses apprenants. Elle lisait donc qu'on allait
                  le faire à sa place, et attendait une suite qui ne venait jamais.
                  `affecteElleMeme` porte la vraie distinction : présentiel et onboarding
                  affectent, le coach et l'assistante en ligne attendent qu'on le fasse. */}
              {estCentre ? (
                <>Votre demande part à l'<strong>assistante du centre d'arrivée</strong> : c'est elle
                qui accepte et qui lui trouvera une classe. <strong>Aucun test de niveau</strong> —
                l'apprenant garde son niveau, son historique et ses paiements, seul le lieu change.</>
              ) : affecteElleMeme ? (
                <>Le dossier part à l'<strong>agent placement test</strong>. Le test de niveau sera
                passé d'abord ; c'est son résultat qui déterminera la nouvelle classe, que{" "}
                <strong>vous affecterez</strong> ensuite depuis « Dossiers à réaffecter ».</>
              ) : (
                <>Votre demande part à l'<strong>équipe onboarding</strong> et à l'<strong>agent placement
                test</strong>. Le test de niveau sera passé d'abord ; c'est son résultat qui déterminera
                la nouvelle classe. Vous n'avez pas à l'affecter vous-même — vous serez prévenu
                à chaque étape.</>
              )}
            </p>

            {/* LE CENTRE AVANT LE MOTIF : c'est la destination qui donne son sens au motif.
                Le centre actuel est absent de la liste — s'y transférer n'aurait aucun sens. */}
            {estCentre && (
              <>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
                  Centre d'arrivée <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <select value={centreCible} onChange={e => setCentreCible(e.target.value)} style={{ ...champ, marginBottom: 12 }}>
                  <option value="">— Choisir un centre —</option>
                  {centres.map(c => (
                    <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` — ${c.ville}` : ""}</option>
                  ))}
                </select>
                {centres.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "#b45309", margin: "-6px 0 12px" }}>
                    Aucun autre centre disponible.
                  </div>
                )}
              </>
            )}

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Motif <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select value={motif} onChange={e => setMotif(e.target.value)} style={{ ...champ, marginBottom: 12 }}>
              <option value="">— Choisir un motif —</option>
              {Object.entries(motifsAffiches).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Précisions <span style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</span>
            </label>
            {/* Le coach observe en séance ; l'assistante, elle, recueille au comptoir ou au
                téléphone. Lui demander ce qu'elle a « observé en classe » la laisse sans
                réponse à donner, et le champ reste vide. */}
            <textarea rows={3} value={detail} onChange={e => setDetail(e.target.value)}
              /* LE TEXTE NOMME CEUX QUI LIRONT RÉELLEMENT. Sur un transfert de centre, il
                 annonçait le placement test - qui n'intervient jamais dans ce circuit, puisqu'il
                 n'y a pas de test de niveau. L'émettrice croyait donc déclencher une étape qui
                 n'existe pas, et celle qui reçoit se demandait ce qu'elle attendait. */
              placeholder={estCentre
                ? "Ce que l'apprenant vous a dit — c'est ce que lira l'assistante du centre d'accueil."
                : demandeur === "coach"
                  ? "Ce que vous avez observé en classe — c'est ce que liront l'onboarding et le placement test."
                  : "Ce que l'apprenant vous a dit — c'est ce que liront le placement test et celui qui affectera la classe."}
              style={{ ...champ, marginBottom: 18, resize: "vertical" }} />

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setOuvert(false)} disabled={envoi}
                style={{ flex: 1, padding: 12, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button type="button" onClick={envoyer} disabled={!motif || envoi || (estCentre && !centreCible)}
                style={{ flex: 1.4, padding: 12, borderRadius: 9, border: "none", fontFamily: "inherit",
                  background: (motif && !(estCentre && !centreCible)) ? accent : "#cbd5e1", color: "#fff", fontWeight: 700, fontSize: 13,
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
   LA MIGRATION DE CANAL — en ligne ↔ présentiel
══════════════════════════════════════════════════════════════ */
/**
 * Le bouton qui ouvre une migration de canal, sur la fiche d'un apprenant.
 *
 * DISTINCT DU TRANSFERT DU COACH, et volontairement. Le coach signale qu'un apprenant n'est
 * pas à sa place — une question de niveau, qui appelle un test. Ici, l'apprenant est au bon
 * niveau : c'est l'ENDROIT où il suit ses cours qui change. Deux gestes différents, deux
 * boutons différents, deux listes de motifs.
 *
 * L'ÉMETTRICE N'EXÉCUTE PAS. Elle ouvre un dossier que l'autre équipe accepte — celle qui
 * gère le canal d'arrivée. La phrase du modal le dit, sans quoi elle attendrait un
 * déplacement immédiat et croirait à une panne quand rien ne bouge.
 *
 * @param {string} canalActuel  le canal d'où part l'apprenant, pour nommer la destination.
 */
/* `styleBouton` permet à l'écran hôte d'imposer l'apparence : ce bouton vit tantôt dans le
   corps d'une fiche sur fond clair, tantôt dans un bandeau sombre à côté d'« Export PDF ».
   Le style par défaut couvre le premier cas. */
export function BoutonMigrationCanal({ gaId, nomApprenant, canalActuel, accent = "#7A4BC4", authHdrs, onEmise, styleBouton }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [detail, setDetail] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const cible = canalCibleDe(canalActuel);
  const versPresentiel = cible === "presentiel";

  /* ── VERS LE PRÉSENTIEL, IL FAUT DIRE QUEL CENTRE ──
     Une migration part d'une classe EN LIGNE, qui n'a pas de centre. Sans destination, elle
     s'adressait donc à « l'équipe présentiel » en bloc : les onze assistantes des six centres
     la voyaient, dont dix que le dossier ne concerne pas. En nommant le centre d'accueil, elle
     est routée comme un transfert de centre - à celles qui vont réellement recevoir
     l'apprenant, et qui seules peuvent l'accepter.
     Dans l'autre sens, rien à demander : c'est l'onboarding qui place en ligne. */
  const [centres, setCentres] = useState([]);
  const [centreCible, setCentreCible] = useState("");
  useEffect(() => {
    if (!ouvert || !versPresentiel || centres.length) return;
    fetch(`${API_URL}/api/parcours/centres`)
      .then(r => r.ok ? r.json() : { centres: [] })
      .then(d => setCentres(d.centres || []))
      .catch(() => {});
  }, [ouvert, versPresentiel, centres.length]);

  const envoyer = async () => {
    if (!motif) return;
    if (versPresentiel && !centreCible) return;
    setEnvoi(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({ ga_id: gaId, motif, detail: detail.trim() || null,
          type_demande: "changement_coaching",
          ...(versPresentiel && centreCible ? { centre_cible_id: centreCible } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Demande impossible");
      toast.success(versPresentiel
        ? `Migration transmise à ${centres.find(c => String(c.id) === String(centreCible))?.nom || "l'équipe du centre"} ✓`
        : "Migration transmise à l'équipe onboarding ✓");
      setOuvert(false); setMotif(""); setDetail(""); setCentreCible("");
      onEmise?.(d.demande);
    } catch (e) {
      toast.error(e.message || "Demande impossible");
    } finally { setEnvoi(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
        title={`Faire passer ${nomApprenant} ${versPresentiel ? "au présentiel" : "en ligne"} — sans test de niveau`}
        style={styleBouton || { padding: "8px 16px", background: "#fff", border: `1.5px solid ${accent}55`, borderRadius: 8,
          color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        🔀 Migrer {versPresentiel ? "vers le présentiel" : "vers le en ligne"}
      </button>

      {ouvert && (
        <div onClick={e => { if (e.target === e.currentTarget && !envoi) setOuvert(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {/* Même largeur que le modal de demande de transfert : ces deux fenêtres s'ouvrent
              depuis des boutons voisins, sur la même fiche, et deux tailles différentes pour
              un geste de même nature se lisent comme une inattention. */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "100%",
            maxWidth: 560, maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
              Migrer {nomApprenant} {versPresentiel ? "vers le présentiel" : "vers le en ligne"}
            </div>
            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 14px" }}>
              {libelleCanal(canalActuel)} → <strong style={{ color: accent }}>{libelleCanal(cible)}</strong>.
              {" "}<strong>Aucun test de niveau</strong> : l'apprenant garde son niveau, son historique,
              ses séances et ses ressources. Seules sa classe et son canal changent.
            </p>
            <p style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.6, margin: "0 0 16px" }}>
              La demande part à l'<strong>équipe {versPresentiel ? "du centre d'accueil" : "onboarding"}</strong>,
              qui choisira la classe d'arrivée{versPresentiel ? "" : " — l'affectation en ligne lui revient toujours"}.
              Le tarif pourra être ajusté au même moment.
            </p>

            {/* LE CENTRE AVANT LE MOTIF : c'est la destination qui donne son sens au geste, et
                c'est elle qui décide à qui la demande sera adressée. Demandé seulement vers le
                présentiel — en ligne, c'est l'onboarding qui place l'apprenant, il n'y a pas de
                centre à choisir. */}
            {versPresentiel && (
              <>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
                  Centre d'accueil <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <select value={centreCible} onChange={e => setCentreCible(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", marginBottom: 6, boxSizing: "border-box" }}>
                  <option value="">— Choisir un centre —</option>
                  {centres.map(c => (
                    <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` — ${c.ville}` : ""}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
                  Seules les assistantes de ce centre verront la demande et pourront l'accepter.
                </div>
              </>
            )}

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Motif <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select value={motif} onChange={e => setMotif(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}>
              <option value="">— Choisir —</option>
              {Object.entries(MOTIFS_MIGRATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
              Précision <span style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</span>
            </label>
            <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
              placeholder="Ce que l'équipe d'accueil doit savoir…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setOuvert(false)} disabled={envoi}
                style={{ padding: "9px 18px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              {/* Un centre non choisi bloque au même titre qu'un motif manquant : vers le
                  présentiel, le serveur refuse la demande sans destination. */}
              <button onClick={envoyer} disabled={!motif || envoi || (versPresentiel && !centreCible)}
                style={{ padding: "9px 20px", background: (!motif || envoi || (versPresentiel && !centreCible)) ? "#cbd5e1" : accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: (!motif || envoi || (versPresentiel && !centreCible)) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {envoi ? "Envoi…" : "Transmettre la migration"}
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
/**
 * @param {Function} onReaffecter  le tableau de bord hôte EXÉCUTE la réaffectation - ce
 *   composant ne la fait plus lui-même. Il avait son propre sélecteur de classe, bien plus
 *   pauvre : pas de recherche, pas de création à la volée, pas de choix des jours. L'imposer
 *   pour une migration privait l'assistante de l'écran qu'elle connaît, alors que le geste est
 *   le même. Sans `onReaffecter`, aucun bouton d'action n'est proposé : il n'y aurait rien à
 *   ouvrir, et un bouton inerte vaut moins qu'un bouton absent.
 *   L'onboarding a déjà son écran de transfert - filtre de niveau, recherche de classes
 *   compatibles, création de groupe à la volée, choix des jours. Lui imposer le sélecteur
 *   minimal de ce composant aurait été un recul : deux écrans pour le même geste, et le moins
 *   capable des deux au moment où le choix compte. Il reçoit donc la demande et ouvre le sien.
 *   Sans cette fonction, le composant retombe sur son propre modal - c'est le cas de la
 *   commerciale, qui n'a pas cet écran.
 */
export default function FileDemandesTransfert({ accent = "#b45309", authHdrs, mode = "onboarding", onReaffecter, refreshKey = 0 }) {
  const [demandes, setDemandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [nonInstalle, setNonInstalle] = useState(false);
  /* LE SERVEUR DIT QUI PEUT AGIR, pas le rôle deviné côté écran. Une assistante EN LIGNE a
     bien le rôle « commercial » mais ne réaffecte pas : c'est l'onboarding qui s'en charge
     pour les classes en ligne. Elle garde la file en lecture - voir n'est pas décider. */
  const [peutReaffecter, setPeutReaffecter] = useState(false);
  const [filtre, setFiltre] = useState("ouvertes");
  const [action, setAction] = useState(null);     // { demande, type: "test" | "refus" }
  const [valeur, setValeur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [verifie, setVerifie] = useState(null);   // dossier dont on interroge le résultat
  /* Réaffectation : le dossier en cours de traitement et la classe choisie.
     LE BOUTON NE DOIT PAS SE CONTENTER DE CLORE LE DOSSIER. Il le faisait : le dossier passait
     à « Réaffecté » sans que personne ne bouge, et il quittait la file en laissant l'apprenant
     dans sa classe d'origine - une disparition silencieuse, pire que l'absence de bouton. */
  const [canauxExecutables, setCanauxExecutables] = useState({});
  /* Mon centre, et si je suis l'onboarding. Pour un TRANSFERT DE CENTRE, l'autorité ne dépend
     ni du rôle ni du canal mais du centre d'ACCUEIL : seule l'assistante qui reçoit accepte.
     L'écran n'avait que les canaux, et n'affichait donc aucun bouton sur ces dossiers - pas
     même à celle qui devait trancher. */
  const [monCentre, setMonCentre] = useState(null);
  const [jeSuisOnboarding, setJeSuisOnboarding] = useState(false);
  const [detailDemande, setDetailDemande] = useState(null);   // { demande }
  const [parcours, setParcours] = useState(null);             // null = en cours de chargement
  /** Cette personne peut-elle ACCEPTER cette migration ? La question porte sur le canal
      d'arrivée, jamais sur celui de départ. */
  const peutExecuterMigration = (d) => !!canauxExecutables[canalCibleDe(d?.type_cours)];
  /** Et pour un transfert de centre : seule l'assistante du centre d'ACCUEIL peut accepter.
      L'onboarding garde la main, pour arbitrer quand un centre ne répond pas. */
  const peutExecuterCentre = (d) =>
    jeSuisOnboarding || (!!monCentre && String(d?.centre_cible_id || "") === String(monCentre));

  /* LE DÉTAIL AVANT LA DÉCISION. Accepter une migration, c'est engager une classe, un centre
     et un tarif : la carte ne porte que le strict nécessaire pour trier la file. On va donc
     chercher le PARCOURS de l'apprenant - où il est passé, depuis quand - qui est ce qu'on
     veut vraiment savoir avant de l'accueillir. La route existe déjà et sert les mêmes
     données au coach et à la commerciale. */
  const ouvrirDetail = async (d) => {
    setDetailDemande({ demande: d });
    setParcours(null);
    if (!d.ga_id) { setParcours([]); return; }
    try {
      const r = await fetch(`${API_URL}/api/groupes/apprenants/${d.ga_id}/historique`, { headers: authHdrs() });
      const j = await r.json();
      setParcours(Array.isArray(j) ? j : (j.historique || j.lignes || []));
    } catch {
      setParcours([]);   // un parcours illisible ne doit pas empêcher de lire le reste
    }
  };

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert`, { headers: authHdrs() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lecture impossible");
      setDemandes(d.demandes || []);
      setNonInstalle(!!d.non_installe);
      setPeutReaffecter(!!d.je_peux_reaffecter);
      /* L'autorité par canal d'ARRIVÉE, que le serveur seul connaît : une assistante peut
         réaffecter « en général » sans pouvoir accepter une arrivée en ligne. */
      setCanauxExecutables(d.je_peux_executer_vers || {});
      setMonCentre(d.mon_centre || null);
      setJeSuisOnboarding(!!d.je_suis_onboarding);

      /* PRÉVENIR LE BADGE DE L'ONGLET. `charger()` est le seul point par lequel cette file se
         relit — après une acceptation, un refus, une réaffectation ou l'arrivée d'un niveau.
         Signaler ICI couvre donc toutes les actions d'un coup, sans risquer d'en oublier une
         en ajoutant un bouton plus tard. Sans ce signal, le compteur gardait son chiffre
         jusqu'au battement de minuterie suivant : l'assistante lisait « 1 » sur un onglet
         qu'elle venait de vider. */
      signalerMajDemandes();
    } catch (e) {
      toast.error(e.message || "Chargement impossible");
    } finally { setChargement(false); }
  }, [authHdrs]);

  // `refreshKey` : l'hôte a fait le transfert dans SON écran, il incrémente ce compteur
  // pour que la file se relise. Sans cela le dossier traité resterait affiché jusqu'au
  // rafraîchissement automatique, et on croirait le transfert manqué.
  useEffect(() => { charger(); }, [charger, refreshKey]);

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


  const visibles = demandes.filter(d =>
    filtre === "toutes" ? true
    : filtre === "ouvertes" ? ["en_attente_test", "test_fait", "en_attente_accord"].includes(d.statut)
    : d.statut === filtre);

  const compte = (f) => f === "toutes" ? demandes.length
    : f === "ouvertes" ? demandes.filter(d => ["en_attente_test", "test_fait", "en_attente_accord"].includes(d.statut)).length
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
                  {/* UNE MIGRATION SE LIT D'UN COUP D'ŒIL. Sans ce badge, elle se confond
                      avec un changement de groupe ordinaire dans la même file - alors qu'elle
                      ne suit pas le même circuit et n'appelle pas le même geste. */}
                  {estMigration(d) && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: "#f2edfb", color: "#7A4BC4", border: "1px solid #ddd0f5" }}>
                      🔀 {libelleCanal(d.type_cours)} → {libelleCanal(canalCibleDe(d.type_cours))}
                    </span>
                  )}
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
                  <div><span style={{ color: "#94a3b8" }}>Motif : </span><strong>{libelleMotif(d)}</strong></div>
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
                  {/* Sur TOUTES les cartes, pas seulement les migrations : la question « qui
                      est cette personne et d'où vient-elle » se pose aussi avant un simple
                      changement de groupe. */}
                  <button onClick={() => ouvrirDetail(d)}
                    style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    👁 Détails
                  </button>
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

                  {/* UNE MIGRATION EN ATTENTE D'ACCORD. Elle ne passe pas par le test : le
                      bouton n'est donc jamais grisé pour cette raison. En revanche, seul celui
                      qui a autorité sur le canal d'ARRIVÉE peut l'accepter - côté en ligne,
                      l'onboarding et lui seul. Le serveur tranche ; ici on évite de proposer
                      un geste qu'il refuserait. */}
                  {mode === "onboarding" && onReaffecter && estMigration(d) && d.statut === "en_attente_accord" && (
                    <>
                      {peutExecuterMigration(d) ? (
                        <button disabled={occupe}
                          title={`Accepter la migration de ${nom} vers ${libelleCanal(canalCibleDe(d.type_cours))} et choisir sa classe d'arrivée`}
                          /* LE MÊME ÉCRAN QUE POUR UN TRANSFERT ORDINAIRE. J'avais d'abord
                             imposé la modale de ce composant pour ne pas perdre le champ tarif ;
                             c'était le mauvais arbitrage. L'écran de l'onboarding sait chercher
                             une classe, en créer une, choisir les jours - tout ce qu'une
                             migration demande aussi. Le tarif y a été ajouté plutôt que de
                             priver l'assistante de son outil habituel. */
                          onClick={() => onReaffecter?.(d)}
                          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: "#7A4BC4", color: "#fff", cursor: "pointer" }}>
                          ✅ Accepter la migration
                        </button>
                      ) : (
                        <span title={`L'affectation à une classe ${libelleCanal(canalCibleDe(d.type_cours)).replace(/^\S+\s/, "")} ne vous revient pas — vous suivez ce dossier.`}
                          style={{ padding: "7px 14px", borderRadius: 8, background: "#f1f5f9", color: "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "not-allowed" }}>
                          👁 Suivi — l'autre équipe accepte
                        </span>
                      )}
                      {/* REFUSER EST UNE DÉCISION, PAS UN SUIVI. Le bouton s'affichait à tout le
                          monde, y compris à celle qui lit juste au-dessus qu'elle ne fait que
                          suivre : elle pouvait donc clore un dossier qu'elle n'a pas qualité
                          pour trancher. Il suit désormais la même règle que l'acceptation. */}
                      {peutExecuterMigration(d) && (
                        <button onClick={() => { setAction({ demande: d, type: "refus" }); setValeur(""); }}
                          style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Refuser
                        </button>
                      )}
                    </>
                  )}

                  {/* ── TRANSFERT DE CENTRE À CENTRE ──
                      Troisième cas, et il ne tombait dans aucune des deux branches ci-dessus :
                      son statut est `en_attente_accord` comme une migration, mais ce n'en est
                      pas une, et la branche du changement de classe exige `test_fait`. Résultat
                      constaté le 06/10/2026 : l'assistante du centre d'accueil recevait bien la
                      notification, voyait bien le dossier, et n'avait que « Détails » - aucun
                      moyen d'accepter ce qu'on lui demandait d'accepter.
                      L'AUTORITÉ EST CELLE DU CENTRE D'ACCUEIL, pas du canal : celle du centre de
                      départ suit son dossier sans trancher. Le serveur applique la même règle ;
                      ici on évite de proposer un geste qu'il refuserait. */}
                  {mode === "onboarding" && onReaffecter && estChangementCentre(d) && d.statut === "en_attente_accord" && (
                    <>
                      {peutExecuterCentre(d) ? (
                        <button disabled={occupe}
                          title={`Accepter le transfert de ${nom} dans votre centre et choisir sa classe d'arrivée`}
                          onClick={() => onReaffecter?.(d)}
                          style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: "#0369a1", color: "#fff", cursor: "pointer" }}>
                          ✅ Accepter le transfert
                        </button>
                      ) : (
                        <span title="Ce transfert revient à l'assistante du centre d'accueil — vous suivez le dossier."
                          style={{ padding: "7px 14px", borderRadius: 8, background: "#f1f5f9", color: "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "not-allowed" }}>
                          👁 Suivi — le centre d'accueil accepte
                        </span>
                      )}
                      {/* Refuser suit la même règle que l'acceptation : seul le centre d'accueil
                          tranche. Sans cette symétrie, le centre de départ pourrait refuser sa
                          propre demande. */}
                      {peutExecuterCentre(d) && (
                        <button onClick={() => { setAction({ demande: d, type: "refus" }); setValeur(""); }}
                          style={{ padding: "7px 14px", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Refuser
                        </button>
                      )}
                    </>
                  )}

                  {mode === "onboarding" && onReaffecter && !estMigration(d) && !estChangementCentre(d) && peutReaffecter && ["en_attente_test", "test_fait"].includes(d.statut) && (
                    <>
                      {/* GRISÉ TANT QUE LE TEST N'EST PAS REVENU, et l'infobulle dit pourquoi :
                          un bouton inerte sans explication passe pour une panne. */}
                      <button
                        disabled={attendTest || occupe}
                        title={attendTest
                          ? "Le test de niveau n'a pas encore été passé par l'agent placement test. C'est son résultat qui détermine la nouvelle classe."
                          : `Réaffecter ${nom} — niveau obtenu : ${d.niveau_obtenu}`}
                        onClick={() => onReaffecter?.(d)}
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

                  {attendTest && mode === "onboarding" && peutReaffecter && (
                    <span style={{ fontSize: 11.5, color: "#b45309", alignSelf: "center" }}>
                      ⏳ En attente du test de niveau
                    </span>
                  )}

                  {/* DIRE POURQUOI IL N'Y A PAS DE BOUTON. Une carte sans action ressemble à une
                      panne ; elle est ici une règle de métier - les classes en ligne sont
                      réaffectées par l'onboarding, l'assistante en ligne suit le dossier. */}
                  {/* `!estMigration` : une migration affiche DÉJÀ « Suivi — l'autre équipe
                      accepte », et les deux messages se superposaient sur la même carte. */}
                  {mode === "onboarding" && !estMigration(d) && !peutReaffecter && ["en_attente_test", "test_fait"].includes(d.statut) && (
                    <span style={{ fontSize: 11.5, color: "#64748b", alignSelf: "center" }}>
                      👁 Suivi seul — la réaffectation est faite par l'équipe onboarding
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Le détail d'un dossier, avant de décider ─────────────────────────── */}
      {detailDemande && (() => {
        const d = detailDemande.demande;
        const nom = [d.prenom_apprenant, d.nom_apprenant].filter(Boolean).join(" ") || "Apprenant";
        const e = ETATS[d.statut] || ETATS.en_attente_test;
        const Ligne = ({ l, v }) => (
          <div style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span style={{ color: "#94a3b8", fontSize: 12.5, minWidth: 128, flexShrink: 0 }}>{l}</span>
            <span style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 600 }}>{v || "-"}</span>
          </div>
        );
        return (
          <div onClick={ev => { if (ev.target === ev.currentTarget) setDetailDemande(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

              <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a" }}>{nom}</span>
                <span style={{ background: e.bg, color: e.c, borderRadius: 99, padding: "2px 10px", fontSize: 10.5, fontWeight: 800 }}>{e.l}</span>
                {estMigration(d) && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: "#f2edfb", color: "#7A4BC4", border: "1px solid #ddd0f5" }}>
                    🔀 {libelleCanal(d.type_cours)} → {libelleCanal(canalCibleDe(d.type_cours))}
                  </span>
                )}
                <button onClick={() => setDetailDemande(null)}
                  style={{ marginLeft: "auto", background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 15 }}>✕</button>
              </div>

              <div style={{ padding: "16px 24px", overflowY: "auto" }}>
                <Ligne l="E-mail"        v={d.email_apprenant} />
                <Ligne l="Classe        " v={d.groupe_nom} />
                <Ligne l="Coach"         v={d.coach_nom} />
                {/* « Non évalué » PLUTÔT QU'UN TIRET. Depuis le 07/10/2026, ce champ ne
                    recopie plus le niveau de la CLASSE quand l'apprenant n'a pas le sien : il
                    peut donc être vide, et un simple « - » se lit comme un oubli d'affichage.
                    Dire que le niveau n'est pas connu est ce qui permet à l'assistante de
                    réclamer le test avant d'affecter une classe. */}
                <Ligne l="Niveau actuel" v={d.niveau_actuel || "Non évalué"} />
                {d.niveau_obtenu && <Ligne l="Niveau du test" v={d.niveau_obtenu} />}
                <Ligne l="Motif"         v={libelleMotif(d)} />
                <Ligne l="Demandée le"   v={fmt(d.created_at)} />

                {d.detail && (
                  <div style={{ background: "#f8fafc", borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: "10px 13px", fontSize: 12.5, color: "#475569", lineHeight: 1.6, margin: "12px 0" }}>
                    « {d.detail} »
                  </div>
                )}

                {/* LE PARCOURS — ce qu'on veut vraiment savoir avant d'accueillir quelqu'un :
                    d'où il vient, depuis quand, et s'il a déjà changé de classe. */}
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#475569", margin: "18px 0 8px" }}>
                  Son parcours
                </div>
                {parcours === null ? (
                  <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "10px 0" }}>Chargement…</div>
                ) : parcours.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "10px 0" }}>
                    Aucune autre classe connue — c'est sa première.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {parcours.map((h, i) => (
                      <div key={h.id || i} style={{ padding: "8px 11px", background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 12.5, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>{h.groupe_nom || "Classe"}</span>
                          {h.niveau && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#e0e7ff", color: "#3730a3" }}>{h.niveau}</span>}
                          {h.statut === "transfere" && <span style={{ fontSize: 10.5, color: "#94a3b8" }}>transféré</span>}
                          <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 11.5, whiteSpace: "nowrap" }}>
                            {fmt(h.date_ajout)}{h.date_retrait ? ` → ${fmt(h.date_retrait)}` : " → en cours"}
                          </span>
                        </div>
                        {(h.coach_nom || h.centre_nom) && (
                          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3 }}>
                            {[h.coach_nom && `Coach : ${h.coach_nom}`, h.centre_nom && `📍 ${h.centre_nom}`].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8fafc" }}>
                <button onClick={() => setDetailDemande(null)}
                  style={{ padding: "9px 18px", background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Fermer
                </button>
                {/* L'action depuis le détail : on vient d'y lire ce qu'il fallait pour décider,
                    refermer pour rouvrir la carte serait un pas de trop. */}
                {estMigration(d) && d.statut === "en_attente_accord" && peutExecuterMigration(d) && onReaffecter && (
                  <button onClick={() => { setDetailDemande(null); onReaffecter?.(d); }}
                    style={{ padding: "9px 20px", background: "#7A4BC4", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    ✅ Accepter la migration
                  </button>
                )}
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
