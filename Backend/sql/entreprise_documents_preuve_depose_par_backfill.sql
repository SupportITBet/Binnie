-- Complète depose_par_id/depose_par_nom sur les lignes 'preuve_inscription' déjà migrées
-- par entreprise_documents_type_migration.sql (créées avant que syncPreuveDocument()
-- n'enregistre l'acteur) — utilise le créateur de l'entreprise comme meilleure approximation.
UPDATE public.entreprise_documents ed
SET
  depose_par_id  = ce.cree_par_id,
  depose_par_nom = COALESCE(NULLIF(TRIM(CONCAT(u.prenom, ' ', u.nom)), ''), u.email)
FROM public.comptes_entreprises ce
LEFT JOIN public.utilisateurs u ON u.id = ce.cree_par_id
WHERE ed.entreprise_id = ce.id
  AND ed.type = 'preuve_inscription'
  AND ed.depose_par_id IS NULL
  AND ce.cree_par_id IS NOT NULL;
