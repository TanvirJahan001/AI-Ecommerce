import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (process.env.NODE_ENV === "production")
  throw Error("Use isolated test database for restore verification");
const url = new URL(process.env.DATABASE_URL!);
const pool = new Pool({ connectionString: url.toString() });
const target = `restore_${randomUUID().replaceAll("-", "")}`;
const dir = await mkdtemp(join(tmpdir(), "store-restore-"));
const bin =
  process.env.PG_BIN_DIR ||
  join(process.cwd(), "node_modules/@embedded-postgres/linux-x64/native/bin");
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const args = [
  "--host",
  url.hostname,
  "--port",
  url.port || "5432",
  "--username",
  decodeURIComponent(url.username),
];
try {
  execFileSync(
    join(bin, "pg_dump"),
    [
      ...args,
      "--format=custom",
      "--file",
      join(dir, "backup.dump"),
      "--dbname",
      url.pathname.slice(1),
    ],
    { env, stdio: "pipe" },
  );
  await pool.query(`create database ${target}`);
  execFileSync(
    join(bin, "pg_restore"),
    [...args, "--no-owner", "--dbname", target, join(dir, "backup.dump")],
    { env, stdio: "pipe" },
  );
  url.pathname = target;
  const restored = new Pool({ connectionString: url.toString() });
  try {
    for (const table of [
      "products",
      "orders",
      "inventory_commitments",
      "refunds",
      "outbox",
    ]) {
      const source = await pool.query(`select count(*)::int n from ${table}`);
      const copy = await restored.query(`select count(*)::int n from ${table}`);
      if (source.rows[0].n !== copy.rows[0].n)
        throw Error(`Restore count mismatch: ${table}`);
    }
    console.log(
      "Isolated backup restoration verified: catalog, orders, commitments, refunds, outbox",
    );
  } finally {
    await restored.end();
  }
} finally {
  await pool.query(`drop database if exists ${target}`);
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}
