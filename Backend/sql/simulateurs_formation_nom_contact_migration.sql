-- Le nom du responsable/contact saisi dans le formulaire "Votre entreprise" (EntrepriseParcoursModal)
-- n'était jamais persisté : seul email_contact existait, donc "Mes demandes" (dash) retombait
-- sur l'affichage de l'email à la place du nom.
ALTER TABLE public.simulateurs_formation
  ADD COLUMN IF NOT EXISTS nom_contact text;
