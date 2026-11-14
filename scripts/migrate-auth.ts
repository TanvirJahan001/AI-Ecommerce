import { getMigrations } from "better-auth/db/migration";
import { auth, authPool } from "../src/lib/auth";

async function main() {
  try {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    console.log("Better Auth schema and two-factor plugin migrations applied.");
  } finally {
    await authPool.end();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Auth migration failed",
  );
  process.exitCode = 1;
});
