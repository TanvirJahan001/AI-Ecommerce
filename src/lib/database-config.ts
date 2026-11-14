import type { PoolConfig } from "pg";

type Environment = Record<string, string | undefined>;
type Purpose = "runtime" | "migration";
const reservedSchemas = new Set([
  "public",
  "auth",
  "storage",
  "realtime",
  "extensions",
  "graphql",
  "graphql_public",
  "supabase_functions",
  "supabase_migrations",
  "vault",
  "information_schema",
  "pgbouncer",
  "_realtime",
  "_analytics",
]);
const privilegedRoles = new Set([
  "postgres",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
  "authenticator",
  "anon",
  "authenticated",
  "service_role",
]);

export function postgresUrl(value: string | undefined, name: string): URL {
  if (!value)
    throw new Error(
      `${name} is required; no implicit database fallback is allowed`,
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a PostgreSQL connection URL`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new Error(
      `${name} must identify a PostgreSQL host, database and user (an HTTP API URL is insufficient)`,
    );
  if (url.search || url.hash)
    throw new Error(
      `${name} must not contain URL options; use explicit DATABASE_* settings`,
    );
  return url;
}

export function databaseSchema(env: Environment = process.env): string {
  const provider = env.DATABASE_PROVIDER || "postgres";
  if (!["postgres", "supabase"].includes(provider))
    throw new Error("DATABASE_PROVIDER must be postgres or supabase");
  const schema =
    env.DATABASE_SCHEMA || (provider === "postgres" ? "public" : "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema) || schema.startsWith("pg_"))
    throw new Error(
      "DATABASE_SCHEMA must be an explicit lowercase SQL identifier",
    );
  if (
    provider === "supabase" &&
    (reservedSchemas.has(schema) || schema.startsWith("supabase"))
  )
    throw new Error(
      "Supabase requires a dedicated, non-managed private DATABASE_SCHEMA",
    );
  return schema;
}

/** Server/CLI only. Never pass configuration or connection URLs to browser code. */
export function databasePoolConfig(
  env: Environment = process.env,
  purpose: Purpose = "runtime",
  max = 10,
): PoolConfig {
  const schema = databaseSchema(env);
  const supabase = env.DATABASE_PROVIDER === "supabase";
  const mode = env.DATABASE_CONNECTION_MODE || (supabase ? "" : "direct");
  if (!["direct", "session"].includes(mode))
    throw new Error(
      "DATABASE_CONNECTION_MODE must be verified direct or session; transaction pooling is unsupported",
    );
  const runtime = postgresUrl(env.DATABASE_URL, "DATABASE_URL");
  const connection =
    purpose === "migration"
      ? postgresUrl(
          env.MIGRATION_DATABASE_URL ||
            (!supabase ? env.DATABASE_URL : undefined),
          "MIGRATION_DATABASE_URL",
        )
      : runtime;
  if (supabase) {
    if (privilegedRoles.has(decodeURIComponent(runtime.username)))
      throw new Error(
        "DATABASE_URL must use a dedicated restricted runtime role",
      );
    if (
      purpose === "migration" &&
      decodeURIComponent(connection.username) ===
        decodeURIComponent(runtime.username)
    )
      throw new Error("Supabase runtime and migration roles must be distinct");
    if (purpose === "migration" && !sameDatabase(connection, runtime))
      throw new Error(
        "Migration and runtime URLs must identify the same host, port and database",
      );
  }
  const sslMode =
    env.DATABASE_SSL_MODE ||
    (supabase ? "" : env.NODE_ENV === "production" ? "verify-full" : "disable");
  if (!["disable", "verify-full"].includes(sslMode))
    throw new Error(
      "DATABASE_SSL_MODE must be explicitly disable or verify-full",
    );
  return {
    connectionString: connection.toString(),
    max,
    connectionTimeoutMillis: 10000,
    ssl:
      sslMode === "verify-full"
        ? {
            rejectUnauthorized: true,
            ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}),
          }
        : false,
    // This is set at connection startup for EVERY pool connection, not once on an arbitrary client.
    options: `-c search_path=${schema},pg_catalog`,
    application_name:
      purpose === "migration" ? "mobile-store-migrator" : "mobile-store-server",
  };
}

function localHost(host: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(host) ? "loopback" : host;
}
export function sameDatabase(a: URL, b: URL): boolean {
  return (
    localHost(a.hostname) === localHost(b.hostname) &&
    (a.port || "5432") === (b.port || "5432") &&
    decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname)
  );
}

/** Destructive tests must never use the application database, even with a different login. */
export function isolatedTestUrl(env: Environment = process.env): string {
  const test = postgresUrl(env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  if (!env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is required to verify TEST_DATABASE_URL isolation",
    );
  const app = postgresUrl(env.DATABASE_URL, "DATABASE_URL");
  // Conservative even across unknown DNS aliases or pooler/direct endpoints.
  if (
    sameDatabase(test, app) ||
    decodeURIComponent(test.pathname) === decodeURIComponent(app.pathname)
  )
    throw new Error(
      "TEST_DATABASE_URL must identify a different database from DATABASE_URL",
    );
  return test.toString();
}

export function testPoolConfig(
  env: Environment = process.env,
  schema = "public",
): PoolConfig {
  const url = isolatedTestUrl(env);
  return databasePoolConfig(
    {
      ...env,
      DATABASE_URL: url,
      DATABASE_PROVIDER: "postgres",
      DATABASE_SCHEMA: schema,
      DATABASE_CONNECTION_MODE:
        env.TEST_DATABASE_CONNECTION_MODE || env.DATABASE_CONNECTION_MODE,
      DATABASE_SSL_MODE: env.TEST_DATABASE_SSL_MODE || env.DATABASE_SSL_MODE,
    },
    "runtime",
    5,
  );
}

export async function assertDatabaseSchema(
  client: {
    query: (
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
  },
  env: Environment = process.env,
) {
  const schema = databaseSchema(env);
  const result = await client.query(
    "select current_schema() as schema, has_schema_privilege(current_user,$1,'USAGE') as usable",
    [schema],
  );
  if (result.rows[0]?.schema !== schema || result.rows[0]?.usable !== true)
    throw new Error(
      "Configured application schema is missing, inaccessible, or not the effective search_path; provision it before migrations",
    );
}
