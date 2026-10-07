-- ════════════════════════════════════════════════════════════════════════
-- TRANSFERT DE CENTRE À CENTRE — 2026-10-06
--
-- Un apprenant d'Angré déménage et veut suivre ses cours à Yopougon. Ni son
-- niveau ni son canal ne changent : seul le LIEU change. Les deux circuits
-- existants ne savent pas dire cela —
--   · `changement_groupe`    interroge le NIVEAU et exige un test ;
--   · `changement_coaching`  fait passer du en ligne au présentiel.
-- D'où un troisième type, `changement_centre`, de même forme que le second :
-- aucun test, et l'accord de l'équipe qui va RECEVOIR l'apprenant.
--
-- POURQUOI UNE COLONNE, ET PAS UNE DÉDUCTION. Le centre cible est un CHOIX de
-- l'émettrice, pas quelque chose qui se calcule : contrairement au canal — qui
-- n'a que deux valeurs, donc « l'autre » suffit à le désigner — il y a six
-- centres. Sans cette colonne, la demande ne peut être montrée à personne en
-- particulier, et c'est tout le problème : la file présentiel ne filtre
-- aujourd'hui QUE par canal, si bien que les 11 assistantes présentiel
-- réparties sur 6 centres voient les mêmes dossiers. Pour un changement de
-- classe cela passe ; pour un transfert de centre, l'assistante de Yopougon
-- pourrait accepter un dossier d'Angré destiné à Koumassi.
--
-- `centres.id` est un TEXTE court et parlant (« angre », « bouake »), pas un
-- UUID : la colonne suit ce type, et la clé étrangère le vérifie.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.demandes_transfert
  ADD COLUMN IF NOT EXISTS centre_cible_id TEXT NULL REFERENCES public.centres(id),
  -- Le centre de DÉPART, recopié à la création. La classe peut changer de centre
  -- ou être clôturée d'ici le traitement : figé ici, le trajet reste lisible même
  -- des mois plus tard, dans l'archive comme dans la file.
  ADD COLUMN IF NOT EXISTS centre_source_id TEXT NULL REFERENCES public.centres(id),
  -- L'ASSISTANTE D'AVANT. `assignations_parcours.assistante_id` est VIVANT : un
  -- transfert de centre comme une migration de canal le remplacent, et la
  -- précédente ne survit alors nulle part. Elle ne se devine qu'indirectement, par
  -- le crédit figé des paiements déjà encaissés — ce qui ne couvre que les dossiers
  -- ayant déjà payé (84 sur 88 au 06/10/2026) et laisse les autres sans mémoire.
  -- Une colonne, et « qui le suivait avant ? » a une réponse pour tout le monde.
  ADD COLUMN IF NOT EXISTS assistante_source_id UUID NULL REFERENCES public.assistantes(id);

COMMENT ON COLUMN public.demandes_transfert.centre_cible_id      IS 'Centre visé par un transfert centre à centre (type_demande = changement_centre)';
COMMENT ON COLUMN public.demandes_transfert.centre_source_id     IS 'Centre de départ, figé à la création de la demande';
COMMENT ON COLUMN public.demandes_transfert.assistante_source_id IS 'Assistante qui suivait le dossier avant le transfert — assistante_id est écrasé à l''exécution';

-- La file est lue par centre dès qu'un transfert de centre est en jeu : sans index,
-- chaque ouverture de l'onglet balaie la table entière.
CREATE INDEX IF NOT EXISTS idx_demandes_transfert_centre_cible
  ON public.demandes_transfert(centre_cible_id)
  WHERE centre_cible_id IS NOT NULL;

-- ── Contrôle ──────────────────────────────────────────────────────────────
-- Doit renvoyer les deux colonnes.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'demandes_transfert'
  AND column_name IN ('centre_cible_id', 'centre_source_id', 'assistante_source_id')
ORDER BY column_name;
