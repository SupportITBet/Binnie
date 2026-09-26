-- ════════════════════════════════════════════════════════════════════════
-- RRD / BC / BACN — dash (miroir exact de comptabilite_rrd_bc_bacn_migration.sql)
-- ════════════════════════════════════════════════════════════════════════

create table if not exists dash_comptabilite_bons_caisse (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  date_bc           date not null default current_date,
  beneficiaire      text not null,
  motif             text not null,
  montant           numeric not null check (montant > 0),
  mode_paiement     text not null default 'especes',
  statut            text not null default 'valide',
  justificatif_url  text,
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

create table if not exists dash_comptabilite_bordereaux_achat (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  date_bacn         date not null default current_date,
  fournisseur_nom   text not null,
  lignes            jsonb not null default '[]'::jsonb,
  montant_total     numeric not null default 0,
  statut            text not null default 'brouillon',
  justificatif_url  text,
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

create index if not exists idx_dash_comptabilite_bons_caisse_date      on dash_comptabilite_bons_caisse(date_bc);
create index if not exists idx_dash_comptabilite_bordereaux_achat_date on dash_comptabilite_bordereaux_achat(date_bacn);

alter table dash_comptabilite_bons_caisse      enable row level security;
alter table dash_comptabilite_bordereaux_achat enable row level security;
