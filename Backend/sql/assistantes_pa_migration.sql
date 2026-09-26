-- ══════════════════════════════════════════════════════════════
-- Ajout du profil 'pa' (Pedagogical Advisor) à la table assistantes
-- + Insertion exemple du compte PA (remplacer email et nom réels)
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Supprimer l'ancienne contrainte CHECK et en créer une nouvelle
--    qui inclut 'pa'
ALTER TABLE public.assistantes
  DROP CONSTRAINT IF EXISTS assistantes_profil_check;

ALTER TABLE public.assistantes
  ADD CONSTRAINT assistantes_profil_check
  CHECK (profil IN ('b2c', 'b2b', 'les_deux', 'pa'));

-- 2. Insérer le Conseiller Pédagogique dans la table assistantes
--    ⚠️ Remplacer les valeurs ci-dessous par les vraies informations du PA
-- Mettre à jour si l'email existe déjà, sinon insérer
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assistantes WHERE email = 'email.pa@betlanguages.ci') THEN
    UPDATE public.assistantes
    SET profil = 'pa', actif = true, type_cours = 'domicile'
    WHERE email = 'email.pa@betlanguages.ci';
  ELSE
    INSERT INTO public.assistantes (nom, prenom, email, telephone, profil, actif, type_cours, quota_jour)
    VALUES (
      'thubert',                  
      'thubert',                
      'thubert12@gmail.com', 
      '+225 00 00 00 00',          
      'pa',
      true,
      'domicile',
      50
    );
  END IF;
END $$;
