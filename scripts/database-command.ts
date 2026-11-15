import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Only migration processes load the owner password. Next.js reads .env.local.
loadEnvFile(".env.local");
const migrationFile =
  process.env.STORE_MIGRATION_ENV_FILE ?? ".local-data/docker/migration.env";
if (!process.env.MIGRATION_DATABASE_URL && existsSync(migrationFile))
  loadEnvFile(migrationFile);

switch (process.argv[2]) {
  case "migrate":
    await import("./migrate");
    break;
  case "auth":
    await import("./migrate-auth");
    break;
  default:
    throw Error("Usage: tsx scripts/database-command.ts migrate | auth");
}
