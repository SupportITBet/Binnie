-- Migration : ajout du rôle 'admin_deputy_superviseur' à l'enum bet_role.
-- Ce rôle est référencé dans le code (bet-elearning/src/constants/roles.js,
-- Backend/src/middlewares/requireAdmin.js, notifyRole côté sessions-live)
-- mais n'avait jamais été ajouté à l'enum Postgres — tout insert/update de
-- utilisateurs.role='admin_deputy_superviseur' échouait, et toute requête
-- .in('role', [...]) contenant cette valeur échouait intégralement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_deputy_superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_deputy_superviseur';
  END IF;
END $$;
