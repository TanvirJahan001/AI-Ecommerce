BEGIN;
-- Better Auth owns its core/plugin schema; scripts/migrate-auth.ts applies library migrations.
-- No staff roles are accepted until their direct-request permissions are implemented.
CREATE TABLE store_access (
  user_id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('owner','customer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_owner ON store_access(role) WHERE role='owner';
COMMIT;
