-- ============================================================================
--  Deux numéros WhatsApp supplémentaires sur les coordonnées centrales BET
-- ============================================================================
--
--  Le footer, la page Contact et la FAQ n'affichaient qu'un seul numéro. BET en
--  expose désormais trois, côte à côte, tous joignables sur WhatsApp.
--
--  Colonnes ajoutées plutôt qu'un tableau JSON : le bloc de configuration
--  SuperAdmin est un formulaire à champs fixes, et `config_contact` suit déjà
--  cette forme (whatsapp_number, email_central, localisation…). Rester cohérent
--  avec la table évite d'avoir deux conventions dans le même enregistrement.
--
--  Sans effet sur l'existant : les deux colonnes naissent vides, et un numéro
--  vide ne s'affiche nulle part.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE config_contact
  ADD COLUMN IF NOT EXISTS whatsapp_number_2 TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number_3 TEXT;

COMMENT ON COLUMN config_contact.whatsapp_number_2 IS
  'Deuxième numéro WhatsApp affiché à côté du principal (footer, Contact, FAQ). Vide = masqué.';
COMMENT ON COLUMN config_contact.whatsapp_number_3 IS
  'Troisième numéro WhatsApp affiché à côté du principal (footer, Contact, FAQ). Vide = masqué.';

-- Vérification
SELECT whatsapp_number, whatsapp_number_2, whatsapp_number_3
FROM config_contact WHERE id = 1;
