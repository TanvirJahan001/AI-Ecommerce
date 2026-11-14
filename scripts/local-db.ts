import { existsSync as envExists, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
// Never start an embedded source database as a silent substitute for a selected host.
const localEnv = envExists(".env.local")
  ? parseEnv(readFileSync(".env.local", "utf8"))
  : {};
const selectedProvider =
  process.env.DATABASE_PROVIDER ?? localEnv.DATABASE_PROVIDER;
const selectedUrl = process.env.DATABASE_URL ?? localEnv.DATABASE_URL;
if (selectedProvider === "supabase")
  throw Error(
    "Supabase is selected. Start the confirmed Supabase installation; db:local cannot substitute another database.",
  );
if (selectedUrl) {
  let matchesEmbedded = false;
  try {
    const url = new URL(selectedUrl);
    matchesEmbedded =
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === "55432" &&
      url.pathname === "/mobile_store";
  } catch {
    /* Report only the setting name, never its secret contents. */
  }
  if (!matchesEmbedded)
    throw Error(
      "DATABASE_URL selects a different database. db:local will not silently start a substitute.",
    );
}
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
const server = new EmbeddedPostgres({
  databaseDir:
    process.env.LOCAL_PG_DIR ?? `${process.cwd()}/.local-data/postgres`,
  user: "store",
  password: "local-development-only",
  port: 55432,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  autoRehydrateSymlinks: true,
});
if (
  !existsSync(
    `${process.env.LOCAL_PG_DIR ?? `${process.cwd()}/.local-data/postgres`}/PG_VERSION`,
  )
)
  await server.initialise();
await server.start();
try {
  await server.createDatabase("mobile_store");
} catch {}
console.log("Local PostgreSQL listening on 127.0.0.1:55432; development only");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
await new Promise(() => {});
