import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
export type Actor = { id: string; role: "owner" | "customer" | "guest" };
export class CommerceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export async function transaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const need = (ok: unknown, code: string, message: string) => {
  if (!ok) throw new CommerceError(code, message);
};
function owner(a: Actor) {
  if (a.role !== "owner")
    throw new CommerceError("FORBIDDEN", "Owner permission required", 403);
}
function money(v: unknown) {
  const n = Number(v);
  need(
    Number.isSafeInteger(n) && n >= 0,
    "MONEY_INVALID",
    "Invalid monetary amount",
  );
  return n;
}
async function lockedOrder(c: PoolClient, id: string) {
  const r = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id]);
  need(r.rowCount, "NOT_FOUND", "Order not found");
  return r.rows[0];
}
async function audit(
  c: PoolClient,
  a: Actor,
  action: string,
  id: string,
  reason: string,
) {
  await c.query(
    "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,$3,$4,$5)",
    [a.id, action, "order", id, reason],
  );
}
async function notify(c: PoolClient, id: string, topic: string, key: string) {
  await c.query(
    "INSERT INTO outbox(topic,payload,dedupe_key) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING",
    [topic, JSON.stringify({ order_id: id }), key],
  );
}
async function command<T>(
  c: PoolClient,
  key: string,
  name: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  need(
    key.length >= 8 && key.length <= 200,
    "KEY_INVALID",
    "Use an idempotency key of 8–200 characters",
  );
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
  const existing = await c.query("SELECT * FROM command_results WHERE key=$1", [
    key,
  ]);
  if (existing.rowCount) {
    need(
      existing.rows[0].command === name &&
        existing.rows[0].request_hash === hash(input),
      "KEY_REUSE",
      "Idempotency key reused with different input",
    );
    return existing.rows[0].result as T;
  }
  const result = await fn();
  await c.query(
    "INSERT INTO command_results(key,command,request_hash,result) VALUES($1,$2,$3,$4)",
    [
      key,
      name,
      hash(input),
      JSON.stringify(
        result && typeof result === "object"
          ? Object.fromEntries(
              Object.entries(result).filter(([key]) => key !== "guest_token"),
            )
          : result,
      ),
    ],
  );
  return result;
}
export type CartLine = { variant_id: string; quantity: number };
export type QuoteInput = {
  lines: CartLine[];
  district: string;
  discount_code?: string;
};
export async function quote(c: PoolClient, input: QuoteInput) {
  need(
    input.lines.length > 0 && input.lines.length <= 50,
    "CART_INVALID",
    "Cart requires 1–50 items",
  );
  const seen = new Set<string>();
  const lines = [];
  let subtotal = 0;
  for (const l of [...input.lines].sort((a, b) =>
    a.variant_id.localeCompare(b.variant_id),
  )) {
    need(
      Number.isInteger(l.quantity) &&
        l.quantity > 0 &&
        l.quantity <= 100 &&
        !seen.has(l.variant_id),
      "QUANTITY_INVALID",
      "Invalid or duplicate cart item",
    );
    seen.add(l.variant_id);
    const r = await c.query(
      "SELECT v.*,p.name,p.published FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1",
      [l.variant_id],
    );
    need(
      r.rowCount && r.rows[0].active && r.rows[0].published,
      "SKU_UNAVAILABLE",
      "Variant not available",
    );
    const v = r.rows[0];
    need(
      v.sellable_qty - v.committed_qty >= l.quantity,
      "OUT_OF_STOCK",
      "Insufficient available stock",
    );
    const unit = money(v.price_minor);
    subtotal += unit * l.quantity;
    lines.push({
      ...l,
      sku: v.sku,
      name: v.name,
      unit_minor: unit,
      line_minor: unit * l.quantity,
    });
  }
  const rate = await c.query(
    "SELECT fee_minor FROM shipping_rates WHERE district=$1 AND enabled=true",
    [input.district],
  );
  need(
    rate.rowCount,
    "DELIVERY_UNAVAILABLE",
    "Delivery unavailable in selected district",
  );
  const delivery = money(rate.rows[0].fee_minor);
  money(subtotal + delivery);
  let discount = 0;
  let discountId: string | null = null;
  if (input.discount_code) {
    need(
      subtotal > 0,
      "DISCOUNT_INVALID",
      "Discount requires a positive merchandise subtotal",
    );
    const enabled = await c.query(
      "SELECT value FROM store_settings WHERE key='discounts_enabled'",
    );
    need(
      enabled.rows[0]?.value === true,
      "DISCOUNT_UNSUPPORTED",
      "Discounts are not enabled",
    );
    const dr = await c.query(
      "SELECT * FROM discounts WHERE code=$1 AND active=true AND starts_at<=now() AND ends_at>now()",
      [input.discount_code.trim().toUpperCase()],
    );
    need(
      dr.rowCount && dr.rows[0].used_count < dr.rows[0].usage_limit,
      "DISCOUNT_INVALID",
      "Discount unavailable or usage limit reached",
    );
    discount = Math.min(subtotal, money(dr.rows[0].amount_minor));
    discountId = dr.rows[0].id;
  }
  const allocations = allocateUnitDiscounts(lines, discount);
  return {
    lines: lines.map((line, index) => ({
      ...line,
      unit_discounts: allocations[index],
      discount_minor: allocations[index].reduce((sum, n) => sum + n, 0),
    })),
    discount_id: discountId,
    items_minor: subtotal,
    discount_minor: discount,
    delivery_minor: delivery,
    total_minor: subtotal - discount + delivery,
    currency: "BDT",
  };
}
export type CheckoutInput = QuoteInput & {
  key: string;
  session_id: string;
  name: string;
  phone: string;
  email?: string;
  address: Record<string, string>;
  payment_method: "online" | "cod";
  expected_total_minor: number;
  policy_version: string;
};
export async function checkout(c: PoolClient, input: CheckoutInput) {
  return command(c, input.key, "checkout", input, async () => {
    need(
      input.session_id && input.name && /^\+8801[3-9]\d{8}$/.test(input.phone),
      "CONTACT_INVALID",
      "Recipient name and Bangladesh phone required",
    );
    const setting = await c.query(
      "SELECT value FROM store_settings WHERE key=$1",
      [`${input.payment_method}_enabled`],
    );
    need(
      setting.rows[0]?.value === true,
      "METHOD_DISABLED",
      "Payment method is disabled",
    );
    await c.query(
      "SELECT id FROM variants WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [input.lines.map((l) => l.variant_id)],
    );
    if (input.discount_code)
      await c.query("SELECT id FROM discounts WHERE code=$1 FOR UPDATE", [
        input.discount_code.trim().toUpperCase(),
      ]);
    const q = await quote(c, input);
    need(
      q.total_minor === input.expected_total_minor,
      "PRICE_CHANGED",
      "Totals changed; review quote",
    );
    const token = randomBytes(32).toString("base64url");
    const r = await c.query(
      `INSERT INTO orders(guest_name,guest_phone,guest_email,address_snapshot,status,payment_method,items_minor,delivery_minor,total_minor,policy_version,session_id,guest_token_hash,guest_token_expires_at,discount_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '30 days',$13) RETURNING id,status`,
      [
        input.name,
        input.phone,
        input.email ?? null,
        JSON.stringify(input.address),
        input.payment_method === "cod"
          ? "awaiting_cod_confirmation"
          : "pending_payment",
        input.payment_method,
        q.items_minor,
        q.delivery_minor,
        q.total_minor,
        input.policy_version,
        input.session_id,
        hash(token),
        q.discount_minor,
      ],
    );
    const order = r.rows[0];
    await c.query(
      "update orders set policy_snapshot=coalesce((select jsonb_object_agg(slug,jsonb_build_object('title',title,'body',body,'version',version)) from store_content),'{}'::jsonb) where id=$1",
      [order.id],
    );
    for (const l of q.lines) {
      const oi = await c.query(
        "INSERT INTO order_items(order_id,variant_id,sku_snapshot,name_snapshot,unit_minor,quantity,discount_minor,variant_label_snapshot,specification_snapshot,compatibility_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,(select label from variants where id=$2),coalesce((select jsonb_object_agg(attribute,value) from specifications where variant_id=$2),'{}'::jsonb),coalesce((select jsonb_agg(jsonb_build_object('brand',dm.brand,'model',dm.model,'model_number',dm.model_number)) from compatibility co join device_models dm on dm.id=co.device_model_id where co.variant_id=$2),'[]'::jsonb)) RETURNING id",
        [
          order.id,
          l.variant_id,
          l.sku,
          l.name,
          l.unit_minor,
          l.quantity,
          l.discount_minor,
        ],
      );
      for (let unit = 0; unit < l.quantity; unit++)
        await c.query(
          "INSERT INTO order_item_unit_allocations(order_item_id,unit_index,gross_minor,discount_minor) VALUES($1,$2,$3,$4)",
          [oi.rows[0].id, unit, l.unit_minor, l.unit_discounts[unit]],
        );
      await c.query(
        "UPDATE variants SET committed_qty=committed_qty+$2 WHERE id=$1",
        [l.variant_id, l.quantity],
      );
      await c.query(
        `INSERT INTO inventory_commitments(order_id,variant_id,quantity,kind,status,expires_at) VALUES($1,$2,$3,'reservation','active',CASE WHEN $4='online' THEN now()+interval '20 minutes' ELSE null END)`,
        [order.id, l.variant_id, l.quantity, input.payment_method],
      );
    }
    if (q.discount_id) {
      await c.query(
        "UPDATE discounts SET used_count=used_count+1 WHERE id=$1",
        [q.discount_id],
      );
      await c.query(
        "INSERT INTO discount_redemptions(discount_id,order_id,amount_minor) VALUES($1,$2,$3)",
        [q.discount_id, order.id, q.discount_minor],
      );
    }
    if (input.payment_method === "online")
      await c.query(
        `INSERT INTO payment_attempts(order_id,provider,status,amount_minor,currency) VALUES($1,'development','pending',$2,'BDT')`,
        [order.id, q.total_minor],
      );
    await c.query(
      "INSERT INTO checkout_idempotency(key,request_hash,order_id,session_id) VALUES($1,$2,$3,$4)",
      [input.key, hash(input), order.id, input.session_id],
    );
    await notify(c, order.id, "order.created", `created:${order.id}`);
    // Raw credential is only returned to the issuing session. Never put it in logs.
    return { ...order, total_minor: q.total_minor, guest_token: token };
  });
}
export async function confirmCod(
  c: PoolClient,
  id: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "cod.confirm", { id, a: a.id }, async () => {
    const o = await lockedOrder(c, id);
    need(
      o.payment_method === "cod" && o.status === "awaiting_cod_confirmation",
      "STATE_INVALID",
      "COD order is not awaiting confirmation",
    );
    await c.query(
      "UPDATE inventory_commitments SET kind='committed',expires_at=null WHERE order_id=$1 AND status='active'",
      [id],
    );
    await c.query("UPDATE orders SET status='confirmed' WHERE id=$1", [id]);
    await audit(c, a, "cod.confirm", id, "Confirmed COD contact");
    return { status: "confirmed" };
  });
}
export async function paymentEvent(
  c: PoolClient,
  input: {
    event_id: string;
    attempt_id: string;
    status: "succeeded" | "failed" | "pending";
    amount_minor: number;
    currency: string;
    reference: string;
    provider: string;
  },
) {
  return command(
    c,
    `${input.provider}:${input.event_id}`,
    "payment.event",
    input,
    async () => {
      const initial = await c.query(
        "SELECT order_id FROM payment_attempts WHERE id=$1",
        [input.attempt_id],
      );
      need(initial.rowCount, "NOT_FOUND", "Payment attempt missing");
      const o = await lockedOrder(c, initial.rows[0].order_id);
      const r = await c.query(
        "SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE",
        [input.attempt_id],
      );
      const p = r.rows[0];
      need(
        p.provider === input.provider &&
          money(p.amount_minor) === input.amount_minor &&
          input.currency === "BDT",
        "PAYMENT_MISMATCH",
        "Payment amount, currency or provider mismatch",
      );
      await c.query(
        "INSERT INTO provider_events(provider,event_id,payload_hash,processing_status,processed_at) VALUES($1,$2,$3,'processed',now()) ON CONFLICT DO NOTHING",
        [input.provider, input.event_id, hash(input)],
      );
      if (p.status === "succeeded") return { status: "succeeded" };
      if (input.status === "succeeded") {
        const active = await c.query(
          "SELECT * FROM inventory_commitments WHERE order_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now())",
          [o.id],
        );
        const priorFunding = await c.query(
          "SELECT order_id,amount_minor FROM funding_events WHERE source_ref=$1",
          [input.reference],
        );
        need(
          !priorFunding.rowCount ||
            (priorFunding.rows[0].order_id === o.id &&
              money(priorFunding.rows[0].amount_minor) === input.amount_minor),
          "PAYMENT_REFERENCE_REUSE",
          "Provider reference belongs to a different transaction",
        );
        await c.query(
          `INSERT INTO funding_events(order_id,source,source_ref,amount_minor,verified,verified_by,verified_at) VALUES($1,'online',$2,$3,true,'payment-verifier',now()) ON CONFLICT(source_ref) DO NOTHING`,
          [o.id, input.reference, input.amount_minor],
        );
        if (
          o.status !== "pending_payment" ||
          !active.rowCount ||
          Number(
            (
              await c.query(
                "SELECT count(*) n FROM inventory_commitments WHERE order_id=$1",
                [o.id],
              )
            ).rows[0].n,
          ) !== active.rowCount
        ) {
          await c.query(
            "UPDATE payment_attempts SET status='reconciliation_required',verified_at=now(),provider_ref=$2 WHERE id=$1",
            [p.id, input.reference],
          );
          await notify(
            c,
            o.id,
            "payment.reconciliation",
            `reconcile:${input.event_id}`,
          );
          return { status: "reconciliation_required" };
        }
        await c.query(
          "UPDATE payment_attempts SET status='succeeded',verified_at=now(),provider_ref=$2 WHERE id=$1",
          [p.id, input.reference],
        );
        await c.query("UPDATE orders SET status='confirmed' WHERE id=$1", [
          o.id,
        ]);
        await c.query(
          "UPDATE inventory_commitments SET kind='committed',expires_at=null WHERE order_id=$1 AND status='active'",
          [o.id],
        );
        await notify(c, o.id, "payment.succeeded", `paid:${o.id}`);
        return { status: "succeeded" };
      }
      await c.query("UPDATE payment_attempts SET status=$2 WHERE id=$1", [
        p.id,
        input.status,
      ]);
      return { status: input.status };
    },
  );
}
async function release(c: PoolClient, id: string) {
  const rows = await c.query(
    "SELECT * FROM inventory_commitments WHERE order_id=$1 AND status='active' ORDER BY variant_id FOR UPDATE",
    [id],
  );
  for (const row of rows.rows) {
    await c.query(
      "UPDATE variants SET committed_qty=committed_qty-$2 WHERE id=$1",
      [row.variant_id, row.quantity],
    );
  }
  await c.query(
    "UPDATE inventory_commitments SET status='released' WHERE order_id=$1 AND status='active'",
    [id],
  );
}
export async function cancelOrder(
  c: PoolClient,
  id: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "order.cancel", { id, a: a.id }, async () => {
    const o = await lockedOrder(c, id);
    const ship = await c.query(
      "SELECT id FROM shipments WHERE order_id=$1 AND status IN ('dispatched','delivered','delivery_failed','retry_scheduled','return_to_origin','returned_to_store')",
      [id],
    );
    need(
      !ship.rowCount,
      "ALREADY_DISPATCHED",
      "Dispatched order cannot be cancelled",
    );
    if (o.status === "cancelled") return { status: "cancelled" };
    await release(c, id);
    await c.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]);
    await audit(c, a, "order.cancel", id, "Cancellation approved");
    await notify(c, id, "order.cancelled", `cancelled:${id}`);
    return { status: "cancelled" };
  });
}
export async function dispatchOrder(
  c: PoolClient,
  id: string,
  tracking: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "order.dispatch",
    { id, tracking, a: a.id },
    async () => {
      const o = await lockedOrder(c, id);
      need(
        ["confirmed", "processing"].includes(o.status),
        "STATE_INVALID",
        "Only confirmed orders can dispatch",
      );
      need(tracking.trim(), "TRACKING_REQUIRED", "Courier reference required");
      const rows = await c.query(
        "SELECT * FROM inventory_commitments WHERE order_id=$1 AND status='active' AND kind='committed' ORDER BY variant_id FOR UPDATE",
        [id],
      );
      need(rows.rowCount, "STATE_INVALID", "No committed stock");
      for (const row of rows.rows) {
        await c.query(
          "UPDATE variants SET committed_qty=committed_qty-$2,sellable_qty=sellable_qty-$2 WHERE id=$1",
          [row.variant_id, row.quantity],
        );
        await c.query(
          "INSERT INTO inventory_movements(variant_id,order_id,actor_id,kind,quantity_delta,idempotency_key,reason) VALUES($1,$2,$3,'dispatch',$4,$5,$6)",
          [
            row.variant_id,
            id,
            a.id,
            -row.quantity,
            `dispatch:${id}:${row.variant_id}`,
            tracking,
          ],
        );
      }
      await c.query(
        "UPDATE inventory_movements SET physical_delta=quantity_delta,sellable_delta=quantity_delta WHERE order_id=$1 AND kind='dispatch'",
        [id],
      );
      await c.query(
        "UPDATE inventory_commitments SET status='dispatched' WHERE order_id=$1 AND status='active'",
        [id],
      );
      await c.query(
        "INSERT INTO shipments(order_id,status,tracking_ref) VALUES($1,'dispatched',$2) ON CONFLICT(order_id) DO UPDATE SET status='dispatched',tracking_ref=$2",
        [id, tracking],
      );
      await c.query("UPDATE orders SET status='processing' WHERE id=$1", [id]);
      await audit(c, a, "order.dispatch", id, tracking);
      return { status: "dispatched" };
    },
  );
}
export async function stockReceipt(
  c: PoolClient,
  input: {
    variant_id: string;
    quantity: number;
    reason: string;
    key: string;
    adjustment?: boolean;
  },
  a: Actor,
) {
  owner(a);
  return command(
    c,
    input.key,
    "stock.receipt",
    { ...input, a: a.id },
    async () => {
      need(
        Number.isInteger(input.quantity) &&
          input.quantity !== 0 &&
          (input.adjustment || input.quantity > 0) &&
          input.reason.trim(),
        "QUANTITY_INVALID",
        "Valid quantity and reason required",
      );
      const r = await c.query(
        "UPDATE variants SET sellable_qty=sellable_qty+$2 WHERE id=$1 AND sellable_qty+$2>=committed_qty RETURNING id",
        [input.variant_id, input.quantity],
      );
      need(
        r.rowCount,
        "STOCK_CONFLICT",
        "Adjustment would invalidate committed stock",
      );
      await c.query(
        "INSERT INTO inventory_movements(variant_id,actor_id,kind,quantity_delta,idempotency_key,reason) VALUES($1,$2,$3,$4,$5,$6)",
        [
          input.variant_id,
          a.id,
          input.adjustment ? "adjustment" : "receipt",
          input.quantity,
          input.key,
          input.reason,
        ],
      );
      await c.query(
        "UPDATE inventory_movements SET physical_delta=quantity_delta,sellable_delta=quantity_delta WHERE idempotency_key=$1",
        [input.key],
      );
      return { variant_id: input.variant_id };
    },
  );
}
export async function collectCod(
  c: PoolClient,
  id: string,
  amount: number,
  evidence: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "cod.collect",
    { id, amount, evidence, a: a.id },
    async () => {
      const o = await lockedOrder(c, id);
      need(
        o.payment_method === "cod" &&
          amount === money(o.total_minor) &&
          evidence.trim(),
        "COD_INVALID",
        "Exact COD amount and collection evidence required",
      );
      const ship = await c.query(
        "SELECT id FROM shipments WHERE order_id=$1 AND status='delivered'",
        [id],
      );
      need(
        ship.rowCount,
        "DELIVERY_REQUIRED",
        "Verify delivery before recording cash collection",
      );
      const r = await c.query(
        "INSERT INTO cod_collections(order_id,amount_minor,collected_at,proof_ref,verified_by,verified_at) VALUES($1,$2,now(),$3,$4,now()) RETURNING id",
        [id, amount, evidence, a.id],
      );
      await c.query(
        "INSERT INTO funding_events(order_id,source,source_ref,amount_minor,verified,verified_by,verified_at) VALUES($1,'cod_customer_collection',$2,$3,true,$4,now())",
        [id, `cod:${r.rows[0].id}`, amount, a.id],
      );
      await audit(c, a, "cod.collect", id, evidence);
      return { id: r.rows[0].id };
    },
  );
}
export type RefundInput = {
  order_id: string;
  funding_event_id: string;
  items: { order_item_id: string; quantity: number }[];
  shipping_minor: number;
  reason: string;
  key: string;
};
export async function reserveRefund(
  c: PoolClient,
  input: RefundInput,
  a: Actor,
) {
  owner(a);
  return command(
    c,
    input.key,
    "refund.reserve",
    { ...input, a: a.id },
    async () => {
      const o = await lockedOrder(c, input.order_id);
      const f = await c.query(
        "SELECT * FROM funding_events WHERE id=$1 AND order_id=$2 AND verified=true FOR UPDATE",
        [input.funding_event_id, o.id],
      );
      need(
        f.rowCount,
        "FUNDING_REQUIRED",
        "Verified customer payment required",
      );
      need(
        input.reason.trim() && input.items.length > 0,
        "REFUND_INVALID",
        "Refund items and reason required",
      );
      const used = await c.query(
        "SELECT coalesce(sum(amount_minor),0) used FROM refunds WHERE funding_event_id=$1 AND status NOT IN ('requested','failed')",
        [input.funding_event_id],
      );
      const shippingUsed = await c.query(
        "SELECT coalesce(sum(shipping_minor),0) shipping FROM refunds WHERE order_id=$1 AND status NOT IN ('requested','failed')",
        [o.id],
      );
      let total = money(input.shipping_minor);
      need(
        total <= money(o.delivery_minor) - money(shippingUsed.rows[0].shipping),
        "REFUND_CAPACITY",
        "Shipping refund exceeds capacity",
      );
      const lines = [];
      const seen = new Set<string>();
      for (const item of [...input.items].sort((x, y) =>
        x.order_item_id.localeCompare(y.order_item_id),
      )) {
        need(
          !seen.has(item.order_item_id) &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
          "REFUND_INVALID",
          "Duplicate or invalid quantity",
        );
        seen.add(item.order_item_id);
        const ir = await c.query(
          "SELECT * FROM order_items WHERE id=$1 AND order_id=$2 FOR UPDATE",
          [item.order_item_id, o.id],
        );
        need(ir.rowCount, "ITEM_INVALID", "Item not in order");
        const i = ir.rows[0];
        const prior = await c.query(
          "SELECT coalesce(sum(ri.quantity),0) quantity FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id WHERE ri.order_item_id=$1 AND r.status NOT IN ('requested','failed')",
          [i.id],
        );
        const quantityUsed = Number(prior.rows[0].quantity);
        let eligible = i.quantity;
        if (o.status !== "cancelled") {
          const received = await c.query(
            "SELECT coalesce(sum(ri.quantity),0) qty FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND ri.received_at IS NOT NULL AND ri.inspection IS NOT NULL",
            [i.id],
          );
          eligible = Number(received.rows[0].qty);
        }
        need(
          quantityUsed + item.quantity <= eligible,
          "REFUND_QUANTITY",
          "Quantity exceeds inspected/cancelled eligible units",
        );
        // Persisted per-unit allocation prevents later price/discount edits changing partial refunds.
        const allocated = await c.query(
          "SELECT u.unit_index,u.gross_minor,u.discount_minor FROM order_item_unit_allocations u WHERE u.order_item_id=$1 AND NOT EXISTS(SELECT 1 FROM refund_unit_allocations ru JOIN refunds r ON r.id=ru.refund_id WHERE ru.order_item_id=u.order_item_id AND ru.unit_index=u.unit_index AND r.status NOT IN ('requested','failed')) ORDER BY u.unit_index LIMIT $2",
          [i.id, item.quantity],
        );
        const hasAllocations = await c.query(
          "SELECT 1 FROM order_item_unit_allocations WHERE order_item_id=$1 LIMIT 1",
          [i.id],
        );
        need(
          !hasAllocations.rowCount || allocated.rowCount === item.quantity,
          "REFUND_QUANTITY",
          "All eligible units are already committed",
        );
        const discount = allocated.rows.reduce(
          (sum, row) => sum + money(row.discount_minor),
          0,
        );
        const amount =
          allocated.rowCount === item.quantity
            ? allocated.rows.reduce(
                (sum, row) =>
                  sum + money(row.gross_minor) - money(row.discount_minor),
                0,
              )
            : money(i.unit_minor) * item.quantity;
        total += amount;
        lines.push({
          ...item,
          amount,
          discount,
          unit_indices: allocated.rows.map((row) => row.unit_index as number),
        });
      }
      need(
        total > 0 &&
          total <= money(f.rows[0].amount_minor) - money(used.rows[0].used),
        "REFUND_CAPACITY",
        "Insufficient refundable capacity including outstanding refunds",
      );
      const refund = await c.query(
        "INSERT INTO refunds(order_id,funding_event_id,amount_minor,shipping_minor,status,reason,idempotency_key) VALUES($1,$2,$3,$4,'approved',$5,$6) RETURNING id,status",
        [
          o.id,
          input.funding_event_id,
          total,
          input.shipping_minor,
          input.reason,
          input.key,
        ],
      );
      for (const item of lines) {
        await c.query(
          "INSERT INTO refund_items(refund_id,order_item_id,quantity,amount_minor,discount_minor) VALUES($1,$2,$3,$4,$5)",
          [
            refund.rows[0].id,
            item.order_item_id,
            item.quantity,
            item.amount,
            item.discount,
          ],
        );
        for (const index of item.unit_indices)
          await c.query(
            "INSERT INTO refund_unit_allocations(refund_id,order_item_id,unit_index) VALUES($1,$2,$3)",
            [refund.rows[0].id, item.order_item_id, index],
          );
      }
      await audit(c, a, "refund.reserve", o.id, input.reason);
      await notify(
        c,
        o.id,
        "refund.approved",
        `refund-approved:${refund.rows[0].id}`,
      );
      return { ...refund.rows[0], amount_minor: total };
    },
  );
}
export async function submitRefund(
  c: PoolClient,
  id: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "refund.submit", { id, a: a.id }, async () => {
    const r = await c.query("SELECT * FROM refunds WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    need(r.rowCount, "NOT_FOUND", "Refund not found");
    const refund = r.rows[0];
    need(
      refund.status === "approved",
      "STATE_INVALID",
      "Refund already submitted or must be reconciled",
    );
    const f = await c.query("SELECT source FROM funding_events WHERE id=$1", [
      refund.funding_event_id,
    ]);
    await c.query(
      "INSERT INTO refund_payout_attempts(refund_id,channel,status,amount_minor) VALUES($1,$2,'pending',$3)",
      [
        id,
        f.rows[0].source === "online" ? "provider" : "manual_cod",
        refund.amount_minor,
      ],
    );
    await c.query("UPDATE refunds SET status='pending' WHERE id=$1", [id]);
    await notify(
      c,
      refund.order_id,
      "refund.pending",
      `refund-submitted:${id}`,
    );
    return { status: "pending" };
  });
}
export async function reconcileRefund(
  c: PoolClient,
  id: string,
  status: "succeeded" | "failed" | "unknown",
  evidence: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "refund.reconcile",
    { id, status, evidence, a: a.id },
    async () => {
      need(
        evidence.trim(),
        "EVIDENCE_REQUIRED",
        "Payout reference/evidence required",
      );
      const r = await c.query("SELECT * FROM refunds WHERE id=$1 FOR UPDATE", [
        id,
      ]);
      need(r.rowCount, "NOT_FOUND", "Refund not found");
      need(
        ["pending", "unknown", "reconciliation_required"].includes(
          r.rows[0].status,
        ),
        "STATE_INVALID",
        "Refund requires submission first",
      );
      await c.query("UPDATE refunds SET status=$2 WHERE id=$1", [id, status]);
      await c.query(
        "UPDATE refund_payout_attempts SET status=$2,evidence_ref=$3 WHERE refund_id=$1 AND status IN ('pending','unknown')",
        [id, status, evidence],
      );
      await audit(c, a, `refund.${status}`, r.rows[0].order_id, evidence);
      await notify(
        c,
        r.rows[0].order_id,
        `refund.${status}`,
        `refund-reconciled:${key}`,
      );
      return { status };
    },
  );
}
export async function requestReturn(
  c: PoolClient,
  id: string,
  items: { order_item_id: string; quantity: number }[],
  reason: string,
  a: Actor,
  key: string,
) {
  return command(
    c,
    key,
    "return.request",
    { id, items, reason, a: a.id },
    async () => {
      await lockedOrder(c, id);
      const ship = await c.query(
        "SELECT id FROM shipments WHERE order_id=$1 AND status IN ('delivered','return_to_origin','returned_to_store')",
        [id],
      );
      need(
        ship.rowCount,
        "STATE_INVALID",
        "Order must have delivered or returned shipment",
      );
      need(
        items.length && reason.trim(),
        "RETURN_INVALID",
        "Items and reason required",
      );
      const result = await c.query(
        "INSERT INTO returns(order_id,status,reason) VALUES($1,'requested',$2) RETURNING id,status",
        [id, reason],
      );
      for (const item of items) {
        const ir = await c.query(
          "SELECT quantity FROM order_items WHERE id=$1 AND order_id=$2",
          [item.order_item_id, id],
        );
        const prior = await c.query(
          "SELECT coalesce(sum(ri.quantity),0) quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status<>'rejected'",
          [item.order_item_id],
        );
        need(
          ir.rowCount &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity + Number(prior.rows[0].quantity) <=
              ir.rows[0].quantity,
          "RETURN_QUANTITY",
          "Return quantity exceeds purchased units",
        );
        await c.query(
          "INSERT INTO return_items(return_id,order_item_id,quantity) VALUES($1,$2,$3)",
          [result.rows[0].id, item.order_item_id, item.quantity],
        );
      }
      await notify(
        c,
        id,
        "return.requested",
        `return-requested:${result.rows[0].id}`,
      );
      return result.rows[0];
    },
  );
}
export async function authorizeReturn(
  c: PoolClient,
  id: string,
  approved: boolean,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "return.authorize",
    { id, approved, a: a.id },
    async () => {
      const r = await c.query(
        "UPDATE returns SET status=$2 WHERE id=$1 AND status='requested' RETURNING id,status",
        [id, approved ? "authorized" : "rejected"],
      );
      need(r.rowCount, "STATE_INVALID", "Return is not awaiting authorization");
      return r.rows[0];
    },
  );
}
export async function receiveReturn(
  c: PoolClient,
  id: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "return.receive", { id, a: a.id }, async () => {
    const r = await c.query("SELECT * FROM returns WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    need(
      r.rowCount && ["authorized", "in_transit"].includes(r.rows[0].status),
      "STATE_INVALID",
      "Return is not authorized/in transit",
    );
    const items = await c.query(
      "SELECT ri.*,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1 ORDER BY oi.variant_id FOR UPDATE OF ri",
      [id],
    );
    for (const item of items.rows) {
      await c.query(
        "UPDATE variants SET quarantined_qty=quarantined_qty+$2 WHERE id=$1",
        [item.variant_id, item.quantity],
      );
      await c.query(
        "UPDATE return_items SET received_at=now(),disposition='quarantined' WHERE id=$1",
        [item.id],
      );
      await c.query(
        "INSERT INTO inventory_movements(variant_id,actor_id,kind,quantity_delta,idempotency_key,reason,physical_delta,quarantine_delta) VALUES($1,$2,'return_receipt',$3,$4,'Authorized return received into quarantine',$3,$3)",
        [item.variant_id, a.id, item.quantity, `return-receipt:${item.id}`],
      );
    }
    await c.query("UPDATE returns SET status='received' WHERE id=$1", [id]);
    return { status: "received" };
  });
}
export async function inspectReturn(
  c: PoolClient,
  id: string,
  condition: "sellable" | "damaged" | "unavailable",
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "return.inspect",
    { id, condition, a: a.id },
    async () => {
      const parent = await c.query(
        "SELECT return_id FROM return_items WHERE id=$1",
        [id],
      );
      need(parent.rowCount, "NOT_FOUND", "Return item missing");
      await c.query("SELECT id FROM returns WHERE id=$1 FOR UPDATE", [
        parent.rows[0].return_id,
      ]);
      const r = await c.query(
        "SELECT ri.*,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.id=$1 FOR UPDATE OF ri",
        [id],
      );
      need(
        r.rowCount && r.rows[0].received_at && !r.rows[0].inspection,
        "STATE_INVALID",
        "Item not received or already inspected",
      );
      const item = r.rows[0];
      if (condition === "sellable") {
        await c.query(
          "UPDATE variants SET quarantined_qty=quarantined_qty-$2,sellable_qty=sellable_qty+$2 WHERE id=$1",
          [item.variant_id, item.quantity],
        );
        await c.query(
          "INSERT INTO inventory_movements(variant_id,actor_id,kind,quantity_delta,idempotency_key,reason) VALUES($1,$2,'restock',$3,$4,'Inspected sellable return')",
          [item.variant_id, a.id, item.quantity, key],
        );
        await c.query(
          "UPDATE inventory_movements SET sellable_delta=quantity_delta,quarantine_delta=-quantity_delta WHERE idempotency_key=$1",
          [key],
        );
      }
      await c.query(
        "UPDATE return_items SET inspection=$2,disposition=$3,inspected_by=$4,inspected_at=now() WHERE id=$1",
        [
          id,
          condition,
          condition === "sellable" ? "restocked" : "quarantined",
          a.id,
        ],
      );
      await c.query(
        "UPDATE returns SET status='resolved' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM return_items WHERE return_id=$1 AND inspection IS NULL)",
        [item.return_id],
      );
      return {
        inspection: condition,
        disposition: condition === "sellable" ? "restocked" : "quarantined",
      };
    },
  );
}
export async function settlement(
  c: PoolClient,
  input: {
    reference: string;
    allocations: { collection_id: string; amount_minor: number }[];
  },
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "cod.settlement", { ...input, a: a.id }, async () => {
    need(
      input.reference.trim() && input.allocations.length,
      "SETTLEMENT_INVALID",
      "Reference and allocations required",
    );
    const total = input.allocations.reduce(
      (n, l) => n + money(l.amount_minor),
      0,
    );
    money(total);
    need(total > 0, "SETTLEMENT_INVALID", "Positive remittance required");
    const rem = await c.query(
      "INSERT INTO courier_remittances(reference,amount_minor,received_at,recorded_by) VALUES($1,$2,now(),$3) RETURNING id",
      [input.reference, total, a.id],
    );
    for (const line of [...input.allocations].sort((x, y) =>
      x.collection_id.localeCompare(y.collection_id),
    )) {
      const collection = await c.query(
        "SELECT amount_minor FROM cod_collections WHERE id=$1 FOR UPDATE",
        [line.collection_id],
      );
      need(
        collection.rowCount && line.amount_minor > 0,
        "COLLECTION_INVALID",
        "Collection missing",
      );
      const prior = await c.query(
        "SELECT coalesce(sum(amount_minor),0) amount FROM remittance_allocations WHERE collection_id=$1",
        [line.collection_id],
      );
      need(
        line.amount_minor + money(prior.rows[0].amount) <=
          money(collection.rows[0].amount_minor),
        "SETTLEMENT_CAPACITY",
        "Allocation exceeds collection",
      );
      await c.query(
        "INSERT INTO remittance_allocations(remittance_id,collection_id,amount_minor) VALUES($1,$2,$3)",
        [rem.rows[0].id, line.collection_id, line.amount_minor],
      );
    }
    return { id: rem.rows[0].id, amount_minor: total };
  });
}
export async function requestCancellation(
  c: PoolClient,
  id: string,
  reason: string,
  a: Actor,
  key: string,
) {
  return command(
    c,
    key,
    "cancellation.request",
    { id, reason, a: a.id },
    async () => {
      const o = await lockedOrder(c, id);
      need(
        [
          "pending_payment",
          "awaiting_cod_confirmation",
          "confirmed",
          "processing",
        ].includes(o.status),
        "STATE_INVALID",
        "Cancellation unavailable",
      );
      need(reason.trim(), "REASON_REQUIRED", "Cancellation reason required");
      const shipped = await c.query(
        "SELECT id FROM shipments WHERE order_id=$1 AND status IN ('dispatched','delivered','delivery_failed','return_to_origin','returned_to_store')",
        [id],
      );
      need(
        !shipped.rowCount,
        "ALREADY_DISPATCHED",
        "Use return workflow after dispatch",
      );
      await c.query(
        "UPDATE orders SET cancellation_previous_status=status,status='cancellation_requested' WHERE id=$1",
        [id],
      );
      await audit(c, a, "cancellation.request", id, reason);
      return { status: "cancellation_requested" };
    },
  );
}
export async function rejectCancellation(
  c: PoolClient,
  id: string,
  reason: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "cancellation.reject",
    { id, reason, a: a.id },
    async () => {
      const o = await lockedOrder(c, id);
      need(
        o.status === "cancellation_requested" && o.cancellation_previous_status,
        "STATE_INVALID",
        "No pending cancellation request",
      );
      need(reason.trim(), "REASON_REQUIRED", "Rejection reason required");
      await c.query(
        "UPDATE orders SET status=cancellation_previous_status,cancellation_previous_status=null WHERE id=$1",
        [id],
      );
      await audit(c, a, "cancellation.reject", id, reason);
      return { status: o.cancellation_previous_status };
    },
  );
}
export async function updateShipment(
  c: PoolClient,
  id: string,
  status:
    | "delivered"
    | "delivery_failed"
    | "retry_scheduled"
    | "return_to_origin"
    | "returned_to_store",
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "shipment.update",
    { id, status, a: a.id },
    async () => {
      const o = await lockedOrder(c, id);
      const r = await c.query(
        "SELECT * FROM shipments WHERE order_id=$1 FOR UPDATE",
        [id],
      );
      need(r.rowCount, "NOT_FOUND", "Shipment missing");
      const edges: Record<string, string[]> = {
        dispatched: ["delivered", "delivery_failed"],
        delivery_failed: ["retry_scheduled", "return_to_origin"],
        retry_scheduled: ["delivered", "delivery_failed"],
        return_to_origin: ["returned_to_store"],
      };
      need(
        edges[r.rows[0].status]?.includes(status),
        "STATE_INVALID",
        "Invalid shipment transition",
      );
      await c.query("UPDATE shipments SET status=$2 WHERE order_id=$1", [
        id,
        status,
      ]);
      if (status === "delivered")
        await c.query("UPDATE orders SET status='completed' WHERE id=$1", [id]);
      await audit(c, a, "shipment.update", o.id, status);
      await notify(c, id, `shipment.${status}`, `shipment:${key}`);
      return { status };
    },
  );
}
export async function resolveWarranty(
  c: PoolClient,
  id: string,
  resolution: string,
  approved: boolean,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "warranty.resolve",
    { id, resolution, approved, a: a.id },
    async () => {
      need(resolution.trim(), "REASON_REQUIRED", "Resolution required");
      const r = await c.query(
        "UPDATE warranty_claims SET status=$2,resolution=$3 WHERE id=$1 AND status IN ('requested','reviewing','approved') RETURNING id,status",
        [id, approved ? "resolved" : "rejected", resolution],
      );
      need(
        r.rowCount,
        "STATE_INVALID",
        "Warranty case missing or already resolved",
      );
      return r.rows[0];
    },
  );
}
export async function retryPayment(c: PoolClient, id: string, key: string) {
  return command(c, key, "payment.retry", { id }, async () => {
    const o = await lockedOrder(c, id);
    need(
      o.payment_method === "online" && o.status === "pending_payment",
      "STATE_INVALID",
      "Order does not accept payment retry",
    );
    const p = await c.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1 AND status IN ('pending','created','succeeded','reconciliation_required')",
      [id],
    );
    need(
      !p.rowCount,
      "PAYMENT_UNRESOLVED",
      "Reconcile outstanding attempt before retry",
    );
    const holds = await c.query(
      "SELECT count(*)::int count FROM inventory_commitments WHERE order_id=$1 AND status='active' AND expires_at>now()",
      [id],
    );
    need(holds.rows[0].count > 0, "RESERVATION_EXPIRED", "Reservation expired");
    const r = await c.query(
      "INSERT INTO payment_attempts(order_id,provider,status,amount_minor,currency) VALUES($1,'development','pending',$2,'BDT') RETURNING id,status",
      [id, o.total_minor],
    );
    return r.rows[0];
  });
}
export async function expireOrder(
  c: PoolClient,
  id: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(c, key, "order.expire", { id, a: a.id }, async () => {
    const o = await lockedOrder(c, id);
    need(
      o.payment_method === "online" && o.status === "pending_payment",
      "STATE_INVALID",
      "Only unpaid online orders expire",
    );
    const active = await c.query(
      "SELECT id FROM inventory_commitments WHERE order_id=$1 AND status='active' AND expires_at>now()",
      [id],
    );
    need(!active.rowCount, "NOT_EXPIRED", "Reservation has not expired");
    const uncertain = await c.query(
      "SELECT id FROM payment_attempts WHERE order_id=$1 AND status NOT IN ('failed','expired')",
      [id],
    );
    need(
      !uncertain.rowCount,
      "PAYMENT_UNRESOLVED",
      "Verify provider outcome before releasing stock",
    );
    await release(c, id);
    await c.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]);
    return { status: "cancelled" };
  });
}
export async function disposeReturnItem(
  c: PoolClient,
  id: string,
  reason: string,
  a: Actor,
  key: string,
) {
  owner(a);
  return command(
    c,
    key,
    "return.dispose",
    { id, reason, a: a.id },
    async () => {
      need(reason.trim(), "REASON_REQUIRED", "Write-off reason required");
      const parent = await c.query(
        "SELECT return_id FROM return_items WHERE id=$1",
        [id],
      );
      need(parent.rowCount, "NOT_FOUND", "Return item missing");
      await c.query("SELECT id FROM returns WHERE id=$1 FOR UPDATE", [
        parent.rows[0].return_id,
      ]);
      const r = await c.query(
        "SELECT ri.*,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.id=$1 FOR UPDATE OF ri",
        [id],
      );
      const item = r.rows[0];
      need(
        ["damaged", "unavailable"].includes(item.inspection) &&
          item.disposition === "quarantined",
        "STATE_INVALID",
        "Only inspected unavailable quarantine can be written off",
      );
      await c.query(
        "UPDATE variants SET quarantined_qty=quarantined_qty-$2 WHERE id=$1",
        [item.variant_id, item.quantity],
      );
      await c.query(
        "UPDATE return_items SET disposition='disposed' WHERE id=$1",
        [id],
      );
      await c.query(
        "INSERT INTO inventory_movements(variant_id,actor_id,kind,quantity_delta,idempotency_key,reason,physical_delta,quarantine_delta) VALUES($1,$2,'damage',$3,$4,$5,$3,$3)",
        [item.variant_id, a.id, -item.quantity, key, reason],
      );
      return { disposition: "disposed" };
    },
  );
}

/** Largest remainder over individual purchased units, stable variant/unit order; exact integer arithmetic. */
export function allocateUnitDiscounts(
  lines: { unit_minor: number; quantity: number }[],
  discount: number,
): number[][] {
  const units = lines.flatMap((line, index) =>
    Array.from({ length: line.quantity }, (_, unit) => ({
      index,
      unit,
      gross: BigInt(line.unit_minor),
    })),
  );
  const subtotal = units.reduce((sum, u) => sum + u.gross, 0n);
  need(
    Number.isSafeInteger(discount) &&
      discount >= 0 &&
      BigInt(discount) <= subtotal,
    "DISCOUNT_INVALID",
    "Discount exceeds subtotal",
  );
  const result = lines.map((line) => Array<number>(line.quantity).fill(0));
  if (subtotal === 0n || discount === 0) return result;
  const parts = units.map((u, index) => ({
    ...u,
    index,
    amount: Number((BigInt(discount) * u.gross) / subtotal),
    remainder: (BigInt(discount) * u.gross) % subtotal,
  }));
  let remaining = discount - parts.reduce((sum, u) => sum + u.amount, 0);
  const sorted = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const u of sorted) {
    if (remaining <= 0) break;
    u.amount++;
    remaining--;
  }
  for (const u of parts) result[units[u.index].index][u.unit] = u.amount;
  return result;
}
