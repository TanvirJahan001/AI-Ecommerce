import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
if (process.env.DATABASE_PROVIDER === "supabase")
  throw Error(
    "Supabase requires explicit private PostgreSQL configuration; setup:local only creates embedded development defaults.",
  );
try {
  await writeFile(
    ".env.local",
    `DATABASE_URL=postgresql://store:local-development-only@127.0.0.1:55432/mobile_store\nAPP_ORIGIN=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nSTORE_DEV_ADAPTERS=true\nOWNER_BOOTSTRAP_ENABLED=false\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created development .env.local with a random auth secret. Existing configuration is never overwritten.",
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "EEXIST")
    console.log(".env.local already exists; retained");
  else throw e;
}
