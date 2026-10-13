// src/routes/uploadRoutes.js
import express        from "express";
import multer         from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { authenticateUser }  from "../middlewares/auth.js";
import { UPLOADS, typeRessource, maxMoPour, verifierFichier, LIMITE_VERCEL_MO } from "../config/uploads.js";

const router = express.Router();

// ─── Config Cloudinary ──────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MB = 1024 * 1024;

function makeStorage(folder, allowedFormats, resourceType = "auto") {
  return new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const base = `${folder}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // Cloudinary n'ajoute PAS l'extension automatiquement pour resource_type "raw" - sans
      // elle, il ne peut pas déterminer le format et rejette l'upload ("unknown file format").
      // Même correctif que messageStorage plus bas.
      const ext = file.originalname?.includes(".") ? file.originalname.split(".").pop().toLowerCase() : "";
      return {
        folder:          `bet/${folder}`,
        resource_type:   resourceType,
        allowed_formats: allowedFormats,
        transformation:  folder === "avatars" ? [{ width: 400, height: 400, crop: "fill", gravity: "face" }] : undefined,
        public_id:       resourceType === "raw" && ext ? `${base}.${ext}` : base,
      };
    },
  });
}

function sizeFilter(maxMb) {
  return (req, file, cb) => {
    // Multer vérifie la taille après le stream - on la double-check en middleware post-upload
    cb(null, true);
  };
}

// ─── Uploader par type ───────────────────────────────────────────────────────
const uploadAvatar = multer({
  storage: makeStorage("avatars", ["jpg", "jpeg", "png", "webp"]),
  limits:  { fileSize: 5 * MB },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Seules les images sont acceptées pour un avatar"));
    cb(null, true);
  },
});

const uploadImage = multer({
  storage: makeStorage("images", ["jpg", "jpeg", "png", "webp", "gif", "svg"]),
  limits:  { fileSize: 10 * MB },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Fichier image requis"));
    cb(null, true);
  },
});

const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/webm", "video/avi", "application/mp4", "application/octet-stream"];
const VIDEO_EXTS  = ["mp4", "mov", "avi", "mkv", "webm", "m4v"];

const uploadVideo = multer({
  storage: makeStorage("videos", ["mp4", "mov", "avi", "mkv", "webm"], "video"),
  limits:  { fileSize: 500 * MB },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname?.split(".").pop()?.toLowerCase();
    const ok  = file.mimetype.startsWith("video/") || VIDEO_MIMES.includes(file.mimetype) || VIDEO_EXTS.includes(ext);
    if (!ok) return cb(new Error(`Type de fichier non supporté : ${file.mimetype} (.${ext})`));
    cb(null, true);
  },
});

const uploadAudio = multer({
  storage: makeStorage("audio", ["mp3", "wav", "ogg", "m4a", "aac"], "video"),
  limits:  { fileSize: 50 * MB },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("audio/")) return cb(new Error("Fichier audio requis"));
    cb(null, true);
  },
});

// Enregistrements vocaux candidats (webm depuis MediaRecorder navigateur)
const uploadRecording = multer({
  storage: makeStorage("speaking", ["webm", "ogg", "mp3", "wav", "m4a"], "video"),
  limits:  { fileSize: 50 * MB },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith("audio/") || file.mimetype === "video/webm";
    if (!ok) return cb(new Error("Format audio invalide"));
    cb(null, true);
  },
});

// Pas de "allowed_formats" ici : Cloudinary valide le format des fichiers "raw" en inspectant
// leur contenu, et les formats Office modernes (docx/xlsx/pptx = archives ZIP) sont souvent
// rejetés à tort ("unknown file format") même avec l'extension correcte. On valide donc le
// format nous-mêmes via fileFilter, comme pour messageStorage (qui n'a jamais ce problème).
const EXTS_DOCUMENT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"];
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const base = `documents_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ext  = file.originalname?.includes(".") ? file.originalname.split(".").pop().toLowerCase() : "";
    return { folder: "bet/documents", resource_type: "raw", public_id: ext ? `${base}.${ext}` : base };
  },
});
const uploadDocument = multer({
  storage: documentStorage,
  limits:  { fileSize: 50 * MB },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname?.split(".").pop()?.toLowerCase();
    if (!EXTS_DOCUMENT.includes(ext)) return cb(new Error(`Format non supporté : .${ext} (attendu : ${EXTS_DOCUMENT.join(", ")})`));
    cb(null, true);
  },
});

// Dossiers apprenants : mémoire → upload_stream Cloudinary (évite l'incompatibilité multer v2 / multer-storage-cloudinary v4)
const uploadDossierMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * MB } });

// Pièces jointes de messagerie interne - ouvert à tout utilisateur connecté
// (parent, apprenant, coach, admin…), contrairement aux uploads ci-dessus réservés aux admins.
// resource_type est choisi dynamiquement par fichier : "auto" ne fonctionne pas de façon
// fiable pour les documents/archives chez Cloudinary (→ erreur "unknown file format"),
// il faut "raw" pour tout ce qui n'est pas image/vidéo/audio (même logique que uploadDocument ci-dessus).
const messageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const estMedia = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/");
    const base = `messages_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ext  = file.originalname?.includes(".") ? file.originalname.split(".").pop().toLowerCase() : "";
    return {
      folder:        "bet/messages",
      resource_type: estMedia ? "auto" : "raw",
      // Cloudinary n'ajoute PAS l'extension automatiquement pour resource_type "raw" -
      // il faut l'inclure nous-mêmes dans le public_id, sinon le fichier arrive sans extension.
      public_id:     estMedia || !ext ? base : `${base}.${ext}`,
    };
  },
});
const uploadMessageFile = multer({
  storage: messageStorage,
  limits:  { fileSize: 5 * MB },
});

// Contenus onboarding (bibliothèque, bibliothèque communautaire) - même logique resource_type
// que les pièces jointes de messagerie, avec une limite plus large pour les vidéos.
const contenuStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const estMedia = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/");
    const base = `contenus_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ext  = file.originalname?.includes(".") ? file.originalname.split(".").pop().toLowerCase() : "";
    return {
      folder:        "bet/contenus-onboarding",
      resource_type: estMedia ? "auto" : "raw",
      public_id:     estMedia || !ext ? base : `${base}.${ext}`,
    };
  },
});
// Limites différenciées par type de fichier - une vidéo de 200 Mo est normale, mais un PDF ou
// un audio de cette taille est presque toujours une erreur et risque de saturer Cloudinary/la
// bande passante. Multer ne permet qu'une limite globale au niveau du stream ; on utilise donc
// la limite la plus large ici (vidéo) et on revérifie précisément après upload dans la route.
const LIMITES_CONTENU_MB = { video: 100, audio: 20, image: 5, autre: 15 };
function typeLimiteMb(mimetype) {
  if (mimetype?.startsWith("video/")) return LIMITES_CONTENU_MB.video;
  if (mimetype?.startsWith("audio/")) return LIMITES_CONTENU_MB.audio;
  if (mimetype?.startsWith("image/")) return LIMITES_CONTENU_MB.image;
  return LIMITES_CONTENU_MB.autre;
}
const uploadContenuFile = multer({
  storage: contenuStorage,
  limits:  { fileSize: LIMITES_CONTENU_MB.video * MB },
});

// ─── Réponse standard ────────────────────────────────────────────────────────
function fileResponse(file) {
  return {
    url:          file.path,
    public_id:    file.filename,
    resource_type: file.resource_type || "image",
    format:       file.mimetype?.split("/")[1] || "",
    size:         file.size,
    original_name: file.originalname,
  };
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * POST /api/upload/signature - autorise UN envoi direct du navigateur vers Cloudinary.
 *
 * Pourquoi ne pas simplement relayer le fichier, comme les routes ci-dessous ? Parce que
 * Vercel plafonne le corps d'une requête à 4,5 Mo sur tous ses plans : une vidéo n'atteint
 * jamais Express, et la plateforme répond 413 sans en-têtes CORS, ce que le navigateur
 * traduit par une erreur CORS incompréhensible. Le backend ne stockant rien lui-même - il
 * ne fait que transmettre à Cloudinary - ce relais n'apportait rien et coûtait la limite.
 *
 * La sécurité ne repose pas sur le client :
 *  · l'appel exige le même jeton que la route d'upload correspondante ;
 *  · `folder`, `public_id` et `timestamp` sont décidés ICI et entrent dans la signature -
 *    les modifier l'invalide, donc le client ne peut ni écrire ailleurs ni écraser un
 *    fichier existant ;
 *  · la signature expire (Cloudinary rejette au-delà d'une heure) et ne vaut qu'un envoi.
 *
 * Le format et la taille sont vérifiés ici sur les métadonnées annoncées. Un client modifié
 * pourrait mentir : le garde-fou réel est le plafond de Cloudinary lui-même, que la
 * configuration ne dépasse jamais (cf. maxMoPour).
 */
/**
 * Chaque type d'upload est protégé exactement comme sa route d'upload homologue : on ne
 * peut pas obtenir par la signature ce qu'on n'aurait pas pu envoyer par le relais.
 * `express.json()` s'exécute avant ce routeur, `req.body.type` est donc déjà disponible.
 */
const authSelonType = (req, res, next) => {
  const conf = UPLOADS[req.body?.type];
  if (!conf) {
    console.warn(`[upload/signature] refus · type inconnu : ${req.body?.type}`);
    return res.status(400).json({ error: `Type d'upload inconnu : ${req.body?.type}` });
  }
  return conf.roles === "admin"
    ? authenticateAdmin(req, res, next)
    : authenticateUser(req, res, next);
};

router.post("/signature", authSelonType, async (req, res) => {
  try {
    const { type, nom, mimetype, taille } = req.body || {};
    const conf = UPLOADS[type];

    const probleme = verifierFichier(type, { nom, mimetype, taille: Number(taille) || 0 });
    if (probleme) {
      /* Le refus est JOURNALISÉ. Il ne l'était pas : la route renvoyait un message au
         navigateur et n'écrivait rien, si bien qu'un « 400 Bad Request » signalé depuis
         la console obligeait à rejouer des payloads au hasard pour retrouver la cause. */
      console.warn(`[upload/signature] refus · type=${type} · nom=${nom} · mime=${mimetype} · ${((Number(taille) || 0) / 1048576).toFixed(2)} Mo → ${probleme}`);
      return res.status(400).json({ error: probleme });
    }

    const resource_type = typeRessource(mimetype || "");
    const base = `${conf.prefixe}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Cloudinary n'ajoute pas l'extension aux fichiers `raw` : sans elle, le fichier
    // arrive sans extension et n'est plus ouvrable. Même correctif que les storages.
    const ext = nom?.includes(".") ? nom.split(".").pop().toLowerCase() : "";
    const public_id = resource_type === "raw" && ext ? `${base}.${ext}` : base;

    const timestamp = Math.round(Date.now() / 1000);

    /* CONVERSION À L'INGESTION pour les images que les navigateurs ne savent pas afficher.
       Cloudinary accepte le HEIC - le format par défaut des photos iPhone - mais le LIVRE
       tel quel, en `image/heic` : l'envoi réussit, et l'image reste un carré vide pour tout
       visiteur sous Chrome, Firefox ou Android. Mesuré sur le compte : livraison `image/heic`
       en 200, donc aucune erreur pour signaler le problème. On convertit donc en JPEG à
       l'arrivée, ce qui rend le fichier lisible partout et définitivement.
       `format` entre dans la SIGNATURE : le client ne peut pas le retirer. */
    const AVEC_CONVERSION = ["heic", "heif", "avif", "tif", "tiff", "bmp", "jfif"];
    const format = resource_type === "image" && AVEC_CONVERSION.includes(ext) ? "jpg" : null;

    // Seuls les paramètres signés ci-dessous sont opposables ; `resource_type` et
    // `api_key` voyagent hors signature, c'est le protocole de Cloudinary.
    const aSigner = { folder: conf.dossier, public_id, timestamp, ...(format ? { format } : {}) };
    const signature = cloudinary.utils.api_sign_request(aSigner, process.env.CLOUDINARY_API_SECRET);

    res.json({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      folder:     conf.dossier,
      public_id, timestamp, signature, resource_type, format,
      max_mo:     maxMoPour(type, mimetype || ""),
      url:        `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resource_type}/upload`,
    });
  } catch (err) {
    console.error("[upload/signature]", err);
    res.status(500).json({ error: "Impossible de préparer l'envoi" });
  }
});

/**
 * GET /api/upload/limites - ce que le client a le droit d'envoyer, et par quel chemin.
 * Évite de recopier les plafonds dans chaque écran, où ils finissaient par mentir.
 */
router.get("/limites", authenticateUser, (req, res) => {
  res.json({
    limite_relais_mo: LIMITE_VERCEL_MO,
    types: Object.fromEntries(Object.entries(UPLOADS).map(([cle, c]) => [cle, {
      extensions: c.extensions,
      max_mo_defaut: maxMoPour(cle, ""),
    }])),
  });
});

// POST /api/upload/avatar   - photo de profil (apprenant, prospect, coach, admin)
router.post("/avatar", authenticateUser, (req, res) => {
  uploadAvatar.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Avatar uploadé", file: fileResponse(req.file) });
  });
});

// POST /api/upload/message - pièce jointe de messagerie interne (tout utilisateur connecté)
router.post("/message", authenticateUser, (req, res) => {
  uploadMessageFile.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Fichier trop lourd (max 5 Mo)" });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Fichier uploadé", file: fileResponse(req.file) });
  });
});

// POST /api/upload/contenu - vidéo/PDF/audio pour la bibliothèque de contenus onboarding (admin)
router.post("/contenu", authenticateAdmin, (req, res) => {
  uploadContenuFile.single("file")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: `Fichier trop lourd (max ${LIMITES_CONTENU_MB.video} Mo)` });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

    // Multer n'applique qu'une limite globale (200 Mo, calibrée pour la vidéo) - on revérifie
    // ici la limite propre au type réel du fichier et on supprime l'upload Cloudinary si dépassée.
    const limiteMb = typeLimiteMb(req.file.mimetype);
    if (req.file.size > limiteMb * MB) {
      try { await cloudinary.uploader.destroy(req.file.filename, { resource_type: req.file.resource_type || "auto" }); } catch {}
      return res.status(400).json({ error: `Fichier trop lourd pour ce type (max ${limiteMb} Mo)` });
    }

    res.json({ message: "Fichier uploadé", file: fileResponse(req.file) });
  });
});

// POST /api/upload/image   - ressource pédagogique image
router.post("/image", authenticateAdmin, (req, res) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Image uploadée", file: fileResponse(req.file) });
  });
});

// POST /api/upload/video   - cours vidéo, ressource vidéo
router.post("/video", authenticateAdmin, (req, res) => {
  req.socket.setTimeout(600000); // 10 min pour les gros uploads Cloudinary
  uploadVideo.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Vidéo uploadée", file: fileResponse(req.file) });
  });
});

// POST /api/upload/audio   - exercice audio, prononciation
router.post("/audio", authenticateAdmin, (req, res) => {
  uploadAudio.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Audio uploadé", file: fileResponse(req.file) });
  });
});

// POST /api/upload/recording - réponse vocale candidat (public, sans auth)
router.post("/recording", (req, res) => {
  uploadRecording.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ url: req.file.path, public_id: req.file.filename });
  });
});

// POST /api/upload/temoignage - photo du diplôme/certificat pour témoignage apprenant (authenticateUser)
router.post("/temoignage", authenticateUser, (req, res) => {
  const uploadTemo = multer({
    storage: makeStorage("diplomes_temoignages", ["jpg", "jpeg", "png", "webp"]),
    limits:  { fileSize: 10 * MB },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) return cb(new Error("Seules les images sont acceptées"));
      cb(null, true);
    },
  });
  uploadTemo.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Photo du diplôme uploadée", url: req.file.path, file: fileResponse(req.file) });
  });
});

// POST /api/upload/dossier - documents dossier apprenant (Cloudinary via upload_stream)
router.post("/dossier", authenticateAdmin, (req, res) => {
  uploadDossierMem.single("file")(req, res, (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    if (!req.file)  return res.status(400).json({ error: "Aucun fichier reçu" });

    const isImage    = req.file.mimetype.startsWith("image/");
    const resType    = isImage ? "image" : "raw";
    const public_id  = `dossier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const stream = cloudinary.uploader.upload_stream(
      { folder: "bet/dossiers", resource_type: resType, public_id },
      (error, result) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({
          message: "Fichier dossier uploadé",
          file: {
            url:           result.secure_url,
            public_id:     result.public_id,
            resource_type: result.resource_type,
            size:          result.bytes,
            original_name: req.file.originalname,
          },
        });
      }
    );
    stream.end(req.file.buffer);
  });
});

// POST /api/upload/fichier-classe - tout type de fichier partagé par un coach à sa classe
router.post("/fichier-classe", authenticateAdmin, (req, res) => {
  uploadDossierMem.single("file")(req, res, (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    if (!req.file)  return res.status(400).json({ error: "Aucun fichier reçu" });
    const isImage = req.file.mimetype.startsWith("image/");
    /* L'AUDIO EST UN `video` CHEZ CLOUDINARY. C'est leur convention : un seul
       `resource_type` couvre les deux médias temporels. Un mp3 envoyé en `raw` est bien
       stocké mais servi comme un fichier quelconque — pas de lecture en continu, et le
       lecteur de l'apprenant doit le télécharger en entier avant le premier son. Le test
       ne portait que sur `video/`, donc toute capsule audio tombait dans ce cas. */
    const isMediaTemporel = req.file.mimetype.startsWith("video/") || req.file.mimetype.startsWith("audio/");
    const resType   = isImage ? "image" : isMediaTemporel ? "video" : "raw";
    const base      = `fichier_classe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    /* L'EXTENSION DOIT ÊTRE DANS LE `public_id` POUR UN `raw`. Cloudinary l'ajoute tout
       seul pour `image` et `video` — c'est pourquoi les mp3 et les mp4 s'ouvrent bien —
       mais jamais pour `raw`. Un PDF arrivait donc à une URL sans extension, servie en
       `application/octet-stream` : le navigateur ne sait pas quoi en faire, il propose un
       téléchargement d'un fichier sans nom exploitable, ou affiche des caractères
       illisibles. Le téléversement des pièces jointes de la messagerie
       (`messageStorage` plus haut) corrige déjà ce piège ; cette route-ci l'ignorait. */
    const ext       = req.file.originalname?.includes(".")
      ? req.file.originalname.split(".").pop().toLowerCase() : "";
    const public_id = (resType === "raw" && ext) ? `${base}.${ext}` : base;
    const stream = cloudinary.uploader.upload_stream(
      { folder: "bet/fichiers-classes", resource_type: resType, public_id },
      (error, result) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({
          url:          result.secure_url,
          public_id:    result.public_id,
          size:         result.bytes,
          original_name: req.file.originalname,
        });
      }
    );
    stream.end(req.file.buffer);
  });
});

// POST /api/upload/document - PDF, cours, supports
router.post("/document", authenticateAdmin, (req, res) => {
  uploadDocument.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    res.json({ message: "Document uploadé", file: fileResponse(req.file) });
  });
});

/**
 * Décompose une URL de livraison Cloudinary en ce qu'il faut pour la re-signer.
 *
 * Forme attendue : https://res.cloudinary.com/<cloud>/<resource_type>/upload/v<n>/<public_id>
 * Le public_id des fichiers `raw` PORTE son extension (document.pdf), celui des images et
 * des vidéos ne la porte pas - d'où les deux traitements distincts ci-dessous.
 */
function decomposerUrlCloudinary(url) {
  const m = String(url).match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/);
  if (!m) return null;
  const resource_type = m[1];
  const chemin = m[2].split("?")[0];
  const ext = chemin.includes(".") ? chemin.split(".").pop().toLowerCase() : "";
  return {
    resource_type,
    // `raw` garde l'extension dans son identifiant ; les autres non.
    public_id: resource_type === "raw" ? chemin : chemin.replace(/\.[^.]+$/, ""),
    format: ext,
  };
}

/**
 * Récupère un fichier Cloudinary, y compris ceux dont la livraison publique est refusée.
 *
 * Cloudinary bloque par défaut la livraison des PDF (`x-cld-error: deny or ACL failure`,
 * HTTP 401) : les documents partagés aux apprenants étaient donc tous inaccessibles, quelle
 * que soit leur taille - un PDF de 5 Ko échouait comme un autre. Le réglage se change dans
 * le tableau de bord Cloudinary, mais dépendre d'une case à cocher distante est fragile.
 *
 * Le backend détient le secret du compte : il peut signer un lien de téléchargement
 * temporaire, que Cloudinary honore malgré la restriction. On n'essaie ce chemin qu'en
 * repli, pour ne rien changer aux fichiers qui passent déjà.
 */
async function recupererFichierCloudinary(url) {
  const directe = await fetch(url, { redirect: "follow" });
  if (directe.ok) return directe;
  if (directe.status !== 401 && directe.status !== 403) return directe;

  const infos = decomposerUrlCloudinary(url);
  if (!infos) return directe;
  try {
    const signee = cloudinary.utils.private_download_url(infos.public_id, infos.format, {
      resource_type: infos.resource_type,
      type: "upload",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    return await fetch(signee, { redirect: "follow" });
  } catch (e) {
    console.error("[download proxy] signature impossible:", e.message);
    return directe;
  }
}

// GET /api/upload/download?url=xxx&nom=xxx - proxy téléchargement
// Node.js v18+ fetch native : pas de .buffer(), utiliser .arrayBuffer()
/**
 * Relais de téléchargement - et, depuis `?inline=1`, de CONSULTATION.
 *
 * Cloudinary refuse la livraison publique des PDF par un réglage de sécurité actif par
 * défaut sur les comptes : l'URL renvoie `401 Unauthorized`. Mesuré sur ce compte, un
 * `.pptx` et un `.xlsx` passent, les `.pdf` non. Ce relais signe la requête côté serveur -
 * seul endroit où vit le secret du compte - et rend le fichier au navigateur.
 *
 * `inline=1` change uniquement l'en-tête `Content-Disposition` : sans lui, le navigateur
 * télécharge au lieu d'afficher, et un PDF ne peut pas être lu dans la page.
 */
router.get("/download", async (req, res) => {
  const { url, nom, type, inline } = req.query;
  if (!url) return res.status(400).json({ error: "URL requise" });
  if (!url.includes("cloudinary.com")) return res.status(400).json({ error: "URL non autorisée" });
  try {
    const r = await recupererFichierCloudinary(url);
    if (!r.ok) {
      console.error("[download proxy] Cloudinary status:", r.status, url);
      return res.status(502).json({ error: `Cloudinary: ${r.status}` });
    }
    // Compatible Node.js v18+ (fetch native) ET node-fetch v2 (.buffer())
    let buf;
    if (typeof r.arrayBuffer === "function") {
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      buf = await r.buffer();
    }
    const TYPES = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      mp4: "video/mp4", webm: "video/webm",
    };
    // type param (e.g. "pdf") wins, then nom extension, then URL extension
    const extFromNom = (nom && nom.includes(".")) ? nom.split(".").pop().toLowerCase() : null;
    const extFromUrl = url.split("?")[0].split(".").pop().toLowerCase();
    const rawExt = (type && TYPES[type]) ? type : (extFromNom || extFromUrl);
    const ct = TYPES[rawExt] || r.headers.get("content-type") || "application/octet-stream";
    // Ensure filename has the correct extension
    let safeName = (nom || `document`).replace(/[^\w.\-À-ɏ ]/g, "_");
    if (!safeName.includes(".") && rawExt) safeName = `${safeName}.${rawExt}`;
    res.setHeader("Content-Type", ct);
    const disposition = inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Cache-Control", inline === "1" ? "private, max-age=300" : "no-store");
    res.send(buf);
  } catch (err) {
    console.error("[download proxy] erreur:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Erreur téléchargement: " + err.message });
  }
});

// DELETE /api/upload/delete?public_id=xxx&resource_type=image
router.delete("/delete", authenticateAdmin, async (req, res) => {
  try {
    const public_id = req.query.public_id || req.body.public_id;
    const resource_type = req.query.resource_type || req.body.resource_type || "image";
    const result = await cloudinary.uploader.destroy(public_id, { resource_type });
    if (result.result !== "ok" && result.result !== "not found") {
      return res.status(400).json({ error: "Suppression échouée", detail: result });
    }
    res.json({ message: "Fichier supprimé", result });
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    res.status(500).json({ error: "Erreur suppression fichier" });
  }
});

export default router;
