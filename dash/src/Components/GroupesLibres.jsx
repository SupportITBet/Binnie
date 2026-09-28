import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import ChatGroupe from "./ChatGroupe";
import { uploadFichier } from "../utils/uploadFichier";

/**
 * Groupes de discussion libres - ceux qui ne sont pas une classe.
 *
 * Jusqu'ici une conversation de groupe ÉTAIT une classe : impossible de réunir les coachs
 * d'un centre ou l'équipe marketing. Cet écran gère l'appartenance ; le fil lui-même est
 * `ChatGroupe`, le composant déjà monté dans cinq espaces - réutilisé tel quel avec
 * `source="libre"` plutôt que recopié, pour que les deux ne divergent jamais.
 *
 * Droits, tels qu'arbitrés : le superviseur général, le conseil pédagogique, la commerciale
 * et l'onboarding créent ; le créateur est l'unique administrateur de SES groupes ; et
 * personne ne quitte un groupe de lui-même.
 *
 * Un groupe déclare à sa création s'il accueille des APPRENANTS (`avec_apprenants`) - pour
 * un événement, une session d'information, une annonce à plusieurs classes. Ce choix est
 * définitif : l'ouvrir après coup exposerait les échanges déjà tenus entre personnels. Les
 * familles et les comptes entreprise restent exclus partout.
 *
 * ⚠️ Aucun mot de cet écran ne qualifie ces groupes de « privés » ou « confidentiels ».
 * Les règles Firestore du projet sont ouvertes : l'appartenance vérifiée côté serveur
 * protège contre l'interface et l'API, pas contre une requête Firestore directe. Promettre
 * le secret serait le promettre à tort.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const ROLES_LISIBLES = {
  coach: "Coach", commercial: "Commercial", admin_commercial: "Resp. commercial",
  onboarding: "Onboarding", marketing: "Marketing", rh: "RH",
  superviseur: "Superviseur", deputy_superviseur: "Deputy superviseur",
  pedagogical_advisor: "Conseil pédagogique", super_admin: "Super admin",
  admin: "Admin", data_collector: "Collecte", placement_test: "Test de niveau",
};
const libelleRole = (r) => ROLES_LISIBLES[r] || r || "-";

const carte = { background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #e5e7eb" };
const champ = { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit" };
const bouton = (fond) => ({
  padding: "9px 16px", background: fond, color: "#fff", border: "none",
  borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
});

/* LA PASTILLE D'UN GROUPE - sa photo, ou ses initiales à défaut.
   Une liste de dix conversations se lisait mot à mot ; une image se reconnaît d'un coup
   d'œil. Le repli sur les initiales n'est pas un pis-aller : c'est ce que voient les
   groupes qui n'ont pas encore de photo, donc tous aujourd'hui. */
function PastilleGroupe({ nom, url, taille = 30, accent = "#64748b", agrandissable = false }) {
  const [casse, setCasse] = useState(false);
  const [plein, setPlein] = useState(false);
  const style = { width: taille, height: taille, borderRadius: "50%", flexShrink: 0, objectFit: "cover" };
  // Une URL morte (image supprimée de Cloudinary) ne doit pas laisser un carré vide :
  // on retombe sur les initiales, comme si aucune photo n'avait été posée.
  if (url && !casse) {
    return (
      <>
        <img src={url} alt={`Photo du groupe ${nom}`}
          onClick={agrandissable ? () => setPlein(true) : undefined}
          title={agrandissable ? "Voir la photo en grand" : undefined}
          style={{ ...style, border: "1px solid #e2e8f0", cursor: agrandissable ? "zoom-in" : "default" }}
          onError={() => setCasse(true)} />
        {/* LA PHOTO EN GRAND, par-dessus tout le reste. Une vignette de 54 px ne laisse
            rien voir d'une image de groupe ; c'est le geste attendu partout ailleurs. */}
        {plein && (
          <div onClick={() => setPlein(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 10050,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
            <img src={url} alt={`Photo du groupe ${nom}`}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 14, objectFit: "contain", cursor: "default" }} />
            <button onClick={() => setPlein(false)}
              style={{ position: "absolute", top: 18, right: 22, background: "rgba(255,255,255,.15)", color: "#fff",
                border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer" }}>✕</button>
            <div style={{ position: "absolute", bottom: 22, color: "rgba(255,255,255,.85)", fontSize: 13, fontWeight: 600 }}>
              {nom}
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <span style={{ ...style, background: "#e2e8f0", color: accent, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: Math.round(taille * 0.38), fontWeight: 800 }}>
      {initiales(nom)}
    </span>
  );
}

/** Les initiales d'un nom - le repère visuel quand aucune photo n'est disponible. */
const initiales = (nom) =>
  String(nom || "?").trim().split(/\s+/).slice(0, 2).map(m => m[0]).join("").toUpperCase();

export default function GroupesLibres({ profil, token, accent = "#0369a1", accentClair = "#e0f2fe" }) {
  const [conversations, setConversations] = useState([]);
  const [peutCreer, setPeutCreer] = useState(false);
  // La migration n'a pas encore été jouée sur cette base : à dire, plutôt que de
  // laisser croire qu'on n'a simplement aucun groupe.
  const [nonInstalle, setNonInstalle] = useState(false);
  // La direction lit tous les fils. On l'affiche à TOUS les membres, pas seulement à
  // elle : un groupe qu'on croit fermé et qui ne l'est pas est pire qu'un groupe ouvert
  // dont on connaît les règles.
  const [supervisionActive, setSupervisionActive] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [modalCreation, setModalCreation] = useState(false);
  const [modalMembres, setModalMembres] = useState(null);   // la conversation à gérer

  const hdr = useCallback(() => ({
    Authorization: `Bearer ${token}`, "Content-Type": "application/json",
  }), [token]);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/conversations`, { headers: hdr() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lecture impossible");
      setConversations(d.conversations || []);
      setPeutCreer(!!d.peut_creer);
      setNonInstalle(!!d.non_installe);
      setSupervisionActive(!!d.supervision_active);
    } catch (e) { toast.error(e.message || "Chargement impossible"); }
    finally { setChargement(false); }
  }, [hdr]);

  useEffect(() => { charger(); }, [charger]);

  if (chargement) {
    return <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px 20px", fontSize: 13 }}>Chargement…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>💬 Groupes de discussion</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
            Des groupes qui ne suivent pas les classes - une équipe, un centre, un événement.
            Un groupe peut réunir du personnel BET seul, ou aussi des apprenants de plusieurs classes.
          </div>
        </div>
        {peutCreer && (
          <button onClick={() => setModalCreation(true)} disabled={nonInstalle}
            style={{ ...bouton(nonInstalle ? "#cbd5e1" : accent), cursor: nonInstalle ? "not-allowed" : "pointer" }}>
            + Nouveau groupe
          </button>
        )}
      </div>

      {nonInstalle && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 15px", marginBottom: 14, fontSize: 12.5, color: "#78350f", lineHeight: 1.6 }}>
          <strong>Fonctionnalité pas encore activée sur cette base.</strong> Le script
          <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 3, margin: "0 3px" }}>Backend/sql/conversations_libres.sql</code>
          doit être exécuté dans Supabase. Tant qu'il ne l'est pas, aucun groupe ne peut être créé.
        </div>
      )}

      {conversations.length === 0 ? (
        <div style={{ ...carte, textAlign: "center", padding: 44, color: "#9ca3af" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>💬</div>
          <div style={{ fontWeight: 700, color: "#374151" }}>Aucun groupe pour l'instant</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>
            {peutCreer
              ? "Créez-en un et choisissez qui en fait partie."
              : "Vous verrez ici les groupes auxquels on vous aura ajouté."}
          </div>
        </div>
      ) : (
        <>
          {/* La gestion des membres, au-dessus du fil : c'est la seule chose que ce
              composant ajoute à `ChatGroupe`, et elle ne concerne que l'administrateur.
              Les groupes SUPERVISÉS - ceux qu'on lit sans en être membre - sont dans une
              rangée à part : les mêler aux siens ferait croire qu'on y a été ajouté. */}
          {[
            { titre: null, liste: conversations.filter(c => !c.supervision) },
            { titre: "Supervision - groupes dont vous n'êtes pas membre",
              liste: conversations.filter(c => c.supervision) },
          ].filter(g => g.liste.length).map(g => (
            <div key={g.titre || "miens"} style={{ marginBottom: 14 }}>
              {g.titre && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b45309", marginBottom: 6, letterSpacing: ".02em" }}>
                  👁️ {g.titre}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {g.liste.map(c => (
                  <button key={c.id} onClick={() => setModalMembres(c)}
                    title={c.je_suis_admin ? "Gérer les membres" : "Voir les membres"}
                    style={{ ...champ, cursor: "pointer", color: "#334155", fontWeight: 600, display: "flex", alignItems: "center", gap: 7,
                      background: c.supervision ? "#fffbeb" : "#f8fafc",
                      borderColor: c.supervision ? "#fde68a" : "#e5e7eb" }}>
                    <PastilleGroupe nom={c.nom} url={c.photo_url} taille={26} accent={accent} />
                    <span>{c.nom}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                      {c.nb_membres} membre{c.nb_membres > 1 ? "s" : ""}
                    </span>
                    {/* Dire d'un coup d'œil que des apprenants lisent ce fil : on n'y
                        écrit pas la même chose que dans un groupe de personnel. */}
                    {c.avec_apprenants && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#15803d", background: "#dcfce7", borderRadius: 99, padding: "1px 7px" }}>
                        👥 apprenants
                      </span>
                    )}
                    {c.je_suis_admin && <span style={{ fontSize: 10.5, background: accentClair, color: accent, padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>admin</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <ChatGroupe
            source="libre"
            /* La PHOTO accompagne le nom : sans elle dans ce mapping, l'en-tête du fil
               n'aurait que les initiales alors que la liste juste au-dessus montre l'image. */
            groupes={conversations.map(c => ({ id: c.id, nom: c.nom, photo_url: c.photo_url, statut: "actif" }))}
            profil={profil} token={token} accent={accent} accentClair={accentClair}
            mentionVisibilite={supervisionActive ? "Visible par les membres du groupe · lisible par la direction" : undefined}
          />
        </>
      )}

      {modalCreation && (
        <ModalCreation hdr={hdr} accent={accent} accentClair={accentClair}
          onFermer={() => setModalCreation(false)}
          onCree={() => { setModalCreation(false); charger(); }} />
      )}

      {modalMembres && (
        <ModalMembres conversation={modalMembres} hdr={hdr} accent={accent} accentClair={accentClair}
          onFermer={() => setModalMembres(null)} onChange={charger} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Sélecteur de personnel - partagé par la création et l'ajout
══════════════════════════════════════════════════════════════ */

/**
 * La recherche est faite par le SERVEUR, pas dans le navigateur : la base compte près de
 * 190 coachs, et charger la liste entière à chaque frappe coûterait autant que la requête.
 * Elle est aussi temporisée - une requête par lettre saisie saturerait le réseau pour rien.
 */
function SelecteurPersonnel({ hdr, accent, selection, onToggle, exclus = [], source = "personnel", onRemplacerSelection }) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState([]);
  const [cherche, setCherche] = useState(false);
  const [tronque, setTronque] = useState(false);
  const minuteur = useRef(null);
  /* Le même sélecteur sert au personnel et aux apprenants : deux composants jumeaux
     auraient divergé au premier ajustement (temporisation, troncature, initiales). */
  const estApprenants = source === "apprenants";

  useEffect(() => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      setCherche(true);
      try {
        const r = await fetch(`${API_URL}/api/conversations/${source}?q=${encodeURIComponent(q)}`, { headers: hdr() });
        const d = await r.json();
        if (r.ok) { setResultats(d[source] || []); setTronque(!!d.tronque); }
      } catch { /* l'écran reste utilisable : la liste précédente demeure */ }
      finally { setCherche(false); }
    }, 280);
    return () => clearTimeout(minuteur.current);
  }, [q, hdr, source]);

  const exclusSet = new Set(exclus);
  const visibles = resultats.filter(p => !exclusSet.has(p.id));

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} autoFocus
        placeholder={estApprenants ? "🔍 Chercher un apprenant par nom ou e-mail…" : "🔍 Chercher un collègue par nom ou e-mail…"}
        style={{ ...champ, width: "100%", marginBottom: 10 }} />

      {/* TOUT SÉLECTIONNER - sur les résultats VISIBLES seulement, et c'est dit. La liste
          est tronquée côté serveur au-delà d'un certain nombre : prétendre tout cocher
          alors qu'on ne connaît qu'une partie des personnes serait un mensonge, et la
          recherche en cours restreint déjà volontairement ce qu'on voit. */}
      {visibles.length > 1 && onRemplacerSelection && (() => {
        const idsVisibles = visibles.map(p => p.id);
        const tousChoisis = idsVisibles.every(id => selection.some(s => s.id === id));
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <button type="button"
              onClick={() => onRemplacerSelection(tousChoisis
                ? selection.filter(s => !idsVisibles.includes(s.id))
                : [...selection, ...visibles.filter(p => !selection.some(s => s.id === p.id))])}
              style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${accent}`,
                background: tousChoisis ? accent : "#fff", color: tousChoisis ? "#fff" : accent,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {tousChoisis ? "☑ Tout désélectionner" : `☐ Tout sélectionner (${visibles.length})`}
            </button>
            <span style={{ fontSize: 11.5, color: "#94a3b8" }}>
              {q ? "parmi les résultats affichés" : tronque ? "parmi les premiers affichés" : ""}
            </span>
          </div>
        );
      })()}

      {selection.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {selection.map(p => (
            <button key={p.id} onClick={() => onToggle(p)}
              title={p.email}
              style={{ background: accent, color: "#fff", border: "none", borderRadius: 99, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
              {p.nom_complet}
              {/* Le RÔLE accompagne le nom : deux comptes distincts portent parfois le
                  même nom - « Lancina Bamba » existe en marketing ET en super admin - et
                  deux étiquettes identiques laissaient croire à un doublon. */}
              <span style={{ opacity: .75, fontWeight: 500 }}> · {estApprenants ? (p.classes?.[0] || "apprenant") : libelleRole(p.role)}</span> ✕
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 9 }}>
        {cherche && !visibles.length && (
          <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12.5 }}>Recherche…</div>
        )}
        {!cherche && !visibles.length && (
          <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12.5 }}>
            {q ? `Personne ne correspond à « ${q} »` : (estApprenants ? "Aucun apprenant actif à proposer." : "Aucun collègue à proposer.")}
          </div>
        )}
        {visibles.map(p => {
          const choisi = selection.some(s => s.id === p.id);
          return (
            <button key={p.id} onClick={() => onToggle(p)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "9px 13px", border: "none", borderBottom: "1px solid #f1f5f9",
                background: choisi ? "#f0f9ff" : "#fff", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "#e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#475569" }}>
                {initiales(p.nom_complet)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom_complet}</span>
                <span style={{ display: "block", fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {estApprenants
                    ? `${p.classes?.length ? p.classes.join(" · ") : "Sans classe"}${p.email ? ` · ${p.email}` : ""}`
                    : `${libelleRole(p.role)}${p.email ? ` · ${p.email}` : ""}`}
                </span>
              </span>
              <span style={{ fontSize: 15, color: choisi ? accent : "#cbd5e1" }}>{choisi ? "☑" : "☐"}</span>
            </button>
          );
        })}
      </div>

      {/* Dire que la liste est coupée, plutôt que de laisser croire que le collègue
          cherché n'existe pas. */}
      {tronque && (
        <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 7 }}>
          Liste tronquée - affinez la recherche pour trouver quelqu'un qui n'apparaît pas.
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Création d'un groupe
══════════════════════════════════════════════════════════════ */

function ModalCreation({ hdr, accent, accentClair, onFermer, onCree }) {
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [selection, setSelection] = useState([]);
  const [occupe, setOccupe] = useState(false);
  /* Le groupe accueille-t-il des apprenants ? Décidé ici et jamais après : cocher plus
     tard exposerait ce que le personnel s'est déjà dit dans ce fil. */
  const [avecApprenants, setAvecApprenants] = useState(false);
  const [ongletSel, setOngletSel] = useState("personnel");
  /* La photo, dès la création. Le serveur l'acceptait depuis toujours ; seul le champ
     manquait, obligeant à créer le groupe puis à rouvrir son panneau pour l'ajouter. */
  const [photo, setPhoto] = useState(null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const champPhotoCreation = useRef(null);

  const choisirPhoto = async (fichier) => {
    if (!fichier) return;
    setEnvoiPhoto(true);
    try {
      // `uploadFichier` rend un OBJET ({ url, public_id, size… }), pas une chaîne - même
      // piège que dans le panneau du groupe, où l'envoyer tel quel faisait refuser l'URL.
      const envoi = await uploadFichier(fichier, "avatar");
      if (!envoi?.url) throw new Error("Image non déposée");
      setPhoto(envoi.url);
    } catch (e) {
      toast.error(e.message || "Image impossible à déposer");
    } finally {
      setEnvoiPhoto(false);
      if (champPhotoCreation.current) champPhotoCreation.current.value = "";  // re-choisir le même fichier
    }
  };

  const basculer = (p) =>
    setSelection(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p]);

  const creer = async () => {
    setOccupe(true);
    try {
      const r = await fetch(`${API_URL}/api/conversations`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ nom, description, membres: selection.map(p => p.id), avec_apprenants: avecApprenants, photo_url: photo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Création impossible");
      toast.success(`Groupe « ${nom.trim()} » créé ✓`);
      // Le groupe existe, mais la photo a été perdue faute de colonne : le dire, sinon
      // l'utilisateur croit l'avoir enregistrée et ne comprend pas les initiales.
      if (d.photo_non_enregistree) toast.error(d.photo_non_enregistree, { duration: 8000 });
      if (d.refuses > 0) toast.info(`${d.refuses} personne(s) écartée(s) : compte inactif ou non autorisé.`);
      onCree();
    } catch (e) { toast.error(e.message); }
    finally { setOccupe(false); }
  };

  const nomValide = nom.trim().length >= 2 && nom.trim().length <= 80;

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !occupe) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.65)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ ...carte, width: "92vw", maxWidth: 1280, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>💬 Nouveau groupe</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
              Vous en serez l'administrateur : vous seul pourrez ajouter ou retirer des membres.
            </div>
          </div>
          {!occupe && <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>}
        </div>

        {/* Deux colonnes : l'identité du groupe à gauche, le choix des membres à droite.
            C'est le choix des membres qui prend du temps et de la place - lui donner la
            moitié de l'écran évite de faire défiler entre la recherche et la sélection. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 22, alignItems: "start" }}>
        <div>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>Nom du groupe</label>
        {/* La photo à côté du nom, pas en dessous : c'est le couple qui identifie le fil
            dans la liste, et les voir ensemble donne l'aperçu de ce qu'on est en train de
            créer. L'aperçu retombe sur l'initiale du nom saisi - exactement ce que la liste
            affichera si aucune image n'est déposée. */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" onClick={() => champPhotoCreation.current?.click()} disabled={envoiPhoto}
              title={photo ? "Changer la photo du groupe" : "Ajouter une photo de groupe"}
              style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", padding: 0,
                border: `1.5px dashed ${photo ? "transparent" : "#cbd5e1"}`, background: photo ? "transparent" : accentClair,
                cursor: envoiPhoto ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {envoiPhoto ? (
                <span style={{ fontSize: 11, color: accent }}>…</span>
              ) : photo ? (
                <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 15, color: accent, fontWeight: 800 }}>{nom.trim()[0]?.toUpperCase() || "📷"}</span>
              )}
            </button>
            {photo && !envoiPhoto && (
              <button type="button" onClick={() => setPhoto(null)} title="Retirer la photo"
                style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%",
                  border: "none", background: "#b91c1c", color: "#fff", fontSize: 10, lineHeight: 1, cursor: "pointer" }}>✕</button>
            )}
            <input ref={champPhotoCreation} type="file" accept="image/*" hidden
              onChange={e => choisirPhoto(e.target.files?.[0])} />
          </div>
          <input value={nom} onChange={e => setNom(e.target.value)} maxLength={80}
            placeholder="Ex. Coachs Angré - rentrée 2026" style={{ ...champ, flex: 1 }} />
        </div>

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
          Objet <span style={{ fontWeight: 400, color: "#94a3b8" }}>(facultatif)</span>
        </label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="À quoi sert ce groupe ?" style={{ ...champ, width: "100%", marginBottom: 16 }} />

        <div style={{ background: "#f8fafc", borderRadius: 9, padding: "11px 14px", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          <strong style={{ color: "#334155" }}>Vous êtes membre d'office</strong>, en tant qu'administrateur -
          inutile de vous chercher dans la liste.<br />
          {avecApprenants
            ? "Ce groupe accueille des apprenants : ils pourront y lire et y écrire. Les familles et les comptes entreprise restent exclus."
            : "Les apprenants et les familles ne peuvent pas être ajoutés à un groupe de ce type."}
          <br />Un membre ne peut pas se retirer lui-même : c'est à vous de le faire.
        </div>

        {/* L'ouverture aux apprenants se décide ICI, une fois pour toutes : l'autoriser
            après coup exposerait les échanges déjà tenus entre personnels. */}
        <div style={{ marginTop: 12, background: avecApprenants ? "#f0fdf4" : "#f8fafc", border: `1.5px solid ${avecApprenants ? "#bbf7d0" : "#e5e7eb"}`, borderRadius: 9, padding: "11px 14px" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={avecApprenants}
              onChange={e => { setAvecApprenants(e.target.checked); setSelection([]); }}
              style={{ width: 16, height: 16, marginTop: 1, accentColor: "#059669", cursor: "pointer", flexShrink: 0 }} />
            <span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: avecApprenants ? "#15803d" : "#334155" }}>
                👥 Inclure des apprenants
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "#64748b", marginTop: 2, lineHeight: 1.5 }}>
                Pour un événement, une session d'information ou une annonce à des apprenants de plusieurs classes.
                Ce choix est définitif pour ce groupe.
              </span>
            </span>
          </label>
        </div>
        </div>

        <div>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 5 }}>
          Membres <span style={{ fontWeight: 400, color: "#94a3b8" }}>({selection.length} sélectionné{selection.length > 1 ? "s" : ""})</span>
        </label>
        {avecApprenants && (
          <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
            {[["personnel", "🏢 Personnel BET"], ["apprenants", "👥 Apprenants actifs"]].map(([cle, lib]) => (
              <button key={cle} type="button" onClick={() => setOngletSel(cle)}
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${ongletSel === cle ? accent : "#e5e7eb"}`,
                  background: ongletSel === cle ? accentClair : "#fff",
                  color: ongletSel === cle ? accent : "#64748b" }}>
                {lib}
              </button>
            ))}
          </div>
        )}
        <SelecteurPersonnel hdr={hdr} accent={accent} selection={selection} onToggle={basculer} onRemplacerSelection={setSelection}
          source={avecApprenants ? ongletSel : "personnel"} />
        </div>
        </div>

        <button onClick={creer} disabled={occupe || !nomValide}
          style={{ ...bouton(occupe || !nomValide ? "#cbd5e1" : accent), width: "100%", padding: 13, fontSize: 14, marginTop: 18 }}>
          {occupe ? "Création…" : selection.length
            ? `Créer le groupe avec ${selection.length} membre${selection.length > 1 ? "s" : ""}`
            : "Créer le groupe"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Membres d'un groupe
══════════════════════════════════════════════════════════════ */

function ModalMembres({ conversation, hdr, accent, accentClair, onFermer, onChange }) {
  const [membres, setMembres] = useState([]);
  const [estAdmin, setEstAdmin] = useState(false);
  /* La photo vit dans un état local plutôt que d'être relue de `conversation` : le parent
     ne se recharge qu'à la fermeture du modal, et sans cela on déposerait une image sans
     la voir apparaître. */
  const [photo, setPhoto] = useState(conversation.photo_url || null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const champPhoto = useRef(null);
  /* Le nom, modifiable sur place. Le serveur savait le faire depuis toujours (PATCH),
     mais aucun écran ne l'appelait : un groupe mal nommé le restait à vie. */
  const [nom, setNom] = useState(conversation.nom || "");
  const [renomme, setRenomme] = useState(false);
  const [enregistreNom, setEnregistreNom] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [ajout, setAjout] = useState(false);
  const [selection, setSelection] = useState([]);
  const [occupe, setOccupe] = useState(false);
  // Le membre dont on veut confirmer le retrait. `window.confirm` bloquait l'onglet
  // entier, s'affichait hors de la charte, et ne pouvait pas rappeler ce que le
  // retrait implique - la personne perd l'accès au fil, historique compris.
  const [aRetirer, setARetirer] = useState(null);
  const [ongletAjout, setOngletAjout] = useState("personnel");
  // Suppression du groupe : le nom recopié sert de garde-fou, et `suppression` verrouille
  // le dialogue pendant l'appel - la purge des messages peut prendre quelques secondes.
  const [aSupprimer, setASupprimer] = useState(false);
  const [saisieNom, setSaisieNom] = useState("");
  const [suppression, setSuppression] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres`, { headers: hdr() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lecture impossible");
      setMembres(d.membres || []);
      setEstAdmin(!!d.je_suis_admin);
    } catch (e) { toast.error(e.message); }
    finally { setChargement(false); }
  }, [conversation.id, hdr]);

  useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    setOccupe(true);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres`, {
        method: "POST", headers: hdr(), body: JSON.stringify({ membres: selection.map(p => p.id) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ajout impossible");
      toast.success(`${d.ajoutes} membre(s) ajouté(s) ✓`);
      setSelection([]); setAjout(false);
      charger(); onChange?.();
    } catch (e) { toast.error(e.message); }
    finally { setOccupe(false); }
  };

  const retirer = async (m) => {
    setARetirer(null);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}/membres/${m.user_id}`, {
        method: "DELETE", headers: hdr(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Retrait impossible");
      toast.success("Membre retiré");
      charger(); onChange?.();
    } catch (e) { toast.error(e.message); }
  };

  /* Déposer la photo, ou la retirer (`null`). L'image part d'abord sur Cloudinary, et
     seule son URL est enregistrée - comme partout ailleurs dans le projet. */
  const envoyerPhoto = async (fichier) => {
    setEnvoiPhoto(true);
    try {
      // `uploadFichier` rend un OBJET ({ url, public_id, size… }), pas une chaîne : envoyer
      // l'objet tel quel au serveur le faisait refuser comme URL invalide.
      const envoi = fichier ? await uploadFichier(fichier, "avatar") : null;
      const url = envoi?.url || null;
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}`, {
        method: "PATCH", headers: hdr(), body: JSON.stringify({ photo_url: url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Enregistrement impossible");
      setPhoto(url);
      onChange?.();
      toast.success(url ? "Photo du groupe mise à jour ✓" : "Photo retirée");
    } catch (e) {
      toast.error(e.message || "Photo impossible à enregistrer");
    } finally { setEnvoiPhoto(false); }
  };

  /* Retire tous les membres et efface le groupe avec ses messages. Le serveur refuse si
     l'appelant n'est pas le créateur (ou super admin), si la conversation appartient à une
     classe, ou s'il ne peut pas atteindre Firestore - on relaie son message tel quel plutôt
     que d'en inventer un : il dit précisément laquelle des trois raisons s'applique. */
  const supprimerGroupe = async () => {
    if (saisieNom.trim() !== (conversation.nom || "").trim()) return;
    setSuppression(true);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}`, {
        method: "DELETE", headers: hdr(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Suppression impossible");
      toast.success(`Groupe « ${d.nom || conversation.nom} » supprimé ✓`);
      setASupprimer(false);
      onChange?.();
      onFermer?.();       // le groupe n'existe plus : rester sur son panneau n'aurait pas de sens
    } catch (e) {
      toast.error(e.message || "Suppression impossible");
      setSuppression(false);
    }
  };

  const enregistrerNom = async () => {
    const titre = nom.trim();
    if (titre === (conversation.nom || "")) { setRenomme(false); return; }
    if (titre.length < 2 || titre.length > 80) {
      toast.error("Le nom doit faire entre 2 et 80 caractères.");
      return;
    }
    setEnregistreNom(true);
    try {
      const r = await fetch(`${API_URL}/api/conversations/${conversation.id}`, {
        method: "PATCH", headers: hdr(), body: JSON.stringify({ nom: titre }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Renommage impossible");
      conversation.nom = titre;   // l'en-tête et le fil suivent sans attendre le rechargement
      setRenomme(false);
      onChange?.();
      toast.success("Groupe renommé ✓");
    } catch (e) {
      setNom(conversation.nom || "");
      toast.error(e.message || "Renommage impossible");
    } finally { setEnregistreNom(false); }
  };

  const dejaLa = membres.map(m => m.user_id);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.65)", zIndex: 9900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ ...carte, width: "92vw", maxWidth: 1280, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 13, alignItems: "center", minWidth: 0 }}>
            {/* LA PHOTO DU GROUPE. Cliquable pour qui l'administre, simple repère pour les
                autres - on ne propose pas une action qui serait refusée par le serveur. */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <PastilleGroupe nom={conversation.nom} url={photo} taille={54} accent={accent} agrandissable />
              {conversation.je_suis_admin && (
                <>
                  <input ref={champPhoto} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) envoyerPhoto(f); }} />
                  <button onClick={() => champPhoto.current?.click()} disabled={envoiPhoto}
                    title={photo ? "Changer la photo du groupe" : "Ajouter une photo au groupe"}
                    style={{ position: "absolute", right: -3, bottom: -3, width: 23, height: 23, borderRadius: "50%",
                      border: "2px solid #fff", background: envoiPhoto ? "#cbd5e1" : accent, color: "#fff",
                      fontSize: 11, cursor: envoiPhoto ? "wait" : "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", padding: 0 }}>
                    {envoiPhoto ? "…" : "📷"}
                  </button>
                </>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              {renomme ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input value={nom} autoFocus maxLength={80}
                    onChange={e => setNom(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") enregistrerNom(); if (e.key === "Escape") { setNom(conversation.nom || ""); setRenomme(false); } }}
                    style={{ ...champ, fontSize: 15, fontWeight: 700, padding: "6px 10px", minWidth: 220 }} />
                  <button onClick={enregistrerNom} disabled={enregistreNom}
                    style={{ ...bouton(accent), padding: "6px 12px", fontSize: 12 }}>
                    {enregistreNom ? "…" : "✓"}
                  </button>
                  <button onClick={() => { setNom(conversation.nom || ""); setRenomme(false); }}
                    style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px", fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{conversation.nom}</div>
                  {conversation.je_suis_admin && (
                    <button onClick={() => setRenomme(true)} title="Renommer le groupe"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 2, color: "#94a3b8" }}>
                      ✏️
                    </button>
                  )}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
                {membres.length} membre{membres.length > 1 ? "s" : ""}
                {conversation.description ? ` · ${conversation.description}` : ""}
              </div>
              {conversation.je_suis_admin && photo && (
                <button onClick={() => envoyerPhoto(null)} disabled={envoiPhoto}
                  style={{ marginTop: 4, background: "none", border: "none", padding: 0, fontSize: 11.5,
                    color: "#b91c1c", cursor: "pointer", fontWeight: 600 }}>
                  Retirer la photo
                </button>
              )}
            </div>
          </div>
          <button onClick={onFermer} style={{ ...bouton("#f1f5f9"), color: "#374151", padding: "6px 12px" }}>✕</button>
        </div>

        {chargement ? (
          <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Chargement…</div>
        ) : ajout ? (
          <>
            {/* Les deux viviers, quand le groupe accueille des apprenants. Sinon le
                sélecteur reste celui du personnel, comme avant. */}
            {conversation.avec_apprenants && (
              <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
                {[["personnel", "🏢 Personnel BET"], ["apprenants", "👥 Apprenants actifs"]].map(([cle, lib]) => (
                  <button key={cle} type="button" onClick={() => setOngletAjout(cle)}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: `1.5px solid ${ongletAjout === cle ? accent : "#e5e7eb"}`,
                      background: ongletAjout === cle ? accentClair : "#fff",
                      color: ongletAjout === cle ? accent : "#64748b" }}>
                    {lib}
                  </button>
                ))}
              </div>
            )}
            <SelecteurPersonnel hdr={hdr} accent={accent} selection={selection}
              exclus={dejaLa}
              source={conversation.avec_apprenants ? ongletAjout : "personnel"}
              onToggle={p => setSelection(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p])}
              onRemplacerSelection={setSelection} />
            <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
              <button onClick={() => { setAjout(false); setSelection([]); }}
                style={{ ...bouton("#f1f5f9"), color: "#374151", flex: 1, padding: 12 }}>Annuler</button>
              <button onClick={ajouter} disabled={occupe || !selection.length}
                style={{ ...bouton(occupe || !selection.length ? "#cbd5e1" : accent), flex: 1.6, padding: 12 }}>
                {occupe ? "Ajout…" : `Ajouter ${selection.length || ""}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, overflow: "hidden", marginBottom: 14 }}>
              {membres.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "#e2e8f0",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#475569" }}>
                    {initiales(m.nom_complet)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.nom_complet}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {libelleRole(m.utilisateur?.role)}{m.utilisateur?.email ? ` · ${m.utilisateur.email}` : ""}
                    </span>
                  </span>
                  {m.role === "admin" ? (
                    <span style={{ fontSize: 10.5, background: accentClair, color: accent, padding: "2px 8px", borderRadius: 99, fontWeight: 700 }}>admin</span>
                  ) : estAdmin ? (
                    <button onClick={() => setARetirer(m)}
                      style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      Retirer
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {estAdmin ? (
              <button onClick={() => setAjout(true)} style={{ ...bouton(accent), width: "100%", padding: 12 }}>
                + Ajouter des membres
              </button>
            ) : (
              <div style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
                Seul le créateur du groupe peut en modifier les membres.
              </div>
            )}

            {/* SUPPRIMER LE GROUPE. Séparé du reste par un trait : ce n'est pas une action
                de gestion courante, et rien ne doit la faire côtoyer « Ajouter des membres ».
                Le serveur reste seul juge du droit - le bouton s'affiche pour le créateur,
                et un super admin non créateur y accède par l'API. */}
            {estAdmin && (
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                <button onClick={() => { setSaisieNom(""); setASupprimer(true); }}
                  style={{ ...bouton("#fff"), width: "100%", padding: 11, color: "#b91c1c", border: "1.5px solid #fecaca" }}>
                  🗑 Supprimer ce groupe
                </button>
                <div style={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", marginTop: 7, lineHeight: 1.6 }}>
                  Retire tous les membres et efface définitivement la conversation.
                </div>
              </div>
            )}
          </>
        )}

        {/* Confirmation de la suppression. On efface les messages de TOUT LE MONDE, pas les
            siens, et rien ne les rétablira : recopier le nom du groupe empêche le clic de
            trop sans gêner celui qui sait ce qu'il fait. */}
        {aSupprimer && (
          <div onClick={e => { if (e.target === e.currentTarget && !suppression) setASupprimer(false); }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 9950, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ ...carte, width: "100%", maxWidth: 460 }}>
              <div style={{ fontSize: 30, textAlign: "center", marginBottom: 8 }}>🗑</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a", textAlign: "center", marginBottom: 6 }}>
                Supprimer « {conversation.nom} » ?
              </div>
              <div style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 14 }}>
                Les <strong>{membres.length} membre{membres.length > 1 ? "s" : ""}</strong> seront retirés et
                <strong> tous les messages du groupe seront effacés</strong>, pour tout le monde.
                Cette action est définitive : rien ne permettra de les rétablir.
              </div>

              <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>
                Pour confirmer, recopiez le nom du groupe :
              </div>
              <input value={saisieNom} onChange={e => setSaisieNom(e.target.value)} autoFocus
                placeholder={conversation.nom}
                onKeyDown={e => { if (e.key === "Enter" && saisieNom.trim() === (conversation.nom || "").trim()) supprimerGroupe(); }}
                style={{ ...champ, width: "100%", marginBottom: 16, boxSizing: "border-box" }} />

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setASupprimer(false)} disabled={suppression}
                  style={{ ...bouton("#f1f5f9"), color: "#374151", flex: 1, padding: 12 }}>Annuler</button>
                <button onClick={supprimerGroupe}
                  disabled={suppression || saisieNom.trim() !== (conversation.nom || "").trim()}
                  style={{ ...bouton(saisieNom.trim() === (conversation.nom || "").trim() ? "#b91c1c" : "#cbd5e1"),
                    flex: 1.3, padding: 12,
                    cursor: saisieNom.trim() === (conversation.nom || "").trim() && !suppression ? "pointer" : "not-allowed" }}>
                  {suppression ? "Suppression…" : "Supprimer définitivement"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation du retrait. Un retrait ne se rattrape pas : la personne perd
            l'accès au fil et à tout son historique dès la validation. */}
        {aRetirer && (
          <div onClick={e => { if (e.target === e.currentTarget) setARetirer(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", zIndex: 9950, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ ...carte, width: "100%", maxWidth: 440 }}>
              <div style={{ fontSize: 30, textAlign: "center", marginBottom: 8 }}>🚪</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: "#0f172a", textAlign: "center", marginBottom: 6 }}>
                Retirer {aRetirer.nom_complet} ?
              </div>
              <div style={{ fontSize: 12.5, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 16 }}>
                Cette personne perdra l'accès au groupe <strong>« {conversation.nom} »</strong> et à tout
                son historique de messages. Elle n'en sera pas avertie.
              </div>

              <div style={{ background: "#f8fafc", borderRadius: 9, padding: "11px 14px", marginBottom: 16, fontSize: 12.5, color: "#334155", lineHeight: 1.7 }}>
                <div><span style={{ color: "#94a3b8" }}>Rôle :</span> <strong>{libelleRole(aRetirer.utilisateur?.role)}</strong></div>
                {aRetirer.utilisateur?.email && (
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "#94a3b8" }}>E-mail :</span> {aRetirer.utilisateur.email}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setARetirer(null)} style={{ ...bouton("#f1f5f9"), color: "#374151", flex: 1, padding: 12 }}>Annuler</button>
                <button onClick={() => retirer(aRetirer)} style={{ ...bouton("#b91c1c"), flex: 1.3, padding: 12 }}>Retirer du groupe</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
