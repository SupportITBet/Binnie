-- ============================================================================
--  Envoi unique des emails de publication
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--      Lancer seulement la requête de vérification en bas donne
--      « relation ... does not exist », puisque la table n'est pas encore créée.
--
--  Pourquoi cette table : un coach dépublie et republie volontiers — pour
--  corriger une faute, ajuster une échéance, ou simplement parce qu'il hésite.
--  Si chaque passage en « publié » déclenchait un email, une classe de neuf
--  apprenants recevrait trois fois le même message pour un seul devoir, et se
--  désabonnerait — y compris des envois qui comptent.
--
--  Cette table est la mémoire de ce qui a DÉJÀ été envoyé, et l'index unique
--  en est la garantie : il ne dépend d'aucun test applicatif qu'une
--  republication concurrente pourrait contourner. Deux publications
--  simultanées ? La seconde échoue sur l'index, et rien ne repart.
--
--  Une seule table pour les contenus de médiathèque ET les évaluations : la
--  règle est la même, une colonne dans chaque table la dupliquerait.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emails_publication_envoyes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ressource_type   text NOT NULL,
  ressource_id     uuid NOT NULL,
  titre            text,
  nb_destinataires integer NOT NULL DEFAULT 0,
  nb_parents       integer NOT NULL DEFAULT 0,
  envoye_par       uuid,
  envoye_le        timestamptz NOT NULL DEFAULT now()
);

-- La garantie elle-même.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_publication_ressource
  ON public.emails_publication_envoyes (ressource_type, ressource_id);

COMMENT ON TABLE public.emails_publication_envoyes IS
  'Emails de publication deja partis. Une ligne = un envoi definitif : republier une ressource n en declenche pas un second.';

-- PostgREST garde un cache du schéma : sans ce signal, l API continue de
-- répondre « table introuvable » alors qu elle vient d être créée.
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT ressource_type,
       COUNT(*)              AS envois,
       SUM(nb_destinataires) AS destinataires,
       SUM(nb_parents)       AS parents
  FROM public.emails_publication_envoyes
 GROUP BY ressource_type;
