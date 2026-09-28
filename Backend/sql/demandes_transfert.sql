-- ════════════════════════════════════════════════════════════════════════════════
--  DEMANDES DE TRANSFERT — le coach signale, le placement teste, l'onboarding réaffecte
--  À jouer une seule fois, dans l'éditeur SQL de Supabase.
-- ════════════════════════════════════════════════════════════════════════════════
--
--  POURQUOI UNE TABLE, ET PAS UN SIMPLE CHAMP SUR L'INSCRIPTION
--  Un transfert n'est pas un état de l'apprenant : c'est un dossier qui circule entre trois
--  métiers. Le coach constate qu'un apprenant n'est plus à sa place et le dit. L'agent
--  placement test le fait passer et rend un niveau. L'onboarding, et lui seul, exécute le
--  changement de classe. Chacun ne voit qu'un moment de ce parcours, et aucun ne peut le
--  mener seul.
--
--  Porter cela dans `groupes_apprenants` aurait mélangé l'inscription en cours - celle qui
--  décrit où l'apprenant EST - avec la demande de la changer. Et un apprenant peut faire
--  l'objet de plusieurs demandes dans l'année, dont certaines refusées : l'historique aurait
--  été écrasé à chaque fois.
--
--  L'ORDRE DES ÉTATS
--    en_attente_test  le coach a émis la demande ; le placement test doit faire passer le
--                     niveau. L'onboarding voit le dossier mais ne peut pas encore agir.
--    test_fait        le niveau est connu ; l'onboarding peut réaffecter.
--    traitee          l'onboarding a exécuté le changement de classe.
--    refusee          la demande n'aboutit pas ; le motif du refus est conservé.
--
--  LE NIVEAU DÉTERMINE LA CLASSE CIBLE. C'est pour cela que le bouton de réaffectation reste
--  fermé tant que `statut = en_attente_test` : réaffecter avant le test, ce serait replacer
--  l'apprenant au jugé - exactement ce que la demande cherchait à corriger.
-- ════════════════════════════════════════════════════════════════════════════════

create table if not exists demandes_transfert (
  id                uuid primary key default gen_random_uuid(),

  -- QUI. `ga_id` est l'inscription concernée ; `apprenant_id` peut être nul (profil enfant
  -- sans compte propre), d'où la conservation du nom et de l'e-mail au moment de la demande.
  ga_id             uuid not null,
  apprenant_id      uuid,
  nom_apprenant     text,
  prenom_apprenant  text,
  email_apprenant   text,

  -- D'OÙ. Copiés à la création : la classe peut être clôturée ou renommée d'ici le
  -- traitement, et le dossier doit rester lisible tel qu'il a été émis.
  groupe_id         uuid,
  groupe_nom        text,
  niveau_actuel     text,
  coach_id          uuid,
  coach_nom         text,

  -- POURQUOI. `motif` vient d'une liste fermée (elle alimente la colonne REASON FOR STOPPING
  -- du classeur des coachs, qui doit rester dénombrable) ; `detail` est le texte libre.
  type_demande      text not null default 'changement_groupe',   -- changement_groupe | changement_coaching
  motif             text not null,
  detail            text,

  -- OÙ EN EST-ON.
  statut            text not null default 'en_attente_test',
  -- Le test qui débloque le dossier, et le niveau qu'il rend.
  level_test_id     uuid,
  niveau_obtenu     text,
  teste_le          timestamptz,
  teste_par         uuid,

  -- L'ISSUE.
  groupe_cible_id   uuid,
  traite_le         timestamptz,
  traite_par        uuid,
  motif_refus       text,

  cree_par          uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Ajout après coup : le profil de l'apprenant ─────────────────────────────────
-- Le lien de test pré-remplit le formulaire ; sans cette information, l'apprenant arrivait
-- sur « Vous êtes : Particulier » sélectionné par DÉFAUT, et pouvait le changer par
-- inadvertance alors que son profil est déjà connu - c'est un transfert, pas une première
-- inscription. Écrit à la création de la demande quand il est résolvable, `null` sinon :
-- mieux vaut laisser le choix ouvert que figer une valeur fausse.
alter table demandes_transfert
  add column if not exists profil_type text;

comment on column demandes_transfert.profil_type is
  'particulier | etudiant | professionnel | enfant — repris du dossier de l''apprenant pour verrouiller le formulaire de test. NULL = inconnu, le choix reste ouvert.';

-- La file de travail se lit par statut et par date : c'est l'accès de tous les écrans.
create index if not exists idx_demandes_transfert_statut  on demandes_transfert (statut, created_at desc);
create index if not exists idx_demandes_transfert_ga      on demandes_transfert (ga_id);
create index if not exists idx_demandes_transfert_coach   on demandes_transfert (coach_id);

comment on table demandes_transfert is
  'Demandes de changement de classe ou de coaching émises par un coach. Circuit : coach → agent placement test (niveau) → onboarding (réaffectation).';
comment on column demandes_transfert.statut is
  'en_attente_test | test_fait | traitee | refusee. L''onboarding ne peut réaffecter qu''à partir de test_fait.';

-- ── Contrôle ────────────────────────────────────────────────────────────────────
select count(*) as demandes,
       count(*) filter (where statut = 'en_attente_test') as en_attente_test,
       count(*) filter (where statut = 'test_fait')       as pretes_a_reaffecter
from demandes_transfert;
