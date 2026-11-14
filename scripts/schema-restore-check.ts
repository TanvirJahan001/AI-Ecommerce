/** Application-schema-only, fictional isolated restore exercise. Never a switch tool. */
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { mkdtemp, chmod, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  databasePoolConfig,
  databaseSchema,
  postgresUrl,
  sameDatabase,
  assertDatabaseSchema,
} from "../src/lib/database-config";
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;

async function fingerprint(pool: Pool, schema: string) {
  const tables = await pool.query(
    "select tablename from pg_catalog.pg_tables where schemaname=$1 order by tablename",
    [schema],
  );
  const result: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    // Values, credentials and digests never leave this process. Compare every row,
    // including auth, snapshots, commitments, journals and outbox delivery state.
    result[tablename] = (
      await pool.query(
        `select count(*)::text count, md5(coalesce(string_agg(h, '' order by h),'')) digest from (select md5(row_to_json(t)::text) h from ${quote(schema)}.${quote(tablename)} t) hashes`,
      )
    ).rows[0];
  }
  return JSON.stringify(result);
}
async function systemObjects(pool: Pool, schema: string) {
  return JSON.stringify(
    (
      await pool.query(
        `select n.nspname,c.relname,c.relkind,c.oid::text from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname<>$1 and n.nspname !~ '^pg_' and n.nspname<>'information_schema' order by n.nspname,c.relname`,
        [schema],
      )
    ).rows,
  );
}
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.STORE_TEST_FIXTURES !== "true" ||
    process.env.RESTORE_CHECK_QUIESCED !== "true"
  )
    throw Error(
      "Requires fictional fixtures and explicit RESTORE_CHECK_QUIESCED=true after stopping app and worker",
    );
  const schema = databaseSchema();
  if (schema === "public")
    throw Error(
      "Schema-only restore check requires a dedicated private application schema",
    );
  const baseConfig = databasePoolConfig();
  const sourceConfig = {
    ...baseConfig,
    max: 1,
    options: `${baseConfig.options} -c timezone=UTC -c datestyle=ISO,YMD`,
  };
  const sourceUrl = postgresUrl(sourceConfig.connectionString, "DATABASE_URL");
  const target = postgresUrl(
    process.env.RESTORE_DATABASE_URL,
    "RESTORE_DATABASE_URL",
  );
  if (
    sameDatabase(sourceUrl, target) ||
    !/^store_restore_[a-z0-9_]+$/.test(target.pathname.slice(1))
  )
    throw Error(
      "RESTORE_DATABASE_URL must identify a different disposable database named store_restore_<fixture>",
    );
  if (!process.env.PG_BIN_DIR)
    throw Error(
      "PG_BIN_DIR containing compatible pg_dump/pg_restore is required",
    );
  const source = new Pool(sourceConfig);
  const restored = new Pool({
    ...sourceConfig,
    connectionString: target.toString(),
    max: 1,
  });
  let dir: string | undefined;
  try {
    await assertDatabaseSchema(source);
    if (
      (
        await restored.query(
          "select 1 from pg_catalog.pg_namespace where nspname=$1",
          [schema],
        )
      ).rowCount
    )
      throw Error(
        "Restore destination schema already exists; nothing was overwritten",
      );
    const untouched = await systemObjects(restored, schema);
    const expected = await fingerprint(source, schema);
    dir = await mkdtemp(join(tmpdir(), "store-schema-restore-"));
    await chmod(dir, 0o700);
    const archive = join(dir, "application.dump");
    let caPath = process.env.PGSSLROOTCERT;
    if (process.env.DATABASE_SSL_CA) {
      caPath = join(dir, "database-ca.pem");
      await writeFile(caPath, process.env.DATABASE_SSL_CA, { mode: 0o600 });
    }
    const run = (binary: string, url: URL, extra: string[]) => {
      execFileSync(
        join(process.env.PG_BIN_DIR!, binary),
        [
          "--host",
          url.hostname,
          "--port",
          url.port || "5432",
          "--username",
          decodeURIComponent(url.username),
          "--dbname",
          decodeURIComponent(url.pathname.slice(1)),
          ...extra,
        ],
        {
          env: {
            ...process.env,
            PGPASSWORD: decodeURIComponent(url.password),
            ...(caPath ? { PGSSLROOTCERT: caPath } : {}),
            PGSSLMODE:
              process.env.DATABASE_SSL_MODE === "verify-full"
                ? "verify-full"
                : "disable",
          },
          stdio: "pipe",
        },
      );
    };
    run("pg_dump", sourceUrl, [
      "--format=custom",
      "--schema",
      schema,
      "--no-owner",
      "--no-privileges",
      "--file",
      archive,
    ]);
    await chmod(archive, 0o600);
    run("pg_restore", target, [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      archive,
    ]);
    await assertDatabaseSchema(restored);
    if (
      (await fingerprint(source, schema)) !== expected ||
      (await fingerprint(restored, schema)) !== expected
    )
      throw Error(
        "Source changed while copying or restored application rows differ",
      );
    if ((await systemObjects(restored, schema)) !== untouched)
      throw Error("An unrelated destination object changed during restore");
    console.log(
      "Fictional application-schema restore verified: every table's rows match, including identity/MFA, journal, funding, stock and outbox state; unrelated relation identities unchanged. No worker or messages started. Destination fixture retained for inspection; production recovery is unverified.",
    );
  } finally {
    await source.end();
    await restored.end();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
void main().catch(() => {
  console.error(
    "Application-schema restore check failed; destination fixture retained, secrets suppressed. Check explicit configuration, quiescence, client version and privileges privately. No database was dropped.",
  );
  process.exitCode = 1;
});
