-- ════════════════════════════════════════════════════════════════════════════
-- CYCLE DE VIE DU PROSPECT — la condition des huit KPI de conversion
--
-- POURQUOI. Le référentiel demande le taux de qualification (COM-02), la conversion
-- prospect → client (COM-05), le délai de premier contact (COM-03), celui de closing
-- (COM-06) et les taux du site (WEB-09, WEB-11). Or `assignations_parcours.statut` vaut
-- « converti » pour les 78 dossiers : il n'existe aucune étape antérieure. Ces taux
-- auraient donc tous rendu 100 % — un chiffre faux, pire qu'absent.
--
-- CE QUE CES COLONNES AJOUTENT, et rien de plus : les quatre moments d'un dossier.
--   · il arrive            → `cycle_statut = nouveau`
--   · on l'appelle         → `premier_contact_at`
--   · il est qualifié      → `qualifie_at`, `cycle_statut = qualifie`
--   · il signe ou renonce  → `converti_at` / `perdu_at` + `perdu_motif`
--
-- POURQUOI UNE COLONNE SÉPARÉE plutôt que d'enrichir `statut`. Ce champ-là est filtré à
-- plus de quarante endroits du code (`neq("statut","annule")`, whitelists de statuts…) :
-- y introduire de nouvelles valeurs ferait disparaître des dossiers d'écrans qui n'ont
-- rien à voir avec la mesure. `cycle_statut` vit à côté, sans rien perturber.
--
-- LES DOSSIERS EXISTANTS sont marqués « converti » avec la date de création comme repère,
-- puisqu'ils le sont réellement. Leur `premier_contact_at` reste NUL : on ne l'a jamais
-- mesuré, et l'inventer fausserait durablement le délai moyen. Les KPI de délai ne
-- porteront donc que sur les dossiers postérieurs à cette migration — c'est le seul
-- choix honnête.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS cycle_statut        text        NOT NULL DEFAULT 'nouveau',
  ADD COLUMN IF NOT EXISTS premier_contact_at  timestamptz,
  ADD COLUMN IF NOT EXISTS qualifie_at         timestamptz,
  ADD COLUMN IF NOT EXISTS converti_at         timestamptz,
  ADD COLUMN IF NOT EXISTS perdu_at            timestamptz,
  ADD COLUMN IF NOT EXISTS perdu_motif         text;

-- Les quatre valeurs admises, verrouillées en base : une faute de frappe dans un appel
-- d'API ne doit pas créer un cinquième état que les compteurs ignoreraient en silence.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignations_cycle_statut_valide') THEN
    ALTER TABLE assignations_parcours
      ADD CONSTRAINT assignations_cycle_statut_valide
      CHECK (cycle_statut IN ('nouveau', 'qualifie', 'converti', 'perdu'));
  END IF;
END $$;

-- L'existant : tous ces dossiers ont abouti. On le dit, sans inventer de date de contact.
UPDATE assignations_parcours
   SET cycle_statut = 'converti',
       converti_at  = COALESCE(converti_at, created_at)
 WHERE statut = 'converti'
   AND cycle_statut = 'nouveau';

-- Les compteurs du cockpit balaient ces colonnes à chaque ouverture de l'écran.
CREATE INDEX IF NOT EXISTS idx_assignations_cycle_statut ON assignations_parcours (cycle_statut);
CREATE INDEX IF NOT EXISTS idx_assignations_premier_contact ON assignations_parcours (premier_contact_at);

COMMENT ON COLUMN assignations_parcours.cycle_statut IS
  'Cycle commercial : nouveau → qualifie → converti | perdu. Distinct de `statut`, qui pilote les écrans.';
COMMENT ON COLUMN assignations_parcours.premier_contact_at IS
  'Horodatage du premier contact réellement établi. NUL tant que personne n''a appelé.';
