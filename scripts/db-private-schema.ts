import { Pool } from "pg";
import { databasePoolConfig, databaseSchema } from "../src/lib/database-config";

// This tool prepares a fresh, project-owned boundary. It never applies SQL.
// Inspect the intended local installation and review the emitted SQL first.
const schema = databaseSchema({
  DATABASE_PROVIDER: "supabase",
  DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
});
const owner = "ecommerce_owner";
const runtime = "ecommerce_runtime";
const exposed = process.env.DATABASE_EXPOSED_SCHEMAS?.split(",").map((v) =>
  v.trim(),
);
if (!exposed?.length || exposed.some((v) => !v))
  throw Error(
    "Set DATABASE_EXPOSED_SCHEMAS from the intended installation's actual Data API configuration (comma-separated).",
  );
if (exposed.includes(schema))
  throw Error("The application schema must not be exposed by the Data API.");
const quoted = `"${schema}"`;
const mode = process.argv[2];

if (mode === "--sql") {
  console.log(`-- PREPARATION ONLY: review against the confirmed installation.
-- Fresh boundary only: refuses conflicting existing roles/schema. No passwords.
-- Run as an authorized local administrator in the intended database, then set
-- each new role's password privately (for example using psql \\password).
-- Do not run this against the original source database or a guessed target.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('${owner}', '${runtime}'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = '${schema}') THEN
    RAISE EXCEPTION 'Boundary already exists or conflicts; inspect ownership and audit instead of overwriting it';
  END IF;
END $$;
CREATE ROLE ${owner} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE SCHEMA ${quoted} AUTHORIZATION ${owner};
REVOKE ALL ON SCHEMA ${quoted} FROM PUBLIC;
GRANT USAGE ON SCHEMA ${quoted} TO ${runtime};
DO $$ DECLARE r text; BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${owner}, ${runtime}', current_database());
  FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA ${quoted} FROM %I', r);
  END LOOP;
END $$;
-- Defaults apply only to objects created by this NEW project migration role.
-- Function EXECUTE is granted to PUBLIC globally by PostgreSQL; a schema-only
-- revoke cannot negate that global default. Restrict this dedicated creator.
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${quoted} REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${quoted} REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${quoted} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${runtime};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${quoted} GRANT USAGE, SELECT ON SEQUENCES TO ${runtime};
COMMIT;
-- No Supabase-managed schema, role, extension or Data API setting is changed.
-- Do NOT grant ecommerce_owner to ecommerce_runtime.
-- Run existing commerce and Better Auth migrations using ecommerce_owner and
-- a verified direct/session connection whose search_path starts with ${quoted}.
-- Runtime uses ecommerce_runtime with the same private search_path.
-- Run --audit after migrations; establish actual Data API HTTP denial separately.
`);
} else if (mode === "--audit") {
  // Separate explicit administrator configuration; never silently use DATABASE_URL.
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString)
    throw Error(
      "DATABASE_ADMIN_URL is required for the read-only boundary audit.",
    );
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw Error("DATABASE_ADMIN_URL must be a PostgreSQL connection URL.");
  const pool = new Pool(
    databasePoolConfig(
      {
        ...process.env,
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: connectionString,
      },
      "runtime",
      1,
    ),
  );
  const client = await pool.connect().catch(() => {
    throw Error(
      "Private-schema audit could not connect; check private administrator configuration.",
    );
  });
  const failures: string[] = [];
  try {
    await client.query("BEGIN READ ONLY");
    const target = await client.query(
      "select current_database() database, current_setting('server_version') version, inet_server_addr()::text address, inet_server_port() port",
    );
    const dataApiConfiguration = await client.query(
      `select current_setting('pgrst.db_schemas', true) current_setting,
       (select coalesce(json_agg(config), '[]'::json) from
         (select distinct entry config from pg_catalog.pg_db_role_setting s,
          lateral unnest(s.setconfig) entry
          where entry like 'pgrst.db_schemas=%'
          and s.setdatabase in (0, (select oid from pg_catalog.pg_database where datname=current_database()))) configs) stored_settings`,
    );
    const configuredSchemas = [
      dataApiConfiguration.rows[0].current_setting,
      ...dataApiConfiguration.rows[0].stored_settings.map((value: string) =>
        value.slice("pgrst.db_schemas=".length),
      ),
    ].filter(Boolean);
    if (
      configuredSchemas.some((value: string) =>
        value
          .split(",")
          .map((v) => v.trim())
          .includes(schema),
      )
    )
      failures.push(
        "A database-side Data API configuration exposes the application schema.",
      );
    const roles = await client.query(
      "select rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit from pg_catalog.pg_roles where rolname = any($1::text[])",
      [[owner, runtime]],
    );
    if (roles.rowCount !== 2) failures.push("Both dedicated roles must exist.");
    for (const role of roles.rows) {
      if (
        role.rolsuper ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolreplication ||
        role.rolbypassrls ||
        role.rolinherit
      )
        failures.push(
          `${role.rolname} has unexpected elevated role attributes.`,
        );
    }
    const namespace = await client.query(
      "select pg_catalog.pg_get_userbyid(nspowner) owner from pg_catalog.pg_namespace where nspname=$1",
      [schema],
    );
    if (namespace.rows[0]?.owner !== owner)
      failures.push(
        "The private schema is missing or has an unexpected owner.",
      );
    const objects = await client.query(
      `select c.relname name, c.relkind kind, pg_catalog.pg_get_userbyid(c.relowner) owner,
       c.relrowsecurity rls_enabled, c.relforcerowsecurity rls_forced, c.reloptions options
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname=$1 and c.relkind in ('r','p','v','m','f','S') order by c.relname`,
      [schema],
    );
    if (objects.rows.some((object) => object.owner !== owner))
      failures.push("Application objects have unexpected owners.");
    const functions = await client.query(
      `select p.oid::pg_catalog.regprocedure::text signature, pg_catalog.pg_get_userbyid(p.proowner) owner,
       p.prosecdef security_definer, p.proconfig configuration
       from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname=$1`,
      [schema],
    );
    if (functions.rows.some((fn) => fn.security_definer || fn.owner !== owner))
      failures.push(
        "Private functions have unexpected owners or SECURITY DEFINER behavior.",
      );
    const defaultPrivileges = await client.query(
      `select pg_catalog.pg_get_userbyid(d.defaclrole) creator,
       coalesce(n.nspname, '(global)') schema, d.defaclobjtype object_type, d.defaclacl::text acl
       from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
       where pg_catalog.pg_get_userbyid(d.defaclrole)=$1 and (d.defaclnamespace=0 or n.nspname=$2)`,
      [owner, schema],
    );
    const apiRoles = await client.query(
      "select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role') order by rolname",
    );
    if (apiRoles.rowCount !== 3)
      failures.push(
        "Expected Supabase API roles are missing; this is not a complete Supabase role audit.",
      );
    const memberships = await client.query(
      "select parent.rolname parent from pg_catalog.pg_auth_members m join pg_catalog.pg_roles child on child.oid=m.member join pg_catalog.pg_roles parent on parent.oid=m.roleid where child.rolname=$1",
      [runtime],
    );
    if (memberships.rowCount)
      failures.push("Runtime has unexpected role memberships.");
    if (namespace.rowCount) {
      for (const { rolname } of apiRoles.rows) {
        const leakage = await client.query(
          `select pg_catalog.has_schema_privilege($1,$2,'USAGE') schema_access,
           exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$2 and c.relkind in ('r','p','v','m','f') and pg_catalog.has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) table_access,
           exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$2 and case when c.relkind='S' then pg_catalog.has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') else false end) sequence_access,
           exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname=$2 and pg_catalog.has_function_privilege($1,p.oid,'EXECUTE')) function_access`,
          [rolname, schema],
        );
        if (Object.values(leakage.rows[0]).some(Boolean))
          failures.push(
            `${rolname} has private application object privileges.`,
          );
      }
      if (roles.rows.some((r) => r.rolname === runtime)) {
        const access = await client.query(
          `select pg_catalog.has_schema_privilege($1,$2,'USAGE') can_use,
           pg_catalog.has_schema_privilege($1,$2,'CREATE') can_create,
           exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$2 and c.relkind in ('r','p') and not (pg_catalog.has_table_privilege($1,c.oid,'SELECT') and pg_catalog.has_table_privilege($1,c.oid,'INSERT') and pg_catalog.has_table_privilege($1,c.oid,'UPDATE') and pg_catalog.has_table_privilege($1,c.oid,'DELETE'))) missing_dml,
           exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$2 and c.relkind in ('r','p') and pg_catalog.has_table_privilege($1,c.oid,'TRUNCATE')) can_truncate`,
          [runtime, schema],
        );
        const row = access.rows[0];
        if (
          !row.can_use ||
          row.can_create ||
          row.missing_dml ||
          row.can_truncate
        )
          failures.push(
            "Runtime does not have precisely the intended schema/table access.",
          );
      }
    }
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          target: target.rows[0],
          schema,
          declaredExposedSchemas: exposed,
          databaseSideDataApiConfiguration: dataApiConfiguration.rows[0],
          apiRolesObserved: apiRoles.rows.map((r) => r.rolname),
          objects: objects.rows,
          functions: functions.rows,
          defaultPrivileges: defaultPrivileges.rows,
          // A declaration cannot prove the running PostgREST configuration.
          dataApiHttpVerification:
            "required separately: environment/file configuration can override database settings",
          result: failures.length ? "failed" : "passed catalog privilege audit",
          failures,
        },
        null,
        2,
      ),
    );
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // Driver errors may contain a connection URL or other private configuration.
    const sqlState =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "unknown";
    throw Error(
      `Private-schema audit failed (SQLSTATE ${sqlState}); inspect connectivity/privileges privately.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
} else {
  throw Error("Usage: tsx scripts/db-private-schema.ts --sql | --audit");
}
