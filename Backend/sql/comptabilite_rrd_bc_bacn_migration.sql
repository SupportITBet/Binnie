-- ════════════════════════════════════════════════════════════════════════
-- RRD / BC / BACN — bet-elearning
--
-- - RRD (Registre des Recettes et Dépenses) : pas de nouvelle table, c'est
--   un rapport calculé sur comptabilite_tresorerie_mouvements (solde
--   cumulé ligne par ligne, ordre chronologique) — voir routes.
-- - BC (Bon de Caisse) : nouvelle table, sortie de caisse formalisée et
--   numérotée. Alimente automatiquement comptabilite_tresorerie_mouvements
--   à la validation (même logique que les Dépenses).
-- - BACN (Bordereau d'Achat Conforme aux Normes) : nouvelle table, bon de
--   commande/achat émis par l'acheteur avant réception facture — ne
--   génère PAS de mouvement de trésorerie (pas encore de sortie de cash,
--   comme une facture d'achat non payée).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists comptabilite_bons_caisse (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  date_bc           date not null default current_date,
  beneficiaire      text not null,
  motif             text not null,
  montant           numeric not null check (montant > 0),
  mode_paiement     text not null default 'especes',
  statut            text not null default 'valide', -- brouillon | valide | annule
  justificatif_url  text,
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

create table if not exists comptabilite_bordereaux_achat (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null unique,
  date_bacn         date not null default current_date,
  fournisseur_nom   text not null,
  lignes            jsonb not null default '[]'::jsonb, -- [{designation, quantite, prix_unitaire, montant}]
  montant_total     numeric not null default 0,
  statut            text not null default 'brouillon', -- brouillon | valide | annule
  justificatif_url  text,
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

create index if not exists idx_comptabilite_bons_caisse_date      on comptabilite_bons_caisse(date_bc);
create index if not exists idx_comptabilite_bordereaux_achat_date on comptabilite_bordereaux_achat(date_bacn);

alter table comptabilite_bons_caisse      enable row level security;
alter table comptabilite_bordereaux_achat enable row level security;
