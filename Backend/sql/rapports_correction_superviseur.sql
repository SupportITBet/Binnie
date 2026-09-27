-- ════════════════════════════════════════════════════════════════════════════════
--  CORRECTION D'UN RAPPORT D'OBSERVATION PAR LE SUPERVISEUR
--  À jouer une seule fois, dans l'éditeur SQL de Supabase.
-- ════════════════════════════════════════════════════════════════════════════════
--
--  POURQUOI
--  Le superviseur relit les rapports des deputies avant de les transmettre au conseiller
--  pédagogique. Jusqu'ici il ne pouvait qu'ajouter un commentaire : une erreur de saisie -
--  un critère mal cliqué, une classe confondue - partait telle quelle.
--
--  Ce n'est pas anodin. La note globale d'un rapport attribue des points au coach au
--  moment de la transmission (+30 au-dessus de 4,5 · +15 au-dessus de 3,5 · −10 en dessous
--  de 2,5) et alimente son classement et sa catégorie de contrat. Une faute de frappe pèse
--  donc sur la carrière de quelqu'un.
--
--  MAIS UN RAPPORT D'OBSERVATION EST AUSSI UN TÉMOIGNAGE. Laisser le superviseur le
--  réécrire en silence ferait disparaître la parole du deputy, et le document perdrait
--  toute valeur de preuve le jour où un coach conteste sa note.
--
--  D'où cette colonne : la correction est permise, mais l'original est conservé. Le
--  rapport porte alors la mention « corrigé par X le Y », et le conseiller voit ce qui a
--  été modifié.
--
--  FORME DE LA DONNÉE
--    {
--      "original":   { ponctualite: 3, ..., observations: "...", note_globale: 2.8 },
--      "par":        { id, nom, prenom, role },
--      "le":         "2026-09-27T14:12:00.000Z",
--      "motif":      "critère de ponctualité inversé"
--    }
--
--  `original` est écrit UNE SEULE FOIS, à la première correction : il doit rester ce que
--  le deputy a réellement soumis, pas l'avant-dernière version.
--
-- ════════════════════════════════════════════════════════════════════════════════

alter table rapports_observation
  add column if not exists correction_superviseur jsonb;

comment on column rapports_observation.correction_superviseur is
  'Trace d''une correction par le superviseur : valeurs d''origine du deputy, auteur, date et motif. Écrit une seule fois, à la première correction.';

-- ── Contrôle ────────────────────────────────────────────────────────────────────
select count(*) as rapports,
       count(*) filter (where correction_superviseur is not null) as corriges
from rapports_observation;
