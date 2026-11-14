import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getIdentity,
  requireOwner,
  requireSameOrigin,
  AccessError,
  customerIdForIdentity,
} from "@/lib/auth-access";
import { catalog } from "@/modules/store/catalog";
import { saveVariantDetails } from "@/modules/catalog/commands";
import * as commerce from "@/modules/commerce/service";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const development =
  process.env.NODE_ENV !== "production" &&
  process.env.STORE_DEV_ADAPTERS === "true";
async function session(req: NextRequest) {
  let token = req.cookies.get("shop")?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    token = randomBytes(32).toString("base64url");
  const id = digest(token);
  await db.query(
    "insert into shopping_sessions(id) values($1) on conflict do nothing",
    [id],
  );
  const valid = await db.query(
    "select id from shopping_sessions where id=$1 and expires_at>now()",
    [id],
  );
  if (!valid.rowCount)
    throw new AccessError(401, "SESSION_EXPIRED", "Shopping session expired");
  return { id, token };
}
function answer(data: unknown, token?: string) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "private, no-store");
  if (token)
    res.cookies.set("shop", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 86400,
    });
  return res;
}
async function access(req: NextRequest, orderId: string, sid: string) {
  const own = await db.query(
    "select 1 from guest_order_grants where order_id=$1 and session_id=$2 and expires_at>now() and revoked_at is null",
    [orderId, sid],
  );
  if (own.rowCount) return;
  const identity = await getIdentity(req.headers);
  if (identity) {
    const customer = await customerIdForIdentity(identity.user.id);
    const r = await db.query(
      "select 1 from orders where id=$1 and customer_id=$2",
      [orderId, customer],
    );
    if (r.rowCount) return;
  }
  throw new AccessError(
    403,
    "FORBIDDEN",
    "Valid order ownership proof required",
  );
}
async function cart(sid: string, district = "Dhaka", overrideCode?: string) {
  const items = (
    await db.query(
      `select ci.variant_id,ci.quantity,v.sku,p.name,v.price_minor from cart_items ci join variants v on v.id=ci.variant_id join products p on p.id=v.product_id where session_id=$1 order by v.sku`,
      [sid],
    )
  ).rows.map((r) => ({ ...r, price_minor: Number(r.price_minor) }));
  if (!items.length)
    return {
      items,
      items_minor: 0,
      discount_minor: 0,
      delivery_minor: 0,
      total_minor: 0,
      discount_code: undefined,
      development,
    };
  const code =
    overrideCode ??
    (
      await db.query(
        "select discount_code from shopping_sessions where id=$1",
        [sid],
      )
    ).rows[0]?.discount_code;
  const q = await commerce.transaction(db, (c) =>
    commerce.quote(c, {
      lines: items.map((r) => ({
        variant_id: r.variant_id,
        quantity: r.quantity,
      })),
      district,
      discount_code: code || undefined,
    }),
  );
  return { ...q, discount_code: code, items, development };
}
export async function GET(req: NextRequest) {
  try {
    const s = await session(req);
    const resource = req.nextUrl.searchParams.get("resource") ?? "catalog";
    let data: unknown;
    if (resource === "catalog") data = { products: await catalog(db) };
    else if (resource === "cart")
      data = await cart(
        s.id,
        req.nextUrl.searchParams.get("district") ?? "Dhaka",
      );
    else if (resource === "orders") {
      const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
      await access(req, id, s.id);
      const order = (
        await db.query(
          "select id,status,payment_method,total_minor,created_at from orders where id=$1",
          [id],
        )
      ).rows[0];
      const detail: Record<string, unknown> = { order, development };
      for (const [key, table] of Object.entries({
        items: "order_items",
        shipments: "shipments",
        payments: "payment_attempts",
        returns: "returns",
        refunds: "refunds",
      }))
        detail[key] = (
          await db.query(`select * from ${table} where order_id=$1`, [id])
        ).rows;
      data = detail;
    } else if (resource === "admin.order") {
      const identity = await requireOwner(req.headers);
      const id = z.string().uuid().parse(req.nextUrl.searchParams.get("id"));
      data = await commerce.transaction(db, async (c) => {
        const order = (
          await c.query("select * from orders where id=$1 for update", [id])
        ).rows[0];
        if (!order)
          throw new AccessError(404, "ORDER_NOT_FOUND", "Order not found");
        const detail: Record<string, unknown> = { order };
        for (const [key, table] of Object.entries({
          items: "order_items",
          payments: "payment_attempts",
          shipments: "shipments",
          returns: "returns",
          refunds: "refunds",
          funding_events: "funding_events",
          support_notes: "order_support_notes",
        }))
          detail[key] = (
            await c.query(
              `select * from ${table} where order_id=$1 order by ${table === "order_items" ? "id" : "created_at"}`,
              [id],
            )
          ).rows;
        detail.return_items = (
          await c.query(
            "select ri.* from return_items ri join returns r on r.id=ri.return_id where r.order_id=$1",
            [id],
          )
        ).rows;
        detail.refund_items = (
          await c.query(
            "select ri.* from refund_items ri join refunds r on r.id=ri.refund_id where r.order_id=$1",
            [id],
          )
        ).rows;
        detail.warranty_claims = (
          await c.query(
            "select w.* from warranty_claims w join order_items oi on oi.id=w.order_item_id where oi.order_id=$1",
            [id],
          )
        ).rows;
        detail.refund_eligibility = await commerce.getRefundEligibility(c, id, {
          id: identity.user.id,
          role: "owner",
        });
        return detail;
      });
    } else if (resource === "reports") {
      await requireOwner(req.headers);
      data = {
        ...(
          await db.query(
            "select count(*)::int order_count,coalesce(sum(total_minor),0)::text placed_order_value_minor from orders",
          )
        ).rows[0],
        ...(
          await db.query(
            "select coalesce(sum(amount_minor),0)::text verified_collections_minor from funding_events where verified=true",
          )
        ).rows[0],
        ...(
          await db.query(
            "select coalesce(sum(amount_minor),0)::text completed_refunds_minor from refunds where status='succeeded'",
          )
        ).rows[0],
        ...(
          await db.query(
            "select coalesce(sum(amount_minor),0)::text courier_remittances_minor from courier_remittances",
          )
        ).rows[0],
        ...(
          await db.query(
            "select (select coalesce(sum(amount_minor),0) from cod_collections)-(select coalesce(sum(amount_minor),0) from remittance_allocations) as cod_unremitted_minor",
          )
        ).rows[0],
      };
    } else if (resource === "content") {
      data = {
        pages: (await db.query("select * from store_content order by slug"))
          .rows,
      };
    } else if (resource === "account") {
      const identity = await getIdentity(req.headers);
      if (!identity) throw new AccessError(401, "LOGIN_REQUIRED");
      const cid = await customerIdForIdentity(identity.user.id);
      data = {
        orders: (
          await db.query(
            "select id,status,total_minor,created_at from orders where customer_id=$1 order by created_at desc",
            [cid],
          )
        ).rows,
      };
    } else if (resource === "admin") {
      await requireOwner(req.headers);
      const result: Record<string, unknown> = {
        products: await catalog(db, { includeDrafts: true }),
      };
      for (const [key, query] of Object.entries({
        shipments: "select * from shipments",
        remittance_allocations: "select * from remittance_allocations",
        inventory_movements:
          "select * from inventory_movements order by created_at desc limit 500",
        inventory:
          "select v.*,p.name from variants v join products p on p.id=v.product_id",
        orders: "select * from orders order by created_at desc limit 100",
        returns: "select * from returns order by created_at desc limit 100",
        refunds: "select * from refunds order by created_at desc limit 100",
        warranty_claims: "select * from warranty_claims",
        order_items: "select * from order_items",
        return_items: "select * from return_items",
        funding_events: "select * from funding_events",
        collections: "select * from cod_collections",
        customers: "select id,email,phone_e164,created_at from customers",
        support_notes:
          "select * from order_support_notes order by created_at desc limit 100",
        notification_templates: "select * from notification_templates",
        payment_attempts:
          "select * from payment_attempts order by created_at desc limit 100",
        settings: "select * from store_settings",
        shipping_rates: "select * from shipping_rates",
        discounts: "select * from discounts",
        audit: "select * from audit_events order by created_at desc limit 100",
        notifications:
          "select * from outbox order by created_at desc limit 100",
        local_deliveries:
          "select * from local_deliveries order by created_at desc limit 100",
        content: "select * from store_content",
        remittances: "select * from courier_remittances",
      }))
        result[key] = (await db.query(query)).rows;
      data = result;
    } else throw new AccessError(404, "NOT_FOUND", "Unknown resource");
    return answer(data, s.token);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const body = await req.json();
    if (body.action === "session.restart") {
      const token = randomBytes(32).toString("base64url");
      await db.query("insert into shopping_sessions(id) values($1)", [
        digest(token),
      ]);
      return answer({ restarted: true }, token);
    }
    const s = await session(req);
    const action = z.string().parse(body.action);
    let data: unknown;
    if (action === "cart.add") {
      const v = z.string().uuid().parse(body.variant_id),
        q = z.number().int().min(1).max(99).parse(body.quantity);
      await db.query(
        `insert into cart_items(session_id,variant_id,quantity) values($1,$2,$3) on conflict(session_id,variant_id) do update set quantity=excluded.quantity`,
        [s.id, v, q],
      );
      data = await cart(s.id);
    } else if (action === "cart.remove") {
      await db.query(
        "delete from cart_items where session_id=$1 and variant_id=$2",
        [s.id, z.string().uuid().parse(body.variant_id)],
      );
      data = await cart(s.id);
    } else if (action === "discount.apply") {
      const code = z.string().max(60).parse(body.code).trim().toUpperCase();
      data = await cart(s.id, "Dhaka", code);
      await db.query(
        "update shopping_sessions set discount_code=$2 where id=$1",
        [s.id, code || null],
      );
    } else if (action === "quote")
      data = await cart(s.id, z.string().parse(body.district));
    else if (action === "checkout") {
      if (!development)
        throw new AccessError(
          503,
          "LAUNCH_DISABLED",
          "Commercial checkout is not enabled",
        );
      const httpKey = z.string().min(8).parse(body.idempotency_key);
      const requestHash = digest(JSON.stringify(body));
      const existing = await db.query(
        "select * from http_checkout_results where session_id=$1 and key=$2",
        [s.id, httpKey],
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_hash !== requestHash)
          throw new AccessError(409, "KEY_REUSE");
        return answer({ order_id: existing.rows[0].order_id }, s.token);
      }
      const c = await cart(s.id, body.address?.district);
      const address = z
        .object({
          district: z.string().min(1),
          city_upazila: z.string().min(1),
          area: z.string().min(1),
          street: z.string().min(1),
        })
        .parse(body.address);
      const result = await commerce.transaction(db, async (client) => {
        const order = await commerce.checkout(client, {
          lines: c.items.map((i) => ({
            variant_id: i.variant_id,
            quantity: i.quantity,
          })),
          district: address.district,
          key: z.string().min(8).parse(body.idempotency_key),
          session_id: s.id,
          name: z.string().min(1).max(100).parse(body.guest_name),
          phone: z.string().parse(body.guest_phone).replace(/^01/, "+8801"),
          email: body.guest_email || undefined,
          address,
          payment_method: z.enum(["cod", "online"]).parse(body.payment_method),
          discount_code: c.discount_code || undefined,
          expected_total_minor: z
            .number()
            .int()
            .nonnegative()
            .parse(body.expected_total_minor),
          policy_version: "development-only",
        });
        await client.query(
          "insert into guest_order_grants(session_id,order_id) values($1,$2) on conflict do nothing",
          [s.id, order.id],
        );
        await client.query(
          "insert into http_checkout_results(session_id,key,request_hash,order_id) values($1,$2,$3,$4) on conflict do nothing",
          [s.id, httpKey, requestHash, order.id],
        );
        await client.query("delete from cart_items where session_id=$1", [
          s.id,
        ]);
        return order;
      });
      data = { order_id: result.id, status: result.status };
    } else if (action === "payment.retry") {
      const id = z.string().uuid().parse(body.order_id);
      await access(req, id, s.id);
      data = await commerce.transaction(db, (c) =>
        commerce.retryPayment(c, id, randomBytes(16).toString("hex")),
      );
    } else if (action === "payment.simulate") {
      if (!development)
        throw new AccessError(404, "NOT_FOUND", "Adapter unavailable");
      const id = z.string().uuid().parse(body.order_id);
      await access(req, id, s.id);
      const p = (
        await db.query(
          "select * from payment_attempts where order_id=$1 order by created_at desc limit 1",
          [id],
        )
      ).rows[0];
      if (!p) throw new Error("Payment attempt missing");
      data = await commerce.transaction(db, (c) =>
        commerce.paymentEvent(c, {
          event_id: randomBytes(16).toString("hex"),
          attempt_id: p.id,
          status:
            body.outcome === "success"
              ? "succeeded"
              : z.enum(["failed", "pending"]).parse(body.outcome),
          amount_minor: Number(p.amount_minor),
          currency: "BDT",
          reference: `dev:${p.id}`,
          provider: "development",
        }),
      );
    } else if (action === "request") {
      const id = z.string().uuid().parse(body.order_id);
      await access(req, id, s.id);
      const kind = z.enum(["cancel", "return", "warranty"]).parse(body.kind),
        reason = z.string().min(3).max(1000).parse(body.reason),
        key = z.string().min(8).parse(body.idempotency_key),
        actor = { id: s.id, role: "guest" as const };
      data = await commerce.transaction(db, async (c) => {
        if (kind === "cancel")
          return commerce.requestCancellation(c, id, reason, actor, key);
        if (kind === "return")
          return commerce.requestReturn(
            c,
            id,
            [
              {
                order_item_id: z.string().uuid().parse(body.order_item_id),
                quantity: z.number().int().positive().parse(body.quantity),
              },
            ],
            reason,
            actor,
            key,
          );
        const item = await c.query(
          "select id from order_items where id=$1 and order_id=$2",
          [body.order_item_id, id],
        );
        if (!item.rowCount) throw new AccessError(403, "FORBIDDEN");
        return (
          await c.query(
            "insert into warranty_claims(order_item_id,status,reason) values($1,'requested',$2) returning id,status",
            [body.order_item_id, reason],
          )
        ).rows[0];
      });
    } else if (action === "recovery.start") {
      if (!development)
        throw new AccessError(
          503,
          "RECOVERY_CHANNEL_UNAVAILABLE",
          "Contact support through the published store channel",
        );
      const id = z.string().uuid().parse(body.order_id),
        email = z.string().email().parse(body.email);
      const order = await db.query(
        "select id from orders where id=$1 and lower(guest_email)=lower($2)",
        [id, email],
      );
      if (order.rowCount) {
        const count = await db.query(
          "select count(*) n from guest_recovery_challenges where order_id=$1 and created_at>now()-interval '1 hour'",
          [id],
        );
        if (Number(count.rows[0].n) < 3) {
          const code = String(randomInt(100000, 1000000));
          await commerce.transaction(db, async (c) => {
            const challenge = (
              await c.query(
                "insert into guest_recovery_challenges(order_id,code_hash) values($1,$2) returning id",
                [id, digest(code)],
              )
            ).rows[0];
            const job = (
              await c.query(
                "insert into outbox(topic,payload,status) values('guest.recovery',$1,'delivered') returning id",
                [JSON.stringify({ order_id: id, challenge_id: challenge.id })],
              )
            ).rows[0];
            await c.query(
              "insert into local_deliveries(outbox_id,payload) values($1,$2)",
              [
                job.id,
                JSON.stringify({
                  challenge_id: challenge.id,
                  code,
                  development_only: true,
                }),
              ],
            );
          });
        }
      }
      data = {
        message:
          "If details match, a recovery challenge was sent using the configured channel.",
      };
    } else if (action === "recovery.complete") {
      data = await commerce.transaction(db, async (c) => {
        const challenge = (
          await c.query(
            "select * from guest_recovery_challenges where id=$1 for update",
            [z.string().uuid().parse(body.challenge_id)],
          )
        ).rows[0];
        if (
          !challenge ||
          challenge.used_at ||
          new Date(challenge.expires_at) < new Date() ||
          challenge.attempts >= 5
        )
          throw new AccessError(403, "PROOF_INVALID");
        await c.query(
          "update guest_recovery_challenges set attempts=attempts+1 where id=$1",
          [challenge.id],
        );
        if (challenge.code_hash !== digest(z.string().parse(body.code)))
          return { verified: false };
        await c.query(
          "update guest_recovery_challenges set used_at=now() where id=$1",
          [challenge.id],
        );
        await c.query(
          "update guest_order_grants set revoked_at=now() where order_id=$1",
          [challenge.order_id],
        );
        await c.query(
          "insert into guest_order_grants(session_id,order_id) values($1,$2) on conflict(session_id,order_id) do update set expires_at=now()+interval '30 days',revoked_at=null",
          [s.id, challenge.order_id],
        );
        return { verified: true, order_id: challenge.order_id };
      });
    } else if (action === "account.link") {
      const identity = await getIdentity(req.headers);
      if (!identity)
        throw new AccessError(401, "LOGIN_REQUIRED", "Sign in first");
      const id = z.string().uuid().parse(body.order_id);
      await access(req, id, s.id);
      const customer = await customerIdForIdentity(identity.user.id);
      await db.query(
        "update orders set customer_id=$2 where id=$1 and customer_id is null",
        [id, customer],
      );
      data = { linked: true };
    } else if (action === "admin.command") {
      const identity = await requireOwner(req.headers);
      const actor = { id: identity.user.id, role: "owner" as const };
      const id = body.order_id;
      const key = z
        .string()
        .min(8)
        .parse(
          body.idempotency_key ?? body.key ?? randomBytes(16).toString("hex"),
        );
      data = await commerce.transaction(db, async (c) => {
        await c.query(
          "insert into audit_events(actor_id,action,entity_type,reason,metadata) values($1,'admin.command','store',$2,$3)",
          [
            actor.id,
            String(body.reason ?? body.command).slice(0, 1000),
            JSON.stringify({
              command: body.command,
              order_id: body.order_id,
              evidence:
                typeof body.evidence === "string"
                  ? body.evidence.slice(0, 1000)
                  : undefined,
            }),
          ],
        );
        switch (body.command) {
          case "cod.confirm":
            return commerce.confirmCod(c, id, actor, key);
          case "cancel.reject":
            return commerce.rejectCancellation(c, id, body.reason, actor, key);
          case "cancel":
            return commerce.cancelOrder(c, id, actor, key, body.reason);
          case "dispatch":
            return commerce.dispatchOrder(
              c,
              id,
              z.string().min(1).parse(body.tracking_ref),
              actor,
              key,
            );
          case "stock.receipt":
          case "stock.adjust":
            return commerce.stockReceipt(
              c,
              {
                variant_id: z.string().uuid().parse(body.variant_id),
                quantity: z.number().int().parse(body.quantity),
                reason: z.string().min(3).parse(body.reason),
                key,
                adjustment: body.command === "stock.adjust",
              },
              actor,
            );
          case "cash.collect":
            return commerce.collectCod(
              c,
              id,
              z.number().int().positive().parse(body.amount_minor),
              z.string().min(3).parse(body.evidence),
              actor,
              key,
            );
          case "return.authorize":
            return commerce.authorizeReturn(
              c,
              body.return_id,
              z.boolean().parse(body.approved),
              actor,
              key,
            );
          case "return.receive":
            return commerce.receiveReturn(c, body.return_id, actor, key);
          case "return.dispose":
            return commerce.disposeReturnItem(
              c,
              body.return_item_id,
              body.reason,
              actor,
              key,
            );
          case "return.inspect":
            return commerce.inspectReturn(
              c,
              body.return_item_id,
              z
                .enum(["sellable", "damaged", "unavailable"])
                .parse(body.condition),
              actor,
              key,
            );
          case "refund.reserve":
            return commerce.reserveRefund(
              c,
              {
                order_id: id,
                funding_event_id: body.funding_event_id,
                items: body.items,
                shipping_minor: body.shipping_minor ?? 0,
                reason: body.reason,
                key,
              },
              actor,
            );
          case "refund.submit":
            return commerce.submitRefund(c, body.refund_id, actor, key);
          case "refund.reconcile":
            return commerce.reconcileRefund(
              c,
              body.refund_id,
              z.enum(["succeeded", "failed", "unknown"]).parse(body.outcome),
              body.evidence,
              actor,
              key,
            );
          case "settlement":
            return commerce.settlement(
              c,
              { reference: body.reference, allocations: body.allocations },
              actor,
              key,
            );
          case "shipment.update":
            return commerce.updateShipment(c, id, body.status, actor, key);
          case "warranty.resolve":
            return commerce.resolveWarranty(
              c,
              body.claim_id,
              body.resolution,
              z.boolean().parse(body.approved),
              actor,
              key,
            );
          case "return.create":
            return commerce.requestReturn(
              c,
              id,
              body.items,
              body.reason,
              actor,
              key,
            );
          case "discount.save": {
            const d = z
              .object({
                code: z.string().regex(/^[A-Z0-9_-]{3,40}$/),
                amount_minor: z.number().int().positive(),
                usage_limit: z.number().int().positive(),
                ends_at: z.string().datetime(),
                active: z.boolean(),
              })
              .parse(body);
            await c.query(
              "insert into discounts(code,amount_minor,usage_limit,ends_at,active) values($1,$2,$3,$4,$5) on conflict(code) do update set amount_minor=excluded.amount_minor,usage_limit=excluded.usage_limit,ends_at=excluded.ends_at,active=excluded.active",
              [d.code, d.amount_minor, d.usage_limit, d.ends_at, d.active],
            );
            await c.query(
              "update store_settings set value='true' where key='discounts_enabled'",
            );
            return { saved: true };
          }
          case "support.note": {
            await c.query(
              "insert into order_support_notes(order_id,actor_id,note) values($1,$2,$3)",
              [
                z.string().uuid().parse(body.order_id),
                actor.id,
                z.string().min(3).max(2000).parse(body.note),
              ],
            );
            return { saved: true };
          }
          case "notification.template": {
            const t = z
              .object({
                topic: z.string().regex(/^[a-z.]+$/),
                title: z.string().min(1).max(200),
                body: z.string().min(1).max(4000),
              })
              .parse(body);
            await c.query(
              "insert into notification_templates(topic,title,body) values($1,$2,$3) on conflict(topic) do update set title=excluded.title,body=excluded.body,updated_at=now()",
              [t.topic, t.title, t.body],
            );
            return { saved: true };
          }
          case "store.configure": {
            const value = z
              .object({
                cod_enabled: z.boolean(),
                online_enabled: z.boolean(),
                district: z.string().min(1),
                fee_minor: z.number().int().nonnegative(),
                enabled: z.boolean(),
              })
              .parse(body);
            for (const key of ["cod_enabled", "online_enabled"] as const)
              await c.query(
                "update store_settings set value=$2::jsonb where key=$1",
                [key, JSON.stringify(value[key])],
              );
            await c.query(
              "insert into shipping_rates(district,fee_minor,enabled) values($1,$2,$3) on conflict(district) do update set fee_minor=excluded.fee_minor,enabled=excluded.enabled",
              [value.district, value.fee_minor, value.enabled],
            );
            return { saved: true };
          }
          case "variant.details": {
            const parse = (v: unknown, fallback: unknown) => {
              if (typeof v !== "string") return v ?? fallback;
              try {
                return JSON.parse(v || JSON.stringify(fallback));
              } catch {
                throw new AccessError(
                  400,
                  "JSON_INVALID",
                  "Check specifications and compatibility JSON",
                );
              }
            };
            return saveVariantDetails(
              c,
              {
                variant_id: body.variant_id,
                source: body.source,
                models: parse(body.models, []),
                specifications: parse(body.specifications, {}),
                media:
                  body.media === undefined ? undefined : parse(body.media, []),
                remove_specifications: body.remove_specifications,
              },
              actor,
            );
          }
          case "content.save": {
            const p = z
              .object({
                slug: z.string().regex(/^[a-z-]+$/),
                title: z.string().min(1),
                body: z.string().max(20000),
              })
              .parse(body);
            await c.query(
              "insert into store_content(slug,title,body) values($1,$2,$3) on conflict(slug) do update set title=excluded.title,body=excluded.body,version=store_content.version+1,updated_at=now()",
              [p.slug, p.title, p.body],
            );
            return { saved: true };
          }
          case "product.save": {
            const p = z
              .object({
                slug: z.string().regex(/^[a-z0-9-]+$/),
                name: z.string().min(1).max(150),
                description: z.string().max(5000),
                sku: z.string().min(1).max(80),
                label: z.string().min(1),
                price_minor: z.number().int().nonnegative(),
                published: z.boolean(),
              })
              .parse(body);
            if (p.published) {
              const proof = await c.query(
                "select 1 from variants v where (v.sku=$1 or v.id=$2::uuid) and (exists(select 1 from specifications s where s.variant_id=v.id) or exists(select 1 from compatibility co where co.variant_id=v.id))",
                [
                  p.sku,
                  body.variant_id
                    ? z.string().uuid().parse(body.variant_id)
                    : null,
                ],
              );
              if (!proof.rowCount)
                throw new AccessError(
                  409,
                  "SPECIFICATIONS_REQUIRED",
                  "Save a draft, verify SKU fit/specifications with a source, then publish",
                );
            }
            const targetId = body.product_id
              ? z.string().uuid().parse(body.product_id)
              : null;
            const productResult = targetId
              ? await c.query(
                  "update products set slug=$1,name=$2,description=$3,published=$4 where id=$5 returning id",
                  [p.slug, p.name, p.description, p.published, targetId],
                )
              : await c.query(
                  "insert into products(slug,name,description,published) values($1,$2,$3,$4) on conflict(slug) do update set name=excluded.name,description=excluded.description,published=excluded.published returning id",
                  [p.slug, p.name, p.description, p.published],
                );
            const product = productResult.rows[0];
            if (!product) throw new AccessError(404, "PRODUCT_NOT_FOUND");
            const existingVariantId = body.variant_id
              ? z.string().uuid().parse(body.variant_id)
              : null;
            const savedVariant = existingVariantId
              ? await c.query(
                  "update variants set sku=$2,label=$3,price_minor=$4 where id=$1 and product_id=$5 returning id",
                  [
                    existingVariantId,
                    p.sku,
                    p.label,
                    p.price_minor,
                    product.id,
                  ],
                )
              : await c.query(
                  "insert into variants(product_id,sku,label,price_minor) values($1,$2,$3,$4) on conflict(sku) do update set label=excluded.label,price_minor=excluded.price_minor where variants.product_id=excluded.product_id returning id",
                  [product.id, p.sku, p.label, p.price_minor],
                );
            if (!savedVariant.rowCount)
              throw new AccessError(
                409,
                "SKU_CONFLICT",
                "SKU belongs to another product",
              );
            if (typeof body.category === "string" && body.category.trim()) {
              const category = body.category.trim();
              const cat = (
                await c.query(
                  "insert into categories(name,slug) values($1,$2) on conflict(name) do update set name=excluded.name returning id",
                  [category, category.toLowerCase().replace(/\s+/g, "-")],
                )
              ).rows[0];
              await c.query("update products set category_id=$2 where id=$1", [
                product.id,
                cat.id,
              ]);
            }
            if (typeof body.brand === "string" && body.brand.trim()) {
              const brand = (
                await c.query(
                  "insert into brands(name) values($1) on conflict(name) do update set name=excluded.name returning id",
                  [body.brand.trim()],
                )
              ).rows[0];
              await c.query("update products set brand_id=$2 where id=$1", [
                product.id,
                brand.id,
              ]);
            }
            await c.query(
              "insert into audit_events(actor_id,action,entity_type,entity_id,reason) values($1,'product.save','product',$2,'Catalog edit')",
              [actor.id, product.id],
            );
            return { product_id: product.id };
          }
          default:
            throw new AccessError(
              400,
              "COMMAND_UNSUPPORTED",
              "Command is not yet supported",
            );
        }
      });
    } else throw new AccessError(400, "ACTION_UNKNOWN", "Unknown action");
    return answer(data, s.token);
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof AccessError || e instanceof commerce.CommerceError)
    return NextResponse.json(
      { code: e.code, message: e.message },
      { status: e.status },
    );
  if (typeof e === "object" && e && "code" in e && e.code === "23505")
    return NextResponse.json(
      {
        code: "IDENTIFIER_CONFLICT",
        message: "That SKU or URL is already in use. Choose a unique value.",
      },
      { status: 409 },
    );
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        code: "VALIDATION",
        message: "Check the submitted fields",
        fields: e.flatten(),
      },
      { status: 400 },
    );
  console.error("Store operation failed", {
    kind: e instanceof Error ? e.name : "unknown",
    code:
      typeof e === "object" && e && "code" in e ? String(e.code) : "unknown",
  });
  return NextResponse.json(
    {
      code: "OPERATION_FAILED",
      message: "Operation failed. Check the current state and try again.",
    },
    { status: 500 },
  );
}
