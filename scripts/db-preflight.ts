import { Pool } from "pg";
import {
  databasePoolConfig,
  databaseSchema,
  assertDatabaseSchema,
} from "../src/lib/database-config";

// No mutations, schema creation, migration, secret output or fallback connection.
async function main() {
  const purpose = process.argv.includes("--migration")
    ? "migration"
    : "runtime";
  const config = databasePoolConfig(process.env, purpose, 1);
  const url = new URL(config.connectionString!);
  const pool = new Pool(config);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await assertDatabaseSchema(client);
      const identity =
        await client.query(`select current_database() database, current_user role,
        current_setting('server_version') version, current_schema() schema,
        current_setting('search_path') search_path,
        inet_server_addr()::text server_address, inet_server_port() server_port,
        r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
        has_schema_privilege(current_user,current_schema(),'CREATE') can_create
        from pg_catalog.pg_roles r where rolname=current_user`);
      const extensions = await client.query(
        "select extname, extversion, n.nspname schema from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace order by extname",
      );
      const schemas = await client.query(
        "select nspname from pg_catalog.pg_namespace where nspname !~ '^pg_' order by nspname",
      );
      const row = identity.rows[0];
      if (
        process.env.DATABASE_PROVIDER === "supabase" &&
        purpose === "runtime" &&
        (row.rolsuper ||
          row.rolcreatedb ||
          row.rolcreaterole ||
          row.rolbypassrls ||
          row.can_create)
      )
        throw new Error(
          "Runtime role has elevated privileges; private boundary audit is required",
        );
      console.log(
        JSON.stringify(
          {
            configured: {
              provider: process.env.DATABASE_PROVIDER || "postgres",
              host: url.hostname,
              port: url.port || "5432",
              database: decodeURIComponent(url.pathname.slice(1)),
              purpose,
              schema: databaseSchema(),
              connectionMode: process.env.DATABASE_CONNECTION_MODE || "direct",
            },
            actual: row,
            extensions: extensions.rows,
            schemas: schemas.rows.map((r) => r.nspname),
            limits:
              "Connection mode must also be established from installation configuration; connectivity does not prove pooling semantics, Data API denial, data migration or launch readiness.",
          },
          null,
          2,
        ),
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
void main().catch(() => {
  console.error(
    "Database preflight failed. Verify the private connection, schema and role configuration; no fallback or database mutation was attempted. Credentials are suppressed.",
  );
  process.exitCode = 1;
});
