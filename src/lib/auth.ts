import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { Pool } from "pg";

const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const globalAuth = globalThis as unknown as { storeAuthPool?: Pool };
export const authPool =
  globalAuth.storeAuthPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== "production") globalAuth.storeAuthPool = authPool;

/** The library owns passwords, cookie/session tokens, TOTP secrets and recovery codes. */
export const auth = betterAuth({
  appName: "Mobile Accessories Store",
  baseURL: origin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authPool,
  trustedOrigins: [origin],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
  plugins: [twoFactor({ issuer: "Mobile Accessories Store" }), nextCookies()],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const result = await authPool.query(
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
