import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { auth, authPool } from "../src/lib/auth";

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    (process.env.OWNER_BOOTSTRAP_ENABLED !== "true" &&
      !process.argv.includes("--enable"))
  ) {
    throw new Error(
      "Owner bootstrap is disabled. In a local non-production environment, run: npm run owner:bootstrap -- --enable",
    );
  }
  if (!stdin.isTTY)
    throw new Error(
      "Interactive terminal required; passwords must not be passed as command arguments.",
    );
  const terminal = createInterface({ input: stdin, output: stdout });
  const email = (await terminal.question("Owner email: ")).trim();
  const name = (await terminal.question("Owner display name: ")).trim();
  terminal.close();
  stdout.write("Owner password (12+ characters): ");
  const password = await new Promise<string>((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Bootstrap cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    }
    stdin.on("data", onData);
  });
  const client = await authPool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('bootstrap-owner'))");
    if (
      (await client.query("select 1 from store_access where role='owner'"))
        .rowCount
    )
      throw new Error(
        "An owner already exists; bootstrap cannot promote another user.",
      );
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    await client.query(
      "insert into store_access(user_id,role) values($1,'owner')",
      [result.user.id],
    );
    console.log(
      "Owner created. Sign in at /login and enroll TOTP before admin access is enabled. If you enabled OWNER_BOOTSTRAP_ENABLED in your environment, disable it now; --enable applies only to this command.",
    );
  } finally {
    await client.query(
      "select pg_advisory_unlock(hashtext('bootstrap-owner'))",
    );
    client.release();
    await authPool.end();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Owner bootstrap failed",
  );
  process.exitCode = 1;
  void authPool.end().catch(() => {});
});
