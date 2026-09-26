-- ════════════════════════════════════════════════════════════════════════
-- badges_fidelite — série de 24 visuels "Happy to have You", un par mois
-- d'ancienneté (1 à 24) d'un apprenant chez BET. Table éditable en back-office
-- (contrairement aux 24 fichiers d'origine, figés) : image_url et message
-- peuvent être modifiés sans redéploiement.
--
-- type_recompense : "aucune" | "reduction" | "gratuit" — informatif seulement,
-- n'applique jamais rien automatiquement sur le plan de paiement (validation
-- manuelle par la commerciale, décision confirmée avant implémentation).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists badges_fidelite (
  id               uuid primary key default gen_random_uuid(),
  mois             int  not null unique check (mois >= 1),
  titre            text not null default 'Happy to have You',
  message          text not null,
  image_url        text not null,
  type_recompense  text not null default 'aucune' check (type_recompense in ('aucune','reduction','gratuit')),
  valeur_recompense text,               -- ex: "10%" — libre, affiché tel quel, jamais interprété automatiquement
  actif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists badges_fidelite_mois_idx on badges_fidelite(mois);
