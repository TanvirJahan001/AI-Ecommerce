import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { Pool } from "pg";

const directory = ".local-data/docker";
const composeEnv = `${directory}/database.env`;
const migrationEnv = `${directory}/migration.env`;
const envPath = ".env.local";
const port = "55432";

function run(command: string, args: string[], env = process.env) {
  const child = spawnSync(command, args, { stdio: "inherit", env });
  if (child.error || child.status !== 0)
    throw Error(`${command} failed; inspect the output above.`);
}

function connection(user: string, password: string, database: string) {
  return `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
}

async function privateFile(path: string, content: string) {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("setup:docker is for local development only.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  if (!existsSync(composeEnv)) {
    const password = () => randomBytes(32).toString("hex");
    await privateFile(
      composeEnv,
      `POSTGRES_PASSWORD=${password()}\nOWNER_PASSWORD=${password()}\nRUNTIME_PASSWORD=${password()}\nTEST_PASSWORD=${password()}\nLOCAL_DB_PORT=${port}\n`,
    );
  }
  const secrets = parseEnv(await readFile(composeEnv, "utf8")) as Record<
    string,
    string
  >;
  for (const name of [
    "POSTGRES_PASSWORD",
    "OWNER_PASSWORD",
    "RUNTIME_PASSWORD",
    "TEST_PASSWORD",
  ])
    if (!/^[a-f0-9]{64}$/.test(secrets[name] ?? ""))
      throw Error(
        `Missing or invalid local ${name}; retain credentials for existing volumes.`,
      );
  if (secrets.LOCAL_DB_PORT !== port)
    throw Error(`This local setup expects LOCAL_DB_PORT=${port}.`);

  run("docker", [
    "compose",
    "--env-file",
    composeEnv,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "180",
  ]);

  const adminUrl = connection(
    "supabase_admin",
    secrets.POSTGRES_PASSWORD,
    "postgres",
  );
  const admin = new Pool({
    connectionString: adminUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const runtimeUrl = connection(
    "ecommerce_runtime",
    secrets.RUNTIME_PASSWORD,
    "mobile_store",
  );
  const ownerUrl = connection(
    "ecommerce_owner",
    secrets.OWNER_PASSWORD,
    "mobile_store",
  );
  let fresh = false;
  try {
    for (const [database, role, password] of [
      ["mobile_store", "ecommerce_owner", secrets.OWNER_PASSWORD],
      ["mobile_store_test", "ecommerce_test", secrets.TEST_PASSWORD],
    ]) {
      if (
        !(await admin.query("select 1 from pg_roles where rolname=$1", [role]))
          .rowCount
      ) {
        const sql = await admin.query(
          "select format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text, $2::text) sql",
          [role, password],
        );
        await admin.query(sql.rows[0].sql);
      }
      if (
        !(
          await admin.query("select 1 from pg_database where datname=$1", [
            database,
          ])
        ).rowCount
      ) {
        // postgres administers the local fixture; the app owner gets only its private schema.
        await admin.query(
          `CREATE DATABASE ${database} OWNER ${database === "mobile_store_test" ? "ecommerce_test" : "postgres"}`,
        );
        if (database === "mobile_store") fresh = true;
      }
    }
    const appAdmin = new Pool({
      connectionString: connection(
        "supabase_admin",
        secrets.POSTGRES_PASSWORD,
        "mobile_store",
      ),
      max: 1,
    });
    try {
      await appAdmin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      const boundary = await appAdmin.query(
        "select pg_get_userbyid(nspowner) owner from pg_namespace where nspname='store_private'",
      );
      if (!boundary.rowCount) {
        fresh = true;
        if (
          (
            await appAdmin.query(
              "select 1 from pg_roles where rolname='ecommerce_runtime'",
            )
          ).rowCount
        )
          throw Error(
            "Local runtime role already exists without its schema; inspect the local database before retrying.",
          );
        const roleSql = await appAdmin.query(
          "select format('CREATE ROLE ecommerce_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', $1::text) sql",
          [secrets.RUNTIME_PASSWORD],
        );
        await appAdmin.query("BEGIN");
        await appAdmin.query(roleSql.rows[0].sql);
        // Reusable application-only grants also apply to self-hosted Supabase.
        await appAdmin.query(
          await readFile("db/provision-private-schema.sql", "utf8"),
        );
        await appAdmin.query("COMMIT");
      } else if (boundary.rows[0].owner !== "ecommerce_owner") {
        throw Error("Existing local private schema has an unexpected owner.");
      }
    } finally {
      await appAdmin.end();
    }
    const testAdmin = new Pool({
      connectionString: connection(
        "supabase_admin",
        secrets.POSTGRES_PASSWORD,
        "mobile_store_test",
      ),
      max: 1,
    });
    try {
      await testAdmin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    } finally {
      await testAdmin.end();
    }
  } finally {
    await admin.end();
  }

  const original = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const existing = parseEnv(original);
  const settings: Record<string, string> = {
    DATABASE_PROVIDER: "supabase",
    DATABASE_URL: runtimeUrl,
    DATABASE_SCHEMA: "store_private",
    DATABASE_CONNECTION_MODE: "direct",
    DATABASE_SSL_MODE: "disable",
    TEST_DATABASE_URL: connection(
      "ecommerce_test",
      secrets.TEST_PASSWORD,
      "mobile_store_test",
    ),
    APP_ORIGIN: existing.APP_ORIGIN || "http://localhost:3000",
    BETTER_AUTH_SECRET:
      existing.BETTER_AUTH_SECRET || randomBytes(48).toString("base64url"),
    STORE_DEV_ADAPTERS: "true",
    OWNER_BOOTSTRAP_ENABLED: "false",
  };
  // Keep unrelated config and preserve the auth secret. Owner/admin secrets stay out of Next.
  const remove = new Set([
    ...Object.keys(settings),
    "MIGRATION_DATABASE_URL",
    "DATABASE_ADMIN_URL",
  ]);
  const retained = original
    .split("\n")
    .filter((line) => {
      const key = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=/)?.[1];
      return (
        line !== "# Local Docker database (npm run setup:docker)." &&
        (!key || !remove.has(key))
      );
    })
    .join("\n")
    .trimEnd();
  const updated = `${retained ? `${retained}\n\n` : ""}# Local Docker database (npm run setup:docker).\n${Object.entries(
    settings,
  )
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n")}\n`;
  if (existing.DATABASE_URL !== runtimeUrl && original) {
    const backup = `${directory}/env-before-docker-${Date.now()}.env`;
    await copyFile(envPath, backup);
    await chmod(backup, 0o600);
    console.log(
      `Previous configuration saved privately to ${backup}. Remote data was not changed.`,
    );
  }
  await privateFile(migrationEnv, `MIGRATION_DATABASE_URL=${ownerUrl}\n`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...existing,
    ...settings,
    MIGRATION_DATABASE_URL: ownerUrl,
  };
  delete env.DATABASE_ADMIN_URL;
  // Migrate and verify before activating the new runtime configuration.
  run(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], env);
  run(process.execPath, ["--import", "tsx", "scripts/migrate-auth.ts"], env);
  if (fresh)
    run(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
      ...env,
      STORE_TEST_FIXTURES: "true",
    });
  run(process.execPath, ["--import", "tsx", "scripts/db-preflight.ts"], env);
  await privateFile(envPath, updated);
  console.log(
    "Local database ready at 127.0.0.1:55432. Data persists in Docker named volumes.",
  );
  console.log(
    "Run npm run dev. Use npm run db:up after restarting Docker; npm run db:stop retains data.",
  );
}

void main().catch((error) => {
  // Do not print driver configuration, queries containing passwords, or URLs.
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : undefined;
  console.error(
    code
      ? `Local database setup failed (${code}). Check Docker logs and local configuration.`
      : error instanceof Error
        ? error.message
        : "Local database setup failed.",
  );
  process.exitCode = 1;
});
