-- ============================================================================
--  Email propre à l'enfant sur le dossier d'inscription
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Un dossier enfant portait `prospect_email` — l'adresse du PARENT, qui sert à joindre
--  le dossier — et `email_parent`. Rien pour l'enfant lui-même.
--
--  Or certains parents créent une vraie adresse pour leur enfant. Faute d'endroit où la
--  ranger, la commerciale ne pouvait pas la saisir : à la création de l'accès, un
--  identifiant technique était généré, que l'enfant ne reconnaissait pas au moment de se
--  connecter.
--
--  Pourquoi ne pas réutiliser `prospect_email` ? Parce que c'est l'adresse de CONTACT du
--  dossier, et qu'elle doit rester celle du parent : c'est lui qu'on relance pour un
--  paiement ou un document manquant. Les deux coexistent donc, chacune avec son rôle.
-- ============================================================================

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS email_enfant text;

COMMENT ON COLUMN public.assignations_parcours.email_enfant IS
  'Adresse propre a l''enfant, quand le parent lui en a cree une. Sert d''identifiant de
   connexion a la creation de l''acces. NULL = un identifiant est genere. Ne remplace jamais
   prospect_email, qui reste l''adresse de contact du dossier (le parent).';

-- Retrouver un enfant par son adresse — le premier réflexe quand il ne parvient pas à se
-- connecter. Index partiel : la colonne est vide pour l'immense majorité des dossiers.
CREATE INDEX IF NOT EXISTS idx_assignations_email_enfant
  ON public.assignations_parcours(lower(email_enfant))
  WHERE email_enfant IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                                          AS dossiers,
       COUNT(*) FILTER (WHERE profil_type = 'enfant')     AS enfants,
       COUNT(email_enfant)                                AS avec_email_propre
  FROM public.assignations_parcours;
