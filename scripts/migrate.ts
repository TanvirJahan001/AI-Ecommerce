import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(
    "select pg_advisory_lock(hashtext('store-schema-migrations'))",
  );
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT name FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    const sql = (await readFile(`db/migrations/${name}`, "utf8"))
      .replace(/^\s*BEGIN;/i, "")
      .replace(/COMMIT;\s*$/i, "");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.query(
    "select pg_advisory_unlock(hashtext('store-schema-migrations'))",
  );
  client.release();
  await pool.end();
}
