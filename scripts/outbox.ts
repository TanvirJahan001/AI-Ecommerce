import { Pool } from "pg";
import { transaction } from "../src/modules/commerce/service";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (
  process.env.NODE_ENV === "production" ||
  process.env.STORE_DEV_ADAPTERS !== "true"
)
  throw Error("Local notification adapter requires explicit development mode");
try {
  const count = await transaction(pool, async (c) => {
    const jobs = await c.query(
      "select * from outbox where status in ('pending','failed') and next_attempt_at<=now() order by created_at for update skip locked limit 25",
    );
    for (const job of jobs.rows) {
      if (process.env.LOCAL_NOTIFICATION_FAIL === "true") {
        await c.query(
          "update outbox set status='failed',attempts=attempts+1,last_error='LOCAL_SIMULATED_FAILURE',next_attempt_at=now()+interval '30 seconds' where id=$1",
          [job.id],
        );
        continue;
      }
      const template = (
        await c.query(
          "select title,body from notification_templates where topic=$1",
          [job.topic],
        )
      ).rows[0];
      const payload = {
        ...job.payload,
        title: template?.title ?? job.topic,
        body: template
          ? String(template.body).replaceAll(
              "{order_id}",
              String(job.payload.order_id ?? ""),
            )
          : undefined,
      };
      await c.query(
        "insert into local_deliveries(outbox_id,payload) values($1,$2) on conflict do nothing",
        [job.id, payload],
      );
      await c.query(
        "update outbox set status='delivered',attempts=attempts+1,last_error=null where id=$1",
        [job.id],
      );
    }
    return jobs.rowCount;
  });
  console.log("Processed notification jobs:", count);
} finally {
  await pool.end();
}
