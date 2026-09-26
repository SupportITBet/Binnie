-- ════════════════════════════════════════════════════════════════════════════
-- Photo des groupes de discussion — classes et groupes libres
--
-- POURQUOI. Un fil de discussion se reconnaît d'abord à son image : c'est ce que fait
-- WhatsApp, et c'est ce que cherche l'œil dans une liste de dix conversations. Jusqu'ici
-- les deux tables n'avaient QUE le nom, et la liste se lisait mot à mot.
--
-- DEUX TABLES, parce qu'il y a deux familles de fils, et qu'elles ne se ressemblent pas :
--   · `conversations_groupes` — les groupes libres, créés à la main par le personnel ;
--   · `groupes`               — les classes, dont la discussion suit la vie pédagogique.
-- Une seule table de photos aurait demandé une clé composite (type + id) pour distinguer
-- l'une de l'autre, et une jointure de plus à chaque affichage de liste. Une colonne dans
-- chacune se lit avec la ligne qu'on chargeait déjà.
--
-- PAS DE VALEUR PAR DÉFAUT. Une colonne NULL veut dire « pas de photo », et l'écran
-- retombe alors sur les initiales du groupe — exactement ce qu'il affiche aujourd'hui.
-- Les 5 groupes libres et les 28 classes existants restent donc inchangés à l'écran tant
-- que personne n'a déposé d'image.
--
-- L'URL SEULEMENT, pas le fichier : les images vivent sur Cloudinary comme toutes les
-- autres pièces du projet (photos de profil, bannières de campagne, pièces jointes).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE conversations_groupes
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE groupes
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN conversations_groupes.photo_url IS
  'Photo du groupe libre (URL Cloudinary). NULL = pas de photo, l''écran affiche les initiales.';
COMMENT ON COLUMN groupes.photo_url IS
  'Photo de la classe affichée dans sa discussion (URL Cloudinary). NULL = initiales.';
