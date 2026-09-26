-- À exécuter dans Supabase > SQL Editor
-- Ajoute la colonne nécessaire au SDK cinetpay-js pour vérifier l'authenticité
-- des webhooks (comparaison du notify_token émis à l'initialisation vs reçu).
ALTER TABLE public.paiements_cinetpay ADD COLUMN IF NOT EXISTS notify_token TEXT;
