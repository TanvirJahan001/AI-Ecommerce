import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { Pool } from "pg";

/** The library owns passwords, cookie/session tokens, TOTP secrets and recovery codes. */
export function createStoreAuth(pool: Pool) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  return betterAuth({
    appName: "Mobile Accessories Store",
    baseURL: origin,
    secret: process.env.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    plugins: [twoFactor({ issuer: "Mobile Accessories Store" }), nextCookies()],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query(
              "select active from store_access where user_id=$1",
              [session.userId],
            );
            if (result.rows[0]?.active === false) return false;
            return { data: session };
          },
        },
      },
    },
  });
}
