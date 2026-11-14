// Explicit opt-in: these tools mutate fictional fixtures, never a preserved store.
if (process.env.STORE_TEST_FIXTURES !== "true")
  throw Error(
    "Set STORE_TEST_FIXTURES=true only for a disposable fictional application database.",
  );
import { access, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { auth, authPool } from "../src/lib/auth";
if (
  process.env.NODE_ENV === "production" ||
  process.env.STORE_DEV_ADAPTERS !== "true"
)
  throw Error("Test fixtures require explicit development mode");
try {
  let exists = false;
  try {
    await access(
      process.env.STORE_OWNER_CREDENTIALS ||
        "/tmp/store-owner-credentials.json",
    );
    exists = true;
  } catch {}
  if (exists) {
    console.log("Private test-owner fixture already exists");
  } else {
    if (
      (await authPool.query("select 1 from store_access where role='owner'"))
        .rowCount
    )
      throw Error(
        "Owner already exists. Use an isolated test database; existing owner is never replaced.",
      );
    const credentials = {
      email: "owner-automation@example.test",
      password: randomBytes(32).toString("base64url"),
    };
    const result = await auth.api.signUpEmail({
      body: { ...credentials, name: "Fictional Automation Owner" },
    });
    await authPool.query(
      "insert into store_access(user_id,role) values($1,'owner')",
      [result.user.id],
    );
    await writeFile(
      process.env.STORE_OWNER_CREDENTIALS ||
        "/tmp/store-owner-credentials.json",
      JSON.stringify(credentials),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "Development owner fixture created privately; run test:auth to verify and save MFA state.",
    );
  }
} finally {
  await authPool.end();
}
