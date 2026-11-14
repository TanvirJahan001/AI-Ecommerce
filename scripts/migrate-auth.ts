import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { createStoreAuth } from "../src/lib/auth-config";
import {
  databasePoolConfig,
  assertDatabaseSchema,
} from "../src/lib/database-config";
const authPool = new Pool(databasePoolConfig(process.env, "migration", 1));
const auth = createStoreAuth(authPool);

async function main() {
  try {
    await assertDatabaseSchema(authPool);
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
