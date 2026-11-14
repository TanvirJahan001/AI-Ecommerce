import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  checkout,
  transaction,
  paymentEvent,
  cancelOrder,
  confirmCod,
  dispatchOrder,
  updateShipment,
  collectCod,
  reserveRefund,
  submitRefund,
  reconcileRefund,
  requestReturn,
  authorizeReturn,
  receiveReturn,
  inspectReturn,
  settlement,
  retryPayment,
  stockReceipt,
  getRefundEligibility,
} from "../../src/modules/commerce/service";
const url = process.env.TEST_DATABASE_URL;
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url });
const pool = new Pool({
  connectionString: url,
  options: `-c search_path=${schema},public`,
});
const actor = { id: "test-owner", role: "owner" as const };
let variant: string;
function input(key = randomUUID()) {
  return {
    key,
    session_id: "session-test",
    name: "Fictional Buyer",
    phone: "+8801712345678",
    address: { district: "Dhaka", street: "Fictional Street" },
    district: "Dhaka",
    lines: [{ variant_id: variant, quantity: 1 }],
    payment_method: "online" as const,
    expected_total_minor: 11000,
    policy_version: "development-fixture-v1",
  };
}
async function create() {
  return transaction(pool, (c) => checkout(c, input()));
}
async function paid(id: string) {
  const p = await pool.query(
    "SELECT * FROM payment_attempts WHERE order_id=$1",
    [id],
  );
  return transaction(pool, (c) =>
    paymentEvent(c, {
      event_id: randomUUID(),
      attempt_id: p.rows[0].id,
      status: "succeeded",
      amount_minor: 11000,
      currency: "BDT",
      reference: randomUUID(),
      provider: "development",
    }),
  );
}
describe.skipIf(!url)("PostgreSQL commerce invariants", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of [
      "001_initial.sql",
      "002_commerce.sql",
      "003_store.sql",
      "004_discount.sql",
      "005_refund_units.sql",
      "012_order_snapshots.sql",
    ])
      await pool.query(await readFile(`db/migrations/${f}`, "utf8"));
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    await pool.query(
      "UPDATE store_settings SET value='false' WHERE key='discounts_enabled'",
    );
    await pool.query(
      "TRUNCATE products,orders,command_results,checkout_idempotency,shipping_rates,courier_remittances,discounts CASCADE",
    );
    const p = await pool.query(
      "INSERT INTO products(slug,name,published) VALUES('fictional-case','Fictional case',true) RETURNING id",
    );
    const v = await pool.query(
      "INSERT INTO variants(product_id,sku,label,price_minor,sellable_qty) VALUES($1,'CASE-Z','Clear',10000,1) RETURNING id",
      [p.rows[0].id],
    );
    variant = v.rows[0].id;
    await pool.query("INSERT INTO shipping_rates VALUES('Dhaka',1000,true)");
    await pool.query(
      "UPDATE store_settings SET value='true' WHERE key IN ('online_enabled','cod_enabled')",
    );
  });
  it("allows one simultaneous checkout for final unit", async () => {
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const v = await pool.query(
      "SELECT committed_qty FROM variants WHERE id=$1",
      [variant],
    );
    expect(v.rows[0].committed_qty).toBe(1);
  });
  it("retains paid commitment before dispatch and decrements physical exactly once", async () => {
    const order = await create();
    await paid(order.id);
    await expect(create()).rejects.toThrow("Insufficient");
    const key = randomUUID();
    await transaction(pool, (c) =>
      dispatchOrder(c, order.id, "TEST-TRACK", actor, key),
    );
    await transaction(pool, (c) =>
      dispatchOrder(c, order.id, "TEST-TRACK", actor, key),
    );
    const v = await pool.query(
      "SELECT sellable_qty,committed_qty FROM variants WHERE id=$1",
      [variant],
    );
    expect(v.rows[0]).toEqual({ sellable_qty: 0, committed_qty: 0 });
  });
  it("replays checkout, rejects changed payload and releases cancellation once", async () => {
    const i = input();
    const first = await transaction(pool, (c) => checkout(c, i));
    const retry = await transaction(pool, (c) => checkout(c, i));
    expect(retry.id).toBe(first.id);
    expect(retry.guest_token).toBeUndefined();
    await expect(
      transaction(pool, (c) => checkout(c, { ...i, name: "Changed" })),
    ).rejects.toThrow("Idempotency");
    await transaction(pool, (c) =>
      cancelOrder(c, first.id, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      cancelOrder(c, first.id, actor, randomUUID()),
    );
    const v = await pool.query(
      "SELECT sellable_qty,committed_qty FROM variants WHERE id=$1",
      [variant],
    );
    expect(v.rows[0]).toEqual({ sellable_qty: 1, committed_qty: 0 });
  });
  it("routes late success to reconciliation without reallocating", async () => {
    const o = await create();
    await transaction(pool, (c) => cancelOrder(c, o.id, actor, randomUUID()));
    expect((await paid(o.id)).status).toBe("reconciliation_required");
    expect(
      (
        await pool.query("SELECT committed_qty FROM variants WHERE id=$1", [
          variant,
        ])
      ).rows[0].committed_qty,
    ).toBe(0);
  });
  it("reserves refund capacity across concurrent requests and unknown payout", async () => {
    const o = await create();
    await paid(o.id);
    await transaction(pool, (c) => cancelOrder(c, o.id, actor, randomUUID()));
    const f = await pool.query(
      "SELECT id FROM funding_events WHERE order_id=$1",
      [o.id],
    );
    const item = await pool.query(
      "SELECT id FROM order_items WHERE order_id=$1",
      [o.id],
    );
    const data = {
      order_id: o.id,
      funding_event_id: f.rows[0].id,
      items: [{ order_item_id: item.rows[0].id, quantity: 1 }],
      shipping_minor: 1000,
      reason: "Fictional refund",
    };
    const results = await Promise.allSettled([
      transaction(pool, (c) =>
        reserveRefund(c, { ...data, key: randomUUID() }, actor),
      ),
      transaction(pool, (c) =>
        reserveRefund(c, { ...data, key: randomUUID() }, actor),
      ),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const refund = await pool.query(
      "SELECT id FROM refunds WHERE order_id=$1",
      [o.id],
    );
    await transaction(pool, (c) =>
      submitRefund(c, refund.rows[0].id, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        refund.rows[0].id,
        "unknown",
        "Simulated provider timeout",
        actor,
        randomUUID(),
      ),
    );
    await expect(
      transaction(pool, (c) =>
        reserveRefund(c, { ...data, key: randomUUID() }, actor),
      ),
    ).rejects.toThrow();
  });
  it("funds COD only after collection; remittance is separate", async () => {
    const o = await transaction(pool, (c) =>
      checkout(c, { ...input(), payment_method: "cod" }),
    );
    expect(
      (
        await pool.query("SELECT id FROM funding_events WHERE order_id=$1", [
          o.id,
        ])
      ).rowCount,
    ).toBe(0);
    await transaction(pool, (c) => confirmCod(c, o.id, actor, randomUUID()));
    await transaction(pool, (c) =>
      dispatchOrder(c, o.id, "COD-TRACK", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "delivered", actor, randomUUID()),
    );
    const cash = await transaction(pool, (c) =>
      collectCod(c, o.id, 11000, "Fictional cash receipt", actor, randomUUID()),
    );
    expect(
      (
        await pool.query("SELECT id FROM funding_events WHERE order_id=$1", [
          o.id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (await pool.query("SELECT id FROM courier_remittances")).rowCount,
    ).toBe(0);
    await transaction(pool, (c) =>
      settlement(
        c,
        {
          reference: randomUUID(),
          allocations: [{ collection_id: cash.id, amount_minor: 11000 }],
        },
        actor,
        randomUUID(),
      ),
    );
    expect(
      (await pool.query("SELECT id FROM courier_remittances")).rowCount,
    ).toBe(1);
  });
  it("keeps damaged return in quarantine, unavailable to another buyer", async () => {
    const o = await create();
    await paid(o.id);
    await transaction(pool, (c) =>
      dispatchOrder(c, o.id, "TRACK", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "delivered", actor, randomUUID()),
    );
    const item = await pool.query(
      "SELECT id FROM order_items WHERE order_id=$1",
      [o.id],
    );
    const ret = await transaction(pool, (c) =>
      requestReturn(
        c,
        o.id,
        [{ order_item_id: item.rows[0].id, quantity: 1 }],
        "Fictional defect",
        actor,
        randomUUID(),
      ),
    );
    await transaction(pool, (c) =>
      authorizeReturn(c, ret.id, true, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      receiveReturn(c, ret.id, actor, randomUUID()),
    );
    const ri = await pool.query(
      "SELECT id FROM return_items WHERE return_id=$1",
      [ret.id],
    );
    await transaction(pool, (c) =>
      inspectReturn(c, ri.rows[0].id, "damaged", actor, randomUUID()),
    );
    const v = await pool.query(
      "SELECT sellable_qty,quarantined_qty FROM variants WHERE id=$1",
      [variant],
    );
    expect(v.rows[0]).toEqual({ sellable_qty: 0, quarantined_qty: 1 });
    await expect(create()).rejects.toThrow("Insufficient");
  });
  it("uses server price and delivery, rejecting client tampering and unsupported discounts", async () => {
    await expect(
      transaction(pool, (c) =>
        checkout(c, { ...input(), expected_total_minor: 1 }),
      ),
    ).rejects.toThrow("Totals changed");
    await expect(
      transaction(pool, (c) =>
        checkout(c, { ...input(), discount_code: "UNSUPPORTED" }),
      ),
    ).rejects.toThrow("Discounts are not enabled");
    expect((await pool.query("SELECT id FROM orders")).rowCount).toBe(0);
  });
  it("processes successful payment without browser and ignores duplicate/out-of-order failure", async () => {
    const o = await create();
    const p = await pool.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1",
      [o.id],
    );
    const event = {
      event_id: randomUUID(),
      attempt_id: p.rows[0].id,
      status: "succeeded" as const,
      amount_minor: 11000,
      currency: "BDT",
      reference: randomUUID(),
      provider: "development",
    };
    await transaction(pool, (c) => paymentEvent(c, event));
    await transaction(pool, (c) => paymentEvent(c, event));
    await transaction(pool, (c) =>
      paymentEvent(c, { ...event, event_id: randomUUID(), status: "failed" }),
    );
    expect(
      (await pool.query("SELECT status FROM orders WHERE id=$1", [o.id]))
        .rows[0].status,
    ).toBe("confirmed");
    expect(
      (
        await pool.query("SELECT id FROM funding_events WHERE order_id=$1", [
          o.id,
        ])
      ).rowCount,
    ).toBe(1);
  });
  it("allows safe retry after definitive payment failure", async () => {
    const o = await create();
    const p = await pool.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1",
      [o.id],
    );
    await transaction(pool, (c) =>
      paymentEvent(c, {
        event_id: randomUUID(),
        attempt_id: p.rows[0].id,
        status: "failed",
        amount_minor: 11000,
        currency: "BDT",
        reference: randomUUID(),
        provider: "development",
      }),
    );
    const retry = await transaction(pool, (c) =>
      retryPayment(c, o.id, randomUUID()),
    );
    expect(retry.status).toBe("pending");
    await expect(
      transaction(pool, (c) => retryPayment(c, o.id, randomUUID())),
    ).rejects.toThrow("Reconcile outstanding");
  });
  it("rejects customer direct stock mutation and preserves counts", async () => {
    await expect(
      transaction(pool, (c) =>
        stockReceipt(
          c,
          {
            variant_id: variant,
            quantity: 10,
            reason: "Unauthorized",
            key: randomUUID(),
          },
          { id: "customer", role: "customer" },
        ),
      ),
    ).rejects.toThrow("Owner permission");
    expect(
      (
        await pool.query("SELECT sellable_qty FROM variants WHERE id=$1", [
          variant,
        ])
      ).rows[0].sellable_qty,
    ).toBe(1);
  });
  it("keeps failed COD return-to-origin unavailable until inspection", async () => {
    const o = await transaction(pool, (c) =>
      checkout(c, { ...input(), payment_method: "cod" }),
    );
    await transaction(pool, (c) => confirmCod(c, o.id, actor, randomUUID()));
    await transaction(pool, (c) =>
      dispatchOrder(c, o.id, "RTO-TRACK", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "delivery_failed", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "return_to_origin", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "returned_to_store", actor, randomUUID()),
    );
    expect(
      (
        await pool.query("SELECT sellable_qty FROM variants WHERE id=$1", [
          variant,
        ])
      ).rows[0].sellable_qty,
    ).toBe(0);
    expect(
      (
        await pool.query("SELECT id FROM funding_events WHERE order_id=$1", [
          o.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("caps partial refund to inspected quantity and snapshots unchanged price", async () => {
    await pool.query("UPDATE variants SET sellable_qty=2 WHERE id=$1", [
      variant,
    ]);
    const o = await transaction(pool, (c) =>
      checkout(c, {
        ...input(),
        lines: [{ variant_id: variant, quantity: 2 }],
        expected_total_minor: 21000,
      }),
    );
    const p = await pool.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1",
      [o.id],
    );
    await transaction(pool, (c) =>
      paymentEvent(c, {
        event_id: randomUUID(),
        attempt_id: p.rows[0].id,
        status: "succeeded",
        amount_minor: 21000,
        currency: "BDT",
        reference: randomUUID(),
        provider: "development",
      }),
    );
    await pool.query("UPDATE variants SET price_minor=50000 WHERE id=$1", [
      variant,
    ]);
    await transaction(pool, (c) =>
      dispatchOrder(c, o.id, "PARTIAL", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, o.id, "delivered", actor, randomUUID()),
    );
    const item = await pool.query(
      "SELECT id FROM order_items WHERE order_id=$1",
      [o.id],
    );
    const ret = await transaction(pool, (c) =>
      requestReturn(
        c,
        o.id,
        [{ order_item_id: item.rows[0].id, quantity: 1 }],
        "Partial fictional return",
        actor,
        randomUUID(),
      ),
    );
    await transaction(pool, (c) =>
      authorizeReturn(c, ret.id, true, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      receiveReturn(c, ret.id, actor, randomUUID()),
    );
    const ri = await pool.query(
      "SELECT id FROM return_items WHERE return_id=$1",
      [ret.id],
    );
    await transaction(pool, (c) =>
      inspectReturn(c, ri.rows[0].id, "sellable", actor, randomUUID()),
    );
    const funding = await pool.query(
      "SELECT id FROM funding_events WHERE order_id=$1",
      [o.id],
    );
    const data = {
      order_id: o.id,
      funding_event_id: funding.rows[0].id,
      items: [{ order_item_id: item.rows[0].id, quantity: 1 }],
      shipping_minor: 0,
      reason: "Partial refund",
    };
    const refund = await transaction(pool, (c) =>
      reserveRefund(c, { ...data, key: randomUUID() }, actor),
    );
    expect(refund.amount_minor).toBe(10000);
    await expect(
      transaction(pool, (c) =>
        reserveRefund(c, { ...data, key: randomUUID() }, actor),
      ),
    ).rejects.toThrow("Quantity exceeds");
  });
  it("models compatibility and charger capability independently per SKU", async () => {
    const product = await pool.query(
      "SELECT product_id FROM variants WHERE id=$1",
      [variant],
    );
    const other = await pool.query(
      "INSERT INTO variants(product_id,sku,label,price_minor) VALUES($1,'CASE-Q','For Phone Q',10000) RETURNING id",
      [product.rows[0].product_id],
    );
    const models = await pool.query(
      "INSERT INTO device_models(brand,model,model_number) VALUES('Fictional','Phone Z','Z-1'),('Fictional','Phone Q','Q-1') RETURNING id,model",
    );
    await pool.query(
      "INSERT INTO compatibility(variant_id,device_model_id,source) VALUES($1,$2,'Fictional fixture'),($3,$4,'Fictional fixture')",
      [variant, models.rows[0].id, other.rows[0].id, models.rows[1].id],
    );
    const matches = await pool.query(
      "SELECT variant_id FROM compatibility WHERE device_model_id=$1",
      [models.rows[0].id],
    );
    expect(matches.rows.map((x) => x.variant_id)).toEqual([variant]);
    await pool.query(
      "INSERT INTO specifications(variant_id,attribute,value,source) VALUES($1,'connector','\"USB-C\"','Fictional fixture'),($1,'protocols','[\"USB PD\"]','Fictional fixture'),($1,'max_output_w','30','Fictional fixture')",
      [other.rows[0].id],
    );
    const specs = await pool.query(
      "SELECT attribute,value FROM specifications WHERE variant_id=$1",
      [other.rows[0].id],
    );
    expect(
      Object.fromEntries(specs.rows.map((x) => [x.attribute, x.value])),
    ).toEqual({ connector: "USB-C", protocols: ["USB PD"], max_output_w: 30 });
  });
  it("enforces discount usage limit across distinct simultaneous orders", async () => {
    await pool.query("UPDATE variants SET sellable_qty=2 WHERE id=$1", [
      variant,
    ]);
    await pool.query(
      "UPDATE store_settings SET value='true' WHERE key='discounts_enabled'",
    );
    await pool.query(
      "INSERT INTO discounts(code,amount_minor,usage_limit,ends_at,active) VALUES('FICTIONAL',1000,1,now()+interval '1 day',true)",
    );
    const results = await Promise.allSettled([
      transaction(pool, (c) =>
        checkout(c, {
          ...input(),
          discount_code: "FICTIONAL",
          expected_total_minor: 10000,
        }),
      ),
      transaction(pool, (c) =>
        checkout(c, {
          ...input(),
          discount_code: "FICTIONAL",
          expected_total_minor: 10000,
        }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT used_count FROM discounts WHERE code='FICTIONAL'",
        )
      ).rows[0].used_count,
    ).toBe(1);
    expect(
      (await pool.query("SELECT discount_id FROM discount_redemptions"))
        .rowCount,
    ).toBe(1);
  });
  it("allocates odd poisha deterministically and caps discounted partial refunds", async () => {
    await pool.query("UPDATE variants SET sellable_qty=2 WHERE id=$1", [
      variant,
    ]);
    await pool.query(
      "UPDATE store_settings SET value='true' WHERE key='discounts_enabled'",
    );
    await pool.query(
      "INSERT INTO discounts(code,amount_minor,usage_limit,ends_at,active) VALUES('ODD',1001,2,now()+interval '1 day',true)",
    );
    const o = await transaction(pool, (c) =>
      checkout(c, {
        ...input(),
        lines: [{ variant_id: variant, quantity: 2 }],
        discount_code: "ODD",
        expected_total_minor: 19999,
      }),
    );
    const p = await pool.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1",
      [o.id],
    );
    await transaction(pool, (c) =>
      paymentEvent(c, {
        event_id: randomUUID(),
        attempt_id: p.rows[0].id,
        status: "succeeded",
        amount_minor: 19999,
        currency: "BDT",
        reference: randomUUID(),
        provider: "development",
      }),
    );
    await transaction(pool, (c) => cancelOrder(c, o.id, actor, randomUUID()));
    const allocations = await pool.query(
      "SELECT discount_minor FROM order_item_unit_allocations ORDER BY unit_index",
    );
    expect(allocations.rows.map((r) => Number(r.discount_minor))).toEqual([
      501, 500,
    ]);
    const f = await pool.query(
      "SELECT id FROM funding_events WHERE order_id=$1",
      [o.id],
    );
    const item = await pool.query(
      "SELECT id FROM order_items WHERE order_id=$1",
      [o.id],
    );
    const data = {
      order_id: o.id,
      funding_event_id: f.rows[0].id,
      items: [{ order_item_id: item.rows[0].id, quantity: 1 }],
      shipping_minor: 0,
      reason: "Fictional partial refund",
    };
    const first = await transaction(pool, (c) =>
      reserveRefund(c, { ...data, key: randomUUID() }, actor),
    );
    const second = await transaction(pool, (c) =>
      reserveRefund(c, { ...data, key: randomUUID() }, actor),
    );
    expect(first.amount_minor).toBe(9499);
    expect(second.amount_minor).toBe(9500);
    expect(
      (
        await pool.query(
          "SELECT sum(discount_minor)::int total FROM refund_items",
        )
      ).rows[0].total,
    ).toBe(1001);
    await expect(
      transaction(pool, (c) =>
        reserveRefund(c, { ...data, key: randomUUID() }, actor),
      ),
    ).rejects.toThrow("Quantity exceeds");
    await transaction(pool, (c) =>
      submitRefund(c, first.id, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        first.id,
        "failed",
        "Definitive fictional failed payout",
        actor,
        randomUUID(),
      ),
    );
    const replacement = await transaction(pool, (c) =>
      reserveRefund(c, { ...data, key: randomUUID() }, actor),
    );
    expect(replacement.amount_minor).toBe(9499);
  });
  it("preserves purchased variant specifications when the live catalog changes", async () => {
    await pool.query(
      "insert into specifications(variant_id,attribute,value,source) values($1,'max_output_w','30','Fictional test')",
      [variant],
    );
    await pool.query(
      "insert into store_content(slug,title,body) values('shipping','Fictional policy','Original policy')",
    );
    const o = await create();
    await pool.query(
      "update store_content set body='New policy' where slug='shipping'",
    );
    expect(
      (
        await pool.query("select policy_snapshot from orders where id=$1", [
          o.id,
        ])
      ).rows[0].policy_snapshot.shipping.body,
    ).toBe("Original policy");
    await pool.query(
      "update specifications set value='65' where variant_id=$1",
      [variant],
    );
    await pool.query("update variants set label='New label' where id=$1", [
      variant,
    ]);
    const item = (
      await pool.query(
        "select variant_label_snapshot,specification_snapshot from order_items where order_id=$1",
        [o.id],
      )
    ).rows[0];
    expect(item.specification_snapshot.max_output_w).toBe(30);
    expect(item.variant_label_snapshot).toBe("Clear");
  });
  it("refunds a paid unshipped cancellation without a fictional return or physical receipt", async () => {
    const order = await create();
    await paid(order.id);
    const beforeCancellation = await transaction(pool, (c) =>
      getRefundEligibility(c, order.id, actor),
    );
    expect(beforeCancellation.branch).toBe("unshipped_cancellation");
    expect(beforeCancellation.requires_cancellation).toBe(true);
    expect(beforeCancellation.reason).toContain("Approve cancellation");
    expect(beforeCancellation.reason).not.toContain("receipt");
    expect(beforeCancellation.items[0].remaining_quantity).toBe(0);
    const snapshot = (
      await pool.query(
        "select unit_minor,discount_minor,quantity from order_items where order_id=$1",
        [order.id],
      )
    ).rows;
    await Promise.all([
      transaction(pool, (c) => cancelOrder(c, order.id, actor, randomUUID())),
      transaction(pool, (c) => cancelOrder(c, order.id, actor, randomUUID())),
    ]);
    const eligibility = await transaction(pool, (c) =>
      getRefundEligibility(c, order.id, actor),
    );
    await expect(
      transaction(pool, (c) =>
        getRefundEligibility(c, order.id, {
          id: "unrelated-customer",
          role: "customer",
        }),
      ),
    ).rejects.toThrow("Owner permission required");
    expect(eligibility.branch).toBe("unshipped_cancellation");
    expect(eligibility.requires_cancellation).toBe(false);
    expect(eligibility.items[0].remaining_quantity).toBe(1);
    expect(eligibility.remaining_total_minor).toBe(11000);
    const request = {
      order_id: order.id,
      funding_event_id: eligibility.funding[0].id,
      items: [
        { order_item_id: eligibility.items[0].order_item_id, quantity: 1 },
      ],
      shipping_minor: 1000,
      reason: "Approved unshipped cancellation",
      key: randomUUID(),
    };
    const refund = await transaction(pool, (c) =>
      reserveRefund(c, request, actor),
    );
    expect(
      (await transaction(pool, (c) => reserveRefund(c, request, actor))).id,
    ).toBe(refund.id);
    const submissionKey = randomUUID();
    await Promise.all([
      transaction(pool, (c) =>
        submitRefund(c, refund.id, actor, submissionKey),
      ),
      transaction(pool, (c) =>
        submitRefund(c, refund.id, actor, submissionKey),
      ),
    ]);
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        refund.id,
        "unknown",
        "Fictional provider timeout",
        actor,
        randomUUID(),
      ),
    );
    expect(
      (await transaction(pool, (c) => getRefundEligibility(c, order.id, actor)))
        .remaining_total_minor,
    ).toBe(0);
    await expect(
      transaction(pool, (c) =>
        reserveRefund(c, { ...request, key: randomUUID() }, actor),
      ),
    ).rejects.toThrow();
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        refund.id,
        "succeeded",
        "Fictional verified payout evidence",
        actor,
        randomUUID(),
      ),
    );
    expect(
      (
        await pool.query(
          "select count(*)::int n from refund_payout_attempts where refund_id=$1",
          [refund.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "select sellable_qty,committed_qty,quarantined_qty from variants where id=$1",
          [variant],
        )
      ).rows[0],
    ).toEqual({ sellable_qty: 1, committed_qty: 0, quarantined_qty: 0 });
    expect(
      (
        await pool.query(
          "select count(*)::int n from returns where order_id=$1",
          [order.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select count(*)::int n from inventory_movements where variant_id=$1",
          [variant],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select unit_minor,discount_minor,quantity from order_items where order_id=$1",
          [order.id],
        )
      ).rows,
    ).toEqual(snapshot);
  });
  it("refunds verified late funds after cancellation without resuming fulfillment", async () => {
    const order = await create();
    await transaction(pool, (c) =>
      cancelOrder(c, order.id, actor, randomUUID()),
    );
    expect((await paid(order.id)).status).toBe("reconciliation_required");
    const eligibility = await transaction(pool, (c) =>
      getRefundEligibility(c, order.id, actor),
    );
    const attempt = (
      await pool.query(
        "select id,provider_ref from payment_attempts where order_id=$1",
        [order.id],
      )
    ).rows[0];
    const delayed = await transaction(pool, (c) =>
      paymentEvent(c, {
        event_id: randomUUID(),
        attempt_id: attempt.id,
        status: "failed",
        amount_minor: 11000,
        currency: "BDT",
        reference: attempt.provider_ref,
        provider: "development",
      }),
    );
    expect(delayed.status).toBe("reconciliation_required");
    await expect(
      transaction(pool, (c) =>
        paymentEvent(c, {
          event_id: randomUUID(),
          attempt_id: attempt.id,
          status: "succeeded",
          amount_minor: 11000,
          currency: "BDT",
          reference: randomUUID(),
          provider: "development",
        }),
      ),
    ).rejects.toThrow("different provider reference");
    expect(
      (
        await pool.query(
          "select sum(amount_minor)::int amount from funding_events where order_id=$1",
          [order.id],
        )
      ).rows[0].amount,
    ).toBe(11000);
    expect(eligibility.branch).toBe("late_payment");
    expect(eligibility.requires_cancellation).toBe(false);
    const refund = await transaction(pool, (c) =>
      reserveRefund(
        c,
        {
          order_id: order.id,
          funding_event_id: eligibility.funding[0].id,
          items: [
            { order_item_id: eligibility.items[0].order_item_id, quantity: 1 },
          ],
          shipping_minor: 1000,
          reason: "Late paid funds returned",
          key: randomUUID(),
        },
        actor,
      ),
    );
    await transaction(pool, (c) =>
      submitRefund(c, refund.id, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        refund.id,
        "succeeded",
        "Fictional late-payment payout",
        actor,
        randomUUID(),
      ),
    );
    expect(
      (await pool.query("select status from orders where id=$1", [order.id]))
        .rows[0].status,
    ).toBe("cancelled");
    expect(
      (
        await pool.query(
          "select count(*)::int n from shipments where order_id=$1",
          [order.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select count(*)::int n from returns where order_id=$1",
          [order.id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("requires an explicit cancellation resolution before refunding a reservation-expiry late payment", async () => {
    const order = await create();
    await pool.query(
      "update inventory_commitments set expires_at=now()-interval '1 minute' where order_id=$1",
      [order.id],
    );
    expect((await paid(order.id)).status).toBe("reconciliation_required");
    const eligibility = await transaction(pool, (c) =>
      getRefundEligibility(c, order.id, actor),
    );
    expect(eligibility.branch).toBe("late_payment");
    expect(eligibility.requires_cancellation).toBe(true);
    const request = {
      order_id: order.id,
      funding_event_id: eligibility.funding[0].id,
      items: [
        { order_item_id: eligibility.items[0].order_item_id, quantity: 1 },
      ],
      shipping_minor: 1000,
      reason: "Refund late payment after expired hold",
      key: randomUUID(),
    };
    await expect(
      transaction(pool, (c) => reserveRefund(c, request, actor)),
    ).rejects.toThrow("Approve cancellation");
    expect(
      (await pool.query("select status from orders where id=$1", [order.id]))
        .rows[0].status,
    ).toBe("pending_payment");
    await transaction(pool, (c) =>
      cancelOrder(c, order.id, actor, randomUUID()),
    );
    const refund = await transaction(pool, (c) =>
      reserveRefund(c, request, actor),
    );
    expect(refund.amount_minor).toBe(11000);
    expect(
      (
        await pool.query(
          "select sellable_qty,committed_qty from variants where id=$1",
          [variant],
        )
      ).rows[0],
    ).toEqual({ sellable_qty: 1, committed_qty: 0 });
    expect(
      (
        await pool.query(
          "select count(*)::int n from inventory_movements where variant_id=$1",
          [variant],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("requires delivered returns to be received and inspected while refund payout leaves disposition unchanged", async () => {
    const order = await create();
    await paid(order.id);
    await transaction(pool, (c) =>
      dispatchOrder(c, order.id, "Fictional delivery", actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      updateShipment(c, order.id, "delivered", actor, randomUUID()),
    );
    const eligible = await transaction(pool, (c) =>
      getRefundEligibility(c, order.id, actor),
    );
    expect(eligible.branch).toBe("delivered_return");
    expect(eligible.items[0].remaining_quantity).toBe(0);
    const itemId = eligible.items[0].order_item_id;
    const request = {
      order_id: order.id,
      funding_event_id: eligible.funding[0].id,
      items: [{ order_item_id: itemId, quantity: 1 }],
      shipping_minor: 0,
      reason: "Inspected delivered return",
      key: randomUUID(),
    };
    await expect(
      transaction(pool, (c) => reserveRefund(c, request, actor)),
    ).rejects.toThrow("Quantity exceeds");
    const ret = await transaction(pool, (c) =>
      requestReturn(
        c,
        order.id,
        [{ order_item_id: itemId, quantity: 1 }],
        "Fictional defect",
        actor,
        randomUUID(),
      ),
    );
    await transaction(pool, (c) =>
      authorizeReturn(c, ret.id, true, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      receiveReturn(c, ret.id, actor, randomUUID()),
    );
    await expect(
      transaction(pool, (c) => reserveRefund(c, request, actor)),
    ).rejects.toThrow("Quantity exceeds");
    const ri = (
      await pool.query("select id from return_items where return_id=$1", [
        ret.id,
      ])
    ).rows[0];
    await transaction(pool, (c) =>
      inspectReturn(c, ri.id, "damaged", actor, randomUUID()),
    );
    const refund = await transaction(pool, (c) =>
      reserveRefund(c, request, actor),
    );
    await transaction(pool, (c) =>
      submitRefund(c, refund.id, actor, randomUUID()),
    );
    await transaction(pool, (c) =>
      reconcileRefund(
        c,
        refund.id,
        "succeeded",
        "Fictional delivered-return payout",
        actor,
        randomUUID(),
      ),
    );
    expect(
      (
        await pool.query(
          "select sellable_qty,committed_qty,quarantined_qty from variants where id=$1",
          [variant],
        )
      ).rows[0],
    ).toEqual({ sellable_qty: 0, committed_qty: 0, quarantined_qty: 1 });
  });
});
