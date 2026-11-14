// Explicit opt-in: these tools mutate fictional fixtures, never a preserved store.
if (process.env.STORE_TEST_FIXTURES !== "true")
  throw Error(
    "Set STORE_TEST_FIXTURES=true only for a disposable fictional application database.",
  );
/** Development fixture verification only. No real credentials are accepted or logged. */
import assert from "node:assert/strict";
import { readFile, chmod, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { authPool } from "../src/lib/auth";
import { setAccountActive } from "../src/lib/auth-access";

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.STORE_DEV_ADAPTERS !== "true"
  )
    throw new Error("Development fixtures only");
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const owner = JSON.parse(
    await readFile(
      process.env.STORE_OWNER_CREDENTIALS ||
        "/tmp/store-owner-credentials.json",
      "utf8",
    ),
  );
  assert.ok(
    String(owner.email).endsWith("@example.test"),
    "Fictional owner fixture only",
  );
  let previousState: string | undefined;
  try {
    await access(
      process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
    );
    previousState =
      process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json";
  } catch {}
  const browser = await request.newContext({
    baseURL: origin,
    storageState: previousState,
    extraHTTPHeaders: { Origin: origin },
  });
  const customer = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const post = async (path: string, data: unknown) => {
    const result = await browser.post(path, { data });
    assert.equal(result.status(), 200, `${path} expected successful response`);
    return result.json();
  };
  try {
    // Repeatable local fixture: an earlier verified fixture session can reset enrollment.
    if (previousState) {
      const old = await (await browser.get("/api/auth/identity")).json();
      if (
        old.authenticated &&
        old.user.role === "owner" &&
        old.user.twoFactorEnabled
      )
        await post("/api/auth/two-factor/disable", {
          password: owner.password,
        });
      await post("/api/auth/sign-out", {});
    }
    assert.equal(
      (await browser.get("/api/store?resource=admin")).status(),
      401,
    );
    const signup = await customer.post("/api/auth/sign-up/email", {
      data: {
        name: "Fictional Customer",
        email: `auth-smoke-${randomBytes(5).toString("hex")}@example.test`,
        password: randomBytes(32).toString("base64url"),
      },
    });
    assert.equal(signup.status(), 200);
    const customerId = (await signup.json()).user.id;
    assert.equal(
      (await customer.get("/api/store?resource=admin")).status(),
      403,
    );
    await post("/api/auth/sign-in/email", {
      email: owner.email,
      password: owner.password,
    });
    assert.equal(
      (await browser.get("/api/store?resource=admin")).status(),
      428,
    );
    const enrollment = await post("/api/auth/two-factor/enable", {
      password: owner.password,
    });
    const secret = new URL(enrollment.totpURI).searchParams.get("secret");
    assert.ok(secret);
    const otp = createOTP(base32.decode(secret));
    await post("/api/auth/two-factor/verify-totp", { code: await otp.totp() });
    assert.equal(
      (await browser.get("/api/store?resource=admin")).status(),
      200,
    );
    const cookieHeaders = new Headers({
      cookie: (await browser.storageState()).cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
      origin,
    });
    await setAccountActive(
      cookieHeaders,
      customerId,
      false,
      "Local auth smoke deactivation",
    );
    assert.equal((await customer.get("/api/auth/identity")).status(), 200);
    assert.equal(
      (await (await customer.get("/api/auth/identity")).json()).authenticated,
      false,
    );
    const sessions = await authPool.query(
      'select count(*)::int as count from "session" where "userId"=$1',
      [customerId],
    );
    assert.equal(sessions.rows[0].count, 0);
    await post("/api/auth/sign-out", {});
    const challenged = await post("/api/auth/sign-in/email", {
      email: owner.email,
      password: owner.password,
    });
    assert.equal(challenged.twoFactorRedirect, true);
    assert.equal(
      (await browser.get("/api/store?resource=admin")).status(),
      401,
    );
    await post("/api/auth/two-factor/verify-totp", { code: await otp.totp() });
    assert.equal(
      (await browser.get("/api/store?resource=admin")).status(),
      200,
    );
    await browser.storageState({
      path: process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
    });
    await chmod(
      process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
      0o600,
    );
    console.log(
      "PASS: anonymous denied, customer signup and role denial, owner MFA gate/enrollment/challenge, deactivation/session revocation; owner storage state saved privately",
    );
  } finally {
    await browser.dispose();
    await customer.dispose();
    await authPool.end();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Auth smoke failed");
  process.exitCode = 1;
});
