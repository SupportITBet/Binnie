-- ============================================================================
--  Formulaires de campagne — collecte par QR code et lien partagé
-- ============================================================================
--
--  ⚠️  PROPOSITION — NE PAS EXÉCUTER AVANT VALIDATION.
--
--  BET collecte aujourd'hui ses prospects de campagne via Google Forms, puis les
--  ressaisit. Deux coûts : la ressaisie, et surtout la perte du lien entre le support
--  (une affiche, un flyer, un stand) et l'inscription qui en découle. On sait combien
--  de personnes ont répondu ; on ne sait pas quelle affiche les a fait venir.
--
--  Ce schéma vise trois choses, dans cet ordre :
--
--   1. REMPLACER Google Forms — un formulaire public, des champs libres, des réponses.
--   2. SAVOIR CE QUI CONVERTIT — plusieurs QR codes par formulaire, un par support
--      physique. C'est la seule chose que Google Forms ne saura jamais faire ici.
--   3. SUPPRIMER LA RESSAISIE — une réponse se transforme en `assignations_parcours`,
--      le dossier prospect que le reste de l'application connaît déjà.
--
--  Ce qui est délibérément ABSENT : la logique conditionnelle entre questions, les
--  pages multiples, les calculs de score. Tant que le besoin n'est pas avéré, chacune
--  de ces fonctions coûte plus à maintenir qu'elle ne rapporte.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
--  1. CAMPAGNES
--     Un regroupement — « Rentrée septembre 2026 », « Salon de l'étudiant ».
--     Une campagne peut porter plusieurs formulaires ; un formulaire peut exister
--     sans campagne (d'où le ON DELETE SET NULL plus bas) : on ne veut pas qu'une
--     campagne archivée emporte les réponses collectées.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagnes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           text NOT NULL,
  description   text,
  -- planifiee | active | terminee | archivee
  statut        text NOT NULL DEFAULT 'planifiee',
  date_debut    date,
  date_fin      date,
  -- Le centre porteur, quand la campagne est locale. NULL = nationale.
  -- `centres.id` est un identifiant LISIBLE (« angre », « cocody »), pas un uuid :
  -- le typer uuid faisait échouer la contrainte à la création de la table.
  centre_id     text REFERENCES public.centres(id) ON DELETE SET NULL,
  objectif_reponses integer,          -- cible chiffrée, pour mesurer l'atteinte
  budget        numeric(12,2),
  cree_par_id   uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagnes_statut_chk
    CHECK (statut IN ('planifiee','active','terminee','archivee')),
  CONSTRAINT campagnes_dates_chk
    CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);


-- ─────────────────────────────────────────────────────────────────────────
--  2. FORMULAIRES
--     `slug` est l'adresse publique : /f/<slug>. Il est stable et unique — c'est
--     lui qui est encodé dans les QR déjà imprimés, donc il ne doit jamais changer
--     après diffusion, d'où l'index unique plutôt qu'un simple champ texte.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_formulaires (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id    uuid REFERENCES public.campagnes(id) ON DELETE SET NULL,
  slug           text NOT NULL,
  titre          text NOT NULL,
  description    text,
  -- brouillon | publie | ferme. Un formulaire fermé répond encore, mais affiche
  -- son message de clôture : un QR imprimé continue d'exister après la campagne,
  -- et renvoyer une erreur 404 à quelqu'un qui scanne serait le pire accueil.
  statut         text NOT NULL DEFAULT 'brouillon',
  -- Fenêtre d'ouverture. NULL = pas de borne.
  ouvre_le       timestamptz,
  ferme_le       timestamptz,
  message_merci  text NOT NULL DEFAULT 'Merci ! Nous vous recontactons très vite.',
  message_ferme  text NOT NULL DEFAULT 'Cette campagne est terminée. Merci de votre intérêt !',
  redirection_url text,               -- optionnel : renvoyer vers une page après envoi
  -- Couleur et image d'en-tête : un formulaire de campagne est un support de
  -- communication, pas un écran d'administration.
  couleur        text DEFAULT '#1B3080',
  image_url      text,
  -- À qui les réponses sont destinées. NULL = personne en particulier, elles
  -- attendent dans la liste. Sinon la réponse arrive directement chez quelqu'un.
  assignee_id    uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  centre_id      text REFERENCES public.centres(id) ON DELETE SET NULL,
  -- Une même personne peut-elle répondre plusieurs fois ? Sur un stand, oui
  -- (plusieurs visiteurs, un seul téléphone) ; sur une inscription, non.
  autoriser_doublons boolean NOT NULL DEFAULT false,
  -- Mention de consentement affichée sous le bouton d'envoi. Obligatoire dans les
  -- faits : on collecte des coordonnées personnelles pour être recontacté.
  texte_consentement text NOT NULL DEFAULT
    'J''accepte d''être recontacté(e) par BET au sujet de cette demande.',
  cree_par_id    uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagne_formulaires_statut_chk
    CHECK (statut IN ('brouillon','publie','ferme')),
  -- Le slug voyage dans une URL et sur du papier : minuscules, chiffres et tirets.
  CONSTRAINT campagne_formulaires_slug_chk
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campagne_formulaires_slug
  ON public.campagne_formulaires(slug);
CREATE INDEX IF NOT EXISTS idx_campagne_formulaires_campagne
  ON public.campagne_formulaires(campagne_id);


-- ─────────────────────────────────────────────────────────────────────────
--  3. CHAMPS
--     Une table plutôt qu'un JSONB de définition : on veut compter les réponses
--     par option (« combien ont coché Anglais des affaires ? »), et une question a
--     son propre cycle de vie — on la réordonne, on la rend obligatoire, on la
--     retire. Dans un JSONB, chacune de ces opérations réécrit tout le document.
--
--     `role_canonique` est la pièce maîtresse : il désigne les trois champs qui
--     permettent de convertir une réponse en dossier sans deviner. Sans lui, il
--     faudrait analyser les libellés pour retrouver où est le téléphone.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_formulaire_champs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulaire_id  uuid NOT NULL REFERENCES public.campagne_formulaires(id) ON DELETE CASCADE,
  ordre          integer NOT NULL DEFAULT 0,
  libelle        text NOT NULL,
  aide           text,                          -- précision affichée sous le champ
  type           text NOT NULL DEFAULT 'texte',
  obligatoire    boolean NOT NULL DEFAULT false,
  -- Options des champs à choix : [{ "valeur": "a2", "libelle": "A2 — élémentaire" }]
  options        jsonb NOT NULL DEFAULT '[]'::jsonb,
  placeholder    text,
  -- Contraintes de saisie : { "min": 1, "max": 120, "motif": "^[0-9]{10}$" }
  validation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- nom | email | telephone | centre | niveau | type_cours — ou NULL.
  -- Ce qui porte ce marquage alimente les colonnes dédiées de la réponse, donc le
  -- dédoublonnage et la conversion en dossier.
  role_canonique text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Un champ peut porter une image (question illustree) et, pour les choix, autoriser
  -- une option « Autre » avec saisie libre — deux usages courants de Google Forms.
  image_url      text,
  autre_autorise boolean NOT NULL DEFAULT false,
  CONSTRAINT campagne_champs_type_chk CHECK (type IN (
    'texte','texte_long','email','telephone','nombre','date','heure',
    'choix_unique','choix_multiple','liste','oui_non','fichier','centre',
    -- Echelle (1..10) et note en etoiles : deux formats d'enquete de satisfaction.
    'echelle','note',
    -- Ces deux-la n'attendent AUCUNE reponse : ils structurent la page. Les traiter
    -- comme des questions produirait des valeurs vides a analyser.
    'section','information'
  )),
  CONSTRAINT campagne_champs_role_chk CHECK (
    role_canonique IS NULL OR
    role_canonique IN ('nom','email','telephone','centre','niveau','type_cours')
  )
);

CREATE INDEX IF NOT EXISTS idx_campagne_champs_formulaire
  ON public.campagne_formulaire_champs(formulaire_id, ordre);

-- Un seul champ peut porter un rôle donné : deux champs « email » rendraient la
-- conversion ambiguë, et c'est le genre d'ambiguïté qui se découvre trop tard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campagne_champs_role_unique
  ON public.campagne_formulaire_champs(formulaire_id, role_canonique)
  WHERE role_canonique IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
--  4. DIFFUSIONS  (QR imprimé ou lien partagé)
--     LE point qui distingue ce système de Google Forms.
--
--     Un formulaire se diffuse par PLUSIEURS canaux, et chacun doit se mesurer
--     séparément. L'affiche du centre d'Angré, le flyer du marché, le kakémono du
--     salon — mais aussi le lien envoyé dans un groupe WhatsApp, celui posté en story,
--     celui glissé dans une signature d'e-mail.
--
--     QR et lien ne sont pas deux mécanismes : c'est la MÊME adresse, encodée en image
--     ou copiée telle quelle. `/f/<slug>?d=<code>`. D'où une seule table — nommer
--     celle-ci `campagne_qrcodes` aurait condamné le lien partagé à un traitement
--     séparé, donc à des chiffres qu'on ne pourrait pas comparer.
--
--     L'image du QR n'est pas stockée : elle se regénère depuis l'URL, et garder un
--     PNG recalculable est une dette pour rien.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_diffusions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulaire_id  uuid NOT NULL REFERENCES public.campagne_formulaires(id) ON DELETE CASCADE,
  -- Code court qui voyage dans l'URL : /f/<slug>?d=<code>
  code           text NOT NULL,
  libelle        text NOT NULL,                 -- « Affiche entrée Angré », « Groupe WhatsApp parents »
  -- Sous quelle forme ce canal est diffusé. `mixte` = une affiche qui porte à la fois
  -- le QR et l'adresse écrite, cas courant.
  format         text NOT NULL DEFAULT 'qr',
  -- affiche | flyer | stand | whatsapp | reseaux | email | sms | site | autre
  support        text NOT NULL DEFAULT 'autre',
  emplacement    text,                          -- « Centre Angré — porte principale »
  centre_id      text REFERENCES public.centres(id) ON DELETE SET NULL,
  actif          boolean NOT NULL DEFAULT true,
  -- Compteur dénormalisé : une visite est un événement fréquent et sans valeur
  -- individuelle. Le détail vit dans campagne_visites pour la courbe ; ce compteur
  -- sert l'affichage, qui n'a pas à agréger des milliers de lignes.
  nb_visites     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagne_diffusions_format_chk
    CHECK (format IN ('qr','lien','mixte')),
  CONSTRAINT campagne_diffusions_support_chk
    CHECK (support IN ('affiche','flyer','stand','whatsapp','reseaux','email','sms','site','autre')),
  CONSTRAINT campagne_diffusions_code_chk
    CHECK (code ~ '^[a-zA-Z0-9]{4,16}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campagne_diffusions_code
  ON public.campagne_diffusions(code);
CREATE INDEX IF NOT EXISTS idx_campagne_diffusions_formulaire
  ON public.campagne_diffusions(formulaire_id);


-- ─────────────────────────────────────────────────────────────────────────
--  5. VISITES
--     Ouvrir le formulaire n'est pas y répondre : beaucoup regardent sans remplir.
--     C'est précisément l'écart entre les deux qui instruit — un canal très ouvert et
--     peu converti accuse le formulaire, pas le canal.
--
--     Le mot « visite » et non « scan » : un lien partagé se clique, il ne se scanne pas,
--     et les deux doivent se compter de la même façon pour être comparables.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_visites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diffusion_id      uuid REFERENCES public.campagne_diffusions(id) ON DELETE CASCADE,
  formulaire_id  uuid NOT NULL REFERENCES public.campagne_formulaires(id) ON DELETE CASCADE,
  visite_le      timestamptz NOT NULL DEFAULT now(),
  -- Empreinte, jamais l'adresse en clair : elle suffit à repérer un robot ou un
  -- doublon sans conserver une donnée personnelle dont on n'a pas l'usage.
  ip_hash        text,
  user_agent     text,
  referent       text
);

CREATE INDEX IF NOT EXISTS idx_campagne_visites_diffusion ON public.campagne_visites(diffusion_id, visite_le);
CREATE INDEX IF NOT EXISTS idx_campagne_visites_form   ON public.campagne_visites(formulaire_id, visite_le);


-- ─────────────────────────────────────────────────────────────────────────
--  6. RÉPONSES
--     Deux représentations cohabitent, à dessein :
--
--      · `donnees` (JSONB) fige ce qui a été soumis, tel quel. Si une question est
--        reformulée ou supprimée six mois plus tard, la réponse d'origine reste
--        lisible. C'est la mémoire.
--
--      · `campagne_reponse_valeurs` (table 7) éclate la même chose en lignes, pour
--        pouvoir compter et croiser. C'est l'analyse.
--
--     Les colonnes `nom`, `email`, `telephone` sont extraites depuis les champs
--     marqués `role_canonique`. Elles ne dupliquent pas pour le plaisir : elles
--     rendent possibles l'index de dédoublonnage et la conversion en dossier sans
--     jamais ouvrir le JSON.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_reponses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formulaire_id  uuid NOT NULL REFERENCES public.campagne_formulaires(id) ON DELETE CASCADE,
  -- Par quel QR la personne est arrivée. NULL = lien direct, sans QR.
  diffusion_id      uuid REFERENCES public.campagne_diffusions(id) ON DELETE SET NULL,
  campagne_id    uuid REFERENCES public.campagnes(id) ON DELETE SET NULL,

  -- Champs canoniques, extraits à l'enregistrement
  nom            text,
  email          text,
  telephone      text,

  donnees        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- nouvelle | vue | en_cours | convertie | doublon | rejetee
  statut         text NOT NULL DEFAULT 'nouvelle',
  traitee_par_id uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  traitee_le     timestamptz,
  note_interne   text,

  -- Le lien avec le pipeline. Renseigné quand la réponse devient un vrai dossier :
  -- c'est ce qui supprime la ressaisie, et ce qui permet de dire combien d'une
  -- campagne sont devenus des inscrits.
  assignation_id uuid REFERENCES public.assignations_parcours(id) ON DELETE SET NULL,

  consentement   boolean NOT NULL DEFAULT false,
  consentement_le timestamptz,

  ip_hash        text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagne_reponses_statut_chk
    CHECK (statut IN ('nouvelle','vue','en_cours','convertie','doublon','rejetee'))
);

CREATE INDEX IF NOT EXISTS idx_campagne_reponses_form
  ON public.campagne_reponses(formulaire_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campagne_reponses_statut
  ON public.campagne_reponses(statut) WHERE statut = 'nouvelle';
CREATE INDEX IF NOT EXISTS idx_campagne_reponses_diffusion
  ON public.campagne_reponses(diffusion_id);
-- Retrouver quelqu'un par son téléphone : c'est le premier réflexe d'une commerciale.
CREATE INDEX IF NOT EXISTS idx_campagne_reponses_tel
  ON public.campagne_reponses(telephone) WHERE telephone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campagne_reponses_email
  ON public.campagne_reponses(lower(email)) WHERE email IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
--  7. VALEURS
--     Une ligne par champ répondu. `valeur_texte` porte le lisible, `valeurs` porte
--     les choix multiples. Les deux sont renseignés pour un champ à choix : le texte
--     pour l'affichage et l'export, le tableau pour compter.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_reponse_valeurs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reponse_id     uuid NOT NULL REFERENCES public.campagne_reponses(id) ON DELETE CASCADE,
  -- SET NULL et non CASCADE : supprimer une question ne doit pas effacer ce que les
  -- gens avaient répondu. `libelle_champ` conserve alors la question telle qu'elle
  -- était posée — sans quoi la valeur devient orpheline et incompréhensible.
  champ_id       uuid REFERENCES public.campagne_formulaire_champs(id) ON DELETE SET NULL,
  libelle_champ  text NOT NULL,
  valeur_texte   text,
  valeurs        text[],
  valeur_nombre  numeric,
  valeur_date    date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campagne_valeurs_reponse ON public.campagne_reponse_valeurs(reponse_id);
CREATE INDEX IF NOT EXISTS idx_campagne_valeurs_champ   ON public.campagne_reponse_valeurs(champ_id);


-- ─────────────────────────────────────────────────────────────────────────
--  8. LECTURE — ce que les écrans afficheront
-- ─────────────────────────────────────────────────────────────────────────

-- Performance par canal : visites, réponses, conversions. C'est le tableau qui répond
-- à « quelle affiche marche ? quel lien partagé rapporte ? » — la question qui a motivé
-- tout ce schéma.
CREATE OR REPLACE VIEW public.v_campagne_performance_diffusion AS
SELECT
  d.id                AS diffusion_id,
  d.formulaire_id,
  d.libelle,
  d.format,
  d.support,
  d.emplacement,
  d.nb_visites,
  COUNT(r.id)                                              AS nb_reponses,
  COUNT(r.id) FILTER (WHERE r.assignation_id IS NOT NULL)   AS nb_converties,
  -- NULLIF évite la division par zéro sur un canal diffusé mais jamais ouvert,
  -- cas parfaitement normal en début de campagne.
  ROUND(100.0 * COUNT(r.id) / NULLIF(d.nb_visites, 0), 1)   AS taux_reponse,
  ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.assignation_id IS NOT NULL)
        / NULLIF(COUNT(r.id), 0), 1)                        AS taux_conversion
FROM public.campagne_diffusions d
LEFT JOIN public.campagne_reponses r ON r.diffusion_id = d.id
GROUP BY d.id;

-- Vue d'ensemble d'un formulaire.
-- `security_invoker = true` est OBLIGATOIRE ici : sans lui, la vue s'exécute avec les droits
-- de son propriétaire et contourne la RLS des trois tables qu'elle agrège - un visiteur muni
-- de la clé `anon` (publique, embarquée dans le bundle du navigateur) lisait les titres et les
-- compteurs de toutes les campagnes, que chaque table lui refusait pourtant. Signalé CRITICAL
-- par l'Advisor Supabase ; cf. Backend/sql/fix_security_definer_v_campagne_formulaire_stats.sql
-- pour le correctif appliqué aux bases déjà en place.
CREATE OR REPLACE VIEW public.v_campagne_formulaire_stats
WITH (security_invoker = true) AS
SELECT
  f.id AS formulaire_id,
  f.titre,
  f.slug,
  f.statut,
  f.campagne_id,
  (SELECT COUNT(*) FROM public.campagne_diffusions d WHERE d.formulaire_id = f.id)        AS nb_diffusions,
  (SELECT COALESCE(SUM(d.nb_visites),0) FROM public.campagne_diffusions d WHERE d.formulaire_id = f.id) AS nb_visites,
  (SELECT COUNT(*) FROM public.campagne_reponses r WHERE r.formulaire_id = f.id)       AS nb_reponses,
  (SELECT COUNT(*) FROM public.campagne_reponses r WHERE r.formulaire_id = f.id
     AND r.statut = 'nouvelle')                                                        AS nb_a_traiter,
  (SELECT COUNT(*) FROM public.campagne_reponses r WHERE r.formulaire_id = f.id
     AND r.assignation_id IS NOT NULL)                                                 AS nb_converties,
  (SELECT MAX(r.created_at) FROM public.campagne_reponses r WHERE r.formulaire_id = f.id) AS derniere_reponse
FROM public.campagne_formulaires f;



-- ─────────────────────────────────────────────────────────────────────────
--  9. CAMPAGNES WHATSAPP
--
--     Le pendant de `newsletter_campagnes`, qui fonctionne déjà pour l'e-mail. Même
--     vocabulaire volontairement : `destinataires` en JSONB, `statut`, programmation,
--     compteurs. Un écran qui sait lire l'un saura lire l'autre.
--
--     Mais WhatsApp N'EST PAS un e-mail, et deux règles de Meta gouvernent tout :
--
--      · LA FENÊTRE DE 24 HEURES. Passé 24h depuis le dernier message de la personne,
--        on ne peut plus écrire librement : seul un MODÈLE pré-approuvé par Meta est
--        accepté. Une campagne sortante tombe toujours dans ce cas — d'où la table
--        `whatsapp_modeles`, qui n'est pas un confort mais une condition d'existence.
--
--      · LE CONSENTEMENT EXPLICITE. Écrire à un numéro qui ne l'a pas demandé fait
--        signaler l'expéditeur, et un numéro trop signalé est banni — définitivement.
--        L'opt-in est donc tracé par numéro, avec sa date et sa provenance.
-- ─────────────────────────────────────────────────────────────────────────

-- Modèles approuvés par Meta. `corps` contient des marqueurs {{1}}, {{2}}… que
-- l'envoi remplace ; `variables` les décrit pour que l'écran sache quoi demander.
CREATE TABLE IF NOT EXISTS public.whatsapp_modeles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,                 -- nom exact chez Meta
  langue         text NOT NULL DEFAULT 'fr',
  categorie      text NOT NULL DEFAULT 'MARKETING',
  corps          text NOT NULL,
  -- [{ "position": 1, "libelle": "Prénom", "exemple": "Awa" }]
  variables      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- brouillon | en_attente | approuve | rejete — miroir du statut chez Meta.
  -- On n'envoie qu'avec un modèle `approuve` : tenter avec un autre échoue côté API.
  statut         text NOT NULL DEFAULT 'brouillon',
  motif_rejet    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_modeles_statut_chk
    CHECK (statut IN ('brouillon','en_attente','approuve','rejete')),
  CONSTRAINT whatsapp_modeles_cat_chk
    CHECK (categorie IN ('MARKETING','UTILITY','AUTHENTICATION'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_modeles_nom
  ON public.whatsapp_modeles(nom, langue);

-- Consentement par numéro. Le numéro est stocké au format international normalisé
-- (+225…), sans quoi le même correspondant existerait sous trois écritures.
CREATE TABLE IF NOT EXISTS public.whatsapp_optin (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone      text NOT NULL,
  consenti       boolean NOT NULL DEFAULT true,
  -- formulaire | inscription | import | manuel — d'où vient l'accord.
  source         text NOT NULL DEFAULT 'formulaire',
  -- La preuve : la réponse de formulaire qui portait la case cochée.
  reponse_id     uuid REFERENCES public.campagne_reponses(id) ON DELETE SET NULL,
  consenti_le    timestamptz NOT NULL DEFAULT now(),
  retire_le      timestamptz,                   -- STOP reçu, ou retrait demandé
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_optin_tel_chk CHECK (telephone ~ '^\+[0-9]{8,15}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_optin_tel ON public.whatsapp_optin(telephone);

CREATE TABLE IF NOT EXISTS public.campagnes_whatsapp (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            text NOT NULL,
  campagne_id    uuid REFERENCES public.campagnes(id) ON DELETE SET NULL,
  modele_id      uuid REFERENCES public.whatsapp_modeles(id) ON DELETE RESTRICT,
  -- Les valeurs des variables du modèle, ou la règle pour les calculer :
  -- { "1": { "champ": "nom" }, "2": { "fixe": "15 octobre" } }
  variables      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Même forme que newsletter_campagnes.destinataires :
  --   { "mode": "formulaire", "formulaire_id": "…" }
  --   { "mode": "diffusion",  "diffusion_id": "…" }
  --   { "mode": "apprenants", "type_coaching": "prive" }
  destinataires  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- brouillon | programmee | en_cours | envoyee | annulee | echouee
  statut         text NOT NULL DEFAULT 'brouillon',
  date_programmee timestamptz,
  date_envoi      timestamptz,
  total_destinataires integer NOT NULL DEFAULT 0,
  nb_envoyes      integer NOT NULL DEFAULT 0,
  nb_delivres     integer NOT NULL DEFAULT 0,
  nb_lus          integer NOT NULL DEFAULT 0,
  nb_echecs       integer NOT NULL DEFAULT 0,
  -- Écartés faute de consentement : ce n'est pas un échec technique, et les
  -- confondre masquerait le vrai problème — une base sans opt-in.
  nb_sans_optin   integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagnes_whatsapp_statut_chk
    CHECK (statut IN ('brouillon','programmee','en_cours','envoyee','annulee','echouee'))
);
CREATE INDEX IF NOT EXISTS idx_campagnes_whatsapp_statut
  ON public.campagnes_whatsapp(statut, date_programmee);

-- Une ligne par destinataire. Indispensable pour reprendre un envoi interrompu sans
-- réexpédier à ceux qui ont déjà reçu — un doublon sur WhatsApp fait signaler.
CREATE TABLE IF NOT EXISTS public.whatsapp_envois (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_wa_id uuid NOT NULL REFERENCES public.campagnes_whatsapp(id) ON DELETE CASCADE,
  telephone      text NOT NULL,
  reponse_id     uuid REFERENCES public.campagne_reponses(id) ON DELETE SET NULL,
  -- en_attente | envoye | delivre | lu | echec | ignore_sans_optin
  statut         text NOT NULL DEFAULT 'en_attente',
  message_id     text,                          -- identifiant chez le fournisseur
  erreur         text,
  envoye_le      timestamptz,
  delivre_le     timestamptz,
  lu_le          timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_envois_statut_chk
    CHECK (statut IN ('en_attente','envoye','delivre','lu','echec','ignore_sans_optin'))
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_envois_campagne
  ON public.whatsapp_envois(campagne_wa_id, statut);
-- Un seul envoi par numéro et par campagne : la garantie anti-doublon, posée par la
-- base plutôt que par la prudence du code appelant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_envois_unique
  ON public.whatsapp_envois(campagne_wa_id, telephone);


NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.campagnes)                  AS campagnes,
  (SELECT COUNT(*) FROM public.campagne_formulaires)       AS formulaires,
  (SELECT COUNT(*) FROM public.campagne_formulaire_champs) AS champs,
  (SELECT COUNT(*) FROM public.campagne_diffusions)        AS diffusions,
  (SELECT COUNT(*) FROM public.campagne_reponses)          AS reponses,
  (SELECT COUNT(*) FROM public.whatsapp_modeles)           AS modeles_wa,
  (SELECT COUNT(*) FROM public.campagnes_whatsapp)         AS campagnes_wa,
  (SELECT COUNT(*) FROM public.whatsapp_optin)             AS optin_wa;
