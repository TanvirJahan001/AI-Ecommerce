-- Apply in a fresh app boundary as an installation administrator, after creating
-- ecommerce_owner and ecommerce_runtime with distinct private LOGIN passwords.
-- Run inside a transaction. Does not create users or change managed Supabase schemas.
CREATE SCHEMA store_private AUTHORIZATION ecommerce_owner;
REVOKE ALL ON SCHEMA store_private FROM PUBLIC;
GRANT USAGE ON SCHEMA store_private TO ecommerce_runtime;
DO $$ DECLARE role_name text; BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ecommerce_owner, ecommerce_runtime', current_database());
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA store_private FROM %I', role_name);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_owner IN SCHEMA store_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_owner IN SCHEMA store_private REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_owner IN SCHEMA store_private GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecommerce_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_owner IN SCHEMA store_private GRANT USAGE, SELECT ON SEQUENCES TO ecommerce_runtime;
