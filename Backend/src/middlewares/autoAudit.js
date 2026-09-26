import { logAudit } from "./logAudit.js";

const SKIP_PREFIXES = [
  "/api/auth",
  "/api/admin",
  "/api/boutique",
  "/api/paiements",
  "/api/audit",
  // Modules déjà instrumentés avec des appels logAudit() manuels (détail lisible, propre à
  // chaque action) - les laisser passer ici créerait un doublon générique moins lisible en
  // plus du log précis. "/api/contenus" couvre aussi des routes appelées par les apprenants
  // eux-mêmes (vues, mini-jeux) qui n'ont pas leur place dans un journal d'audit admin.
  "/api/contenus",
  "/api/inscriptions-elearning",
  "/api/classes-elearning",
  // Trafic du site public (pageview), pas une action administrative - déjà couvert par
  // l'onglet dédié "Trafic Web", n'a rien à faire dans le journal d'audit admin.
  "/api/analytics",
  // Test de niveau public (soumission par un prospect anonyme, pas une action admin) +
  // suivi de tentative en cours (level_test_attempts) qui écrit très fréquemment (toutes
  // les ~15s pendant qu'un candidat passe le test) - noyait le journal d'audit sous des
  // centaines d'entrées "LEVEL TEST UPDATED" sans aucune valeur pour le staff. Le slash
  // final est indispensable : "/api/level-test" est un préfixe de "/api/level-tests"
  // (config admin CRUD, pluriel) qui doit lui rester audité.
  "/api/level-test/",
  "/api/bet-elearning/level-test/",
];

const METHOD_TO_ACTION = {
  POST:   "CREATED",
  PUT:    "UPDATED",
  PATCH:  "UPDATED",
  DELETE: "DELETED",
};

const MODULE_LABELS = {
  inscriptions:    "Inscription",
  leads:           "Lead / prospect",
  parcours:        "Parcours",
  coachs:          "Coach",
  centres:         "Centre",
  blog:            "Article de blog",
  temoignages:     "Témoignage",
  sondage:         "Sondage",
  newsletter:      "Newsletter",
  messages:        "Message",
  avis:            "Avis",
  groupes:         "Groupe de cours",
  contrats_prives: "Contrat privé",
  plaintes:        "Plainte",
  faq:             "FAQ",
  carousel:        "Carousel",
  offre_media:     "Média offre",
  corporate:       "Corporate",
  marquee:         "Bandeau défilant",
  codes_promo:     "Code promo",
  partenaires:     "Partenaire",
  equipe_photos:   "Photo équipe",
  level_test:      "Test de niveau",
  level_tests:     "Test de niveau",
  contact:         "Contact",
  devis:           "Devis",
  entreprise:      "Entreprise",
  simulateur:      "Simulateur",
  upload:          "Fichier",
  cinetpay:        "Paiement CinetPay (désactivé)",
  touchpoint:      "Paiement TouchPoint",
  config_contact:  "Configuration contact",
  comptabilite:               "Comptabilité - Facturation/Trésorerie",
  comptabilite_generale:      "Comptabilité générale",
  comptabilite_tva:           "Comptabilité - TVA",
  comptabilite_immobilisations: "Comptabilité - Immobilisations",
  dash_comptabilite:              "Comptabilité - Facturation/Trésorerie",
  dash_comptabilite_generale:     "Comptabilité générale",
  dash_comptabilite_tva:          "Comptabilité - TVA",
  dash_comptabilite_immobilisations: "Comptabilité - Immobilisations",
  apprenants:            "Apprenant",
  remplacements:         "Remplacement de coach",
  presences_privees:     "Présence - cours privé",
  seances:               "Séance",
  seances_privees:       "Séance privée",
  notifications:         "Notification",
  fichiers_prives:       "Fichier privé",
  packages_commerciaux:  "Package commercial",
  gamification:          "Gamification",
  gamification_coach:    "Gamification coach",
  gamification_coach_dash: "Gamification coach",
  mon_espace:            "Espace apprenant",
  cours_elearning:       "Cours e-learning",
  config_competences_elearning: "Configuration compétences e-learning",
  config_footer_elearning:      "Configuration footer e-learning",
  elearning:             "E-learning",
  superviseur:           "Supervision",
  tickets:               "Ticket support",
  placement:             "Test de placement",
};

// Libellés humains pour les noms de champs les plus courants - évite d'afficher
// des clés techniques brutes ("prix_h", "date_fin_formation") dans le journal.
const FIELD_LABELS = {
  nom: "Nom", prenom: "Prénom", email: "Email", telephone: "Téléphone",
  statut: "Statut", niveau: "Niveau", actif: "Actif", visible: "Visible",
  motif: "Motif", note: "Note", notes: "Notes", type: "Type",
  type_cours: "Type de cours", type_contrat: "Type de contrat",
  capacite_max: "Capacité max", coach_id: "Coach", groupe_id: "Groupe",
  centre_id: "Centre", apprenant_id: "Apprenant", classe_id: "Classe",
  date_debut: "Date de début", date_fin: "Date de fin",
  date_debut_formation: "Date de début", date_fin_formation: "Date de fin",
  prix: "Prix", prix_h: "Tarif horaire", montant: "Montant",
  montant_recu: "Montant reçu", montant_total: "Montant total",
  nb_seances_total: "Nombre de séances", nb_seances_realisees: "Séances réalisées",
  duree_seance_h: "Durée de séance", raison: "Raison", raison_sociale: "Raison sociale",
  objectif: "Objectif", filiere: "Filière", role: "Rôle",
  mode_paiement: "Mode de paiement", reference: "Référence",
  cle: "Paramètre", valeur: "Valeur", titre: "Titre", cat: "Catégorie",
  fichier_url: "Fichier", horaire: "Horaire", scope: "Périmètre",
};
const fieldLabel = k => FIELD_LABELS[k] || k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
// Champs dont la valeur, si numérique, représente très probablement un montant FCFA.
const MONEY_KEY = /prix|montant|tarif|solde|encaiss/i;

const ACTION_VERBS = {
  CREATED: { v: "ajouté(e)",    past: "Nouveau/Nouvelle" },
  UPDATED: { v: "mis(e) à jour", past: "Modification"    },
  DELETED: { v: "supprimé(e)",  past: "Suppression"      },
};

const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// Champs "sensibles" à ne pas logguer
const SKIP_KEYS = new Set(["password", "mot_de_passe", "token", "secret", "access_token", "refresh_token"]);

function deriveModule(path) {
  const match = path.match(/^\/api\/([^/?]+)/);
  return match ? match[1].replace(/-/g, "_") : "system";
}

function deriveActionType(method, path) {
  return `${deriveModule(path).toUpperCase()}_${METHOD_TO_ACTION[method] || "ACTION"}`;
}

// Cherche un nom lisible dans le body
function extractName(body) {
  if (!body || typeof body !== "object") return null;
  if (body.prospect_nom)                     return body.prospect_nom;
  if (body.apprenant_nom && body.apprenant_prenom) return `${body.apprenant_prenom} ${body.apprenant_nom}`;
  if (body.apprenant_nom)                    return body.apprenant_nom;
  if (body.coach_nom)                        return body.coach_nom;
  if (body.client_nom)                       return body.client_nom;
  if (body.nom_complet)                      return body.nom_complet;
  if (body.raison_sociale)                   return body.raison_sociale;
  if (body.entreprise_nom)                   return body.entreprise_nom;
  if (body.groupe_nom)                       return body.groupe_nom;
  if (body.nom && body.prenom)               return `${body.prenom} ${body.nom}`;
  if (body.nom)                              return body.nom;
  if (body.name)                             return body.name;
  if (body.titre || body.title)              return body.titre || body.title;
  if (body.label)                            return body.label;
  if (body.sujet || body.subject)            return body.sujet || body.subject;
  if (body.prospect_email || body.email)     return body.prospect_email || body.email;
  return null;
}

// Formate une valeur de champ pour affichage dans le journal - devine le type
// (montant FCFA, booléen, date ISO) à partir du nom de champ et du contenu.
function formatValue(key, v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "activé" : "désactivé";
  if (typeof v === "number") return MONEY_KEY.test(key) ? `${v.toLocaleString("fr-FR")} FCFA` : String(v);
  if (Array.isArray(v)) return `${v.length} élément${v.length > 1 ? "s" : ""}`;
  if (typeof v === "object") return null; // trop imbriqué pour tenir dans une ligne
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d)) return d.toLocaleDateString("fr-FR", v.includes("T") ? { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" } : { day:"2-digit", month:"2-digit", year:"numeric" });
    }
    return v.length <= 60 ? v : v.slice(0, 57) + "…";
  }
  return String(v);
}

// Résume les champs modifiés de façon lisible (PATCH / PUT)
function summarizeChanges(body) {
  if (!body || typeof body !== "object") return null;
  const keys = Object.keys(body).filter(k =>
    !SKIP_KEYS.has(k) &&
    !["id", "updated_at", "created_at", "user_id", "acteur_id"].includes(k)
  );
  if (keys.length === 0) return null;

  // On affiche la valeur de chaque champ modifié (nom lisible + valeur formatée),
  // jusqu'à 8 champs - au-delà, un journal d'audit devient illisible de toute façon,
  // donc on bascule sur une simple liste des noms de champs restants.
  const MAX_AVEC_VALEURS = 8;
  if (keys.length <= MAX_AVEC_VALEURS) {
    const parts = keys.map(k => {
      const v = body[k];
      if (v === null || v === undefined || v === "") return `${fieldLabel(k)} effacé`;
      const formatted = formatValue(k, v);
      if (formatted === null) return `${fieldLabel(k)} mis à jour`;
      if (typeof v === "boolean") return `${fieldLabel(k)} ${formatted}`;
      return `${fieldLabel(k)} → ${typeof v === "string" && !MONEY_KEY.test(k) ? `"${formatted}"` : formatted}`;
    });
    return parts.join(", ");
  }
  // Trop de champs pour tout détailler - on liste les noms lisibles (pas les clés brutes)
  return `champs modifiés : ${keys.slice(0, 6).map(fieldLabel).join(", ")}${keys.length > 6 ? `… (+${keys.length - 6})` : ""}`;
}

function buildDetail(method, fullPath, status, body) {
  const module    = deriveModule(fullPath);
  const action    = METHOD_TO_ACTION[method] || "ACTION";
  const modLabel  = MODULE_LABELS[module] || module.replace(/_/g, " ");
  const verbObj   = ACTION_VERBS[action] || { v: action.toLowerCase(), past: action };

  // Sous-ressource (ex: "assignations" dans /api/parcours/assignations/:id)
  const subPath     = fullPath.replace(/^\/api\/[^/]+\/?/, "");
  const segments    = subPath.split("/").filter(Boolean);
  const subResource = segments.filter(s => !IS_UUID.test(s)).join(" › ");
  const lastUUID    = [...segments].reverse().find(s => IS_UUID.test(s));

  const entityName = extractName(body);

  // Phrase principale
  let detail = modLabel;
  if (subResource) detail += ` › ${subResource}`;

  if (method === "POST") {
    detail += entityName
      ? ` - ${verbObj.past.toLowerCase()} : ${entityName}`
      : ` - ${verbObj.v}`;
  } else if (method === "DELETE") {
    detail += lastUUID
      ? ` - ${verbObj.v} (ID : ${lastUUID.slice(0, 8)}…)`
      : ` - ${verbObj.v}`;
    if (entityName) detail += ` [${entityName}]`;
  } else {
    // PATCH / PUT - préfère un nom lisible (nom/titre transmis dans le body) à l'UUID brut.
    const changes = summarizeChanges(body);
    if (entityName) {
      detail += ` - ${entityName}`;
    } else if (lastUUID) {
      detail += ` (ID : ${lastUUID.slice(0, 8)}…)`;
    }
    detail += changes ? ` - ${changes}` : ` - ${verbObj.v}`;
  }

  if (status >= 400) detail += ` ⚠ HTTP ${status}`;
  return detail;
}

// Résout l'acteur selon la source disponible :
// 1. req.profil  → staff admin (authenticateAdmin)
// 2. req.user    → apprenant connecté (authenticateUser) - nom dans user_metadata
// 3. body        → visiteur anonyme (formulaire public)
function resolveActor(req, body) {
  // ── Cas 1 : staff admin ────────────────────────────────────
  if (req.profil) {
    const p = req.profil;
    return {
      acteur_id:    p.id    || null,
      acteur_nom:   (p.prenom && p.nom) ? `${p.prenom} ${p.nom}` : p.nom || p.email || null,
      acteur_email: p.email || null,
      acteur_role:  p.role  || req.role || "admin",
    };
  }

  // ── Cas 2 : apprenant connecté (objet Supabase brut) ───────
  if (req.user) {
    const u    = req.user;
    const meta = u.user_metadata || {};
    const nom  = (meta.prenom && meta.nom)
      ? `${meta.prenom} ${meta.nom}`
      : meta.nom || meta.full_name || meta.name || u.email || null;
    return {
      acteur_id:    u.id  || u.sub || null,
      acteur_nom:   nom,
      acteur_email: u.email || null,
      acteur_role:  u.app_metadata?.role || "apprenant",
    };
  }

  // ── Cas 3 : visiteur anonyme - on récupère ce qu'on peut dans le body ──
  const nom = extractName(body);
  const email = body?.email || body?.prospect_email || body?.acteur_email || null;
  return {
    acteur_id:    null,
    acteur_nom:   nom || email || "Visiteur",
    acteur_email: email,
    acteur_role:  "anonyme",
  };
}

export function autoAudit(req, res, next) {
  const { method } = req;

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

  const fullPath = req.originalUrl.split("?")[0];

  if (SKIP_PREFIXES.some(p => fullPath.startsWith(p))) return next();

  // Copie du body MAINTENANT avant que les handlers le modifient éventuellement
  const bodyCopy = req.body && typeof req.body === "object" ? { ...req.body } : {};

  res.on("finish", () => {
    if (req._auditLogged) return;

    const status = res.statusCode;
    const statut = status >= 500 ? "danger" : status >= 400 ? "warning" : "success";
    const actor  = resolveActor(req, bodyCopy);
    const module = deriveModule(fullPath);

    logAudit({
      ...actor,
      action_type:  deriveActionType(method, fullPath),
      module,
      // Pas de "plateforme" explicite ici - logAudit() la déduit elle-même du rôle de
      // l'acteur en priorité (acteur.acteur_role, ci-dessus), puis du module en fallback.
      entite_id:    req.params?.id || null,
      ip_address:   req.ip || req.headers["x-forwarded-for"] || null,
      user_agent:   req.headers["user-agent"] || null,
      detail:       buildDetail(method, fullPath, status, bodyCopy),
      metadata: {
        body_keys: Object.keys(bodyCopy).filter(k => !SKIP_KEYS.has(k)),
        params:    req.params || {},
      },
      statut,
    });
  });

  next();
}
