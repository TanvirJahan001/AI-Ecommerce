import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { transaction, stockReceipt } from "../../src/modules/commerce/service";
export default async function setup() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.STORE_DEV_ADAPTERS !== "true"
  )
    throw Error("Browser fixtures require isolated development mode");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = (
      await pool.query(
        "select v.id,v.sellable_qty-v.committed_qty available from variants v join products p on p.id=v.product_id where v.sku in ('CASE-Z-CLEAR','CASE-Q-CLEAR','CHG-30C') and p.description='Illustrative sample; specifications are fictional test data.'",
      )
    ).rows;
    for (const row of rows)
      if (row.available < 20)
        await transaction(pool, (c) =>
          stockReceipt(
            c,
            {
              variant_id: row.id,
              quantity: 50 - row.available,
              reason: "Fictional repeatable browser fixture stock",
              key: randomUUID(),
            },
            { id: "browser-fixture", role: "owner" },
          ),
        );
  } finally {
    await pool.end();
  }
}
