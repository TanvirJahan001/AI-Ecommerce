import { Pool } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { databasePoolConfig } from "../src/lib/database-config";
if (
  process.env.STORE_TEST_FIXTURES !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw Error("Disposable fictional fixture only");
const stage = process.argv[2];
if (!["before", "after"].includes(stage))
  throw Error("Usage: test-restart.ts before|after");
const stateFile =
  process.env.STORE_RESTART_STATE || "/tmp/store-fixture-restart.json";
const p = new Pool({ ...databasePoolConfig(), max: 1 });
try {
  const state: Record<string, unknown> = {};
  for (const table of [
    "products",
    "variants",
    "cart_items",
    "orders",
    "order_items",
    "inventory_commitments",
    "inventory_movements",
    "refunds",
    "outbox",
    "local_deliveries",
    '"user"',
    '"account"',
    '"twoFactor"',
  ]) {
    const r = await p.query(
      `select count(*)::int count, md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(row_to_json(t)::text) h from ${table} t) hashes`,
    );
    state[table] = r.rows[0];
  }
  if (stage === "before") {
    await writeFile(stateFile, JSON.stringify(state), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      "Fixture restart baseline saved privately; product/cart/order/inventory/auth/outbox data present",
      Object.fromEntries(
        Object.entries(state).map(([k, v]) => [
          k,
          (v as { count: number }).count,
        ]),
      ),
    );
  } else {
    assert.deepEqual(state, JSON.parse(await readFile(stateFile, "utf8")));
    const client = await request.newContext({
      baseURL: process.env.APP_ORIGIN,
      storageState: process.env.STORE_OWNER_STORAGE,
    });
    try {
      assert.equal((await client.get("/api/health")).status(), 200);
      assert.equal(
        (await client.get("/api/store?resource=catalog")).status(),
        200,
      );
      assert.equal(
        (await client.get("/api/store?resource=admin")).status(),
        200,
      );
      const identity = await (await client.get("/api/auth/identity")).json();
      assert.equal(identity.user.role, "owner");
      assert.equal(identity.user.twoFactorEnabled, true);
    } finally {
      await client.dispose();
    }
    console.log(
      "PASS fixture app restart: exact data fingerprints match; health/catalog/owner API and MFA session survive, outbox statuses/delivery dedupe unchanged. Not actual Supabase.",
    );
  }
} finally {
  await p.end();
}
