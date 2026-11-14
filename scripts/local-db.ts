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
