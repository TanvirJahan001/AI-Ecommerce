// Explicit opt-in: these tools mutate fictional fixtures, never a preserved store.
if (process.env.STORE_TEST_FIXTURES !== "true")
  throw Error(
    "Set STORE_TEST_FIXTURES=true only for a disposable fictional application database.",
  );
import { databasePoolConfig } from "../src/lib/database-config";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (
  process.env.NODE_ENV === "production" ||
  process.env.STORE_DEV_ADAPTERS !== "true"
)
  throw Error("Development only");
const db = new Pool(databasePoolConfig());
const job = (
  await db.query(
    "insert into outbox(topic,payload,dedupe_key) values('test.notification',$1,$2) returning id",
    [JSON.stringify({ fictional: true }), randomUUID()],
  )
).rows[0];
try {
  const run = (fail: boolean) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/outbox.ts"], {
      env: {
        ...process.env,
        LOCAL_NOTIFICATION_FAIL: String(fail),
        STORE_TEST_OUTBOX_ID: job.id,
      },
      stdio: "pipe",
    });
  run(true);
  assert.equal(
    (await db.query("select status from outbox where id=$1", [job.id])).rows[0]
      .status,
    "failed",
  );
  await db.query("update outbox set next_attempt_at=now() where id=$1", [
    job.id,
  ]);
  run(false);
  run(false);
  assert.equal(
    (await db.query("select status from outbox where id=$1", [job.id])).rows[0]
      .status,
    "delivered",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from local_deliveries where outbox_id=$1",
        [job.id],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS: notification failure, durable retry, idempotent local delivery",
  );
} finally {
  await db.query("delete from local_deliveries where outbox_id=$1", [job.id]);
  await db.query("delete from outbox where id=$1", [job.id]);
  await db.end();
}
