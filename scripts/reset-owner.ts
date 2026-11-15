import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { createStoreAuth } from "../src/lib/auth-config";
import { databasePoolConfig } from "../src/lib/database-config";

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    !process.argv.includes("--enable")
  )
    throw Error(
      "Local reset is disabled. Run: npm run owner:reset -- --enable",
    );

  const config = databasePoolConfig(process.env, "runtime", 1);
  const target = new URL(config.connectionString!);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.port !== "55432" ||
    target.pathname !== "/mobile_store" ||
    target.username !== "ecommerce_runtime" ||
    process.env.DATABASE_SCHEMA !== "store_private" ||
    process.env.DATABASE_PROVIDER !== "supabase" ||
    process.env.STORE_DEV_ADAPTERS !== "true"
  )
    throw Error(
      "Owner reset is restricted to this project's local Docker development database.",
    );

  const pool = new Pool(config);
  let credentialFile: string | undefined;
  let committed = false;
  try {
    const auth = createStoreAuth(pool);
    const context = await auth.$context;
    const password = randomBytes(24).toString("base64url");
    const hash = await context.password.hash(password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "select pg_advisory_xact_lock(hashtext('bootstrap-owner'))",
      );
      const owners = await client.query<{
        id: string;
        email: string;
        active: boolean;
      }>(
        `select u.id, u.email, a.active from store_access a
         join "user" u on u.id=a.user_id where a.role='owner' for update of u, a`,
      );
      if (owners.rowCount !== 1 || !owners.rows[0].active)
        throw Error(
          "Exactly one active owner is required; no account was changed.",
        );
      const owner = owners.rows[0];
      const credentials = await client.query(
        `update "account" set password=$1, "updatedAt"=now()
         where "userId"=$2 and "providerId"='credential' and "accountId"=$2 returning id`,
        [hash, owner.id],
      );
      if (credentials.rowCount !== 1)
        throw Error(
          "Expected one owner password account; no account was changed.",
        );
      await client.query('delete from "session" where "userId"=$1', [owner.id]);
      await client.query(
        'delete from "verification" where identifier like $1 and value=$2',
        ["reset-password:%", owner.id],
      );
      await client.query(
        `insert into audit_events(actor_id,action,entity_type,reason,metadata)
         values($1,'account.password_reset','auth_user','Authorized local owner password recovery',$2)`,
        [
          owner.id,
          JSON.stringify({ user_id: owner.id, sessions_revoked: true }),
        ],
      );
      if (!(await context.password.verify({ hash, password })))
        throw Error("Password verification failed; reset was rolled back.");

      await mkdir(".local-data", { recursive: true, mode: 0o700 });
      credentialFile = `.local-data/owner-login-${randomBytes(6).toString("hex")}.txt`;
      await writeFile(
        credentialFile,
        `Email: ${owner.email}\nPassword: ${password}\n`,
        { mode: 0o600, flag: "wx" },
      );
      await client.query("COMMIT");
      committed = true;
      console.log(
        `Password reset for ${owner.email}; existing sessions revoked.`,
      );
      console.log(
        `New login saved privately to ${credentialFile} (not printed here).`,
      );
      console.log(
        "Sign in at /login. Account roles and MFA enrollment are preserved.",
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    if (credentialFile && !committed) await unlink(credentialFile);
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(
    typeof error === "object" && error && "code" in error
      ? `Local owner reset failed (${String(error.code)}); credentials suppressed.`
      : error instanceof Error
        ? error.message
        : "Local owner reset failed.",
  );
  process.exitCode = 1;
});
