import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser } from "../middlewares/requireAdmin.js";
import { notifyUsers } from "../services/notifyRole.js";

const router = express.Router();

/**
 * Groupes de discussion libres - ceux qui ne sont pas une classe.
 *
 * Une conversation de groupe était jusqu'ici l'exacte image d'une classe : impossible de
 * réunir les coachs d'un centre, les deputys d'un superviseur ou l'équipe marketing. Ces
 * routes gèrent l'APPARTENANCE ; les messages continuent de vivre dans Firestore, avec
 * l'écoute temps réel déjà en place, sous `chats/libre_{id}/messages`.
 *
 * Les droits, tels qu'arbitrés :
 *   · CRÉER    - superviseur global et conseil pédagogique uniquement.
 *   · ADMINISTRER - le créateur SEUL. Il ajoute, retire, renomme, archive.
 *   · ÊTRE MEMBRE - personnel BET uniquement. Ni apprenant, ni parent, ni compte client.
 *   · QUITTER   - impossible de son propre chef : un groupe de travail n'est pas un groupe
 *     d'amis, et une consigne ne doit pas manquer son destinataire.
 *
 * ⚠️ Ce que ces contrôles NE font PAS. Les règles Firestore du projet sont aujourd'hui
 * `allow read, write: if true`. L'appartenance vérifiée ici protège contre l'interface et
 * l'API, pas contre une requête Firestore directe. Tant que le pont Supabase → Firebase
 * n'existe pas, aucun écran ne doit présenter ces groupes comme « privés ».
 */

/**
 * Qui peut créer un groupe.
 *
 * Aux rôles à vue transversale se sont ajoutées la COMMERCIALE et l'ONBOARDING : ce sont
 * elles qui réunissent des apprenants de plusieurs classes pour un événement, une session
 * d'information ou une relance. Elles n'administrent QUE les groupes dont elles sont
 * créatrices - la règle « le créateur seul ajoute et retire » est inchangée.
 */
const ROLES_CREATEURS = [
  "superviseur", "super_admin", "admin_superviseur", "pedagogical_advisor",
  "commercial", "admin_commercial", "onboarding", "admin_onboarding",
];

/**
 * Qui lit TOUS les groupes sans en être membre.
 *
 * Une capacité de supervision, pas une appartenance : le SuperAdmin n'apparaît pas dans la
 * liste des membres, ne reçoit aucune notification, et sa lecture ne change pas la
 * composition du groupe. Elle est ASSUMÉE : chaque fil porte la mention « Lisible par la
 * direction » côté membres. Un groupe qu'on croit fermé et qui ne l'est pas est pire qu'un
 * groupe ouvert dont on connaît les règles.
 */
const ROLES_SUPERVISION = ["super_admin"];

/**
 * Qui ne peut PAS être ajouté. Liste d'EXCLUSION et non d'inclusion : un nouveau rôle de
 * personnel créé demain doit être assignable sans qu'on pense à modifier ce fichier, alors
 * qu'un nouveau rôle d'apprenant ou de famille devra être ajouté ici - l'oubli est bien
 * moins grave dans ce sens.
 */
const ROLES_EXCLUS = ["apprenant", "parent", "client_entreprise"];

/**
 * Les apprenants sont admis dans CERTAINS groupes seulement, ceux créés avec l'indicateur
 * `avec_apprenants`.
 *
 * Pourquoi un indicateur par groupe plutôt que retirer « apprenant » de la liste
 * d'exclusion : sans lui, un apprenant pourrait être glissé dans n'importe quel fil, y
 * compris celui du conseil pédagogique ou d'une équipe qui discute de son dossier. Un
 * groupe déclare donc à sa création s'il accueille des apprenants, et cela ne change plus.
 * `parent` et `client_entreprise` restent exclus partout.
 */
const ROLES_APPRENANTS = ["apprenant"];

/** Les rôles admis dans ce groupe-ci. */
const rolesAdmis = (conv) => (conv?.avec_apprenants ? ROLES_APPRENANTS : []);

/** Un rôle est-il refusé pour ce groupe ? */
const roleRefuse = (role, conv) =>
  ROLES_EXCLUS.includes(role) && !rolesAdmis(conv).includes(role);

const requireCreateur = (req, res, next) => {
  if (!ROLES_CREATEURS.includes(req.role)) {
    return res.status(403).json({
      error: "Seuls le superviseur général et le conseil pédagogique peuvent créer un groupe de discussion.",
    });
  }
  next();
};

/**
 * La table ou une colonne peut manquer si le SQL n'a pas été joué : on répond vide plutôt
 * que 500. `42P01` est le code PostgreSQL, `PGRST205` celui que renvoie PostgREST quand la
 * table est absente de son cache de schéma - tester le premier seul laissait passer un 500
 * sur une base non migrée, ce qui a été constaté.
 */
const tableAbsente = (e) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "42703");

/** L'identifiant Firestore d'une conversation libre, miroir de `groupe_{id}` côté classe. */
const docFirestore = (id) => `libre_${id}`;

/** Le nom affichable d'un utilisateur, sans jamais rendre une chaîne vide. */
const nomDe = (u) => `${u?.prenom || ""} ${u?.nom || ""}`.trim() || u?.email || "-";

/**
 * Prévient les personnes ajoutées à un groupe.
 *
 * Sans cela, on découvrait son appartenance par hasard, en ouvrant l'onglet - ou jamais,
 * puisque rien n'attire l'œil sur un groupe dont on ignore l'existence. Une consigne
 * postée dans un groupe que personne n'a vu n'est pas une consigne.
 *
 * NE LÈVE JAMAIS : l'ajout a déjà eu lieu en base. Faire échouer la réponse HTTP parce
 * qu'une notification n'est pas partie ferait croire que l'ajout a échoué, et pousserait
 * à le refaire.
 */
async function prevenirAjoutes(userIds, { conversation, auteur }) {
  if (!userIds?.length) return;
  const par = `${auteur?.prenom || ""} ${auteur?.nom || ""}`.trim() || "Un responsable";
  /* UNE seule insertion pour tout le monde, et non une par personne : sur un groupe de
     237 membres, la boucle faisait 236 allers-retours et portait la création à près de
     4 secondes - le temps que l'écran passe à ne rien afficher. */
  await notifyUsers(userIds, {
    type: "conversation_ajout",
    titre: `💬 Ajouté au groupe « ${conversation.nom} »`,
    message: `${par} vous a ajouté au groupe de discussion « ${conversation.nom} »`
      + `${conversation.description ? ` - ${conversation.description}` : ""}.`
      + ` Retrouvez-le dans Messagerie › Groupes.`,
    // `conversation_id` permettra plus tard d'ouvrir directement le fil depuis la cloche.
    meta: { conversation_id: conversation.id, ajoute_par: auteur?.id || null },
  });
}

/**
 * Charge une conversation et le rôle qu'y tient l'appelant.
 * Renvoie `null` si elle n'existe pas - un non-membre reçoit 404 et non 403 : dire
 * « ce groupe existe mais pas pour vous » est déjà une fuite d'information.
 */
async function contexte(conversationId, userId) {
  const { data: conv, error } = await supabase
    .from("conversations_groupes").select("*").eq("id", conversationId).maybeSingle();
  if (error || !conv) return null;

  const { data: membres } = await supabase
    .from("conversation_membres").select("*").eq("conversation_id", conversationId);

  const moi = (membres || []).find(m => m.user_id === userId) || null;
  return { conv, membres: membres || [], moi, estAdmin: conv.cree_par === userId };
}

/* ══════════════════════════════════════════════════════════════
   MES CONVERSATIONS
══════════════════════════════════════════════════════════════ */

/**
 * `authenticateUser` et non `authenticateAdmin` : un coach est membre à part entière et
 * doit voir ses groupes. Seule la CRÉATION est réservée.
 */
router.get("/", authenticateUser, async (req, res) => {
  /* `peut_creer` accompagne TOUTES les réponses, y compris les réponses vides.
     Il ne figurait que dans le cas nominal : sur une base non migrée - ou simplement
     quand l'utilisateur n'appartient encore à aucun groupe - la réponse partait sans
     lui, l'écran le lisait comme `false`, et le bouton « Nouveau groupe » disparaissait
     pour un superviseur qui avait pourtant le droit. Un droit ne doit pas dépendre de
     l'existence de données. */
  const peutCreer = ROLES_CREATEURS.includes(req.role);
  const vide = (raison) => res.json({ conversations: [], peut_creer: peutCreer, ...raison });

  try {
    const moi = req.profil?.id;
    if (!moi) return res.status(401).json({ error: "Session invalide" });

    const { data: appartenances, error } = await supabase
      .from("conversation_membres").select("conversation_id, role").eq("user_id", moi);
    // `non_installe` dit à l'écran que la base n'a pas encore reçu la migration, pour
    // qu'il l'annonce au lieu d'afficher un « aucun groupe » trompeur.
    if (error) { if (tableAbsente(error)) return vide({ non_installe: true }); throw error; }

    const supervise = ROLES_SUPERVISION.includes(req.role);
    const ids = (appartenances || []).map(a => a.conversation_id);

    /* Le superviseur global lit TOUS les groupes. On ne se contente pas d'élargir `ids` :
       les siens et ceux qu'il supervise restent distingués par `supervision`, pour que
       l'écran ne mélange pas « mes groupes » et « ceux que je surveille ». */
    if (supervise) {
      const { data: tous, error: eT } = await supabase
        .from("conversations_groupes").select("id").eq("archive", false);
      if (eT) { if (tableAbsente(eT)) return vide({ non_installe: true }); throw eT; }
      (tous || []).forEach(c => { if (!ids.includes(c.id)) ids.push(c.id); });
    }

    if (!ids.length) {
      /* N'appartenir à aucun groupe et NE PAS POUVOIR en créer se ressemblent à l'écran,
         alors que l'un est normal et l'autre est une migration manquante. On vérifie donc
         que la table des groupes répond - une seule requête de comptage, et seulement dans
         ce cas vide. Sans ce contrôle, le bouton « Nouveau groupe » s'affichait sur une
         base incomplète et n'échouait qu'au moment du clic. */
      // `head: true` NE remonte PAS d'erreur sur une table absente : PostgREST rend
      // `count: null` sans broncher, et la table manquante passait inaperçue. Une vraie
      // lecture d'une ligne, elle, renvoie bien `PGRST205`.
      const { error: e0 } = await supabase
        .from("conversations_groupes").select("id").limit(1);
      return vide(tableAbsente(e0) ? { non_installe: true } : undefined);
    }

    const [{ data: convs, error: e1 }, { data: tousMembres }] = await Promise.all([
      supabase.from("conversations_groupes").select("*").in("id", ids)
        .eq("archive", false).order("updated_at", { ascending: false }),
      // Tous les membres des conversations concernées en UNE requête : une par
      // conversation ferait autant d'allers-retours que de groupes affichés.
      supabase.from("conversation_membres").select("conversation_id, user_id").in("conversation_id", ids),
    ]);

    if (e1) { if (tableAbsente(e1)) return vide({ non_installe: true }); throw e1; }

    const compte = {};
    (tousMembres || []).forEach(m => { compte[m.conversation_id] = (compte[m.conversation_id] || 0) + 1; });

    res.json({
      conversations: (convs || []).map(c => ({
        ...c,
        nb_membres: compte[c.id] || 0,
        je_suis_admin: c.cree_par === moi,
        // `true` quand on y accède SANS en être membre : l'écran le signale au lieu de
        // le faire passer pour un groupe qu'on nous aurait attribué.
        supervision: !(appartenances || []).some(a => a.conversation_id === c.id),
        doc_firestore: docFirestore(c.id),
      })),
      peut_creer: peutCreer,
      // L'écran affiche la mention « Lisible par la direction » sur tous les fils dès que
      // cette capacité existe - y compris pour les membres, qui doivent la connaître.
      supervision_active: true,
    });
  } catch (err) {
    console.error("[conversations GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PERSONNEL ASSIGNABLE
══════════════════════════════════════════════════════════════ */

/**
 * Les personnes qu'on peut ajouter à un groupe.
 *
 * Renvoie le personnel BET, jamais les apprenants ni les familles. La recherche se fait
 * ICI et non dans le navigateur : la base compte près de 190 coachs, et transmettre la
 * liste entière à chaque frappe coûterait autant que la requête elle-même.
 */
router.get("/personnel", authenticateAdmin, requireCreateur, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    /* L'APPELANT est exclu de sa propre liste. Il apparaissait parmi les personnes à
       cocher alors qu'il est ajouté d'office comme administrateur : le cocher n'avait
       aucun effet, et ne pas le cocher laissait croire qu'il pourrait rester dehors. */
    let requete = supabase
      .from("utilisateurs").select("id, prenom, nom, email, role, avatar_url")
      .eq("actif", true).not("role", "in", `(${ROLES_EXCLUS.join(",")})`)
      .neq("id", req.profil?.id || "00000000-0000-0000-0000-000000000000")
      // 500 et non 200 : le personnel assignable compte 237 personnes, et le plafond
      // précédent tronquait la liste initiale - l'écran affichait un avertissement de
      // troncature avant même qu'on ait cherché quoi que ce soit.
      .order("prenom").limit(q ? 60 : 500);

    if (q) {
      // `or` sur trois colonnes : on cherche aussi bien « Ouattara » que « ismael@ ».
      const motif = `%${q}%`;
      requete = requete.or(`prenom.ilike.${motif},nom.ilike.${motif},email.ilike.${motif}`);
    }

    const { data, error } = await requete;
    if (error) throw error;

    res.json({
      personnel: (data || []).map(u => ({ ...u, nom_complet: nomDe(u) })),
      // Dit franchement que la liste est tronquée, plutôt que de laisser croire
      // que le collègue cherché n'existe pas.
      tronque: (data || []).length >= (q ? 60 : 500),
    });
  } catch (err) {
    console.error("[conversations/personnel]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/**
 * GET /api/conversations/apprenants?q=
 *
 * Les apprenants ACTIFS de toutes les classes, pour les groupes qui les accueillent.
 *
 * On part des rattachements (`groupes_apprenants`) et non de la table `utilisateurs` : un
 * compte au rôle « apprenant » peut exister sans classe - dossier abandonné, doublon,
 * compte de test - et n'a rien à faire dans un groupe d'événement. La classe accompagne
 * chaque nom : sur 77 apprenants, deux homonymes ne se distinguent que par elle.
 */
router.get("/apprenants", authenticateAdmin, requireCreateur, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    const { data: rattachements, error: eRatt } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, groupes(nom)")
      .eq("statut", "actif")
      .not("apprenant_id", "is", null);
    if (eRatt) throw eRatt;

    // Un apprenant peut être rattaché à plusieurs classes : on garde toutes ses classes
    // sur une seule ligne plutôt que de le faire apparaître deux fois dans la liste.
    const classesDe = {};
    (rattachements || []).forEach(r => {
      const nom = r.groupes?.nom;
      if (!nom) return;
      (classesDe[r.apprenant_id] = classesDe[r.apprenant_id] || []).push(nom);
    });
    const ids = Object.keys(classesDe);
    if (!ids.length) return res.json({ apprenants: [], tronque: false });

    let requete = supabase
      .from("utilisateurs").select("id, prenom, nom, email, role, avatar_url")
      .in("id", ids).eq("actif", true)
      .order("prenom").limit(q ? 60 : 500);
    if (q) {
      const motif = `%${q}%`;
      requete = requete.or(`prenom.ilike.${motif},nom.ilike.${motif},email.ilike.${motif}`);
    }
    const { data, error } = await requete;
    if (error) throw error;

    res.json({
      apprenants: (data || []).map(u => ({
        ...u,
        nom_complet: nomDe(u),
        classes: [...new Set(classesDe[u.id] || [])],
      })),
      tronque: (data || []).length >= (q ? 60 : 500),
    });
  } catch (err) {
    console.error("[conversations/apprenants]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   CRÉATION
══════════════════════════════════════════════════════════════ */

/* La photo du groupe : une URL Cloudinary, ou rien. On refuse tout ce qui n'est pas une
   adresse http(s) - une valeur libre finirait dans un attribut `src`, où une chaîne
   `javascript:` serait exécutée par le navigateur de chaque membre. */
const photoValide = (v) => {
  if (v === null || v === "") return null;
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) && s.length <= 500 ? s : undefined;   // undefined = refusée
};

router.post("/", authenticateAdmin, requireCreateur, async (req, res) => {
  try {
    const { nom, description, membres, avec_apprenants, photo_url } = req.body || {};
    const titre = String(nom || "").trim();
    // Fixé à la création et jamais modifié ensuite : un groupe qui accueillerait des
    // apprenants après coup exposerait les échanges déjà tenus entre personnels.
    const ouvertApprenants = avec_apprenants === true;
    if (titre.length < 2) return res.status(400).json({ error: "Donnez un nom au groupe (2 caractères minimum)." });
    if (titre.length > 80) return res.status(400).json({ error: "Le nom du groupe est trop long (80 caractères maximum)." });

    const moi = req.profil?.id;
    const demandes = [...new Set((Array.isArray(membres) ? membres : []).filter(Boolean))]
      .filter(id => id !== moi);   // le créateur est ajouté d'office, plus bas

    /* Les rôles sont revérifiés EN BASE et non pris sur parole : la liste vient du
       navigateur, et un identifiant d'apprenant glissé dans la requête entrerait sinon
       dans un groupe réservé au personnel. */
    let valides = [];
    if (demandes.length) {
      const { data: trouves } = await supabase
        .from("utilisateurs").select("id, role, actif").in("id", demandes);
      valides = (trouves || [])
        .filter(u => u.actif && !roleRefuse(u.role, { avec_apprenants: ouvertApprenants }))
        .map(u => u.id);
    }
    const refuses = demandes.length - valides.length;

    const photoCreation = photoValide(photo_url);
    if (photoCreation === undefined) return res.status(400).json({ error: "Photo de groupe invalide." });

    const aInserer = {
      nom: titre,
      description: description?.trim() || null,
      type: "libre",
      cree_par: moi,
      avec_apprenants: ouvertApprenants,
      // Absente tant que le SQL n'est pas joué : le repli ci-dessous crée alors le groupe
      // sans elle plutôt que de refuser la création sur une base non migrée.
      ...(photoCreation ? { photo_url: photoCreation } : {}),
    };
    let { data: conv, error } = await supabase.from("conversations_groupes").insert(aInserer).select().single();
    /* Repli si la colonne `avec_apprenants` n'a pas encore été ajoutée : on crée quand
       même le groupe, sans apprenants, plutôt que de refuser toute création sur une base
       non migrée. Le reste du code lit `conv.avec_apprenants` comme `undefined`, donc
       faux - le comportement retombe exactement sur l'ancien. */
    if (error && tableAbsente(error) && (ouvertApprenants || photoCreation)) {
      const { avec_apprenants: _ignore, photo_url: _ignore2, ...sansColonne } = aInserer;
      ({ data: conv, error } = await supabase.from("conversations_groupes").insert(sansColonne).select().single());
    }
    if (error) {
      if (tableAbsente(error)) {
        return res.status(503).json({ error: "Les groupes de discussion ne sont pas encore activés sur cette base." });
      }
      throw error;
    }

    const lignes = [
      { conversation_id: conv.id, user_id: moi, role: "admin", ajoute_par: moi },
      ...valides.map(id => ({ conversation_id: conv.id, user_id: id, role: "membre", ajoute_par: moi })),
    ];
    const { error: e2 } = await supabase.from("conversation_membres").insert(lignes);
    if (e2) {
      // Une conversation sans son créateur serait inaccessible à tout le monde, y compris
      // à lui : mieux vaut ne rien laisser qu'un groupe fantôme que personne ne peut ouvrir.
      await supabase.from("conversations_groupes").delete().eq("id", conv.id);
      throw e2;
    }

    // Le créateur ne se notifie pas lui-même : il sait qu'il vient de créer le groupe.
    await prevenirAjoutes(valides, { conversation: conv, auteur: req.profil });

    res.status(201).json({
      conversation: { ...conv, nb_membres: lignes.length, je_suis_admin: true, doc_firestore: docFirestore(conv.id) },
      refuses,
    });
  } catch (err) {
    console.error("[conversations POST]", err.message || err);
    res.status(500).json({ error: err.message || "Création impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   MEMBRES
══════════════════════════════════════════════════════════════ */

router.get("/:id/membres", authenticateUser, async (req, res) => {
  try {
    const ctx = await contexte(req.params.id, req.profil?.id);
    // 404 et non 403 : « ce groupe existe mais pas pour vous » est déjà une information.
    // Le superviseur global y accède sans être membre - c'est la capacité de supervision.
    const supervise = ROLES_SUPERVISION.includes(req.role);
    if (!ctx || (!ctx.moi && !supervise)) return res.status(404).json({ error: "Conversation introuvable" });

    const ids = ctx.membres.map(m => m.user_id);
    const { data: gens } = ids.length
      ? await supabase.from("utilisateurs").select("id, prenom, nom, email, role, avatar_url").in("id", ids)
      : { data: [] };
    const par = Object.fromEntries((gens || []).map(u => [u.id, u]));

    res.json({
      conversation: { ...ctx.conv, doc_firestore: docFirestore(ctx.conv.id) },
      je_suis_admin: ctx.estAdmin,
      membres: ctx.membres.map(m => ({
        ...m,
        // Un compte supprimé depuis laisse sa ligne d'appartenance : on le dit plutôt
        // que d'afficher une entrée vide que personne ne sait interpréter.
        utilisateur: par[m.user_id] || null,
        nom_complet: par[m.user_id] ? nomDe(par[m.user_id]) : "Compte supprimé",
      })).sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : a.nom_complet.localeCompare(b.nom_complet))),
    });
  } catch (err) {
    console.error("[conversations membres GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.post("/:id/membres", authenticateAdmin, async (req, res) => {
  try {
    const ctx = await contexte(req.params.id, req.profil?.id);
    /* La direction LIT tous les groupes mais n'en administre aucun : lui répondre
       « Conversation introuvable » serait faux - elle vient de la consulter. On distingue
       donc le non-membre ordinaire, à qui l'existence du groupe ne doit rien révéler, de
       la direction, à qui on explique la vraie raison du refus. */
    const supervise = ROLES_SUPERVISION.includes(req.role);
    if (!ctx || (!ctx.moi && !supervise)) return res.status(404).json({ error: "Conversation introuvable" });
    if (!ctx.estAdmin) {
      return res.status(403).json({
        error: supervise
          ? "La supervision donne la lecture, pas l'administration. Seul le créateur du groupe peut en ajouter les membres."
          : "Seul le créateur du groupe peut ajouter des membres.",
      });
    }

    const demandes = [...new Set((Array.isArray(req.body?.membres) ? req.body.membres : []).filter(Boolean))];
    if (!demandes.length) return res.status(400).json({ error: "Aucune personne sélectionnée." });

    const deja = new Set(ctx.membres.map(m => m.user_id));
    const { data: trouves } = await supabase
      .from("utilisateurs").select("id, role, actif").in("id", demandes);

    // Le groupe décide : un apprenant n'entre que dans un groupe ouvert aux apprenants.
    const valides = (trouves || [])
      .filter(u => u.actif && !roleRefuse(u.role, ctx.conv) && !deja.has(u.id))
      .map(u => u.id);
    if (!valides.length) {
      return res.status(409).json({ error: "Ces personnes sont déjà dans le groupe, ou ne peuvent pas y être ajoutées." });
    }

    const { error } = await supabase.from("conversation_membres").insert(
      valides.map(id => ({ conversation_id: ctx.conv.id, user_id: id, role: "membre", ajoute_par: req.profil.id })),
    );
    if (error) throw error;

    await supabase.from("conversations_groupes")
      .update({ updated_at: new Date().toISOString() }).eq("id", ctx.conv.id);

    await prevenirAjoutes(valides, { conversation: ctx.conv, auteur: req.profil });

    res.json({ ajoutes: valides.length, ignores: demandes.length - valides.length });
  } catch (err) {
    console.error("[conversations membres POST]", err.message || err);
    res.status(500).json({ error: "Ajout impossible" });
  }
});

router.delete("/:id/membres/:userId", authenticateAdmin, async (req, res) => {
  try {
    const ctx = await contexte(req.params.id, req.profil?.id);
    const supervise = ROLES_SUPERVISION.includes(req.role);
    if (!ctx || (!ctx.moi && !supervise)) return res.status(404).json({ error: "Conversation introuvable" });
    if (!ctx.estAdmin) {
      return res.status(403).json({
        error: supervise
          ? "La supervision donne la lecture, pas l'administration. Seul le créateur du groupe peut en retirer un membre."
          : "Seul le créateur du groupe peut retirer un membre.",
      });
    }
    if (req.params.userId === ctx.conv.cree_par) {
      // Retirer le créateur laisserait un groupe sans administrateur, donc impossible à
      // gérer et impossible à fermer. L'archivage est la sortie prévue.
      return res.status(409).json({
        error: "Le créateur ne peut pas être retiré. Archivez le groupe s'il n'a plus lieu d'être.",
      });
    }

    const { error } = await supabase.from("conversation_membres")
      .delete().eq("conversation_id", ctx.conv.id).eq("user_id", req.params.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[conversations membres DELETE]", err.message || err);
    res.status(500).json({ error: "Retrait impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   RENOMMER / ARCHIVER
══════════════════════════════════════════════════════════════ */

router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const ctx = await contexte(req.params.id, req.profil?.id);
    if (!ctx || !ctx.moi) return res.status(404).json({ error: "Conversation introuvable" });
    if (!ctx.estAdmin) return res.status(403).json({ error: "Seul le créateur du groupe peut le modifier." });

    const maj = { updated_at: new Date().toISOString() };
    if (req.body.nom !== undefined) {
      const titre = String(req.body.nom).trim();
      if (titre.length < 2 || titre.length > 80) {
        return res.status(400).json({ error: "Le nom doit faire entre 2 et 80 caractères." });
      }
      maj.nom = titre;
    }
    if (req.body.description !== undefined) maj.description = req.body.description?.trim() || null;
    if (req.body.photo_url !== undefined) {
      const photo = photoValide(req.body.photo_url);
      if (photo === undefined) return res.status(400).json({ error: "Photo de groupe invalide." });
      maj.photo_url = photo;   // `null` retire la photo, l'écran retombe sur les initiales
    }
    if (req.body.archive !== undefined) {
      maj.archive = !!req.body.archive;
      maj.archive_le = maj.archive ? new Date().toISOString() : null;
    }

    let { data, error } = await supabase
      .from("conversations_groupes").update(maj).eq("id", ctx.conv.id).select().single();
    /* La colonne `photo_url` peut ne pas exister encore - le SQL est livré à part et
       s'exécute quand l'équipe le décide. Plutôt qu'un « Modification impossible » qui
       ferait aussi perdre le renommage demandé dans le même appel, on rejoue sans la
       photo et on le DIT : l'écran saura pourquoi l'image n'est pas apparue. */
    let photoIgnoree = false;
    if (error && maj.photo_url !== undefined && tableAbsente(error)) {
      const { photo_url: _sansPhoto, ...reste } = maj;
      photoIgnoree = true;
      ({ data, error } = await supabase
        .from("conversations_groupes").update(reste).eq("id", ctx.conv.id).select().single());
    }
    if (error) throw error;
    if (photoIgnoree) {
      return res.json({
        conversation: { ...data, doc_firestore: docFirestore(data.id) },
        photo_non_enregistree: "La photo de groupe n'est pas encore installée sur cette base (Backend/sql/photo_groupes_chat.sql).",
      });
    }
    res.json({ conversation: { ...data, doc_firestore: docFirestore(data.id) } });
  } catch (err) {
    console.error("[conversations PATCH]", err.message || err);
    res.status(500).json({ error: "Modification impossible" });
  }
});

export default router;
