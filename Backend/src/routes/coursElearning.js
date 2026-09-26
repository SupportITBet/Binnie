import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyRole, ROLES_SUPERVISION_GLOBALE, notifyDeputiesDuCoach } from "../services/notifyRole.js";
import { envoyerEmailPublication } from "../services/emailPublication.js";
import { staffDesClasses } from "../services/staffDesClasses.js";
import { calculerVerrous, MOTIF } from "../services/lectureSequentielle.js";

/**
 * Médiathèque du coach - un contenu, plusieurs classes.
 *
 * Le modèle comptait trois niveaux : un Cours rattaché à UNE classe, contenant des
 * Modules, contenant des blocs. Deux conséquences, l'une pédagogique et l'autre technique :
 *
 *  • un coach enseignant le même B1 à trois classes devait créer trois fois le même
 *    contenu. Une fonction « Dupliquer vers une autre classe » avait été ajoutée pour
 *    contourner ce point - elle copiait le module, si bien que corriger une faute
 *    obligeait à la corriger dans chaque copie ;
 *  • le niveau Cours n'apportait rien qu'un titre et une couleur : il forçait deux
 *    assistants de création et deux niveaux d'imbrication pour déposer un PDF.
 *
 * Le niveau Cours est donc supprimé. Le CONTENU (`modules_elearning`) devient l'entité
 * racine : il appartient à un coach, et il est publié vers autant de classes qu'on veut
 * via `groupe_ids`. La duplication disparaît avec la limite qui la justifiait.
 *
 * La migration a été faite à vide (0 cours, 0 module, 0 progression en base), donc sans
 * aucune reprise de données. La colonne `cours_id` subsiste mais n'est plus renseignée.
 *
 * Le chemin de montage `/api/cours-elearning` est conservé : c'est un nom, cinq écrans
 * l'appellent, et le renommer n'apporterait rien de fonctionnel.
 */

const router = express.Router();

/** Projection d'un contenu vers le format attendu par les écrans. */
const mapContenu = (m, groupeNomMap = {}) => {
  const ids = m.groupe_ids || [];
  return {
    id:           m.id,
    titre:        m.titre || m.nom || "",
    nom:          m.titre || m.nom || "",   // compat : certains écrans lisent `nom`
    statut:       m.statut || "brouillon",
    publie:       m.statut === "publie",
    blocs:        m.blocs || [],
    objectifs:    m.objectifs || [],
    dureeEstimee: m.duree_estimee || 60,
    duree_estimee: m.duree_estimee || 60,
    ordre:        m.ordre || 1,
    semaine:      m.semaine || "",
    type_contenu: m.type_contenu || "lecon",
    coach_id:     m.coach_id || null,
    groupe_ids:   ids,
    groupe_noms:  ids.map((id) => groupeNomMap[id]).filter(Boolean),
    created_at:   m.created_at || null,
    updated_at:   m.updated_at || null,
    // Faux par defaut : une base pas encore migree ne doit verrouiller personne.
    lecture_sequentielle: m.lecture_sequentielle === true,
  };
};

/** Résout les noms de classes pour un lot de contenus, en une requête. */
const resoudreNomsClasses = async (contenus) => {
  const ids = [...new Set((contenus || []).flatMap((m) => m.groupe_ids || []))];
  if (!ids.length) return {};
  const { data } = await supabase.from("groupes").select("id, nom").in("id", ids);
  const map = {};
  (data || []).forEach((g) => { map[g.id] = g.nom; });
  return map;
};

/**
 * Prévient les intéressés qu'un contenu est publié.
 *
 * Un contenu vise désormais plusieurs classes : la notification part vers les apprenants
 * de CHACUNE d'elles, et vers la commerciale qui a créé chaque classe. Les rôles de suivi
 * (PA, onboarding, e-learning) ne sont prévenus qu'une fois, quel que soit le nombre de
 * classes - sans quoi publier vers cinq classes leur enverrait cinq fois le même message.
 */
/**
 * Le nom d'un coach, pour nommer l'auteur d'une publication.
 *
 * À la CRÉATION, l'auteur est l'appelant : son nom est déjà dans `req.profil`. À la mise à
 * jour, la publication peut venir d'un autre écran que celui du coach - un conseil
 * pédagogique qui publie un brouillon, par exemple - et il faut alors le lire.
 */
const nomDuCoach = async (coachId) => {
  if (!coachId) return "";
  const { data } = await supabase
    .from("utilisateurs").select("prenom, nom").eq("id", coachId).maybeSingle();
  return [data?.prenom, data?.nom].filter(Boolean).join(" ").trim();
};

const notifierPublication = async ({ titre, contenuId, groupeIds = [], coachId = null, coachNom = "" }) => {
  try {
    const court = titre?.length > 60 ? titre.slice(0, 57) + "…" : titre;
    const notifTitre = `📦 Nouveau contenu publié : ${court}`;
    const notifMsg   = `Le contenu « ${court} » a été publié par votre formateur.`;
    const meta = { contenu_id: contenuId, groupe_ids: groupeIds, coach_id: coachId };
    const inserts = [];

    /* LE SUPERVISEUR GÉNÉRAL était absent de cette liste. Il contrôle le travail
       pédagogique des coachs : ne pas le prévenir d'une publication le privait
       précisément de ce qu'il est censé surveiller. Son message nomme le coach, là où
       celui des apprenants dit « votre formateur » - il en suit cent quatre-vingt-neuf. */
    for (const role of ROLES_SUPERVISION_GLOBALE) {
      const { data: us } = await supabase
        .from("utilisateurs").select("id").eq("role", role).eq("actif", true);
      (us || []).forEach((u) => inserts.push({
        user_id: u.id, type: "cours", lu: false, meta,
        titre: notifTitre,
        message: `${coachNom || "Un coach"} a publié « ${court} »${groupeIds.length ? ` pour ${groupeIds.length} classe(s)` : ""}.`,
      }));
    }

    for (const role of ["pedagogical_advisor", "onboarding", "admin_elearning"]) {
      const { data: us } = await supabase
        .from("utilisateurs").select("id").eq("role", role).eq("actif", true);
      (us || []).forEach((u) =>
        inserts.push({ user_id: u.id, type: "cours", titre: notifTitre, message: notifMsg, lu: false, meta }));
    }

    if (groupeIds.length) {
      // L'assistante qui SUIT chaque apprenant, et pas seulement celle qui a créé la
      // classe : la seconde pouvait n'avoir plus aucun dossier dans le groupe, pendant
      // que celle qui en suit six n'était jamais prévenue.
      const staff = await staffDesClasses(groupeIds);
      staff.forEach((uid) =>
        inserts.push({ user_id: uid, type: "cours_publie", titre: notifTitre, message: notifMsg, lu: false, meta }));

      const { data: gas } = await supabase
        .from("groupes_apprenants").select("apprenant_id")
        .in("groupe_id", groupeIds).eq("statut", "actif").not("apprenant_id", "is", null);
      const apprenants = [...new Set((gas || []).map((g) => g.apprenant_id))];
      apprenants.forEach((uid) =>
        inserts.push({ user_id: uid, type: "cours_publie", titre: "📚 Nouveau contenu disponible !", message: notifMsg, lu: false, meta }));
    }

    if (inserts.length) await supabase.from("notifications").insert(inserts);

    /* Les DEPUTYS, eux, sont filtrés : seuls ceux qui suivent réellement CE coach - une
       mission en cours ou une observation déjà faite. Les prévenir tous reviendrait à
       leur envoyer les publications de cent quatre-vingt-neuf coachs, et la notification
       cesserait d'être lue. C'est la même règle que sur les autres événements coach. */
    if (coachId) {
      await notifyDeputiesDuCoach(coachId, {
        type: "cours",
        titre: notifTitre,
        message: `${coachNom || "Le coach que vous suivez"} a publié « ${court} »${groupeIds.length ? ` pour ${groupeIds.length} classe(s)` : ""}.`,
        meta,
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[notifierPublication]", e.message);
  }
};

/* ─────────────────────────────────────────────────────────────
   GET /api/cours-elearning            - contenus du coach connecté
   GET /api/cours-elearning?coach_id=  - contenus d'un coach (PA, onboarding, superviseur)
   Filtre optionnel ?groupe_id= - les contenus visant cette classe.
───────────────────────────────────────────────────────────── */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.query.coach_id || req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Profil introuvable" });

    let q = supabase
      .from("modules_elearning")
      .select("*")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });

    // `contains` et non `overlaps` : on veut les contenus qui visent CETTE classe,
    // qu'ils en visent d'autres ou non.
    if (req.query.groupe_id) q = q.contains("groupe_ids", [req.query.groupe_id]);

    const { data, error } = await q;
    if (error) {
      console.error("[contenus GET]", error.message);
      return res.status(500).json({ error: error.message });
    }

    const noms = await resoudreNomsClasses(data);
    res.json({ contenus: (data || []).map((m) => mapContenu(m, noms)) });
  } catch (e) {
    console.error("[contenus GET] inattendu:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/cours-elearning/pour-apprenant  - via user_token
   Les contenus publiés vers l'une des classes de l'apprenant.
───────────────────────────────────────────────────────────── */
router.get("/pour-apprenant", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    // Le rattachement se fait par identifiant OU par email : les deux coexistent en base
    // selon que l'apprenant a été importé ou inscrit en ligne.
    // Les DATES sont chargees ici : c'est la fenetre de presence de l'apprenant dans
    // chaque classe qui decide de ce qu'il peut consulter, pas la classe elle-meme.
    // `note` porte les PERIODES de presence - indispensable a `calculerVerrous` pour qu'un
    // apprenant parti puis revenu ne recupere pas les cours parus pendant son absence.
    const GA_SELECT = "groupe_id, statut, date_ajout, date_retrait, note, groupes(id, nom, filiere)";
    const [parId, parEmail] = await Promise.all([
      supabase.from("groupes_apprenants").select(GA_SELECT).eq("apprenant_id", user.id),
      supabase.from("groupes_apprenants").select(GA_SELECT).ilike("email_apprenant", user.email),
    ]);

    const vus = new Set();
    const gaRows = [...(parId.data || []), ...(parEmail.data || [])].filter((r) => {
      if (!r.groupe_id || vus.has(r.groupe_id)) return false;
      vus.add(r.groupe_id);
      return true;
    });

    const groupeIds = gaRows.map((g) => g.groupe_id).filter(Boolean);
    if (!groupeIds.length) return res.json({ contenus: [] });

    // `overlaps` : un contenu visant PLUSIEURS classes doit remonter dès qu'il en touche
    // une des siennes. C'est toute la raison d'être de `groupe_ids`.
    const { data, error } = await supabase
      .from("modules_elearning")
      .select("*")
      .overlaps("groupe_ids", groupeIds)
      .eq("statut", "publie")
      /* `created_at` ASCENDANT - la MÊME clé que la séquence de déverrouillage.
         Le tri portait sur `ordre`, colonne qui vaut 1 pour tous les modules : Postgres
         rendait donc les lignes dans un ordre arbitraire, et l'apprenant voyait ses cours
         mélangés pendant qu'ils s'ouvraient chronologiquement. Le troisième pouvait
         s'afficher en premier, verrouillé, sans qu'on comprenne pourquoi. */
      .order("created_at", { ascending: true });
    if (error) throw error;

    const coachIds = [...new Set((data || []).map((m) => m.coach_id).filter(Boolean))];
    const coachMap = {};
    if (coachIds.length) {
      const { data: coachs } = await supabase
        .from("utilisateurs").select("id, nom, prenom").in("id", coachIds);
      (coachs || []).forEach((c) => { coachMap[c.id] = `${c.prenom || ""} ${c.nom || ""}`.trim(); });
    }

    const noms = await resoudreNomsClasses(data);

    /* Le verrou est applique ICI, cote serveur, et les BLOCS d'un contenu verrouille ne
       sont pas envoyes : un verrou seulement visuel se contourne en lisant la reponse
       reseau. Le contenu doit etre absent de la charge utile, pas seulement grise. */
    const verrous = await calculerVerrous(user.id, gaRows, data || []);

    const contenus = (data || []).map((m) => {
      const v = verrous[m.id] || { verrouille: false, motif: null, bloque_par: null, lu: false };
      const base = { ...mapContenu(m, noms), coach_nom: coachMap[m.coach_id] || "" };
      if (!v.verrouille) return { ...base, verrouille: false, motif: null, bloque_par: null, lu: !!v.lu };
      return {
        ...base,
        blocs: [],
        objectifs: [],
        // Un contenu verrouillé n'est jamais lu, mais on renvoie le champ pour que
        // l'écran n'ait pas à traiter son absence comme un cas particulier.
        lu: false,
        // Le titre et le nombre de parties restent visibles : l'apprenant doit savoir
        // ce qui l'attend et pourquoi c'est ferme, sinon le verrou parait arbitraire.
        nb_blocs_caches: (m.blocs || []).length,
        verrouille: true,
        motif: v.motif,
        bloque_par: v.bloque_par,
      };
    })
    // Les contenus publies APRES le depart de l'apprenant ne sont pas grises : ils
    // DISPARAISSENT. Montrer a quelqu'un qui est parti la liste des cours qu'il n'aura
    // jamais n'informe personne. Un contenu publie avant son arrivee, lui, reste
    // visible et grise - la il y a quelque chose a comprendre.
    // `pendant_absence` (parti puis revenu) reste VISIBLE pour la meme raison : c'est
    // exactement ce qu'il a manque, et il doit pouvoir le constater.
    .filter((c) => c.motif !== MOTIF.APRES_DEPART);

    const nbVerr = contenus.filter(c => c.verrouille).length;
    console.log(`[pour-apprenant] ${contenus.length} contenu(s) - classes ${groupeIds.join(",")} - ${nbVerr} verrouille(s)`);
    res.json({ contenus });
  } catch (e) {
    console.error("[pour-apprenant]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/cours-elearning/pour-commercial
   Les contenus publiés vers les classes créées par cette commerciale.
───────────────────────────────────────────────────────────── */
router.get("/pour-commercial", authenticateAdmin, async (req, res) => {
  try {
    const userId = req.profil?.id;
    if (!userId) return res.status(401).json({ error: "Profil introuvable" });

    const { data: groupes } = await supabase
      .from("groupes").select("id, nom").eq("created_by", userId);
    const groupeIds = (groupes || []).map((g) => g.id);
    if (!groupeIds.length) return res.json({ contenus: [] });

    const { data, error } = await supabase
      .from("modules_elearning")
      .select("*")
      .overlaps("groupe_ids", groupeIds)
      .eq("statut", "publie")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const coachIds = [...new Set((data || []).map((m) => m.coach_id).filter(Boolean))];
    const coachMap = {};
    if (coachIds.length) {
      const { data: coachs } = await supabase
        .from("utilisateurs").select("id, nom, prenom").in("id", coachIds);
      (coachs || []).forEach((c) => { coachMap[c.id] = `${c.prenom || ""} ${c.nom || ""}`.trim(); });
    }

    const noms = await resoudreNomsClasses(data);
    res.json({
      contenus: (data || []).map((m) => ({ ...mapContenu(m, noms), coach_nom: coachMap[m.coach_id] || "" })),
    });
  } catch (e) {
    console.error("[pour-commercial]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/cours-elearning/:id/lecteurs
   Qui a lu ce contenu - et surtout qui ne l'a pas encore ouvert.

   La donnée existait déjà : le bouton « Marquer comme terminé » de
   l'espace apprenant écrit dans `contenus_lus` depuis longtemps. Mais
   rien ne la restituait au coach, qui publiait donc sans jamais savoir
   si quelqu'un avait ouvert.

   Les DEUX listes comptent. Savoir que « 4 ont lu » n'aide pas à
   relancer ; savoir QUI n'a pas ouvert, si.
───────────────────────────────────────────────────────────── */
router.get("/:id/lecteurs", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: contenu } = await supabase
      .from("modules_elearning").select("id, titre, groupe_ids, coach_id").eq("id", id).maybeSingle();
    if (!contenu) return res.status(404).json({ error: "Contenu introuvable" });

    const groupeIds = contenu.groupe_ids || [];
    if (!groupeIds.length) {
      return res.json({ titre: contenu.titre, lecteurs: [], en_attente: [], total: 0, lus: 0 });
    }

    const [{ data: gas }, { data: lus }, { data: groupes }] = await Promise.all([
      supabase.from("groupes_apprenants")
        .select("apprenant_id, email_apprenant, groupe_id")
        .in("groupe_id", groupeIds).eq("statut", "actif"),
      supabase.from("contenus_lus").select("apprenant_id, classe_id, lu_le").eq("contenu_id", id),
      supabase.from("groupes").select("id, nom").in("id", groupeIds),
    ]);

    const nomClasse = {};
    (groupes || []).forEach((g) => { nomClasse[g.id] = g.nom; });

    const ids = [...new Set((gas || []).map((g) => g.apprenant_id).filter(Boolean))];
    const profils = {};
    if (ids.length) {
      const { data: us } = await supabase
        .from("utilisateurs").select("id, nom, prenom, email").in("id", ids);
      (us || []).forEach((u) => { profils[u.id] = u; });
    }

    // Une lecture par apprenant : un contenu publié vers trois classes ne doit pas
    // compter trois fois pour qui appartiendrait à deux d'entre elles.
    const luPar = {};
    (lus || []).forEach((l) => {
      if (!luPar[l.apprenant_id] || l.lu_le < luPar[l.apprenant_id]) luPar[l.apprenant_id] = l.lu_le;
    });

    const lecteurs = [];
    const enAttente = [];
    const vus = new Set();
    for (const ga of gas || []) {
      const cle = ga.apprenant_id || ga.email_apprenant;
      if (!cle || vus.has(cle)) continue;
      vus.add(cle);
      const u = profils[ga.apprenant_id] || {};
      const fiche = {
        apprenant_id: ga.apprenant_id || null,
        nom: `${u.prenom || ""} ${u.nom || ""}`.trim() || ga.email_apprenant || "Apprenant",
        email: u.email || ga.email_apprenant || null,
        classe: nomClasse[ga.groupe_id] || "-",
      };
      const le = luPar[ga.apprenant_id];
      if (le) lecteurs.push({ ...fiche, lu_le: le });
      else enAttente.push(fiche);
    }

    lecteurs.sort((a, b) => String(b.lu_le).localeCompare(String(a.lu_le)));
    enAttente.sort((a, b) => a.nom.localeCompare(b.nom));

    res.json({
      titre: contenu.titre,
      lecteurs, en_attente: enAttente,
      lus: lecteurs.length,
      total: lecteurs.length + enAttente.length,
    });
  } catch (e) {
    console.error("[lecteurs]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/cours-elearning  - crée un contenu
───────────────────────────────────────────────────────────── */
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Profil coach introuvable" });

    const { titre, objectifs, duree_estimee, statut, blocs, semaine, type_contenu, ordre } = req.body;
    if (!titre?.trim()) return res.status(400).json({ error: "Titre requis" });

    // On accepte `groupe_ids` (nouveau) et `groupe_id` (ancien appelant) : un client pas
    // encore redéployé continue de fonctionner, avec une seule classe.
    const groupeIds = Array.isArray(req.body.groupe_ids)
      ? req.body.groupe_ids.filter(Boolean)
      : (req.body.groupe_id ? [req.body.groupe_id] : []);

    const payload = {
      coach_id:      coachId,
      titre:         titre.trim(),
      groupe_ids:    groupeIds,
      objectifs:     objectifs || [],
      duree_estimee: duree_estimee || 60,
      statut:        statut || "brouillon",
      blocs:         blocs || [],
      ordre:         ordre || 1,
      // Verrouille les contenus publies APRES celui-ci, dans les memes classes.
      lecture_sequentielle: req.body.lecture_sequentielle === true,
    };
    if (semaine)      payload.semaine      = semaine;
    if (type_contenu) payload.type_contenu = type_contenu;

    const { data, error } = await supabase
      .from("modules_elearning").insert(payload).select().single();
    if (error) {
      console.error("[contenu POST]", error.message);
      return res.status(500).json({ error: error.message });
    }

    const noms = await resoudreNomsClasses([data]);
    res.json({ contenu: mapContenu(data, noms) });

    // Après la réponse : la notification ne doit pas retarder l'écran du coach. Elle est
    // tout de même attendue (await) pour ne pas être coupée par la fin de la requête en
    // environnement serverless.
    const coachNom = [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ") || "Un coach";
    await notifyRole(["assistant_elearning", "admin_elearning", "onboarding"], {
      type: "cours",
      titre: `📦 Nouveau contenu créé : ${data.titre}`,
      message: `${coachNom} a créé « ${data.titre} »${groupeIds.length ? ` pour ${groupeIds.length} classe(s)` : ""}.`,
      meta: { contenu_id: data.id, groupe_ids: groupeIds },
    }).catch(() => {});

    if (data.statut === "publie") {
      await notifierPublication({ titre: data.titre, contenuId: data.id, groupeIds, coachId: data.coach_id, coachNom });
      if (req.body.envoyer_email) {
        await envoyerEmailPublication({
          ressourceType: "contenu",
          ressourceId: data.id,
          titre: `📚 Nouveau contenu : ${data.titre}`,
          message: `Votre formateur a publié « ${data.titre} ». Retrouvez-le dès maintenant dans votre espace.`,
          groupeIds,
          acteurId: coachId,
        });
      }
    }
  } catch (e) {
    console.error("[contenu POST] inattendu:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/cours-elearning/:id  - modifie un contenu
───────────────────────────────────────────────────────────── */
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const { id } = req.params;

    const { data: avant } = await supabase
      .from("modules_elearning").select("coach_id, statut").eq("id", id).maybeSingle();
    if (!avant) return res.status(404).json({ error: "Contenu introuvable" });
    // Un coach ne modifie que ses propres contenus ; les rôles de suivi peuvent corriger.
    if (avant.coach_id !== coachId && req.role === "coach") {
      return res.status(403).json({ error: "Ce contenu ne vous appartient pas" });
    }

    const update = {};
    for (const champ of ["titre", "objectifs", "duree_estimee", "statut", "blocs", "ordre", "semaine", "type_contenu", "lecture_sequentielle"]) {
      if (req.body[champ] !== undefined) update[champ] = req.body[champ];
    }
    if (Array.isArray(req.body.groupe_ids)) update.groupe_ids = req.body.groupe_ids.filter(Boolean);
    else if (req.body.groupe_id !== undefined) update.groupe_ids = req.body.groupe_id ? [req.body.groupe_id] : [];

    /* UN CONTENU A TOUJOURS AU MOINS UNE CLASSE. Sans destinataire il n'est lu par
       personne, n'apparaît dans aucune médiathèque - qui filtre par classe - et devient
       introuvable, y compris pour son auteur. La règle est posée ici, et pas seulement à
       l'écran : le cas dangereux n'est pas la création, c'est le RETRAIT de la dernière
       classe d'un contenu déjà publié, qui le ferait disparaître sous les apprenants en
       train de le lire. */
    if (update.groupe_ids && update.groupe_ids.length === 0) {
      return res.status(400).json({ error: "Un contenu doit rester rattaché à au moins une classe." });
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: "Aucune modification" });

    const { data, error } = await supabase
      .from("modules_elearning").update(update).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    const noms = await resoudreNomsClasses([data]);
    res.json({ contenu: mapContenu(data, noms) });

    // La notification ne part qu'au PASSAGE en publié : republier un contenu déjà publié
    // après une correction de virgule ne doit pas réalerter toutes les classes.
    if (avant.statut !== "publie" && data.statut === "publie") {
      await notifierPublication({ titre: data.titre, contenuId: data.id, groupeIds: data.groupe_ids || [], coachId: data.coach_id, coachNom: await nomDuCoach(data.coach_id) });
      // L'email ne part qu'une fois par contenu : le service refuse tout second envoi,
      // quel que soit le nombre de dépublications/republications.
      if (req.body.envoyer_email) {
        await envoyerEmailPublication({
          ressourceType: "contenu",
          ressourceId: data.id,
          titre: `📚 Nouveau contenu : ${data.titre}`,
          message: `Votre formateur a publié « ${data.titre} ». Retrouvez-le dès maintenant dans votre espace.`,
          groupeIds: data.groupe_ids || [],
          acteurId: coachId,
        });
      }
    }
  } catch (e) {
    console.error("[contenu PATCH]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   DELETE /api/cours-elearning/:id
───────────────────────────────────────────────────────────── */
router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.profil?.id;
    const { id } = req.params;

    const { data: avant } = await supabase
      .from("modules_elearning").select("coach_id").eq("id", id).maybeSingle();
    if (!avant) return res.status(404).json({ error: "Contenu introuvable" });
    if (avant.coach_id !== coachId && req.role === "coach") {
      return res.status(403).json({ error: "Ce contenu ne vous appartient pas" });
    }

    const { error } = await supabase.from("modules_elearning").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error("[contenu DELETE]", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
