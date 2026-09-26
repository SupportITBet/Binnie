-- ═════════════════════════════════════════════════════════════════════════
-- HISTORIQUE DES CAMPAGNES E-MAIL DE COLLECTE
--
-- Les campagnes WhatsApp étaient enregistrées (`campagnes_whatsapp` +
-- `whatsapp_envois`), les campagnes e-mail ne l'étaient PAS : la route envoyait
-- et oubliait. Conséquence concrète — quand un envoi a échoué chez Brevo, rien
-- dans la base ne permettait de savoir qu'il avait seulement été tenté, ni à qui,
-- ni pourquoi. Il a fallu aller lire les journaux du fournisseur.
--
-- Ces deux tables sont volontairement CALQUÉES sur la paire WhatsApp : mêmes
-- noms de colonnes, mêmes statuts quand ils ont le même sens. L'écran de
-- statistiques affiche les deux canaux côte à côte, et deux formes différentes
-- l'auraient obligé à traduire.
-- ═════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.campagnes_email (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Le formulaire filtré à l'envoi, quand il y en avait un. NULLABLE À DESSEIN :
  -- une campagne peut viser plusieurs récoltes à la fois, ou toutes.
  formulaire_id  uuid REFERENCES public.campagne_formulaires(id) ON DELETE SET NULL,
  -- Les récoltes réellement touchées, déduites des destinataires au moment de
  -- l'envoi. C'est CE champ qui répond à « quelles campagnes sur cette récolte ? »,
  -- parce que `formulaire_id` seul mentirait sur un envoi multi-récoltes.
  formulaire_ids uuid[] NOT NULL DEFAULT '{}',
  campagne_id    uuid REFERENCES public.campagnes(id) ON DELETE SET NULL,
  -- Un nom donné par l'assistant marketing. Plusieurs campagnes partent sur la
  -- même récolte : sans nom, la liste n'est qu'une suite d'objets d'e-mails.
  nom            text,
  sujet          text NOT NULL,
  contenu        text,
  piece_jointe_url text,
  piece_jointe_nom text,
  -- Les filtres exacts qui ont produit l'audience :
  --   { "formulaire_id": "…", "diffusion_id": "…", "statut": "nouvelle" }
  -- Figés à l'envoi : recalculer l'audience plus tard donnerait un autre chiffre,
  -- et le rapport ne correspondrait plus à ce qui est réellement parti.
  filtres        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- envoyee | partielle | echouee
  statut         text NOT NULL DEFAULT 'envoyee',
  total_destinataires integer NOT NULL DEFAULT 0,
  nb_envoyes     integer NOT NULL DEFAULT 0,
  nb_echecs      integer NOT NULL DEFAULT 0,
  -- Écartés faute de consentement — pas un échec technique. Les confondre
  -- masquerait le vrai problème : une base sans opt-in.
  nb_sans_consentement integer NOT NULL DEFAULT 0,
  -- Sans adresse e-mail du tout : le champ est rarement obligatoire.
  nb_sans_email  integer NOT NULL DEFAULT 0,
  -- Les motifs distincts renvoyés par le fournisseur, pour diagnostiquer sans
  -- ouvrir les journaux de Brevo.
  erreurs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  date_envoi     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campagnes_email_statut_chk
    CHECK (statut IN ('envoyee','partielle','echouee'))
);
CREATE INDEX IF NOT EXISTS idx_campagnes_email_date
  ON public.campagnes_email(date_envoi DESC);
-- GIN sur le tableau : « toutes les campagnes qui ont touché cette récolte » est
-- la question posée par l'écran, et elle s'écrit `formulaire_ids && ARRAY[...]`.
CREATE INDEX IF NOT EXISTS idx_campagnes_email_formulaires
  ON public.campagnes_email USING GIN (formulaire_ids);

-- Une ligne par destinataire — le même rôle que `whatsapp_envois` : savoir qui a
-- reçu quoi, et pour les autres, la raison exacte du refus.
CREATE TABLE IF NOT EXISTS public.email_envois (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_email_id uuid NOT NULL REFERENCES public.campagnes_email(id) ON DELETE CASCADE,
  email          text NOT NULL,
  nom            text,
  reponse_id     uuid REFERENCES public.campagne_reponses(id) ON DELETE SET NULL,
  -- La récolte d'où vient ce destinataire. Recopiée ici plutôt que relue par
  -- jointure : une réponse supprimée ne doit pas effacer l'attribution d'un
  -- envoi qui a bel et bien eu lieu.
  formulaire_id  uuid,
  -- envoye | echec
  statut         text NOT NULL DEFAULT 'envoye',
  erreur         text,
  envoye_le      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_envois_statut_chk
    CHECK (statut IN ('envoye','echec'))
);
CREATE INDEX IF NOT EXISTS idx_email_envois_campagne
  ON public.email_envois(campagne_email_id, statut);
-- Un seul envoi par adresse et par campagne, garanti par la base plutôt que par
-- la prudence du code appelant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_envois_unique
  ON public.email_envois(campagne_email_id, email);

-- Les deux tables sont écrites par le backend avec la clé de service ; aucune
-- lecture directe depuis le navigateur. RLS activée sans politique = personne,
-- ce qui est exactement l'intention.
ALTER TABLE public.campagnes_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_envois    ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- SYMÉTRIE CÔTÉ WHATSAPP
--
-- `campagnes_whatsapp` n'a qu'un `campagne_id` : elle ne sait pas non plus dire
-- quelles récoltes elle a touchées quand l'audience en couvrait plusieurs. On lui
-- ajoute le même tableau, pour que l'écran de statistiques interroge les deux
-- canaux de la même façon.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.campagnes_whatsapp
  ADD COLUMN IF NOT EXISTS formulaire_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_campagnes_whatsapp_formulaires
  ON public.campagnes_whatsapp USING GIN (formulaire_ids);

ALTER TABLE public.whatsapp_envois
  ADD COLUMN IF NOT EXISTS formulaire_id uuid;

NOTIFY pgrst, 'reload schema';
