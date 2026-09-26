-- Plusieurs PA Advisors (2 à 5) traitent les remplacements — il faut pouvoir tracer NOMINATIVEMENT
-- qui a assigné ou refusé une demande, pas seulement "le PA" en général. `assigne_par_id` et
-- `refuse_par_id` existaient déjà mais sans nom dénormalisé, coûteux à résoudre à l'affichage
-- (coach et PA n'ont pas forcément accès à la table utilisateurs pour ça). Idempotent.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS assigne_par_nom TEXT,
  ADD COLUMN IF NOT EXISTS refuse_par_nom  TEXT;
