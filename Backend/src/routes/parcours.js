import express from "express";
import supabase from "../config/supabase.js";
import { marquerPriseEnCharge, marquerConverti, cycleALaCreation } from "../services/cycleProspect.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { notifyUser, notifyRole, notifyOnboarding } from "../services/notifyRole.js";
import { suspendrePlan, reprendrePlan, periodeDe } from "../services/planPaiement.js";

const router = express.Router();
console.log("✅ Route parcours chargée");

// ── Helpers ──────────────────────────────────────────────────

// Compte les assignations d'aujourd'hui pour chaque assistante
async function getQuotasAujourdHui() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("assignations_parcours")
    .select("assistante_id")
    .gte("created_at", today.toISOString());
  const counts = {};
  (data || []).forEach(a => {
    counts[a.assistante_id] = (counts[a.assistante_id] || 0) + 1;
  });
  return counts;
}

// Détermine si aujourd'hui est semaine ou weekend
function typeSemaineAujourdhui() {
  const day = new Date().getDay(); // 0=dim, 6=sam
  return day === 0 || day === 6 ? "weekend" : "semaine";
}

// Retourne le nom du jour courant en français
function jourAujourdhui() {
  const jours = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
  return jours[new Date().getDay()];
}

// Enrichit photo_url avec avatar_url de la table utilisateurs si absent
async function mergeAvatarUrls(list) {
  const sans = list.filter(a => !a.photo_url && a.email);
  if (!sans.length) return list;
  const emails = sans.map(a => a.email);
  const { data: users } = await supabase
    .from("utilisateurs")
    .select("email, avatar_url")
    .in("email", emails);
  const map = {};
  (users || []).forEach(u => { if (u.avatar_url) map[u.email] = u.avatar_url; });
  return list.map(a => (!a.photo_url && map[a.email]) ? { ...a, photo_url: map[a.email] } : a);
}

// ── GET /api/parcours/assistantes-ligne ──────────────────────
// Retourne les assistantes disponibles pour le cours en ligne
// Query: ?type_coaching=groupe|prive
router.get("/assistantes-ligne", async (req, res) => {
  try {
    const { profil } = req.query; // optionnel : "b2c" | "b2b" | "les_deux"

    let query = supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, photo_url, quota_jour, jours_travail, profil")
      .eq("actif", true)
      .in("type_cours", ["en_ligne", "les_deux"])
      .order("created_at", { ascending: true });

    if (profil) {
      query = query.in("profil", [profil, "les_deux"]);
    }

    let { data: assistantes, error } = await query;

    if (error) throw error;

    if (profil === "b2b") {
      console.log(`[B2B] assistantes trouvées dans la table: ${(assistantes||[]).length}`, (assistantes||[]).map(a => `${a.prenom} ${a.nom} <${a.email}> profil=${a.profil} actif`));
      // Répartition équitable : le formulaire entreprise prend toujours assistantes[0]
      // pour auto-assigner (comme /assistantes-pa) - sans ce tri par charge du jour,
      // tout le trafic B2B atterrissait sur la première assistante b2b créée, les
      // autres n'en recevant jamais (constaté : sarah tatiana ne recevait rien).
      const quotas = await getQuotasAujourdHui();
      assistantes = [...(assistantes || [])].sort((a, b) => {
        const qa = quotas[a.id] || 0, qb = quotas[b.id] || 0;
        return qa - qb;
      });
    }

    const enriched = await mergeAvatarUrls(assistantes || []);
    res.json({ assistantes: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes-pa ─────────────────────────
// Retourne les assistantes de profil "pa" (Pedagogical Advisor)
// utilisé par le formulaire domicile pour auto-assigner le prospect
router.get("/assistantes-pa", async (req, res) => {
  try {
    const { data: assistantes, error } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, photo_url")
      .eq("actif", true)
      .eq("profil", "pa")
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Répartition équitable : le frontend prend toujours assistantes[0] pour
    // auto-assigner - sans ce tri, tout le trafic atterrissait sur le premier
    // PA créé. On trie par charge du jour croissante (le moins chargé en tête).
    const quotas = await getQuotasAujourdHui();
    const tries = [...(assistantes || [])].sort((a, b) => {
      const qa = quotas[a.id] || 0, qb = quotas[b.id] || 0;
      return qa - qb;
    });

    const enriched = await mergeAvatarUrls(tries);
    res.json({ assistantes: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes-presentiel/:centreId ───────
// ?liste=true → retourne toutes les assistantes disponibles (pour affichage liste)
// Sans paramètre  → retourne 1 assistante via rotation (comportement ParcoursModal)
router.get("/assistantes-presentiel/:centreId", async (req, res) => {
  try {
    const { centreId } = req.params;
    const { liste, tous } = req.query;
    const aujourd = jourAujourdhui();
    const joursWeekend = ["samedi", "dimanche"];
    const estWeekend = joursWeekend.includes(aujourd);
    const periodeJour = estWeekend ? "weekend" : "semaine";

    const { data: assistantes, error } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, photo_url, quota_jour, jours_travail")
      .eq("actif", true)
      .eq("centre_id", centreId)
      .in("type_cours", ["presentiel", "les_deux"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    const enriched = await mergeAvatarUrls(assistantes || []);
    res.json({
      assistantes: enriched,
      assistante:  enriched[0] || null,
      periode: periodeJour,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes-domicile ────────────────────
// Coaching privé À DOMICILE : géré par les assistantes présentielles (comme le
// coaching privé au cabinet), jamais par les assistantes en ligne - un coach se
// déplace physiquement, ça n'a rien à voir avec le canal en ligne. Contrairement
// à /assistantes-presentiel/:centreId, le client ne choisit aucun centre pour le
// domicile (il n'a pas à savoir de quel centre part le coach), donc cette route
// liste les assistantes présentielles de TOUS les centres, avec le nom du centre
// affiché pour information.
router.get("/assistantes-domicile", async (req, res) => {
  try {
    const { data: assistantes, error } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, photo_url, quota_jour, jours_travail, centre_id, centres(nom)")
      .eq("actif", true)
      .in("type_cours", ["presentiel", "les_deux"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    const quotas = await getQuotasAujourdHui();
    const tries = [...(assistantes || [])].sort((a, b) => (quotas[a.id] || 0) - (quotas[b.id] || 0));

    const enriched = await mergeAvatarUrls(tries);
    res.json({ assistantes: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes ────────────────────────────
// Liste TOUTES les assistantes actives, tous canaux/centres confondus
// (réservé au staff - utilisé par le PA Advisor pour choisir à qui
// transférer un dossier hors de son périmètre habituel).
router.get("/assistantes", authenticateAdmin, async (req, res) => {
  try {
    const { data: assistantes, error } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, photo_url, profil, type_cours, centre_id, actif, centres(nom)")
      .eq("actif", true)
      .order("nom", { ascending: true });

    if (error) throw error;

    const enriched = await mergeAvatarUrls((assistantes || []).map(a => ({
      ...a, centre_nom: a.centres?.nom || null,
    })));
    res.json({ assistantes: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/centres ────────────────────────────────
// Liste des centres actifs avec le nombre d'assistantes dispo
router.get("/centres", async (req, res) => {
  try {
    const { data: centres, error } = await supabase
      .from("centres")
      .select("id, nom, ville, adresse")
      .eq("actif", true)
      .order("nom");
    if (error) throw error;
    res.json({ centres: centres || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/mon-assignation?email=xxx[&prenom_enfant=&nom_enfant=] ──
// Récupère la dernière assignation d'un prospect (public, par email). Pour un
// enfant, préciser prenom_enfant/nom_enfant scope sur CE dossier précis - sinon
// un parent avec plusieurs enfants récupérerait l'assignation du mauvais enfant.
router.get("/mon-assignation", async (req, res) => {
  const { email, prenom_enfant, nom_enfant } = req.query;
  if (!email) return res.status(400).json({ error: "email requis" });
  try {
    let query = supabase
      .from("assignations_parcours")
      .select("id, type_cours, type_coaching, statut, created_at, source, assistantes(id, nom, prenom, telephone, photo_url, email), centres(id, nom)")
      .ilike("prospect_email", email.trim())
      // Un dossier "archivé" (doublon consolidé par un PA après une alerte hors-canal)
      // ou "perdu" (abandonné côté commercial) ne doit plus jamais être celui renvoyé
      // ici - sinon le site public continue de pointer vers l'ancienne assistante/le
      // dossier périmé selon lequel des deux doublons est le plus récent, au lieu de
      // refléter la décision du PA (voir CommercialDashboard "Dossiers à réaffecter").
      .not("statut", "in", "(archivé,perdu)");

    if (prenom_enfant) query = query.ilike("prenom_enfant", prenom_enfant.trim());
    if (nom_enfant) query = query.ilike("nom_enfant", nom_enfant.trim());

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ assignation: null });

    // assistantes.id (utilisé pour l'affichage et pour créer une nouvelle assignation) est un
    // espace d'id totalement différent de utilisateurs.id (celui utilisé partout ailleurs comme
    // commercial_id : notifications, paiements, tests de niveau...) - résolu ici par email pour
    // que les appelants qui ont besoin du véritable identifiant du commercial (ex: FreeLevelTest,
    // qui posait par erreur assistante_id comme commercial_id d'un test) l'aient sans avoir à
    // refaire cette jointure eux-mêmes.
    // La photo suit le même chemin : l'avatar est téléversé depuis le dashboard, donc
    // écrit dans utilisateurs.avatar_url - assistantes.photo_url n'est jamais renseignée
    // (0 sur 25 en base). Sans ce repli, le chat affichait les initiales alors que la
    // photo existait bel et bien, une table plus loin. Même requête, une colonne de plus.
    let utilisateurId = null;
    let avatarUtilisateur = null;
    if (data.assistantes?.email) {
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("id, avatar_url")
        .ilike("email", data.assistantes.email)
        .maybeSingle();
      utilisateurId = u?.id || null;
      avatarUtilisateur = u?.avatar_url || null;
    }

    res.json({
      assignation: {
        assignation_id:    data.id,
        assistante_id:     data.assistantes?.id,
        utilisateur_id:    utilisateurId,
        assistante_prenom: data.assistantes?.prenom,
        assistante_nom:    data.assistantes?.nom,
        assistante_photo:  data.assistantes?.photo_url || avatarUtilisateur || null,
        assistante_tel:    data.assistantes?.telephone || null,
        type_cours:        data.type_cours,
        type_coaching:     data.type_coaching || null,
        centre_id:         data.centres?.id || null,
        centre_nom:        data.centres?.nom || null,
        date:              data.created_at,
        source:            data.source || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/parcours/assignation ───────────────────────────
// Crée une assignation prospect → assistante
/**
 * Coeur de la creation d'un dossier d'inscription.
 *
 * Extrait de la route POST /assignation (qui n'en est plus qu'une enveloppe) pour
 * que l'import en masse puisse l'appeler DIRECTEMENT, sans repasser par HTTP.
 * L'import creait auparavant ses dossiers en rappelant sa propre API depuis le
 * navigateur : 16 allers-retours par ligne. En appelant cette fonction, le serveur
 * fait le meme travail en un seul appel, avec exactement les memes regles
 * (resolution de l'onboarding, anti-doublon, liaison au compte apprenant, inserts
 * a repli multiple, notifications) -- aucune logique n'est dupliquee.
 *
 * @param   {object} body corps de requete, identique a celui de la route
 * @param   {object} ctx  { authorization } -- distingue un appel staff d'un appel public
 * @returns {{status:number, payload:object}} reponse HTTP a renvoyer telle quelle
 */
const __rep = (status, payload) => ({ status, payload });

async function creerAssignationCore(body, ctx = {}) {
  try {
    const {
      assistante_id,
      prospect_nom,
      prospect_email,
      prospect_telephone,
      type_cours,
      type_coaching,
      centre_id,
      source,
      inscription_offre,
      offre_label,        // alias envoyé par le frontend (CentresEnLigneModal)
      montant_paye,
      niveau_client,
      objectif_client,
      notes,
      profil_type,
      nom_parent,
      telephone_parent,
      email_parent,
      prenom_enfant,
      nom_enfant,
      age_enfant,
      niveau_classe_enfant,
      email_enfant,
      disponibilites,
      pack_coaching,
      lieu_coaching,
      formation_souhaitee,
      centre_coaching,
      adresse_coaching,
      date_debut_formation,
      routing_statut,
      statut: statutBody,
      code_promo,
      mensualite_negociee,
      formule_groupe,
    } = body;

    if (!prospect_nom || !type_cours) {
      return __rep(400, { error: "prospect_nom et type_cours sont requis" });
    }

    // Anti-doublon : un appel public (sans token staff) ne doit pas pouvoir
    // RÉASSIGNER un prospect à une AUTRE assistante pour un même type de service
    // qu'il a déjà (ex. rechoisir une assistante en_ligne/groupe différente).
    // Ça ne doit en revanche jamais bloquer l'achat d'une offre supplémentaire
    // (nouveau type_cours/type_coaching, ou même assistante) - le frontend
    // réutilise d'ailleurs automatiquement l'assistante déjà assignée dans ce cas.
    // Les appels authentifiés (commercial/onboarding/PA advisor) restent libres -
    // ce sont des transmissions de dossier volontaires entre rôles.
    // Pour un profil "enfant", prospect_email est l'email du PARENT : un même
    // parent peut légitimement inscrire plusieurs enfants, donc on scope la
    // vérification sur le couple parent + enfant, pas sur l'email seul.
    const isStaffCall = !!ctx.authorization;
    if (prospect_email && assistante_id) {
      let dupQuery = supabase
        .from("assignations_parcours")
        .select("id, prospect_nom, prospect_email, type_cours, statut, assistante_id, type_coaching, centre_id, statut_paiement, plan_paiement, created_at, assistantes(id, nom, prenom)")
        .ilike("prospect_email", prospect_email.trim())
        .eq("type_cours", type_cours)
        .not("statut", "in", "(annule,annulee,refuse,refusee)");

      if (type_coaching) dupQuery = dupQuery.eq("type_coaching", type_coaching);
      if (type_cours === "presentiel" && centre_id) dupQuery = dupQuery.eq("centre_id", centre_id);
      if (profil_type === "enfant") {
        if (prenom_enfant) dupQuery = dupQuery.ilike("prenom_enfant", prenom_enfant.trim());
        if (nom_enfant) dupQuery = dupQuery.ilike("nom_enfant", nom_enfant.trim());
      }

      const { data: existing, error: existingErr } = await dupQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (existing && existing.assistante_id && existing.assistante_id !== assistante_id && !isStaffCall) {
        // Réassignation à une AUTRE assistante sur le même canal, depuis un appel public :
        // jamais autorisé (le transfert volontaire passe par PATCH, réservé au staff).
        return __rep(409, {
          error: profil_type === "enfant"
            ? "Une assistante est déjà assignée à cet enfant pour ce type de cours"
            : "Une assistante est déjà assignée pour ce type de cours",
          assignation: existing,
        });
      }
      if (existing && existing.assistante_id === assistante_id) {
        // Même assistante, même canal : dossier déjà existant - on le renvoie tel quel
        // au lieu d'en créer un doublon (bug identifié : double-clic, resoumission de
        // test, retour arrière du frontend qui rappelle l'API sans s'en rendre compte).
        return __rep(200, {
          assignation: existing,
          assistante: existing.assistantes ? { ...existing.assistantes, utilisateur_id: null } : null,
          doublon_evite: true,
        });
      }
    }

    // Signalement "hors canal" : le prospect a déjà une assistante pour un AUTRE
    // canal (ex: présentiel, et il demande maintenant du en_ligne). On ne bloque
    // pas la nouvelle demande (l'assistante du bon canal la traite normalement),
    // mais on prévient les PA Advisors pour qu'ils vérifient s'il faut consolider
    // le dossier sur une seule assistante (via le transfert PATCH assistante_id).
    let alerteHorsCanal = null;
    if (!isStaffCall && prospect_email && assistante_id && type_coaching !== "prive") {
      let autreCanalQuery = supabase
        .from("assignations_parcours")
        .select("id, assistante_id, type_cours, type_coaching, centre_id, assistantes(nom, prenom)")
        .ilike("prospect_email", prospect_email.trim())
        .not("statut", "in", "(annule,annulee,refuse,refusee)")
        .neq("type_cours", type_cours);

      if (profil_type === "enfant") {
        if (prenom_enfant) autreCanalQuery = autreCanalQuery.ilike("prenom_enfant", prenom_enfant.trim());
        if (nom_enfant) autreCanalQuery = autreCanalQuery.ilike("nom_enfant", nom_enfant.trim());
      }

      const { data: autreCanal } = await autreCanalQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (autreCanal && autreCanal.assistante_id && autreCanal.assistante_id !== assistante_id) {
        alerteHorsCanal = autreCanal;
      }
    }

    // Soumission directe depuis commerciale → pas de vérif quota
    const isOnboardingRoute    = routing_statut === "onboarding_en_attente";
    const isDirectCommerciale  = !assistante_id && type_coaching === "prive";
    const isInscriptionDirecte = source === "inscription_directe";

    let assistante = null;
    if (!isDirectCommerciale) {
      if (!assistante_id) {
        return __rep(400, { error: "assistante_id requis" });
      }
      // Vérifier que l'assistante existe et est active
      const { data: aData, error: aErr } = await supabase
        .from("assistantes")
        .select("id, nom, prenom, email, telephone, photo_url, quota_jour, profil, onboarding_id")
        .eq("id", assistante_id)
        .eq("actif", true)
        .single();

      if (aErr || !aData) {
        return __rep(404, { error: "Assistante introuvable ou inactive" });
      }
      assistante = aData;

    }

    // Créer l'assignation (avec champs enrichis si la migration a été jouée)
    const resolvedStatut = statutBody || "en_attente";
    // Figer l'onboarding responsable au moment de l'inscription
    const onboardingIdAtCreation = assistante?.onboarding_id || null;

    // Certains formulaires (ParcoursParticulier) envoient un suivi_demarrage pré-construit
    // au lieu de champs top-level : on le lit comme fallback
    const sdFromBody = (typeof body.suivi_demarrage === "object" && body.suivi_demarrage !== null)
      ? body.suivi_demarrage : {};

    // Normalise disponibilites depuis le corps ou depuis suivi_demarrage
    const rawDispos = disponibilites ?? sdFromBody.disponibilites ?? null;
    const resolvedDispos = (() => {
      if (!rawDispos) return null;
      // Nouveau format : { horaires: [{jour, debut}] }
      if (!Array.isArray(rawDispos) && Array.isArray(rawDispos.horaires)) {
        return rawDispos.horaires.length > 0 ? rawDispos : null;
      }
      // Ancien format : tableau de labels
      if (Array.isArray(rawDispos) && rawDispos.length > 0) {
        return { jours: rawDispos, creneaux: [] };
      }
      return null;
    })();

    // Autres champs coaching avec fallback suivi_demarrage
    const resolvedPack     = pack_coaching     || sdFromBody.pack_coaching     || sdFromBody.type_coaching  || null;
    const resolvedLieu     = lieu_coaching     || sdFromBody.lieu_coaching     || null;
    const resolvedFormation= formation_souhaitee || sdFromBody.formation_souhaitee || null;
    const resolvedCentre   = centre_coaching   || sdFromBody.centre_coaching   || null;
    const resolvedAdresse  = adresse_coaching  || sdFromBody.adresse_coaching  || null;
    const resolvedCout     = body.cout_formation || sdFromBody.cout_formation || null;
    /* LES AUTRES PERSONNES DE LA FAMILLE (coaching privé d'un couple ou d'une famille).
       Un seul dossier, un seul montant, un seul échéancier - mais plusieurs apprenants.
       Elles vivent ici plutôt que dans des dossiers séparés : trois dossiers auraient
       produit trois échéanciers et obligé à découper un forfait global en trois parts
       arbitraires.
       Chaque entrée est nettoyée et bornée : ce tableau est recopié tel quel dans un JSONB,
       donc ce qui entre ici est ce qui sera relu partout ensuite. Une saisie libre non
       filtrée y laisserait des champs parasites qu'aucun écran ne saurait afficher. */
    const resolvedMembresFamille = (() => {
      const bruts = body.membres_famille || sdFromBody.membres_famille || null;
      if (!Array.isArray(bruts) || bruts.length === 0) return null;
      const membres = bruts
        .map(m => ({
          prenom:    String(m?.prenom    || "").trim() || null,
          nom:       String(m?.nom       || "").trim() || null,
          /* Coordonnées propres à chaque personne : elles deviendront des apprenants avec
             leur espace personnel, et l'Onboarding a besoin d'un identifiant pour leur
             ouvrir un accès. Sans elles, il devrait rappeler le client pour les réclamer. */
          telephone: String(m?.telephone || "").trim() || null,
          email:     String(m?.email     || "").trim().toLowerCase() || null,
          /* Le LIEN de parenté, et non l'âge : demander son âge au conjoint d'un client est
             inutile et intrusif. « Enfant » porte l'information d'âge réellement utile au
             coach sans avoir à la réclamer. */
          lien:      String(m?.lien      || "").trim() || null,
          niveau:    String(m?.niveau    || "").trim() || null,
        }))
        .filter(m => m.prenom || m.nom)   // une ligne sans identité n'est pas une personne
        .slice(0, 9);                     // une famille, pas une classe : garde-fou de saisie
      return membres.length ? membres : null;
    })();
    /* La formule acceptée sous deux formes : l'objet complet envoyé par les écrans à jour,
       ou le simple libellé des anciens appels - qu'on normalise pour que l'onboarding lise
       toujours la même structure. */
    const resolvedFormuleGroupe = (() => {
      const f = formule_groupe || sdFromBody.formule_groupe || null;
      if (!f) return null;
      if (typeof f === "string") return { label: f, id: null, frequence: null, tarif: null };
      return {
        id:        f.id        || null,
        label:     f.label     || null,
        frequence: f.frequence || null,
        tarif:     Number(f.tarif) > 0 ? Number(f.tarif) : null,
        canal:     f.canal     || null,
      };
    })();

    // Coaching privé : le prospect a déjà choisi son canal (type_cours) et son centre
    // (centre_id) pendant le tunnel public - on les recopie dans le "Besoin du client"
    // pour que ce ne soit pas ressaisi par l'assistante (elle n'a qu'à confirmer/compléter
    // le pack et les disponibilités, pas refaire un choix déjà fait par le prospect).
    const inferredLieu = (type_coaching === "prive" && !resolvedLieu)
      ? (type_cours === "domicile" ? "domicile" : type_cours === "en_ligne" ? "en_ligne" : type_cours === "presentiel" ? "cabinet" : null)
      : resolvedLieu;
    const inferredCentre = (type_coaching === "prive" && !resolvedCentre && type_cours === "presentiel")
      ? (centre_id || null)
      : resolvedCentre;

    // Lier explicitement à un compte apprenant déjà existant (identité stable, insensible
    // à la casse/aux typos d'email) - seulement pour un profil adulte : pour un enfant,
    // prospect_email est celui du PARENT, le rattacher comme apprenant serait faux.
    let apprenantIdExistant = null;
    if (prospect_email && profil_type !== "enfant") {
      const { data: apprExist } = await supabase
        .from("utilisateurs").select("id").ilike("email", prospect_email.trim()).eq("role", "apprenant").maybeSingle();
      apprenantIdExistant = apprExist?.id || null;
    }

    // apprenant_id est VOLONTAIREMENT tenu hors de basePayload (voir plus bas, après
    // l'insert) - cette colonne est toute récente et peut ne pas encore exister en base
    // tant que la migration n'a pas été jouée ; si elle était incluse ici, son absence
    // ferait échouer TOUTES les tentatives d'insert (tiers 1 à 4, qui la reprennent
    // tous via basePayload), jusqu'à retomber sur le payload minimal du tier 5 - qui
    // lui perd source/routing_statut/onboarding_id/notes/etc. C'est exactement le bug
    // constaté (dossiers "incomplets" côté PA) : on l'isole donc dans une mise à jour
    // best-effort séparée, qui ne peut jamais dégrader l'insert principal.
    const basePayload = {
      assistante_id:      assistante_id || null,
      prospect_nom:       prospect_nom.trim(),
      prospect_email:     prospect_email?.trim()     || null,
      prospect_telephone: prospect_telephone?.trim() || null,
      type_cours,
      type_coaching:      type_coaching     || null,
      centre_id:          centre_id         || null,
      source:             source            || null,
      statut:             resolvedStatut,
      onboarding_id:      onboardingIdAtCreation,
    };
    const enrichedPayload = {
      ...basePayload,
      inscription_offre:    inscription_offre || offre_label || null,
      montant_paye:         montant_paye        ? Number(montant_paye) : null,
      /* LA MENSUALITÉ NÉGOCIÉE À L'INSCRIPTION.
         `montant_paye` est ce qu'on encaisse le jour même ; il ne disait rien du tarif de
         la SUITE du contrat. Quand l'échéancier était créé plus tard - souvent par une
         autre personne, plusieurs jours après - le formulaire proposait le prix du
         catalogue, et la remise accordée au comptoir était perdue sans que personne s'en
         aperçoive.
         On la range dans `plan_paiement`, le JSONB qui existe déjà : aucune migration, et
         l'échéancier la retrouve là où il ira de toute façon la chercher. On n'y met QUE
         le tarif - pas de mois générés : cela demande les dates de la classe, qu'on n'a
         pas encore à l'inscription.
         `par` et `le` sont écrits pour que la personne qui crée l'échéancier sache d'où
         vient le chiffre, et ne le « corrige » pas par réflexe vers le tarif public. */
      ...(Number(mensualite_negociee) > 0 ? {
        plan_paiement: {
          type: "mensuel",
          mensualite: Number(mensualite_negociee),
          negociee: {
            le: new Date().toISOString(),
            par: assistante ? `${assistante.prenom || ""} ${assistante.nom || ""}`.trim() : null,
            origine: "inscription",
          },
        },
      } : {}),
      // Ne jamais envoyer `null` explicitement : la colonne est NOT NULL avec
      // une valeur par défaut en base, et aucun formulaire public ne fournit
      // ce champ à la création. `undefined` (omis par JSON.stringify) laisse
      // Postgres appliquer son défaut au lieu de faire échouer l'insertion
      // (violation NOT NULL confondue à tort avec un schéma manquant plus bas).
      ...(body.statut_paiement ? { statut_paiement: body.statut_paiement } : {}),
      date_debut_formation: date_debut_formation || sdFromBody.date_debut_formation || null,
      niveau_client:        niveau_client       || null,
      objectif_client:      objectif_client     || null,
      notes:                notes               || null,
      profil_type:          profil_type         || "adulte",
      suivi_demarrage:    (() => {
        const hasCoaching = resolvedDispos || resolvedPack || inferredLieu || resolvedFormation || inferredCentre || resolvedAdresse || resolvedFormuleGroupe || resolvedMembresFamille;
        const hasEnfant   = profil_type === "enfant" && (prenom_enfant || nom_enfant || age_enfant || niveau_classe_enfant);
        if (!hasCoaching && !hasEnfant) return null;
        return {
          ...(hasCoaching ? {
            disponibilites:      resolvedDispos,
            pack_coaching:       resolvedPack       || null,
            type_coaching:       resolvedPack       || null,
            lieu_coaching:       inferredLieu       || null,
            formation_souhaitee: resolvedFormation  || null,
            centre_coaching:     inferredCentre     || null,
            adresse_coaching:    resolvedAdresse    || null,
            cout_formation:      resolvedCout       || null,
            /* LA FORMULE DE GROUPE, EN ENTIER - pas seulement son nom.
               Le dossier part ensuite chez l'onboarding, qui affecte l'apprenant à une
               classe : sans les jours et les horaires, elle ne peut pas savoir dans quel
               groupe le placer, et devait rappeler la commerciale pour le demander.
               On y range donc l'identifiant, le libellé, le rythme et le tarif retenu. */
            formule_groupe:      resolvedFormuleGroupe || null,
            membres_famille:       resolvedMembresFamille  || null,
          } : {}),
          ...(hasEnfant ? {
            prenom_enfant:        prenom_enfant        || null,
            nom_enfant:           nom_enfant           || null,
            age_enfant:           age_enfant           || null,
            niveau_classe_enfant: niveau_classe_enfant || null,
          } : {}),
        };
      })(),
      nom_parent:           nom_parent          || null,
      telephone_parent:     telephone_parent    || null,
      email_parent:         email_parent        || null,
      prenom_enfant:        profil_type === "enfant" ? (prenom_enfant        || null) : null,
      nom_enfant:           profil_type === "enfant" ? (nom_enfant           || null) : null,
      age_enfant:           profil_type === "enfant" ? (age_enfant           || null) : null,
      niveau_classe_enfant: profil_type === "enfant" ? (niveau_classe_enfant || null) : null,
      // Adresse propre a l'enfant, quand le parent lui en a cree une. `prospect_email`
      // reste celle du parent : c'est lui qu'on relance pour un paiement ou un document.
      email_enfant:         profil_type === "enfant" ? (email_enfant || null) : null,
      routing_statut:       routing_statut      || null,
      // Pipeline coaching privé (assistante → PA → paiement → routage) : dossier_statut
      // reste NULL à la création - la transmission au PA est un clic délibéré de
      // l'assistante (bouton "Transmettre au PA"), jamais un effet de bord automatique
      // (même principe déjà appliqué à la transmission Onboarding dans ce fichier).
      dossier_statut:       null,
      /* Le cycle commercial, posé d'emblée selon la provenance : une inscription saisie
         à la main est un prospect déjà contacté et acquis, un dossier venu du site sans
         paiement reste « nouveau ». Aucun clic n'est demandé ensuite. */
      ...cycleALaCreation(source),
    };

    const isSchemaErr = (e) => e && (
      e.code === "42703" || e.code === "PGRST204" ||
      (e.message || "").includes("Could not find") ||
      (e.message || "").includes("column") ||
      (e.message || "").includes("does not exist")
    );

    // suivi_demarrage est la donnée critique - on la préserve dans tous les fallbacks
    const suiviDemarrage = enrichedPayload.suivi_demarrage;

    let assignation;
    let aData, insErr;

    // Tentative 1 : payload enrichi complet
    ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(enrichedPayload).select().single());

    // Tentative 1b : sans routing_statut/pa_advisor_id uniquement (migration onboarding
    // potentiellement absente) - on garde les colonnes enfant, migration indépendante
    if (isSchemaErr(insErr)) {
      console.warn("[assignation] fallback 1b (sans routing/pa_advisor/dossier_statut), erreur:", insErr.message);
      const { routing_statut: _r0, pa_advisor_id: _p0, dossier_statut: _ds0, ...payload1b } = enrichedPayload;
      ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(payload1b).select().single());
    }

    // Tentative 2 : sans routing_statut/pa_advisor_id/dossier_statut ni colonnes enfant (migrations potentiellement absentes)
    if (isSchemaErr(insErr)) {
      console.warn("[assignation] fallback 2 (sans routing/pa_advisor/dossier_statut/enfant-cols), erreur:", insErr.message);
      const { routing_statut: _r, pa_advisor_id: _p, dossier_statut: _ds, prenom_enfant: _pe, nom_enfant: _ne, age_enfant: _ae, niveau_classe_enfant: _nc, email_enfant: _eee, ...payload2 } = enrichedPayload;
      ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(payload2).select().single());
    }

    // Tentative 3 : sans onboarding_id (migration pas encore jouée) mais suivi_demarrage + date préservés
    if (isSchemaErr(insErr)) {
      console.warn("[assignation] fallback 3 (sans onboarding_id), erreur:", insErr.message);
      const { onboarding_id: _oid, ...basePayloadNoOid } = basePayload;
      const payload3 = {
        ...basePayloadNoOid,
        inscription_offre:    inscription_offre || offre_label || null,
        montant_paye:         montant_paye        ? Number(montant_paye) : null,
        // Ne jamais envoyer `null` explicitement : la colonne est NOT NULL avec
      // une valeur par défaut en base, et aucun formulaire public ne fournit
      // ce champ à la création. `undefined` (omis par JSON.stringify) laisse
      // Postgres appliquer son défaut au lieu de faire échouer l'insertion
      // (violation NOT NULL confondue à tort avec un schéma manquant plus bas).
      ...(body.statut_paiement ? { statut_paiement: body.statut_paiement } : {}),
        date_debut_formation: date_debut_formation || null,
        niveau_client:        niveau_client       || null,
        objectif_client:      objectif_client     || null,
        notes:                notes               || null,
        profil_type:          profil_type         || "adulte",
        nom_parent:           nom_parent          || null,
        telephone_parent:     telephone_parent    || null,
        email_parent:         email_parent        || null,
        routing_statut:       routing_statut      || null,
        suivi_demarrage:      suiviDemarrage,
      };
      ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(payload3).select().single());
    }

    // Tentative 4 : sans routing_statut/pa_advisor_id en plus (colonnes CONSOLIDATION)
    if (isSchemaErr(insErr)) {
      console.warn("[assignation] fallback 4 (base+suivi sans routing), erreur:", insErr.message);
      const { onboarding_id: _oid2, ...basePayloadNoOid2 } = basePayload;
      const payload4 = {
        ...basePayloadNoOid2,
        inscription_offre:    inscription_offre || offre_label || null,
        niveau_client:        niveau_client       || null,
        notes:                notes               || null,
        date_debut_formation: date_debut_formation || null,
        profil_type:          profil_type         || "adulte",
        nom_parent:           nom_parent          || null,
        telephone_parent:     telephone_parent    || null,
        email_parent:         email_parent        || null,
        suivi_demarrage:      suiviDemarrage,
      };
      ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(payload4).select().single());
    }

    // Tentative 5 : payload minimal absolu (colonnes de la migration initiale uniquement)
    if (isSchemaErr(insErr)) {
      console.warn("[assignation] fallback 5 minimal, erreur:", insErr.message);
      const minimalPayload = {
        assistante_id,
        prospect_nom:         prospect_nom.trim(),
        prospect_email:       prospect_email?.trim() || null,
        prospect_telephone:   prospect_telephone?.trim() || null,
        type_cours,
        type_coaching:        type_coaching || null,
        centre_id:            centre_id     || null,
        date_debut_formation: date_debut_formation || null,
        suivi_demarrage:      suiviDemarrage,
        statut:               "en_attente",
      };
      ({ data: aData, error: insErr } = await supabase.from("assignations_parcours").insert(minimalPayload).select().single());
    }

    if (insErr) {
      console.error("[assignation] échec définitif - code:", insErr.code, "-", insErr.message);
      throw insErr;
    }
    if (!aData) {
      console.error("[assignation] insert réussi mais data null");
      throw new Error("Insert assignation: aucune donnée retournée");
    }
    assignation = aData;
    console.log("[assignation] créée id:", assignation.id, "suivi_demarrage:", assignation.suivi_demarrage ? "✓" : "null");

    // Rattachement best-effort à un compte apprenant existant - voir commentaire sur
    // basePayload plus haut : jamais dans l'insert principal, uniquement ici en aparté,
    // pour ne jamais risquer de dégrader l'insert si la colonne n'existe pas encore.
    if (apprenantIdExistant) {
      supabase.from("assignations_parcours").update({ apprenant_id: apprenantIdExistant }).eq("id", assignation.id)
        .then(({ error: apErr }) => { if (apErr) console.warn("[assignation] apprenant_id non appliqué (migration pas encore jouée ?):", apErr.message); });
    }

    // Code promo : jamais fait confiance au client - revalidé et le montant réellement
    // réduit ici. Jusque-là, le code promo n'était qu'affiché dans le tunnel public
    // (jamais persisté, jamais soustrait du montant facturé) - best-effort, en aparté
    // comme apprenant_id ci-dessus, pour ne jamais risquer de dégrader l'insert principal
    // si la migration ajoutant code_promo/reduction_montant n'a pas encore été jouée.
    /* DEUX ASSIETTES POSSIBLES, jamais les deux à la fois.
       En formation standard, le code porte sur `montant_paye` - la somme encaissée à
       l'inscription. En coaching privé il n'y a pas de somme unique : le contrat est une
       suite de mensualités, et `montant_paye` reste vide. Le code s'applique alors à la
       PREMIÈRE MENSUALITÉ, une seule fois - la forme courante d'un code promo, et celle
       qui n'entre pas en concurrence avec la mensualité négociée, qui, elle, vaut pour
       toute la durée. Les cumuler reviendrait à consentir deux fois la même remise. */
    const planPourPromo = (() => {
      try { return typeof assignation.plan_paiement === "string" ? JSON.parse(assignation.plan_paiement) : assignation.plan_paiement; }
      catch { return null; }
    })();
    const assiettePromo = assignation.montant_paye
      ? { type: "montant_paye", base: Number(assignation.montant_paye) }
      : (Number(planPourPromo?.mensualite) > 0
          ? { type: "premiere_mensualite", base: Number(planPourPromo.mensualite) }
          : null);

    if (code_promo?.trim() && assiettePromo) {
      (async () => {
        try {
          const { data: promo } = await supabase
            .from("codes_promo")
            .select("*")
            .eq("code", code_promo.trim().toUpperCase())
            .eq("actif", true)
            .maybeSingle();
          if (!promo) return;
          if (promo.date_expiration && new Date(promo.date_expiration) < new Date()) return;
          if (promo.usage_max != null && promo.usage_count >= promo.usage_max) return;
          const applicable = promo.applicable_a || ["tous"];
          // applicable_a utilise les catégories du catalogue ("centres"/"en_ligne"/"domicile"/
          // "certifications"), pas les valeurs de type_cours ("presentiel"/"en_ligne"/"domicile") -
          // sans cette correspondance, un code restreint à "centres" ne matchait jamais un
          // dossier présentiel (type_cours="presentiel" ≠ "centres").
          const offreTypeAssignation = type_cours === "presentiel" ? "centres" : type_cours;
          if (!applicable.includes("tous") && !applicable.includes(offreTypeAssignation)) return;
          // Restriction par centre précis (cumulative) - liste vide = tous les centres.
          const centresAutorises = promo.centres_ids || [];
          if (centre_id && centresAutorises.length > 0 && !centresAutorises.includes(centre_id)) return;

          const montantInitial = assiettePromo.base;
          const reduction = promo.type_reduction === "pourcentage"
            ? Math.round(montantInitial * (Number(promo.valeur) / 100))
            : Math.min(Number(promo.valeur), montantInitial);
          const montantFinal = Math.max(0, montantInitial - reduction);

          /* Sur la première mensualité, on ne TOUCHE PAS au tarif du plan : il vaut pour
             tous les mois. On dépose la remise à côté, et l'échéancier l'appliquera au
             premier mois généré - les suivants restant au plein tarif. */
          const maj = assiettePromo.type === "montant_paye"
            ? { code_promo: promo.code, reduction_montant: reduction, montant_paye: montantFinal }
            : {
                code_promo: promo.code,
                reduction_montant: reduction,
                plan_paiement: {
                  ...planPourPromo,
                  promo_premiere_mensualite: {
                    code: promo.code,
                    type_reduction: promo.type_reduction,
                    valeur: Number(promo.valeur),
                    montant_avant: montantInitial,
                    montant_deduit: reduction,
                    le: new Date().toISOString(),
                  },
                },
              };

          const { error: promoErr } = await supabase
            .from("assignations_parcours")
            .update(maj)
            .eq("id", assignation.id);
          if (promoErr) { console.warn("[assignation] code_promo non appliqué (migration pas encore jouée ?):", promoErr.message); return; }

          supabase.from("codes_promo").update({ usage_count: (promo.usage_count || 0) + 1 }).eq("id", promo.id)
            .then(({ error: cntErr }) => { if (cntErr) console.warn("[assignation] usage_count code promo non incrémenté:", cntErr.message); });
        } catch (e) { console.warn("[assignation] application code promo échouée:", e.message); }
      })();
    }

    // Notifie l'assistante/PA qui vient de recevoir ce prospect - sans ça, elle ne
    // découvre le dossier qu'en consultant elle-même son onglet "Prospects parcours".
    if (assistante?.email) {
      const { data: assistUser } = await supabase
        .from("utilisateurs").select("id").ilike("email", assistante.email).maybeSingle();
      if (assistUser?.id) {
        const estPA = assistante.profil === "pa";
        await notifyUser(assistUser.id, {
          type:    "assignation",
          titre:   estPA ? `🆕 Nouvelle demande de coaching privé - ${prospect_nom}` : `🆕 Nouveau prospect - ${prospect_nom}`,
          message: estPA
            ? `${prospect_nom} a demandé un coaching privé (${type_cours}). Consultez le dossier pour le prendre en charge.`
            : `${prospect_nom} vous a été assigné(e) (${type_cours}${type_coaching ? " · " + type_coaching : ""}). Consultez votre onglet Prospects parcours.`,
          meta:    { assignation_id: assignation.id, prospect_nom, type_cours, type_coaching: type_coaching || null },
          source:  "dash",
        }).catch(() => {});
      }
    }

    // Notifie le SuperAdmin - visibilité totale sur toute création de dossier,
    // manuelle (site web) ou importée en masse.
    await notifyRole(["super_admin"], {
      type:    "assignation",
      titre:   `🆕 Nouveau dossier - ${prospect_nom}`,
      message: `${prospect_nom} (${type_cours}${type_coaching ? " · " + type_coaching : ""}) - dossier créé via "${source || "formulaire"}".`,
      meta:    { assignation_id: assignation.id, prospect_nom, type_cours, type_coaching: type_coaching || null },
      source:  "dash",
    }).catch(() => {});

    // Coaching privé sans PA pré-assigné (pool partagé) : on ne désigne personne au
    // prospect (message générique côté frontend) - on notifie TOUS les PA Advisors
    // actifs, à charge pour l'un d'eux de prendre le dossier (PATCH assistante_id).
    if (isDirectCommerciale && type_coaching === "prive") {
      await notifyRole("pedagogical_advisor", {
        type:    "assignation",
        titre:   `🆕 Nouveau dossier coaching privé - ${prospect_nom}`,
        message: `${prospect_nom} a demandé un coaching privé (${type_cours}). Aucun PA n'est encore assigné - prenez le dossier en charge dès que possible.`,
        meta:    { assignation_id: assignation.id, prospect_nom, type_cours },
        source:  "dash",
      }).catch(() => {});
    }

    // Coaching privé AVEC assistante choisie par le client (nouveau parcours) : le PA
    // n'est PAS notifié ici - la transmission est un clic délibéré de l'assistante une
    // fois le "Besoin du client" renseigné (PATCH /assignations/:id/transmettre-pa),
    // pas un effet de bord automatique de la création du dossier.

    // Signalement aux PA Advisors : ce prospect a maintenant des assistantes
    // différentes sur deux canaux - à eux de décider s'il faut consolider.
    if (alerteHorsCanal) {
      const nomAutre = [alerteHorsCanal.assistantes?.prenom, alerteHorsCanal.assistantes?.nom].filter(Boolean).join(" ") || "une autre assistante";
      await notifyRole("pedagogical_advisor", {
        type:    "alerte",
        titre:   `⚠️ ${prospect_nom} a deux assistantes sur deux canaux`,
        message: `${prospect_nom} a une assistante (${nomAutre}) pour "${alerteHorsCanal.type_cours}" et vient d'être assignée à une autre assistante pour "${type_cours}". Vérifiez si une réaffectation est nécessaire.`,
        meta:    {
          assignation_id: assignation.id, autre_assignation_id: alerteHorsCanal.id, prospect_nom,
          // Canal de chaque dossier - permet au PA de ne se voir proposer que des
          // assistantes compatibles avec le canal du dossier qu'il réaffecte (cf. bug
          // où un dossier présentiel se retrouvait assigné à une assistante en_ligne).
          type_cours: type_cours, centre_id: centre_id || null,
          autre_type_cours: alerteHorsCanal.type_cours, autre_centre_id: alerteHorsCanal.centre_id || null,
        },
        source: "dash",
      }).catch(() => {});
    }

    // Retrouver l'ID utilisateurs de l'assistante (pour lier le test de niveau)
    let utilisateurId = null;
    if (assistante?.email) {
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("email", assistante.email)
        .eq("role", "commercial")
        .maybeSingle();
      utilisateurId = u?.id || null;
    }

    return __rep(201, {
      assignation,
      assistante: assistante ? { ...assistante, utilisateur_id: utilisateurId } : null,
    });
  } catch (err) {
    return __rep(500, { error: err.message });
  }
}

// Enveloppe HTTP : la logique vit dans creerAssignationCore ci-dessus, partagee
// telle quelle avec l'import en masse (src/routes/imports.js).
router.post("/assignation", async (req, res) => {
  const { status, payload } = await creerAssignationCore(req.body, {
    authorization: req.headers.authorization,
  });
  res.status(status).json(payload);
});

// ── GET /api/parcours/assignations/recentes ───────────────────
// Pour le poller de notification - filtré par assistante si commercial
router.get("/assignations/recentes", authenticateAdmin, async (req, res) => {
  try {
    const ROLES_GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);

    let query = supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, statut, source, created_at, assistantes(nom, prenom)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isGlobal) {
      const { data: ass } = await supabase.from("assistantes").select("id").eq("email", req.profil.email).maybeSingle();
      if (!ass) return res.json({ assignations: [] });
      query = query.eq("assistante_id", ass.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      assignations: (data || []).map(a => ({
        ...a,
        assistante_nom: a.assistantes ? `${a.assistantes.prenom} ${a.assistantes.nom}` : "-",
        assistantes: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assignations ───────────────────────────
// Super admin / admin / responsable + PA → toutes les assignations (avec filtre type_cours)
// Commercial → uniquement celles de son assistante (par email)
router.get("/assignations", authenticateAdmin, async (req, res) => {
  try {
    const { statut, type_cours, prospect_email, id } = req.query;
    const ROLES_GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager", "pedagogical_advisor"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);
    const isPa = req.role === "pedagogical_advisor";
    const isOnboarding = req.role === "onboarding";

    let assistanteId = null;
    if (!isGlobal && !isOnboarding) {
      // Trouver l'assistante liée au compte connecté via l'email
      const { data: ass } = await supabase
        .from("assistantes")
        .select("id")
        .eq("email", req.profil.email)
        .maybeSingle();

      if (!ass) {
        // Aucune assistante trouvée pour ce compte → liste vide
        return res.json({ assignations: [] });
      }
      assistanteId = ass.id;
    }

    // Niveau 3 : toutes les colonnes nouvelles (paiement en ligne + documents + formation)
    // apprenant_id n'est PAS inclus ici tant que la migration n'a pas été jouée : la
    // colonne est absente en base pour l'instant, et son absence ferait échouer TOUTE
    // cette requête (schema error), retombant sur BASE_SELECT - qui, lui, ne contient
    // pas suivi_demarrage. Résultat exact du bug constaté : tous les dossiers PA
    // (formation, niveau, lieu, centre, disponibilités...) apparaissaient vides pour
    // TOUT LE MONDE dès qu'un seul insert avait tenté cette colonne. Ne jamais
    // remettre apprenant_id ici avant confirmation que la migration a été exécutée.
    const FULL_SELECT  = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, source, inscription_offre, montant_paye, code_promo, reduction_montant, niveau_client, objectif_client, notes, notes_coach, date_debut_formation, documents_dossier, suivi_demarrage, suivi_presences, plan_paiement, profil_type, nom_parent, telephone_parent, email_parent, prenom_enfant, nom_enfant, age_enfant, niveau_classe_enfant, acces_apprenant, routing_statut, pa_advisor_id, onboarding_id, dossier_statut, motif_invalidation, cycle_statut, premier_contact_at, converti_at, created_at, updated_at, assistantes(id, nom, prenom, telephone, email, photo_url), centres(nom)";
    // Niveau 2 : sans date_debut_formation ni acces_apprenant (si migration pas encore jouée)
    const BASE_SELECT  = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, source, inscription_offre, montant_paye, niveau_client, objectif_client, notes, profil_type, nom_parent, telephone_parent, email_parent, prenom_enfant, nom_enfant, age_enfant, niveau_classe_enfant, created_at, updated_at, assistantes(id, nom, prenom, telephone, email, photo_url), centres(nom)";
    // Niveau 1 : colonnes d'origine uniquement (fallback si aucune migration n'a été jouée)
    const LEGACY_SELECT = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, source, created_at, updated_at, assistantes(id, nom, prenom, telephone, email, photo_url), centres(nom)";

    const onboardingUserId = isOnboarding ? (req.profil?.id || req.user?.id) : null;
    // Compte "Onboarding global" (désigné via utilisateurs.onboarding_vue_globale) : voit
    // toutes les demandes en attente côté onboarding, pas seulement celles qui lui sont
    // nommément assignées - les autres comptes onboarding gardent leur périmètre habituel.
    const onboardingVueGlobale = isOnboarding && req.profil?.onboarding_vue_globale === true;

    // "Global" a longtemps voulu dire "aucun filtre", ce qui remontait aussi les dossiers
    // présentiel : une commerciale de centre est son propre onboarding, ses dossiers n'ont
    // rien à faire dans cette vue. On borne donc au périmètre onboarding - les assistantes
    // NON présentiel - exactement comme le fait déjà groupes.js pour les classes.
    // Un dossier sans assistante (circuit privé direct, pris en charge par le PA) sort
    // également du périmètre : il ne relève d'aucun onboarding.
    let assistantesPerimetreOnboarding = null;
    if (onboardingVueGlobale && !prospect_email && !id) {
      const { data: assOnb } = await supabase
        .from("assistantes").select("id, type_cours").neq("type_cours", "presentiel");
      assistantesPerimetreOnboarding = (assOnb || []).map((a) => a.id);
    }

    const buildQuery = (select) => {
      let q = supabase.from("assignations_parcours").select(select).order("created_at", { ascending: false });
      if (assistanteId) q = q.eq("assistante_id", assistanteId);
      // Onboarding sans email précis : filtrer par onboarding_id
      if (isOnboarding && !onboardingVueGlobale && !prospect_email && !id && onboardingUserId) q = q.eq("onboarding_id", onboardingUserId);
      // Onboarding global : borné au périmètre onboarding (jamais "tout, sans filtre").
      if (assistantesPerimetreOnboarding) {
        q = assistantesPerimetreOnboarding.length
          ? q.in("assistante_id", assistantesPerimetreOnboarding)
          : q.eq("id", "00000000-0000-0000-0000-000000000000"); // aucun périmètre → aucun dossier
      }
      if (statut        && statut        !== "tous") q = q.eq("statut",        statut);
      if (id)                                        q = q.eq("id", id);
      if (prospect_email && !id)                     q = q.eq("prospect_email", prospect_email);
      // PA : filtre par type_cours si fourni. Pas de restriction implicite sur type_coaching -
      // l'onglet "Mes apprenants" distingue déjà "Parcours" (assignations_parcours, toutes)
      // de "Privés" (table contrats_prives, séparée) côté frontend ; forcer type_coaching="prive"
      // ici videait le bucket "Parcours" de ses vraies données groupe/parcours.
      if (isPa) {
        const tcFilter = type_cours && type_cours !== "tous" ? type_cours : null;
        if (tcFilter) q = q.eq("type_cours", tcFilter);
      } else {
        const tcFilter = type_cours && type_cours !== "tous" ? type_cours : null;
        if (tcFilter) q = q.eq("type_cours", tcFilter);
      }
      return q;
    };

    let { data, error } = await buildQuery(FULL_SELECT);
    if (error) ({ data, error } = await buildQuery(BASE_SELECT));
    if (error) ({ data, error } = await buildQuery(LEGACY_SELECT));
    if (error) throw error;

    // Dossiers avec une alerte "hors canal" (deux assistantes sur deux canaux) encore
    // non tranchée par un PA Advisor - permet au frontend de bloquer/griser les actions
    // de la page (même logique que le blocage serveur de PATCH /assignations/:id).
    const idsEnAttenteHorsCanal = await (async () => {
      const idsCourants = (data || []).map(a => a.id);
      if (idsCourants.length === 0) return new Set();
      const { data: alertes } = await supabase.from("notifications").select("meta").eq("type", "alerte");
      const paires = new Set();
      for (const n of alertes || []) {
        const aId = n.meta?.assignation_id, bId = n.meta?.autre_assignation_id;
        if (aId && bId && (idsCourants.includes(aId) || idsCourants.includes(bId))) {
          paires.add(JSON.stringify([aId, bId]));
        }
      }
      if (paires.size === 0) return new Set();
      const idsAVerifier = [...new Set([...paires].flatMap(p => JSON.parse(p)))];
      const { data: rows } = await supabase.from("assignations_parcours").select("id, assistante_id, statut").in("id", idsAVerifier);
      const map = Object.fromEntries((rows || []).map(r => [r.id, r.assistante_id]));
      const statutMap = Object.fromEntries((rows || []).map(r => [r.id, r.statut]));
      const enAttente = new Set();
      for (const p of paires) {
        const [a, b] = JSON.parse(p);
        // Un PA a déjà tranché dès qu'un des deux doublons est archivé (cf. PATCH
        // /assignations/:id, archivage automatique du doublon non choisi) - sans
        // cette exclusion, la bannière "en attente d'arbitrage PA" restait bloquée
        // pour toujours sur le dossier gagnant, puisque l'archivé garde son ancien
        // assistante_id, forcément différent du nouveau.
        if (statutMap[a] === "archivé" || statutMap[b] === "archivé") continue;
        if (map[a] && map[b] && map[a] !== map[b]) { enAttente.add(a); enAttente.add(b); }
      }
      return enAttente;
    })();

    // Nom du PA Advisor ayant traité chaque dossier - traçabilité (plusieurs PA actifs).
    const paIdsPourNom = [...new Set((data || []).map(a => a.pa_advisor_id).filter(Boolean))];
    let paNomMapListe = {};
    if (paIdsPourNom.length) {
      const { data: paRowsListe } = await supabase.from("utilisateurs").select("id,nom,prenom").in("id", paIdsPourNom);
      (paRowsListe || []).forEach(u => { paNomMapListe[u.id] = `${u.prenom||""} ${u.nom||""}`.trim(); });
    }

    // Idem pour l'onboarding responsable du dossier - utile au PA Advisor pour savoir
    // qui contacter côté onboarding sans devoir chercher dans un autre onglet.
    const obIdsPourNom = [...new Set((data || []).map(a => a.onboarding_id).filter(Boolean))];
    let onboardingMapListe = {};
    if (obIdsPourNom.length) {
      const { data: obRowsListe } = await supabase.from("utilisateurs").select("id,nom,prenom,email,telephone").in("id", obIdsPourNom);
      (obRowsListe || []).forEach(u => { onboardingMapListe[u.id] = { nom: `${u.prenom||""} ${u.nom||""}`.trim(), email: u.email||null, telephone: u.telephone||null }; });
    }

    // Résout la classe (privée OU groupe) créée pour chaque dossier (lien posé dans
    // groupes_apprenants.note à la création) - permet au PA de retrouver les séances de la
    // table unifiée `seances` (filtrée par groupe_id) sans dépendre de l'ancien système
    // seances_privees, que le coach n'utilise plus. Restreint à "prive" à l'origine, ce qui
    // privait tous les dossiers "groupe" (en ligne comme présentiel) du même lien pourtant
    // posé en note à leur création - coach jamais résolu pour eux dans le tableau PA.
    const idsPourGroupe = (data || []).map(a => a.id);
    let groupeIdMap = {};
    if (idsPourGroupe.length) {
      const { data: gaRows } = await supabase
        .from("groupes_apprenants")
        .select("groupe_id, note")
        .or(idsPourGroupe.map(id => `note.ilike.%${id}%`).join(","));
      (gaRows || []).forEach(row => {
        try {
          const aid = JSON.parse(row.note || "{}").assignation_id;
          if (aid) groupeIdMap[aid] = row.groupe_id;
        } catch {}
      });
    }

    // Photo de l'apprenant - assignations_parcours n'a pas de colonne photo propre ;
    // on la retrouve via l'email du prospect, qui correspond à l'email du compte
    // utilisateurs (apprenant) une fois qu'il en a un et y a mis un avatar. Ne
    // fonctionne pas pour un profil "enfant" (prospect_email = celui du parent, pas
    // de l'enfant), qui garde donc ses initiales pour l'instant.
    const emailsPourPhoto = [...new Set((data || []).map(a => a.prospect_email).filter(Boolean).map(e => e.toLowerCase()))];
    let avatarParEmail = {};
    let accesBloqueParEmail = {};
    if (emailsPourPhoto.length) {
      const { data: comptesPhoto } = await supabase
        .from("utilisateurs").select("id, email, avatar_url").in("email", emailsPourPhoto);
      (comptesPhoto || []).forEach(u => { if (u.avatar_url) avatarParEmail[(u.email||"").toLowerCase()] = u.avatar_url; });

      // Accès bloqué (suspension auto après 4 absences) - vit dans app_metadata Supabase
      // Auth, jamais dans assignations_parcours. Sans cet enrichissement, la liste "Mes
      // apprenants"/"Prospects parcours" ne pouvait jamais afficher le badge "🔒 Suspendu"
      // (elle lisait par erreur plan_paiement.acces_bloque, un champ qui n'existe pas là),
      // même quand l'apprenant était réellement bloqué.
      const idsAuth = [...new Set((comptesPhoto || []).map(u => u.id).filter(Boolean))];
      if (idsAuth.length) {
        const authResults = await Promise.all(
          idsAuth.map(uid =>
            supabase.auth.admin.getUserById(uid)
              .then(({ data: ud }) => ({ email: (comptesPhoto.find(u => u.id === uid)?.email || "").toLowerCase(), acces_bloque: ud?.user?.app_metadata?.acces_bloque || false }))
              .catch(() => ({ email: null, acces_bloque: false }))
          )
        );
        authResults.forEach(r => { if (r.email) accesBloqueParEmail[r.email] = r.acces_bloque; });
      }
    }

    const mapRow = (a) => ({
      ...a,
      avatar_url: avatarParEmail[(a.prospect_email||"").toLowerCase()] || null,
      acces_bloque: accesBloqueParEmail[(a.prospect_email||"").toLowerCase()] || false,
      documents_dossier: a.documents_dossier ?? [],
      /* LE CYCLE COMMERCIAL. Ces trois champs étaient écrits en base par le suivi
         automatique mais ne remontaient dans AUCUNE des deux projections : l'écran de la
         commerciale retombait sur son état par défaut et annonçait « en attente de prise
         en charge » pour des dossiers convertis depuis longtemps. Le cockpit KPI, lui, lit
         la table directement - ses chiffres n'ont jamais été touchés. */
      cycle_statut:       a.cycle_statut       ?? null,
      premier_contact_at: a.premier_contact_at ?? null,
      converti_at:        a.converti_at        ?? null,
      suivi_demarrage:   a.suivi_demarrage   ?? null,
      suivi_presences:   a.suivi_presences   ?? null,
      plan_paiement:     a.plan_paiement     ?? null,
      inscription_offre:    a.inscription_offre    ?? null,
      montant_paye:         a.montant_paye         ?? null,
      niveau_client:        a.niveau_client        ?? null,
      objectif_client:      a.objectif_client      ?? null,
      notes:                a.notes                ?? null,
      date_debut_formation: a.date_debut_formation ?? null,
      routing_statut:       a.routing_statut       ?? null,
      pa_advisor_id:        a.pa_advisor_id        ?? null,
      pa_advisor_nom:       paNomMapListe[a.pa_advisor_id] || null,
      onboarding_id:        a.onboarding_id        ?? null,
      onboarding_nom:       onboardingMapListe[a.onboarding_id]?.nom       || null,
      onboarding_email:     onboardingMapListe[a.onboarding_id]?.email     || null,
      onboarding_telephone: onboardingMapListe[a.onboarding_id]?.telephone || null,
      groupe_id:            groupeIdMap[a.id]      || null,
      // Repli sur suivi_demarrage : un fallback d'insert (schema error sur une
      // colonne sans rapport, ex. routing_statut) peut avoir écarté ces 4
      // colonnes top-level tout en les préservant dans le JSONB - cf. Tentative 2.
      prenom_enfant:        a.prenom_enfant        ?? a.suivi_demarrage?.prenom_enfant        ?? null,
      nom_enfant:           a.nom_enfant           ?? a.suivi_demarrage?.nom_enfant           ?? null,
      age_enfant:           a.age_enfant           ?? a.suivi_demarrage?.age_enfant           ?? null,
      niveau_classe_enfant: a.niveau_classe_enfant ?? a.suivi_demarrage?.niveau_classe_enfant ?? null,
      assistante_nom:   a.assistantes ? `${a.assistantes.prenom} ${a.assistantes.nom}` : "-",
      assistante_tel:   a.assistantes?.telephone || null,
      assistante_email: a.assistantes?.email     || null,
      assistante_photo: a.assistantes?.photo_url || null,
      centre_nom:     a.centres?.nom || null,
      hors_canal_en_attente: idsEnAttenteHorsCanal.has(a.id),
      assistantes: undefined,
      centres: undefined,
    });

    res.json({ assignations: (data || []).map(mapRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assignations/:id - détail d'un dossier précis ──
// Utilisé notamment par le PA Advisor pour afficher le détail des deux offres
// avant de trancher une réaffectation "hors canal" (cf. onglet Dossiers à réaffecter).
router.get("/assignations/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, montant_paye, inscription_offre, created_at, assistantes(id, nom, prenom, telephone), centres(nom)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Assignation introuvable" });
    res.json({
      assignation: {
        ...data,
        assistante_nom: data.assistantes ? `${data.assistantes.prenom} ${data.assistantes.nom}` : "-",
        assistante_tel: data.assistantes?.telephone || null,
        centre_nom:     data.centres?.nom || null,
        assistantes: undefined,
        centres: undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/parcours/assignations/:id ─────────────────────
// Un commercial ne peut modifier que ses propres assignations
/* ══════════════════════════════════════════════════════════════════
   PAUSE ET REPRISE DE LA FACTURATION
   ------------------------------------------------------------------
   Un apprenant qui s'arrête plusieurs mois ne doit rien devoir pour la période
   sans cours - et, à son retour, ne doit pas voir apparaître d'un coup les
   mensualités du creux. Le cron ne connaît ni les classes ni les apprenants :
   c'est ici qu'on fait le lien, en passant par le service `planPaiement`.

   Le plan est RELU juste avant d'écrire : la colonne est remplacée en entier,
   et le cron (ou un paiement TouchPoint) peut l'avoir modifiée entre-temps.
   Accepter un plan construit par le client écraserait silencieusement ces
   écritures.
══════════════════════════════════════════════════════════════════ */

const chargerPlan = async (assignationId) => {
  const { data, error } = await supabase
    .from("assignations_parcours")
    .select("id, prospect_nom, plan_paiement, type_coaching")
    .eq("id", assignationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
};

router.post("/assignations/:id/suspendre-plan", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const dossier = await chargerPlan(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!dossier.plan_paiement) return res.status(409).json({ error: "Ce dossier n'a pas de plan de paiement mensuel" });

    const { premier_mois_non_facture, motif, detail, date_reprise_prevue, ga_id } = req.body || {};
    const acteur = req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null;

    const { plan, moisNeutralises, montantGele } = suspendrePlan(dossier.plan_paiement, {
      premierMoisNonFacture: premier_mois_non_facture || periodeDe(),
      motif: motif || null,
      detail: detail || null,
      dateReprisePrevue: date_reprise_prevue || null,
      gaId: ga_id || null,
      par: acteur,
    });

    const { error } = await supabase
      .from("assignations_parcours").update({ plan_paiement: plan }).eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    logAudit({
      acteur_id: req.profil?.id || null, acteur_nom: acteur, acteur_email: req.profil?.email || null,
      acteur_role: req.role || null, plateforme: "dash",
      action_type: "PLAN_SUSPENDU", module: "finances",
      entite_type: "assignation", entite_id: req.params.id,
      detail: `Facturation suspendue pour ${dossier.prospect_nom} - ${moisNeutralises.length} mois neutralisé(s), ${montantGele} F non dus`,
      statut: "success",
    }).catch(() => {});

    res.json({ ok: true, mois_neutralises: moisNeutralises, montant_gele: montantGele, plan_paiement: plan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/assignations/:id/reprendre-plan", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const dossier = await chargerPlan(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!dossier.plan_paiement) return res.status(409).json({ error: "Ce dossier n'a pas de plan de paiement mensuel" });

    const { mois_reprise, date_reprise } = req.body || {};
    const acteur = req.profil ? `${req.profil.prenom || ""} ${req.profil.nom || ""}`.trim() : null;

    const { plan, moisRepris, moisComble, prolongation } = reprendrePlan(dossier.plan_paiement, {
      moisReprise: mois_reprise || periodeDe(),
      dateReprise: date_reprise || null,
      par: acteur,
    });

    const { error } = await supabase
      .from("assignations_parcours").update({ plan_paiement: plan }).eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    logAudit({
      acteur_id: req.profil?.id || null, acteur_nom: acteur, acteur_email: req.profil?.email || null,
      acteur_role: req.role || null, plateforme: "dash",
      action_type: "PLAN_REPRIS", module: "finances",
      entite_type: "assignation", entite_id: req.params.id,
      detail: `Facturation reprise pour ${dossier.prospect_nom} en ${moisRepris}`
        + (prolongation ? ` - contrat prolongé de ${prolongation} mois` : ""),
      statut: "success",
    }).catch(() => {});

    res.json({ ok: true, mois_repris: moisRepris, mois_comble: moisComble, prolongation, plan_paiement: plan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/parcours/assignations/:id/prise-en-charge
 *
 * Le dossier vient d'être ouvert par une commerciale. Signal envoyé par l'écran, jamais
 * par un bouton : c'est ce qui permet de mesurer le délai de prise en charge (`COM-03`,
 * cible 2 h) sans rien demander à personne.
 *
 * Répond toujours 204, même si rien n'a été écrit : l'appelant n'a rien à faire du
 * résultat, et un échec de mesure ne doit pas remonter jusqu'à l'écran.
 */
router.post("/assignations/:id/prise-en-charge", authenticateAdmin, async (req, res) => {
  marquerPriseEnCharge(req.params.id);   // volontairement pas attendu
  res.status(204).end();
});

/* LA ROUTE `PATCH /assignations/:id/cycle` A ÉTÉ SUPPRIMÉE. Elle faisait avancer le
   dossier sur ordre d'un bouton : trois clics par dossier, que personne n'aurait faits.
   Toutes ses transitions sont désormais déduites de gestes qui existent déjà — ouverture
   du dossier, versement reçu, transmission à l'Onboarding — dans
   `src/services/cycleProspect.js`. La perte, elle, n'est plus écrite du tout : elle se
   déduit à la lecture dans `src/routes/kpi.js`. */

router.patch("/assignations/:id", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const ROLES_GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager", "pedagogical_advisor", "onboarding"];
    const isGlobal = ROLES_GLOBAUX.includes(req.role);

    // Récupérer l'assignation AVANT modification (pour comparer plan_paiement + création accès)
    const { data: existing, error: selErr } = await supabase
      .from("assignations_parcours")
      .select("assistante_id, plan_paiement, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, pa_advisor_id, statut")
      .eq("id", req.params.id)
      .single();
    if (selErr || !existing) return res.status(404).json({ error: "Assignation introuvable" });

    if (!isGlobal) {
      const { data: ass } = await supabase.from("assistantes").select("id").eq("email", req.profil.email).maybeSingle();
      if (!ass || ass.id !== existing.assistante_id) {
        return res.status(403).json({ error: "Accès refusé - ce prospect ne vous appartient pas" });
      }
    }

    // Une fois le contrat signé (transmis à l'admin BET pour validation), une assistante
    // ne peut plus modifier le statut - seul un rôle admin/global le peut désormais.
    if (existing.statut === "converti" && req.body.statut !== undefined && req.body.statut !== "converti" && !isGlobal) {
      return res.status(403).json({ error: "Ce dossier a été transmis à l'admin BET pour validation - le statut ne peut plus être modifié depuis cet écran." });
    }

    const allowed = ["statut", "mode_paiement", "statut_paiement", "montant_paye", "inscription_offre", "niveau_client", "objectif_client", "notes", "date_debut_formation", "documents_dossier", "suivi_demarrage", "suivi_presences", "plan_paiement", "notes_coach", "profil_type", "nom_parent", "telephone_parent", "email_parent", "routing_statut", "pa_advisor_id", "onboarding_id", "acces_apprenant", "dossier_statut"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    // Blocage anti-course : si ce dossier a une alerte "hors canal" (deux assistantes sur
    // deux canaux) encore non tranchée par un PA Advisor, on empêche une assistante
    // d'enregistrer l'apprenant (assignation coach/classe) de son côté avant que le PA
    // n'ait consolidé le dossier sur la bonne assistante - sinon les deux progressent
    // en parallèle et l'apprenant se retrouve avec deux parcours concurrents.
    const tenteEnregistrement = !!(updates.suivi_demarrage?.coach_id) || updates.statut === "converti";
    if (tenteEnregistrement && !isGlobal) {
      const { data: alertes } = await supabase
        .from("notifications")
        .select("meta")
        .or(`meta->>assignation_id.eq.${req.params.id},meta->>autre_assignation_id.eq.${req.params.id}`)
        .eq("type", "alerte");
      const pairesAVerifier = new Set();
      for (const n of alertes || []) {
        if (n.meta?.assignation_id && n.meta?.autre_assignation_id) {
          pairesAVerifier.add(JSON.stringify([n.meta.assignation_id, n.meta.autre_assignation_id]));
        }
      }
      for (const paire of pairesAVerifier) {
        const [idA, idB] = JSON.parse(paire);
        const { data: deuxAssignations } = await supabase
          .from("assignations_parcours")
          .select("id, assistante_id, statut")
          .in("id", [idA, idB]);
        if ((deuxAssignations || []).length === 2) {
          const [a1, a2] = deuxAssignations;
          // Un PA a déjà tranché dès qu'un des deux doublons est archivé - sans cette
          // exclusion, le blocage anti-course restait actif pour toujours (même bug
          // que idsEnAttenteHorsCanal plus haut dans ce fichier).
          const dejaConsolide = a1.statut === "archivé" || a2.statut === "archivé";
          if (!dejaConsolide && a1.assistante_id && a2.assistante_id && a1.assistante_id !== a2.assistante_id) {
            return res.status(409).json({
              error: "Ce dossier a une alerte \"hors canal\" en attente d'arbitrage par un PA Advisor (deux assistantes sur deux canaux) - l'enregistrement de l'apprenant est bloqué jusqu'à ce que le dossier soit consolidé.",
            });
          }
        }
      }
    }

    // Transfert de dossier à une autre assistante - réservé au PA Advisor / rôles
    // globaux (le flux prévu : le PA reçoit le signalement "offre hors canal" et
    // réaffecte lui-même au bon profil, pas l'assistante actuelle elle-même).
    // Passe par la Matrice de permissions (permissions_roles + permission_exceptions,
    // déjà résolue dans req.profil.permissions par authenticateAdmin) plutôt qu'une
    // liste de rôles codée en dur, pour que les exceptions par utilisateur soient
    // enfin respectées ici aussi.
    let transfertVersAssistanteId = null;
    if (req.body.assistante_id !== undefined) {
      if (!req.profil?.permissions?.inscriptions?.update) {
        return res.status(403).json({ error: "Seul un PA Advisor ou un rôle admin peut transférer ce dossier à une autre assistante" });
      }
      const { data: cible, error: cibleErr } = await supabase
        .from("assistantes")
        .select("id, nom, prenom, email, type_cours, profil")
        .eq("id", req.body.assistante_id)
        .eq("actif", true)
        .maybeSingle();
      if (cibleErr || !cible) return res.status(404).json({ error: "Assistante cible introuvable ou inactive" });
      // Garde-fou serveur : une assistante n'est qualifiée que pour SON canal - quel que
      // soit ce que le frontend envoie (ex: sélection restée périmée après un changement
      // de dossier ciblé côté PA), on refuse tout transfert vers un canal incompatible.
      // Exception : un PA Advisor (profil "pa") gère le coaching PRIVÉ sur tous les
      // canaux (en_ligne/présentiel/domicile) - c'est précisément sa raison d'être,
      // le champ type_cours de sa fiche assistante n'a pas de sens comme restriction ici.
      const estClaimPA = cible.profil === "pa" && existing.type_coaching === "prive";
      if (!estClaimPA && cible.type_cours && existing.type_cours && cible.type_cours !== existing.type_cours) {
        return res.status(409).json({
          error: `Cette assistante gère le canal "${cible.type_cours}", incompatible avec ce dossier ("${existing.type_cours}").`,
        });
      }
      updates.assistante_id = req.body.assistante_id;
      transfertVersAssistanteId = cible;
    }
    const PATCH_SELECT = "id, prospect_nom, prospect_email, type_cours, statut, statut_paiement, plan_paiement, acces_apprenant";
    let { data, error } = await supabase
      .from("assignations_parcours")
      .update(updates)
      .eq("id", req.params.id)
      .select(PATCH_SELECT)
      .single();

    // Fallback: strip columns that don't exist yet (pending migrations) and retry
    const colErr = (err, col) => err && (err.message || "").includes(col);
    if (colErr(error, "acces_apprenant")) {
      const { acces_apprenant: _aa, ...u0 } = updates;
      ({ data, error } = await supabase.from("assignations_parcours").update(u0).eq("id", req.params.id).select("id, prospect_nom, prospect_email, type_cours, statut, statut_paiement, plan_paiement").single());
    }
    if (colErr(error, "date_debut_formation")) {
      const { date_debut_formation: _d, acces_apprenant: _aa2, ...u2 } = updates;
      ({ data, error } = await supabase.from("assignations_parcours").update(u2).eq("id", req.params.id).select("id, prospect_nom, prospect_email, type_cours, statut, statut_paiement, plan_paiement").single());
    }
    if (colErr(error, "routing_statut") || colErr(error, "pa_advisor_id")) {
      const { routing_statut: _r, pa_advisor_id: _p, date_debut_formation: _d2, acces_apprenant: _aa3, ...u3 } = updates;
      ({ data, error } = await supabase.from("assignations_parcours").update(u3).eq("id", req.params.id).select("id, prospect_nom, prospect_email, type_cours, statut, statut_paiement, plan_paiement").single());
    }
    if (colErr(error, "notes_coach")) {
      const { notes_coach: _nc, routing_statut: _r2, pa_advisor_id: _p2, date_debut_formation: _d3, acces_apprenant: _aa4, ...u4 } = updates;
      ({ data, error } = await supabase.from("assignations_parcours").update(u4).eq("id", req.params.id).select("id, prospect_nom, prospect_email, type_cours, statut, statut_paiement, plan_paiement").single());
    }

    if (error) throw error;

    // ── Répercuter le statut sur les tables partagées (demandes_entreprise /
    // simulateurs_formation) ── sans ça, seule l'assistante propriétaire de cette
    // assignation voit le nouveau statut ; les autres assistantes B2B, qui lisent ces
    // tables partagées via GET /entreprise/mes-demandes sans avoir leur propre
    // assignation sur ce prospect, restaient bloquées sur l'ancien statut (ex: "Nouvelle
    // demande" alors que le contrat était déjà signé côté assistante propriétaire).
    const emailProspect = data.prospect_email || existing.prospect_email;
    if (updates.statut !== undefined && emailProspect) {
      await Promise.all([
        supabase.from("demandes_entreprise").update({ statut: updates.statut }).eq("email", emailProspect),
        supabase.from("simulateurs_formation").update({ statut: updates.statut }).eq("email_contact", emailProspect),
      ]).catch(() => {});
    }

    // ── Notification de transfert vers la nouvelle assistante ──
    if (transfertVersAssistanteId) {
      const prospectNomTransfert = data.prospect_nom || existing.prospect_nom || "un prospect";
      if (transfertVersAssistanteId.email) {
        const { data: u } = await supabase
          .from("utilisateurs")
          .select("id")
          .ilike("email", transfertVersAssistanteId.email.trim())
          .maybeSingle();
        if (u?.id) {
          await notifyUser(u.id, {
            type:    "assignation",
            titre:   `📋 Dossier transféré - ${prospectNomTransfert}`,
            message: `Un PA Advisor vous a transféré le dossier de ${prospectNomTransfert} (${data.type_cours || ""}).`,
            meta:    { assignation_id: req.params.id, prospect_nom: prospectNomTransfert },
            source:  "dash",
          }).catch(() => {});
        }
      }
      await notifyRole(["super_admin"], {
        type:    "assignation",
        titre:   `📋 Dossier réaffecté - ${prospectNomTransfert}`,
        message: `Un PA Advisor a réaffecté le dossier de ${prospectNomTransfert} (${data.type_cours || ""}) à une autre commerciale.`,
        meta:    { assignation_id: req.params.id, prospect_nom: prospectNomTransfert },
        source:  "dash",
      }).catch(() => {});

      // ── Consolidation : archive le dossier doublon (l'autre canal, jamais choisi
      // par le PA) - sinon il continue d'exister indéfiniment côté ancienne
      // assistante, et /mon-assignation (site public) pouvait encore le renvoyer si
      // ce doublon était le plus récent des deux, contredisant la décision du PA.
      if (req.body.assignation_doublon_id) {
        (async () => {
          try {
            const { data: doublon } = await supabase
              .from("assignations_parcours")
              .select("id, assistante_id, prospect_nom, type_cours, statut")
              .eq("id", req.body.assignation_doublon_id)
              .maybeSingle();
            if (!doublon || doublon.statut === "archivé") return;

            await supabase.from("assignations_parcours")
              .update({ statut: "archivé" })
              .eq("id", doublon.id);

            if (doublon.assistante_id) {
              const { data: ancienneAssistante } = await supabase
                .from("assistantes").select("email").eq("id", doublon.assistante_id).maybeSingle();
              if (ancienneAssistante?.email) {
                const { data: uAncien } = await supabase
                  .from("utilisateurs").select("id").ilike("email", ancienneAssistante.email.trim()).maybeSingle();
                if (uAncien?.id) {
                  await notifyUser(uAncien.id, {
                    type:    "assignation",
                    titre:   `📦 Dossier consolidé - ${prospectNomTransfert}`,
                    message: `Le PA Advisor a consolidé le dossier de ${prospectNomTransfert} (${doublon.type_cours || ""}) chez une autre commerciale. Il a été archivé de votre côté.`,
                    meta:    { assignation_id: doublon.id, prospect_nom: prospectNomTransfert },
                    source:  "dash",
                  }).catch(() => {});
                }
              }
            }
          } catch (e) { console.warn("[assignations PATCH] archivage doublon échoué:", e.message); }
        })();
      }
    }

    // ── Notification à l'Onboarding quand une assistante lui transmet un dossier ──
    // Manquait totalement : l'assistante en ligne/présentiel passait routing_statut à
    // "onboarding_en_attente" (bouton "Transmettre") sans jamais prévenir personne côté
    // onboarding, qui ne découvrait le dossier qu'en rafraîchissant sa liste par hasard.
    const prospectNomOnboarding = data.prospect_nom || existing.prospect_nom || "un apprenant";
    /* Transmettre un dossier en production, c'est l'avoir acquis : le cycle suit, sans
       clic supplémentaire. Idem pour le circuit PA du coaching privé, plus bas. */
    if (["onboarding_en_attente", "centre_assigne", "onboarding_affecte"].includes(updates.routing_statut)
        || updates.dossier_statut === "paiement_recu") {
      await marquerConverti(req.params.id);
    }

    if (updates.routing_statut === "onboarding_en_attente") {
      if (updates.onboarding_id) {
        notifyOnboarding(updates.onboarding_id, {
          type:    "assignation",
          titre:   `📥 Nouveau dossier à traiter - ${prospectNomOnboarding}`,
          message: `${prospectNomOnboarding} vient d'être transmis par une assistante commerciale - à affecter à une classe.`,
          meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding },
          source:  "dash",
        }).catch(() => {});
      } else {
        await notifyRole("onboarding", {
          type:    "assignation",
          titre:   `📥 Nouveau dossier à traiter - ${prospectNomOnboarding}`,
          message: `${prospectNomOnboarding} vient d'être transmis par une assistante commerciale - à affecter à une classe.`,
          meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding },
          source:  "dash",
        }).catch(() => {});
      }
    }

    // ── Notification à l'assistante quand le PA route un dossier privé PRÉSENTIEL/
    // DOMICILE vers elle (au lieu de l'Onboarding, réservé au en ligne) - c'est elle qui
    // crée/affecte la classe physique pour ce mode, cf. workflow "Cours Privé" Option 2.
    if (updates.routing_statut === "assistante_a_traiter") {
      (async () => {
        try {
          const { data: asgAssistante } = await supabase
            .from("assignations_parcours")
            .select("assistante_id, assistantes(email)")
            .eq("id", req.params.id)
            .maybeSingle();
          if (asgAssistante?.assistantes?.email) {
            const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", asgAssistante.assistantes.email.trim()).maybeSingle();
            if (u?.id) {
              await notifyUser(u.id, {
                type:    "assignation",
                titre:   `🏢 Dossier à finaliser - ${prospectNomOnboarding}`,
                message: `Le PA a vérifié le paiement de ${prospectNomOnboarding} - créez ou affectez la classe présentielle/domicile pour finaliser son inscription.`,
                meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding },
                source:  "dash",
              }).catch(() => {});
            }
          }
        } catch (e) { console.warn("[assignations PATCH] notif assistante_a_traiter échouée:", e.message); }
      })();
    }

    // ── Notification au PA Advisor quand l'assistante a fini d'assigner un dossier
    // PRIVÉ (présentiel/domicile) à une classe & un coach - c'était le trou signalé :
    // le PA la lui avait renvoyé ("assistante_a_traiter") mais n'était jamais prévenu
    // en retour une fois la finalisation faite, il ne le découvrait qu'en rafraîchissant
    // par hasard. Limité au coaching privé : le groupe présentiel classique n'a jamais
    // impliqué le PA dans son propre pipeline, pas de raison de le notifier ici.
    if (updates.routing_statut === "centre_assigne" && existing.type_coaching === "prive") {
      await notifyRole(["pedagogical_advisor", "admin_pa_advisor", "super_admin"], {
        type:    "assignation",
        titre:   `✅ Classe assignée - ${prospectNomOnboarding}`,
        message: `L'assistante a affecté ${prospectNomOnboarding} à une classe et un coach - dossier finalisé.`,
        meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding },
        source:  "dash",
      }).catch(() => {});
    }

    // ── Notification au PA Advisor quand Onboarding a fini d'affecter la classe ──
    // Même trou que côté onboarding : Onboarding passait routing_statut à "onboarding_affecte"
    // (classe créée, apprenant inscrit) sans jamais prévenir le PA Advisor qui avait affecté
    // le coach - il ne le découvrait qu'en rafraîchissant son dashboard par hasard.
    // pa_advisor_id n'est quasiment jamais renseigné pour un dossier groupe/en ligne (réservé
    // au coaching privé) - se limiter à ce champ laissait cette notification ne jamais
    // partir en pratique ; on diffuse donc à tout le rôle PA à la place, comme fait ailleurs
    // (sessions-live, séances clôturées). On indique aussi explicitement si la classe n'a
    // pas encore de coach, pour que le PA sache qu'il doit en assigner un.
    if (updates.routing_statut === "onboarding_affecte") {
      (async () => {
        try {
          let coachManquant = false;
          const { data: gaRow } = await supabase
            .from("groupes_apprenants")
            .select("groupe_id, note")
            .ilike("note", `%${req.params.id}%`)
            .order("date_ajout", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (gaRow?.groupe_id) {
            const { data: groupe } = await supabase
              .from("groupes").select("coach_id, nom").eq("id", gaRow.groupe_id).maybeSingle();
            coachManquant = !groupe?.coach_id;
          }
          const payloadPa = {
            type:    "assignation",
            titre:   coachManquant ? `🎓 Classe assignée sans coach - ${prospectNomOnboarding}` : `✅ Classe créée - ${prospectNomOnboarding}`,
            message: coachManquant
              ? `Onboarding a affecté ${prospectNomOnboarding} à une classe qui n'a pas encore de coach - assignez-en un dès que possible.`
              : `Onboarding a terminé l'affectation de ${prospectNomOnboarding} : la classe a été créée et l'apprenant y a été inscrit.`,
            meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding, groupe_id: gaRow?.groupe_id || null },
            source:  "dash",
          };
          if (existing.pa_advisor_id) await notifyUser(existing.pa_advisor_id, payloadPa);
          else await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], payloadPa);
          await notifyRole(["super_admin"], payloadPa, existing.pa_advisor_id || null);

          // Prévenir aussi l'assistante (en ligne ou présentiel) à l'origine du dossier -
          // jusqu'ici elle n'était jamais informée que l'Onboarding avait fini de créer la
          // classe (groupe ou coaching privé) de son prospect.
          if (existing.assistante_id) {
            const { data: assistante } = await supabase
              .from("assistantes").select("email").eq("id", existing.assistante_id).maybeSingle();
            const assistanteUserId = assistante?.email
              ? (await supabase.from("utilisateurs").select("id").ilike("email", assistante.email.trim()).maybeSingle()).data?.id
              : null;
            if (assistanteUserId) {
              await notifyUser(assistanteUserId, {
                type:    "assignation",
                titre:   `✅ Classe créée - ${prospectNomOnboarding}`,
                message: `L'Onboarding a terminé l'affectation de ${prospectNomOnboarding} : la classe a été créée et l'apprenant y a été inscrit.`,
                meta:    { assignation_id: req.params.id, prospect_nom: prospectNomOnboarding, groupe_id: gaRow?.groupe_id || null },
                source:  "dash",
              });
            }
          }
        } catch (e) { console.warn("[assignations PATCH] notif PA onboarding_affecte échouée:", e.message); }
      })();
    }

    // ── Notification au coach si un coach_id vient d'être assigné ──
    // Ne pas notifier si le dossier passe en attente onboarding (la notif sera envoyée par l'onboarding après création de la classe)
    const newCoachId = updates.suivi_demarrage?.coach_id;
    const isOnboardingPending = updates.routing_statut === "onboarding_en_attente";
    if (newCoachId && !isOnboardingPending) {
      const prospectNomNotif = data.prospect_nom || existing.prospect_nom || "un apprenant";
      const sd               = updates.suivi_demarrage || {};
      // Un classe_id/classe_nom ne peut venir que du flux "Assigner classe & coach" d'une
      // assistante présentiel (groupe déjà existant) - ce n'est jamais le cas du flux coaching
      // privé (PA/onboarding), qui lui décrit une formation/lieu/disponibilités à planifier.
      // Sans cette distinction, un coach recevait le texte "coaching privé" pour une simple
      // affectation à une classe de groupe.
      if (sd.classe_id || sd.classe_nom) {
        supabase.from("notifications").insert({
          user_id: newCoachId,
          type:    "assignation",
          titre:   `📚 Nouvelle classe assignée - ${sd.classe_nom || "classe"}`,
          message: `Vous avez été assigné(e) à la classe "${sd.classe_nom || "-"}", qui inclut ${prospectNomNotif}.`,
          lu:      false,
          meta:    { assignation_id: req.params.id, prospect_nom: prospectNomNotif, classe_id: sd.classe_id, classe_nom: sd.classe_nom },
        }).then(({ error: ne }) => { if (ne) console.error("[notif coach]", ne.message); });
      } else {
        const formation        = sd.formation_souhaitee || "-";
        const niveau           = sd.niveau_prospect     || "-";
        const lieu             = sd.lieu_coaching === "domicile"
          ? `🏠 À domicile${sd.adresse_coaching ? " - " + sd.adresse_coaching : ""}`
          : sd.lieu_coaching === "cabinet"
            ? `🏢 Au cabinet${sd.centre_coaching ? " - " + sd.centre_coaching : ""}`
            : sd.lieu_coaching || "-";
        // Disponibilités (nouveau format horaires ou ancien format jours/creneaux)
        const dispos  = sd.disponibilites || {};
        const dispoStr = (() => {
          if (Array.isArray(dispos.horaires) && dispos.horaires.length > 0) {
            return dispos.horaires.map(h => `${h.jour} ${h.debut}`).join(", ");
          }
          const jours    = Array.isArray(dispos.jours)    ? dispos.jours.join(", ")    : null;
          const creneaux = Array.isArray(dispos.creneaux) ? dispos.creneaux.join(", ") : null;
          return [jours, creneaux].filter(Boolean).join(" · ") || null;
        })();
        // Séances (optionnel)
        const seancesStr = sd.nb_seances_souhaitees ? ` · ${sd.nb_seances_souhaitees} séances prévues` : "";
        const messageParts = [
          `Vous avez été affecté au coaching privé de ${prospectNomNotif}.`,
          `Formation : ${formation} · Niveau : ${niveau}`,
          `Lieu : ${lieu}`,
          dispoStr ? `Disponibilités : ${dispoStr}` : null,
          sd.date_debut_formation ? `Début : ${sd.date_debut_formation}` : null,
          seancesStr ? seancesStr.trim() : null,
          `\nL'onboarding va créer la classe et vous transmettrez le planning définitif.`,
        ].filter(Boolean).join("\n");
        supabase.from("notifications").insert({
          user_id: newCoachId,
          type:    "assignation",
          titre:   `🎯 Nouvel apprenant assigné - ${prospectNomNotif}`,
          message: messageParts,
          lu:      false,
          meta:    { assignation_id: req.params.id, prospect_nom: prospectNomNotif, formation, niveau, lieu, disponibilites: sd.disponibilites },
        }).then(({ error: ne }) => { if (ne) console.error("[notif coach]", ne.message); });
      }
    }

    // ── Notification "échéance proche" - jusqu'ici, une tranche de paiement dont
    // l'échéance approchait n'était visible que dans le dossier apprenant lui-même
    // (onglet Paiement, calculé côté frontend), jamais remontée à la commerciale
    // ni sur son Tableau de bord ni via une notification. On détecte les tranches
    // nouvellement ajoutées dont l'échéance est déjà à ≤30 jours et on notifie
    // l'assistante propriétaire du dossier.
    if (updates.plan_paiement !== undefined) {
      const oldTranches = existing.plan_paiement?.tranches || [];
      const newTranches = data.plan_paiement?.tranches || [];
      const oldIds = new Set(oldTranches.map(t => t.id));
      const nouvelles = newTranches.filter(t => !oldIds.has(t.id) && t.statut === "en_attente" && t.date_echeance);
      if (nouvelles.length > 0) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const aRisque = nouvelles.filter(t => {
          const echeance = new Date(t.date_echeance); echeance.setHours(0, 0, 0, 0);
          return Math.ceil((echeance - today) / 86400000) <= 30;
        });
        if (aRisque.length > 0 && existing.assistante_id) {
          const { data: assistante } = await supabase
            .from("assistantes").select("email").eq("id", existing.assistante_id).maybeSingle();
          const assistanteUserId = assistante?.email
            ? (await supabase.from("utilisateurs").select("id").ilike("email", assistante.email).maybeSingle()).data?.id
            : null;
          if (assistanteUserId) {
            const prospectNomEcheance = data.prospect_nom || existing.prospect_nom || "un apprenant";
            for (const t of aRisque) {
              const echeance = new Date(t.date_echeance); echeance.setHours(0, 0, 0, 0);
              const joursRestants = Math.ceil((echeance - today) / 86400000);
              await notifyUser(assistanteUserId, {
                type:    "paiement",
                titre:   joursRestants < 0 ? `🚨 Échéance dépassée - ${prospectNomEcheance}` : `⏰ Échéance proche - ${prospectNomEcheance}`,
                message: joursRestants < 0
                  ? `La tranche "${t.label}" de ${prospectNomEcheance} est en retard de ${Math.abs(joursRestants)} jour(s).`
                  : `La tranche "${t.label}" de ${prospectNomEcheance} arrive à échéance dans ${joursRestants} jour(s).`,
                meta:    { assignation_id: req.params.id, prospect_nom: prospectNomEcheance, tranche_id: t.id, date_echeance: t.date_echeance },
                source:  "dash",
              }).catch(() => {});
            }
          }
        }
      }
    }

    // Construire un détail lisible selon les champs modifiés
    const changedKeys = Object.keys(updates);
    const prospectNom = data.prospect_nom || existing.prospect_nom || data.prospect_email || existing.prospect_email || "apprenant inconnu";
    let detail = `Dossier de ${prospectNom}`;
    if (changedKeys.includes("plan_paiement")) {
      const oldPlan = Array.isArray(existing.plan_paiement) ? existing.plan_paiement : [];
      const newPlan = Array.isArray(data.plan_paiement)     ? data.plan_paiement     : [];
      const diff    = newPlan.length - oldPlan.length;
      if (diff > 0) {
        detail += ` - ${diff} tranche${diff > 1 ? "s" : ""} de paiement ajoutée${diff > 1 ? "s" : ""} (total : ${newPlan.length})`;
      } else if (diff < 0) {
        const nb = Math.abs(diff);
        detail += ` - ${nb} tranche${nb > 1 ? "s" : ""} de paiement supprimée${nb > 1 ? "s" : ""} (reste : ${newPlan.length})`;
      } else {
        detail += ` - tranche de paiement modifiée (${newPlan.length} au total)`;
      }
    } else if (changedKeys.includes("statut")) {
      detail += ` - statut changé en "${data.statut}"`;
    } else if (changedKeys.includes("statut_paiement")) {
      detail += ` - statut paiement : "${data.statut_paiement}"`;
    } else {
      detail += ` - champ(s) modifié(s) : ${changedKeys.join(", ")}`;
    }

    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil?.id    || null,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || null,
      acteur_role:  req.role          || req.profil?.role || "admin",
      action_type:  "PARCOURS_UPDATED",
      module:       "parcours",
      entite_type:  "assignation",
      entite_id:    data.id,
      centre:       req.profil?.scope?.[0] || null,
      detail,
      metadata:     { champs: changedKeys, prospect_email: data.prospect_email, type_cours: data.type_cours },
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/parcours/assignations/:id/transmettre-pa ──────
// Action délibérée de l'assistante : transmet un dossier coaching privé au PA pour
// validation, une fois le "Besoin du client" renseigné - jamais automatique à la
// création (même principe que la transmission Onboarding plus haut dans ce fichier).
// Peut aussi resservir pour re-transmettre après une invalidation corrigée.
router.patch("/assignations/:id/transmettre-pa", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { data: existing, error: selErr } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, type_cours, type_coaching, dossier_statut, suivi_demarrage, assistantes(nom, prenom)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (selErr || !existing) return res.status(404).json({ error: "Dossier introuvable" });
    if (existing.type_coaching !== "prive") {
      return res.status(400).json({ error: "Cette action ne s'applique qu'aux dossiers de coaching privé" });
    }
    const sd = existing.suivi_demarrage || {};
    const lieuRempli = sd.lieu_coaching === "domicile" ? !!sd.adresse_coaching
      : sd.lieu_coaching === "en_ligne" ? true
      : !!sd.centre_coaching;
    if (!sd.niveau_prospect || !sd.formation_souhaitee || !sd.type_coaching || !lieuRempli || !(sd.disponibilites?.horaires?.length > 0)) {
      return res.status(400).json({ error: "Complétez le dossier (niveau, formation, type de coaching, lieu et disponibilités) avant de le transmettre au PA" });
    }

    const { data, error } = await supabase
      .from("assignations_parcours")
      .update({ dossier_statut: "en_attente_validation", motif_invalidation: null })
      .eq("id", req.params.id)
      .select("id, prospect_nom, dossier_statut")
      .single();
    if (error && (error.message || "").includes("dossier_statut")) {
      return res.status(500).json({ error: "La migration dossier_statut n'a pas encore été appliquée en base." });
    }
    if (error) throw error;

    const nomAssistante = existing.assistantes ? `${existing.assistantes.prenom||""} ${existing.assistantes.nom||""}`.trim() : "son assistante";
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", "super_admin"], {
      type:    "assignation",
      titre:   `🆕 Dossier coaching privé à valider - ${existing.prospect_nom}`,
      message: `${existing.prospect_nom} - coaching privé (${existing.type_cours}) transmis par ${nomAssistante}. Vérifiez la disponibilité du coach et validez ou invalidez le dossier.`,
      meta:    { assignation_id: req.params.id, prospect_nom: existing.prospect_nom, type_cours: existing.type_cours },
      source:  "dash",
    }).catch(() => {});

    res.json({ assignation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/parcours/assignations/:id/valider-prive ───────
// Validation/invalidation par le PA d'un dossier coaching privé (assistante déjà
// choisie par le client) - cf. workflow "Cours Privé" : le paiement ne peut être
// activé par l'assistante qu'une fois le dossier validé ici (motif obligatoire en
// cas de refus). Distinct de la sélection d'un PA sur un dossier "pool" (pa_advisor_id).
router.patch("/assignations/:id/valider-prive", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { decision, motif } = req.body;
    if (!["valide", "invalide"].includes(decision)) {
      return res.status(400).json({ error: "decision doit être 'valide' ou 'invalide'" });
    }
    if (decision === "invalide" && !motif?.trim()) {
      return res.status(400).json({ error: "Un motif est requis pour invalider un dossier" });
    }

    const { data: existing, error: selErr } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, type_coaching, assistante_id, dossier_statut, statut_paiement, assistantes(email, prenom, nom)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (selErr || !existing) return res.status(404).json({ error: "Dossier introuvable" });
    if (existing.type_coaching !== "prive") {
      return res.status(400).json({ error: "Cette action ne s'applique qu'aux dossiers de coaching privé" });
    }

    // Un prospect peut payer en ligne directement (TouchPoint) avant même que le PA
    // n'ait validé le dossier - sans cette vérification, la validation écrasait
    // systématiquement dossier_statut en "paiement_en_attente", ce qui affichait
    // indéfiniment "activez le paiement avec le client" côté assistante alors que
    // le paiement avait déjà été reçu.
    const dejaPaye = existing.statut_paiement === "payé";
    const updates = decision === "valide"
      ? { dossier_statut: dejaPaye ? "paiement_recu" : "paiement_en_attente", motif_invalidation: null }
      : { dossier_statut: "invalide", motif_invalidation: motif.trim() };

    let { data, error } = await supabase
      .from("assignations_parcours")
      .update(updates)
      .eq("id", req.params.id)
      .select("id, prospect_nom, dossier_statut, motif_invalidation")
      .single();

    if (error && (error.message || "").includes("dossier_statut")) {
      return res.status(500).json({ error: "La migration dossier_statut n'a pas encore été appliquée en base (sql/coaching_prive_dossier_statut_migration.sql)." });
    }
    if (error) throw error;

    // Notifier l'assistante propriétaire du dossier - c'est elle qui doit ensuite
    // soit activer/collecter le paiement (validé), soit relayer le refus au client (invalidé).
    if (existing.assistantes?.email) {
      const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", existing.assistantes.email.trim()).maybeSingle();
      if (u?.id) {
        await notifyUser(u.id, {
          type:    "assignation",
          titre:   decision === "valide" ? `✅ Dossier validé - ${existing.prospect_nom}` : `❌ Dossier invalidé - ${existing.prospect_nom}`,
          message: decision === "valide"
            ? (dejaPaye
                ? `Le PA a validé le dossier de ${existing.prospect_nom}. Le paiement en ligne avait déjà été reçu - dossier prêt pour la suite.`
                : `Le PA a validé le dossier de ${existing.prospect_nom}. Vous pouvez maintenant activer le paiement.`)
            : `Le PA a invalidé le dossier de ${existing.prospect_nom}. Motif : ${motif.trim()}`,
          meta:    { assignation_id: req.params.id, prospect_nom: existing.prospect_nom, dossier_statut: updates.dossier_statut },
          source:  "dash",
        }).catch(() => {});
      }
    }

    res.json({ assignation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/parcours/assignations/:id/renvoyer-acces ───────
// Régénère un mot de passe et renvoie l'email de bienvenue
router.post("/assignations/:id/renvoyer-acces", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    // Essayer avec acces_apprenant, fallback sans si colonne absente
    let ass, selErr;
    ({ data: ass, error: selErr } = await supabase
      .from("assignations_parcours")
      .select("prospect_nom, prospect_email, prospect_telephone, acces_apprenant")
      .eq("id", req.params.id)
      .single());
    if (selErr && (selErr.message || "").includes("acces_apprenant")) {
      ({ data: ass, error: selErr } = await supabase
        .from("assignations_parcours")
        .select("prospect_nom, prospect_email, prospect_telephone")
        .eq("id", req.params.id)
        .single());
    }
    if (selErr || !ass) return res.status(404).json({ error: "Assignation introuvable" });
    if (!ass.prospect_email) return res.status(400).json({ error: "Aucun email pour cet apprenant" });

    const email     = ass.prospect_email;
    const parts     = (ass.prospect_nom || "").trim().split(/\s+/);
    const prenom    = parts[0] || "Apprenant";
    const nom       = parts.slice(1).join(" ") || prenom;
    const telephone = ass.prospect_telephone || null;
    const mdpTemp   = "BET@" + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";
    const now       = new Date().toISOString();

    // Mettre à jour le mot de passe Supabase Auth
    const authUserId = ass.acces_apprenant?.auth_user_id;
    if (authUserId) {
      const { error: updErr } = await supabase.auth.admin.updateUserById(authUserId, { password: mdpTemp });
      if (updErr) console.warn("[renvoyer-acces] updateUserById:", updErr.message);
    } else {
      // Créer le compte si inexistant (cas rare)
      const { data: created, error: crErr } = await supabase.auth.admin.createUser({
        email, password: mdpTemp, email_confirm: true,
        user_metadata: { nom, prenom, telephone },
      });
      if (crErr) console.warn("[renvoyer-acces] createUser:", crErr.message);
      // Mettre à jour auth_user_id pour les prochains renvois
      if (created?.user?.id) {
        await supabase.from("assignations_parcours").update({
          acces_apprenant: { ...(ass.acces_apprenant || {}), auth_user_id: created.user.id },
        }).eq("id", req.params.id);
      }
    }

    // Sauvegarder dans la BDD (best-effort - colonne peut ne pas exister si migration non jouée)
    const cree_le   = ass.acces_apprenant?.cree_le || now;
    const newAcces  = { ...(ass.acces_apprenant || {}), email, mdp_temp: mdpTemp, cree_le, renvoye_le: now };
    const { error: storeErr } = await supabase.from("assignations_parcours")
      .update({ acces_apprenant: newAcces }).eq("id", req.params.id);
    if (storeErr) console.warn("[renvoyer-acces] store (migration manquante ?):", storeErr.message);

    // Envoyer l'email
    await sendApprenantWelcomeEmail({ prenom, nom, email, mdpTemp });
    console.log(`[renvoyer-acces] ✅ Email envoyé → ${email}`);

    res.json({ email, mdp_temp: mdpTemp, cree_le, renvoye_le: now });
  } catch (err) {
    console.error("[renvoyer-acces]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes (admin) ────────────────────
// ── GET /api/parcours/pa-advisors ────────────────────────────
// Liste des PA Advisors actifs (pour le picker dans la finalisation)
router.get("/pa-advisors", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, avatar_url")
      .eq("role", "pedagogical_advisor")
      .eq("actif", true)
      .order("prenom");
    if (error) throw error;
    res.json({ pa_advisors: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/mes-apprenants-pa ──────────────────────
// PA Advisor : assignations de cours privés qui lui ont été routées
// ── GET /api/parcours/mes-apprenants-coach ───────────────────
// Retourne les apprenants privés assignés à ce coach via suivi_demarrage.coach_id
router.get("/mes-apprenants-coach", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Non authentifié" });

    // Tentative 1 : filtre JSON @> (contains) - plus fiable que ->> text
    let { data, error } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, prospect_telephone, statut, routing_statut, suivi_demarrage, notes_coach, objectif_client, created_at, updated_at")
      .in("statut", ["converti", "en_cours"])
      .contains("suivi_demarrage", { coach_id: coachId });

    // Tentative 2 : filtre ->>text si @> échoue ou retourne vide
    if ((error || !data?.length)) {
      const r2 = await supabase
        .from("assignations_parcours")
        .select("id, prospect_nom, prospect_email, prospect_telephone, statut, routing_statut, suivi_demarrage, notes_coach, objectif_client, created_at, updated_at")
        .in("statut", ["converti", "en_cours"])
        .filter("suivi_demarrage->>coach_id", "eq", coachId);
      if (!r2.error && r2.data?.length) { data = r2.data; error = null; }
    }

    // Tentative 3 : récupérer tous les dossiers privés et filtrer en mémoire
    if (!data?.length) {
      const r3 = await supabase
        .from("assignations_parcours")
        .select("id, prospect_nom, prospect_email, prospect_telephone, statut, routing_statut, suivi_demarrage, notes_coach, objectif_client, created_at, updated_at")
        .in("routing_statut", ["onboarding_en_attente", "onboarding_affecte"])
        .in("statut", ["converti", "en_cours"]);
      if (!r3.error && r3.data?.length) {
        const filtered = r3.data.filter(a => {
          const sdCoachId = a.suivi_demarrage?.coach_id;
          return sdCoachId && String(sdCoachId).toLowerCase() === String(coachId).toLowerCase();
        });
        if (filtered.length) { data = filtered; error = null; }
      }
    }

    if (error) throw error;

    // Classe privée créée par Onboarding pour chaque dossier (lien posé dans
    // groupes_apprenants.note à la création) - permet au coach de retrouver ses séances
    // de la table unifiée `seances` (filtrée par groupe_id) sans dépendre de l'ancien
    // système seances_privees.
    const idsPourGroupe = (data || []).map(a => a.id);
    let groupeIdMap = {};
    if (idsPourGroupe.length) {
      const { data: gaRows } = await supabase
        .from("groupes_apprenants")
        .select("groupe_id, note")
        .or(idsPourGroupe.map(id => `note.ilike.%${id}%`).join(","));
      (gaRows || []).forEach(row => {
        try {
          const aid = JSON.parse(row.note || "{}").assignation_id;
          if (aid) groupeIdMap[aid] = row.groupe_id;
        } catch {}
      });
    }

    const apprenants = (data || []).map(a => {
      const sd = a.suivi_demarrage || {};
      return {
        id:                a.id,
        groupe_id:         groupeIdMap[a.id] || null,
        _type:             "prive",
        prospect_nom:      a.prospect_nom,
        prospect_email:    a.prospect_email,
        prospect_telephone:a.prospect_telephone,
        statut:            a.statut,
        routing_statut:    a.routing_statut,
        formation:           sd.formation_souhaitee    || "Cours privé",
        niveau:              sd.niveau_prospect        || null,
        lieu:                sd.lieu_coaching          || "cabinet",
        centre_coaching:     sd.centre_coaching        || null,
        adresse_coaching:    sd.adresse_coaching       || null,
        type_coaching:       sd.type_coaching          || "classique",
        cout_formation:      sd.cout_formation         || null,
        nb_seances:          sd.nb_seances_souhaitees  || null,
        disponibilites:      sd.disponibilites         || null,
        pack_coaching:       sd.pack_coaching          || null,
        // L'OBJECTIF DU CLIENT, absent de cette route jusqu'au 26/09/2026 : le coach ne
        // pouvait pas savoir ce que son apprenant attendait de ses séances, et devait le
        // demander à l'assistante. Le champ vit sur l'assignation, pas dans suivi_demarrage.
        objectif_client:     a.objectif_client         || null,
        created_at:        a.created_at,
        updated_at:        a.updated_at,
      };
    });

    res.json({ apprenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/mes-apprenants-pa", authenticateAdmin, async (req, res) => {
  try {
    const userId = req.profil?.id || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Non authentifié" });

    const SELECT = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, date_debut_formation, suivi_demarrage, routing_statut, pa_advisor_id, profil_type, nom_parent, telephone_parent, email_parent, created_at, assistantes(id, nom, prenom, telephone, email), centres(nom)";

    const { data, error } = await supabase
      .from("assignations_parcours")
      .select(SELECT)
      .eq("pa_advisor_id", userId)
      .eq("statut", "converti")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      apprenants: (data || []).map(a => ({
        ...a,
        commerciale_nom: a.assistantes ? `${a.assistantes.prenom} ${a.assistantes.nom}` : "-",
        commerciale_email: a.assistantes?.email || null,
        centre_nom: a.centres?.nom || null,
        assistantes: undefined,
        centres: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/mes-apprenants-onboarding ───────────────
// Onboarding : apprenants convertis par ses commerciales avec routing_statut = onboarding_en_attente
// Supporte plusieurs commerciales par onboarding
// Utilise assignations_parcours.onboarding_id (figé à la création) pour une isolation stable.
router.get("/mes-apprenants-onboarding", authenticateAdmin, async (req, res) => {
  try {
    const myId = req.profil?.id || req.user?.id;
    if (!myId) return res.status(401).json({ error: "Non authentifié" });

    const colErr = (err, col) => err && (err.message || "").includes(col);

    const SELECT_GLOBAL = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, date_debut_formation, routing_statut, pa_advisor_id, profil_type, nom_parent, telephone_parent, email_parent, prenom_enfant, nom_enfant, age_enfant, niveau_classe_enfant, suivi_demarrage, created_at, centres(nom), assistante_id";

    // Compte "Onboarding global" : voit TOUTES les demandes en attente côté onboarding,
    // sans restriction par onboarding_id/assistante_id - ignore donc tout le système de
    // filtrage par myId ci-dessous, propre aux comptes onboarding classiques.
    if (req.profil?.onboarding_vue_globale === true) {
      let { data, error } = await supabase
        .from("assignations_parcours")
        .select(SELECT_GLOBAL)
        .eq("routing_statut", "onboarding_en_attente")
        .neq("statut", "annule")
        .order("created_at", { ascending: false });
      if (colErr(error, "date_debut_formation") || colErr(error, "prenom_enfant")) {
        ({ data, error } = await supabase
          .from("assignations_parcours")
          .select("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, routing_statut, profil_type, nom_parent, telephone_parent, email_parent, suivi_demarrage, created_at, centres(nom), assistante_id")
          .eq("routing_statut", "onboarding_en_attente")
          .neq("statut", "annule")
          .order("created_at", { ascending: false }));
      }
      if (error) throw error;

      const assistanteIdsG = [...new Set((data||[]).map(a => a.assistante_id).filter(Boolean))];
      let assEmailMapG = {};
      if (assistanteIdsG.length) {
        const { data: assRowsG } = await supabase.from("assistantes").select("id,email").in("id", assistanteIdsG);
        (assRowsG||[]).forEach(a => { assEmailMapG[a.id] = a.email; });
      }
      const paIdsG = [...new Set((data||[]).map(a => a.pa_advisor_id).filter(Boolean))];
      let paNameMapG = {};
      if (paIdsG.length) {
        const { data: paRowsG } = await supabase.from("utilisateurs").select("id,nom,prenom").in("id", paIdsG);
        (paRowsG||[]).forEach(p => { paNameMapG[p.id] = `${p.prenom||""} ${p.nom||""}`.trim(); });
      }
      return res.json({
        apprenants: (data||[]).map(a => ({
          ...a,
          commerciale_email: assEmailMapG[a.assistante_id] || null,
          pa_advisor_nom:    paNameMapG[a.pa_advisor_id] || null,
          centre_nom:        a.centres?.nom || null,
        })),
      });
    }

    // Helper: requête directe sur onboarding_id (stable même si commerciale change d'onboarding)
    const runQuery = (select, withRouting) => {
      let q = supabase
        .from("assignations_parcours")
        .select(select)
        .eq("onboarding_id", myId)
        .neq("statut", "annule");
      if (withRouting) q = q.eq("routing_statut", "onboarding_en_attente");
      return q.order("created_at", { ascending: false });
    };

    // Fallback si onboarding_id n'existe pas encore → chercher via assistantes.onboarding_id
    // - jamais les assistantes centre (présentiel), hors périmètre onboarding.
    const runQueryFallback = async (select, withRouting) => {
      const { data: assRows, error: assErr } = await supabase
        .from("assistantes").select("id, type_cours").eq("onboarding_id", myId);
      if (assErr || !assRows?.length) return { data: [], error: null };
      const assistanteIds = assRows.filter(a => a.type_cours !== "presentiel").map(a => a.id);
      if (!assistanteIds.length) return { data: [], error: null };
      let q = supabase
        .from("assignations_parcours")
        .select(select)
        .in("assistante_id", assistanteIds)
        .neq("statut", "annule");
      if (withRouting) q = q.eq("routing_statut", "onboarding_en_attente");
      return q.order("created_at", { ascending: false });
    };

    let data, error, usedFallback = false;

    const SELECT_FULL = "id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, date_debut_formation, routing_statut, pa_advisor_id, profil_type, nom_parent, telephone_parent, email_parent, prenom_enfant, nom_enfant, age_enfant, niveau_classe_enfant, suivi_demarrage, created_at, centres(nom), assistante_id";

    // Tentative 1 : requête directe via onboarding_id (colonne stable)
    ({ data, error } = await runQuery(SELECT_FULL, true));

    // Fallback si :
    // - colonne onboarding_id inexistante (migration pas jouée)
    // - OU résultat vide (onboarding_id null sur les assignations car migration récente)
    if (colErr(error, "onboarding_id") || (!error && (!data || data.length === 0))) {
      usedFallback = true;
      const fb = await runQueryFallback(SELECT_FULL, true);
      // Fusionner : garder les résultats directs + ceux du fallback (dédupliqués par id)
      if (!fb.error && fb.data?.length) {
        const directIds = new Set((data || []).map(r => r.id));
        const merged = [...(data || []), ...fb.data.filter(r => !directIds.has(r.id))];
        data  = merged;
        error = null;
      } else if (colErr(error, "onboarding_id")) {
        // Colonne manquante : utiliser uniquement le fallback
        ({ data, error } = fb);
      }
    }

    // Tentative 3 : dossiers PA privés - suivi_demarrage.onboarding_id (JSON, toujours disponible)
    // Couvre les cas où la colonne onboarding_id n'existe pas ou n'a pas été remplie
    {
      const { data: sdData, error: sdErr } = await supabase
        .from("assignations_parcours")
        .select(SELECT_FULL)
        .filter("suivi_demarrage->>onboarding_id", "eq", myId)
        .eq("routing_statut", "onboarding_en_attente")
        .neq("statut", "annule")
        .order("created_at", { ascending: false });
      if (!sdErr && sdData?.length) {
        const existingIds = new Set((data || []).map(r => r.id));
        const extra = sdData.filter(r => !existingIds.has(r.id));
        if (extra.length) {
          data  = [...(data || []), ...extra];
          error = null;
        }
      }
    }

    if (colErr(error, "date_debut_formation") || colErr(error, "prenom_enfant")) {
      ({ data, error } = usedFallback
        ? await runQueryFallback("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, routing_statut, profil_type, nom_parent, telephone_parent, email_parent, suivi_demarrage, created_at, centres(nom), assistante_id", true)
        : await runQuery("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, routing_statut, profil_type, nom_parent, telephone_parent, email_parent, suivi_demarrage, created_at, centres(nom), assistante_id", true)
      );
    }

    if (colErr(error, "routing_statut")) {
      ({ data, error } = usedFallback
        ? await runQueryFallback("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, profil_type, nom_parent, telephone_parent, email_parent, suivi_demarrage, created_at, centres(nom), assistante_id", false)
        : await runQuery("id, prospect_nom, prospect_email, prospect_telephone, type_cours, type_coaching, centre_id, statut, statut_paiement, mode_paiement, inscription_offre, montant_paye, niveau_client, objectif_client, notes, profil_type, nom_parent, telephone_parent, email_parent, suivi_demarrage, created_at, centres(nom), assistante_id", false)
      );
      if (!error && data?.length) {
        const emails = data.map(a => a.prospect_email).filter(Boolean);
        const { data: placed } = await supabase
          .from("groupes_apprenants")
          .select("email_apprenant")
          .in("email_apprenant", emails)
          .neq("statut", "retire");
        const placedSet = new Set((placed || []).map(p => (p.email_apprenant || "").toLowerCase()));
        data = data.filter(a => !placedSet.has((a.prospect_email || "").toLowerCase()));
      }
    }

    if (error) throw error;

    // Récupérer les emails des commerciales pour enrichissement
    const assistanteIdsInData = [...new Set((data||[]).map(a => a.assistante_id).filter(Boolean))];
    let assEmailMap = {};
    if (assistanteIdsInData.length) {
      const { data: assRows2 } = await supabase.from("assistantes").select("id,email").in("id", assistanteIdsInData);
      (assRows2||[]).forEach(a => { assEmailMap[a.id] = a.email; });
    }

    // Nom du PA Advisor qui a traité le dossier - traçabilité maintenant qu'il y a
    // plusieurs PA (sans ça, l'onboarding ne sait pas qui contacter en cas de doute).
    const paIdsInData = [...new Set((data||[]).map(a => a.pa_advisor_id).filter(Boolean))];
    let paNomMap = {};
    if (paIdsInData.length) {
      const { data: paRows } = await supabase.from("utilisateurs").select("id,nom,prenom").in("id", paIdsInData);
      (paRows||[]).forEach(u => { paNomMap[u.id] = `${u.prenom||""} ${u.nom||""}`.trim(); });
    }

    res.json({
      apprenants: (data || []).map(a => ({
        ...a,
        date_debut_formation: a.date_debut_formation ?? null,
        routing_statut:       a.routing_statut       ?? null,
        centre_nom:           a.centres?.nom         || null,
        commerciale_email:    assEmailMap[a.assistante_id] || null,
        pa_advisor_nom:       paNomMap[a.pa_advisor_id] || null,
        centres: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/parcours/assistantes/gestion (admin) ────────────
// Vue complète (tous statuts, tous champs - dont onboarding_id) pour l'écran
// "Planning des assistantes". Route dédiée : GET /assistantes (ci-dessus) est
// réservée au staff pour un usage plus restreint (actives uniquement, champs
// limités) et était auparavant masquée par un doublon sur le même chemin.
router.get("/assistantes/gestion", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("assistantes")
      .select("*, centres(nom)")
      .order("created_at");
    if (error) throw error;
    res.json({
      assistantes: (data || []).map(a => ({
        ...a,
        centre_nom: a.centres?.nom || null,
        centres: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/parcours/assistantes/:id (admin) ──────────────
router.patch("/assistantes/:id", authenticateAdmin, async (req, res) => {
  try {
    if (req.body.type_cours === "les_deux") {
      return res.status(400).json({ error: "Le mode \"Les deux\" n'est plus disponible pour une assistante - choisissez En ligne ou Présentiel." });
    }
    const allowed = ["nom", "prenom", "email", "telephone", "photo_url", "quota_jour", "actif", "type_cours", "type_semaine", "centre_id", "jours_travail", "profil", "onboarding_id", "utilisateur_id"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const { data, error } = await supabase
      .from("assistantes")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Réutilisé par l'import en masse, qui crée ses dossiers via la MÊME logique que
// la route publique - sans repasser par HTTP (voir src/routes/imports.js).
export { creerAssignationCore };
export default router;
