import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMigrations } from "better-auth/db/migration";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { createStoreAuth } from "../../src/lib/auth-config";
import { testPoolConfig } from "../../src/lib/database-config";

const schema = `auth_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool(testPoolConfig());
const pool = new Pool(testPoolConfig(process.env, schema));
const auth = createStoreAuth(pool);
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const email = `auth-${randomUUID()}@example.test`;
const password = `Test-${randomUUID()}-password`;

function browser() {
  const cookies = new Map<string, string>();
  return {
    cookies,
    async request(path: string, body?: object) {
      const response = await auth.handler(
        new Request(`${origin}/api/auth${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            origin,
            ...(body ? { "content-type": "application/json" } : {}),
            cookie: Array.from(
              cookies,
              ([key, value]) => `${key}=${value}`,
            ).join("; "),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";");
        const split = pair.indexOf("=");
        const name = pair.slice(0, split);
        if (/max-age=0(?:;|$)/i.test(header)) cookies.delete(name);
        else cookies.set(name, pair.slice(split + 1));
      }
      return { response, data: await response.json() };
    },
  };
}

describe("owner login persistence", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(
      "CREATE TABLE store_access (user_id text PRIMARY KEY, active boolean NOT NULL DEFAULT true)",
    );
    await (await getMigrations(auth.options)).runMigrations();
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  it("keeps sessions renewable and only skips MFA on a trusted device", async () => {
    const client = browser();
    expect(
      (
        await client.request("/sign-up/email", {
          name: "Test owner",
          email,
          password,
        })
      ).response.status,
    ).toBe(200);
    const enrollment = await client.request("/two-factor/enable", { password });
    expect(enrollment.response.status).toBe(200);
    const secret = new URL(enrollment.data.totpURI).searchParams.get("secret");
    expect(secret).toBeTruthy();
    const otp = createOTP(base32.decode(secret!));
    expect(
      (
        await client.request("/two-factor/verify-totp", {
          code: await otp.totp(),
        })
      ).response.status,
    ).toBe(200);
    await client.request("/sign-out", {});

    const challenge = await client.request("/sign-in/email", {
      email,
      password,
      rememberMe: true,
    });
    expect(challenge.data.twoFactorRedirect).toBe(true);
    expect(
      (
        await client.request("/two-factor/verify-totp", {
          code: await otp.totp(),
          trustDevice: true,
        })
      ).response.status,
    ).toBe(200);
    expect(
      [...client.cookies.keys()].some((key) => key.endsWith("trust_device")),
    ).toBe(true);
    expect(
      [...client.cookies.keys()].some((key) => key.endsWith("session_token")),
    ).toBe(true);
    await pool.query(
      `UPDATE "session" SET "expiresAt"=now()+interval '28 days'`,
    );
    const refreshed = await client.request("/get-session");
    expect(refreshed.response.status).toBe(200);
    expect(
      new Date(refreshed.data.session.expiresAt).getTime() - Date.now(),
    ).toBeGreaterThan(29 * 86400 * 1000);
    expect(
      refreshed.response.headers
        .getSetCookie()
        .some((header) => /session_token=.*max-age=2592000/i.test(header)),
    ).toBe(true);
    for (const key of client.cookies.keys())
      if (key.endsWith("session_token")) client.cookies.delete(key);
    const trusted = await client.request("/sign-in/email", {
      email,
      password,
      rememberMe: true,
    });
    expect(trusted.response.status).toBe(200);
    expect(trusted.data.twoFactorRedirect).not.toBe(true);
    const untrusted = await browser().request("/sign-in/email", {
      email,
      password,
      rememberMe: true,
    });
    expect(untrusted.data.twoFactorRedirect).toBe(true);
  });
});
