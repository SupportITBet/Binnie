-- Historique des campagnes newsletter : persistance + programmation + stats
create table if not exists newsletter_campagnes (
  id uuid primary key default gen_random_uuid(),
  sujet text not null,
  contenu text not null,
  lien_article text,
  titre_article text,
  piece_jointe_url text,
  piece_jointe_nom text,
  destinataires jsonb not null default '{"mode":"newsletter"}'::jsonb,
  statut text not null default 'brouillon' check (statut in ('brouillon','programmee','envoyee','annulee')),
  date_programmee timestamptz,
  date_envoi timestamptz,
  total_destinataires int not null default 0,
  nb_envoyes int not null default 0,
  nb_echecs int not null default 0,
  tag_brevo text unique,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_newsletter_campagnes_statut on newsletter_campagnes(statut);
create index if not exists idx_newsletter_campagnes_created_at on newsletter_campagnes(created_at desc);
create index if not exists idx_newsletter_campagnes_date_programmee on newsletter_campagnes(date_programmee);
