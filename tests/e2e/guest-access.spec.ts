import { databasePoolConfig } from "../../src/lib/database-config";
import { test, expect, request } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
test("guest proof survives browser closure, expires, and recovers only with challenge; checkout replay survives cleared cart", async () => {
  const db = new Pool(databasePoolConfig());
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const shopper = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const stranger = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  try {
    const catalog = await (
      await shopper.get("/api/store?resource=catalog")
    ).json();
    const variant = catalog.products[0].variants[0];
    await shopper.post("/api/store", {
      data: { action: "cart.add", variant_id: variant.id, quantity: 1 },
    });
    const quote = await (await shopper.get("/api/store?resource=cart")).json();
    const body = {
      action: "checkout",
      idempotency_key: randomUUID(),
      guest_name: "Fictional Recovery Buyer",
      guest_phone: "+8801712345678",
      guest_email: "recovery@example.test",
      payment_method: "cod",
      expected_total_minor: quote.total_minor,
      address: {
        district: "Dhaka",
        city_upazila: "Dhaka",
        area: "Fictional",
        street: "Fictional Road",
      },
    };
    const first = await shopper.post("/api/store", { data: body });
    expect(first.status()).toBe(200);
    const { order_id } = await first.json();
    const replay = await shopper.post("/api/store", { data: body });
    expect((await replay.json()).order_id).toBe(order_id);
    expect(
      (
        await stranger.get(`/api/store?resource=orders&id=${order_id}`)
      ).status(),
    ).toBe(403);
    const restored = await request.newContext({
      baseURL: origin,
      storageState: await shopper.storageState(),
    });
    expect(
      (
        await restored.get(`/api/store?resource=orders&id=${order_id}`)
      ).status(),
    ).toBe(200);
    await restored.dispose();
    await db.query(
      "update guest_order_grants set expires_at=now()-interval '1 second' where order_id=$1",
      [order_id],
    );
    expect(
      (await shopper.get(`/api/store?resource=orders&id=${order_id}`)).status(),
    ).toBe(403);
    await stranger.post("/api/store", {
      data: { action: "recovery.start", order_id, email: "wrong@example.test" },
    });
    expect(
      (
        await db.query(
          "select id from guest_recovery_challenges where order_id=$1",
          [order_id],
        )
      ).rowCount,
    ).toBe(0);
    await stranger.post("/api/store", {
      data: {
        action: "recovery.start",
        order_id,
        email: "recovery@example.test",
      },
    });
    const delivery = (
      await db.query(
        "select ld.payload from local_deliveries ld join outbox o on o.id=ld.outbox_id where o.topic='guest.recovery' and o.payload->>'order_id'=$1 order by ld.created_at desc limit 1",
        [order_id],
      )
    ).rows[0].payload;
    const wrong = await stranger.post("/api/store", {
      data: {
        action: "recovery.complete",
        challenge_id: delivery.challenge_id,
        code: "wrong",
      },
    });
    expect((await wrong.json()).verified).toBe(false);
    const recovered = await stranger.post("/api/store", {
      data: {
        action: "recovery.complete",
        challenge_id: delivery.challenge_id,
        code: delivery.code,
      },
    });
    expect((await recovered.json()).verified).toBe(true);
    expect(
      (
        await stranger.get(`/api/store?resource=orders&id=${order_id}`)
      ).status(),
    ).toBe(200);
    expect(
      (await shopper.get(`/api/store?resource=orders&id=${order_id}`)).status(),
    ).toBe(403);
  } finally {
    await shopper.dispose();
    await stranger.dispose();
    await db.end();
  }
});
