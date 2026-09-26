-- ═════════════════════════════════════════════════════════════════════════
-- GROUPES DE DISCUSSION LIBRES
--
-- Jusqu'ici, une conversation de groupe ÉTAIT une classe : l'identifiant de
-- discussion se déduisait de `groupes.id`, et il n'existait aucun moyen de réunir
-- six coachs d'un même centre ou l'équipe marketing. Ces deux tables ajoutent la
-- seule chose qui manquait — une appartenance qui ne vient pas d'une classe.
--
-- Les MESSAGES restent dans Firestore, avec l'écoute temps réel déjà en place
-- (`chats/libre_{id}/messages`, en parallèle de `chats/groupe_{id}/messages`).
-- Seules l'appartenance et les droits vivent ici : ce sont eux qu'il faut pouvoir
-- vérifier côté serveur, et joindre à `utilisateurs` pour afficher un nom.
--
-- ⚠️ À SAVOIR. Les règles Firestore du projet sont aujourd'hui `allow read, write:
-- if true` sur toutes les collections. L'appartenance déclarée ici protège contre
-- l'interface et l'API de la plateforme, PAS contre une requête Firestore directe.
-- La fermer demande un pont Supabase → Firebase (jeton personnalisé signé par le
-- backend), qui exige un compte de service Firebase absent de l'environnement.
-- Tant que ce pont n'existe pas, aucun écran ne doit qualifier ces groupes de
-- « privés » ou « confidentiels ».
-- ═════════════════════════════════════════════════════════════════════════

-- ⚠️ POURQUOI PAS `conversations` TOUT COURT.
-- Une table `conversations` existe déjà sur cette base : un vestige de messagerie
-- UNE-À-UNE, avec `user1_id`, `user2_id`, `last_message` — et `user1_id NOT NULL`.
-- Une première version de ce fichier tentait de l'adopter en lui ajoutant des
-- colonnes ; l'insertion échouait alors sur cette contrainte, invisible tant qu'on
-- ne tente pas d'écrire. Les groupes ont donc leur propre table : un groupe n'est
-- pas une conversation à deux, et les faire cohabiter dans une même table aurait
-- demandé de rendre nullable une colonne qui protège l'autre usage.
CREATE TABLE IF NOT EXISTS public.conversations_groupes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  description text,
  -- `libre` aujourd'hui ; la colonne existe pour que d'autres familles de groupes
  -- puissent partager cette table sans migration.
  type        text NOT NULL DEFAULT 'libre',
  -- Le créateur est l'UNIQUE administrateur : lui seul ajoute, retire et renomme.
  -- Décision explicite — personne ne se retrouve dans un groupe sans savoir qui
  -- l'y a mis, et il n'y a pas de hiérarchie d'admins à arbitrer.
  cree_par    uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  -- Archivé plutôt que supprimé : l'historique Firestore survivrait de toute façon
  -- à la suppression de la ligne, et un groupe effacé d'un seul côté deviendrait un
  -- fil orphelin que plus personne ne peut ouvrir ni retrouver.
  archive     boolean NOT NULL DEFAULT false,
  archive_le  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_groupes_type_chk CHECK (type IN ('libre')),
  CONSTRAINT conversations_groupes_nom_chk  CHECK (char_length(trim(nom)) BETWEEN 2 AND 80)
);
CREATE INDEX IF NOT EXISTS idx_conversations_groupes_createur
  ON public.conversations_groupes(cree_par, archive);

-- Nettoyage de la première tentative : ces colonnes ont été ajoutées au vestige
-- `conversations` et n'y servent plus à rien. Elles sont toutes nullables ou à
-- valeur par défaut, et aucune ligne n'existe — leur retrait ne perd rien.
ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS archive,
  DROP COLUMN IF EXISTS archive_le;
-- `nom`, `type` et `cree_par` existaient peut-être AVANT cette tentative : on les
-- laisse en place plutôt que de risquer d'amputer l'usage d'origine.

-- `conversation_membres` a peut-être déjà été créée par la première version de ce
-- fichier, avec une clé étrangère pointant vers `conversations` — la mauvaise cible.
-- Un `CREATE TABLE IF NOT EXISTS` serait alors ignoré et laisserait la contrainte
-- fausse en place. La table est VIDE à ce stade : on la reprend à zéro, ce qui ne
-- perd rien et évite une danse de DROP/ADD CONSTRAINT.
DROP TABLE IF EXISTS public.conversation_membres;

CREATE TABLE IF NOT EXISTS public.conversation_membres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations_groupes(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  -- `admin` pour le créateur, `membre` pour les autres. Un seul admin par
  -- conversation dans l'usage actuel ; la colonne évite d'avoir à relire
  -- `conversations.cree_par` à chaque contrôle de droit.
  role            text NOT NULL DEFAULT 'membre',
  ajoute_par      uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_membres_role_chk CHECK (role IN ('admin','membre'))
);
-- Une personne ne peut être ajoutée qu'une fois : la garantie est posée par la base
-- plutôt que par la prudence de l'appelant, parce qu'un double-clic suffit à créer
-- le doublon et qu'un membre en double fausse tous les comptages.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_membres_unique
  ON public.conversation_membres(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_membres_user
  ON public.conversation_membres(user_id);

-- Écrites exclusivement par le backend avec la clé de service ; aucune lecture
-- directe depuis le navigateur. RLS active sans politique = personne, ce qui est
-- exactement l'intention.
ALTER TABLE public.conversations_groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_membres  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
