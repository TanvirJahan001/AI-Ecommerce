const origin = process.env.APP_ORIGIN || "http://localhost:3000";
import { databasePoolConfig } from "../../src/lib/database-config";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  transaction,
  checkout,
  quote,
  paymentEvent,
  confirmCod,
  dispatchOrder,
  updateShipment,
} from "../../src/modules/commerce/service";
import { formatBdtInput } from "../../src/lib/money-input";
const pool = new Pool(databasePoolConfig());
test.use({
  storageState:
    process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
  viewport: { width: 1440, height: 1000 },
});
test.afterAll(async () => {
  await pool.end();
});
async function fixture(method: "online" | "cod", paid: boolean) {
  const marker = randomUUID().slice(0, 8);
  const product = (
    await pool.query(
      "insert into products(slug,name,description,published) values($1,$2,'Isolated fictional owner-workflow fixture',true) returning id",
      [`owner-workflow-${marker}`, `Selected accessory ${marker}`],
    )
  ).rows[0];
  const variant = (
    await pool.query(
      "insert into variants(product_id,sku,label,price_minor,sellable_qty) values($1,$2,'Fictional clear',185050,1) returning id,sku",
      [product.id, `OWNER-${marker}`],
    )
  ).rows[0];
  const input = await transaction(pool, async (c) => {
    const q = await quote(c, {
      lines: [{ variant_id: variant.id, quantity: 1 }],
      district: "Dhaka",
    });
    return {
      key: randomUUID(),
      session_id: `fixture-${marker}`,
      name: `Workflow buyer ${marker}`,
      phone: "+8801712345678",
      address: {
        district: "Dhaka",
        city_upazila: "Dhaka",
        area: "Fictional",
        street: "Fixture Street",
      },
      district: "Dhaka",
      lines: [{ variant_id: variant.id, quantity: 1 }],
      payment_method: method,
      expected_total_minor: q.total_minor,
      policy_version: "fictional-owner-test",
      delivery: q.delivery_minor,
    };
  });
  const order = await transaction(pool, (c) => checkout(c, input));
  if (paid) {
    const attempt = (
      await pool.query("select * from payment_attempts where order_id=$1", [
        order.id,
      ])
    ).rows[0];
    await transaction(pool, (c) =>
      paymentEvent(c, {
        event_id: randomUUID(),
        attempt_id: attempt.id,
        status: "succeeded",
        amount_minor: input.expected_total_minor,
        currency: "BDT",
        reference: `fixture-${randomUUID()}`,
        provider: "development",
      }),
    );
  }
  return {
    id: order.id as string,
    name: input.name,
    variant: variant.id as string,
    sku: variant.sku as string,
    delivery: input.delivery,
    total: input.expected_total_minor,
    productName: `Selected accessory ${marker}`,
  };
}

test("paid unshipped cancellation refunds without a return and selected-order actions stay isolated", async ({
  page,
}) => {
  const first = await fixture("online", true),
    other = await fixture("online", false);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill(first.name);
  await page
    .getByRole("button", {
      name: `Open Order ${first.id.slice(0, 8).toUpperCase()}`,
      exact: true,
    })
    .click();
  const selected = page.getByRole("region", {
    name: "Selected order workspace",
  });
  await expect(
    selected.getByRole("heading", { name: /Order detail/ }),
  ).toBeVisible();
  await expect(selected).toContainText(first.productName);
  await expect(selected).not.toContainText(other.productName);
  await expect(
    selected.getByRole("button", { name: "Confirm COD order", exact: true }),
  ).toHaveCount(0);
  const invalidCod = await page.request.post("/api/store", {
    headers: { Origin: origin },
    data: {
      action: "admin.command",
      command: "cod.confirm",
      order_id: first.id,
      idempotency_key: randomUUID(),
    },
  });
  expect(invalidCod.status()).toBe(409);
  await page.screenshot({
    path: "artifacts/refinement/after/desktop-order-detail.png",
    fullPage: true,
  });
  await selected
    .getByLabel("Cancellation reason / approval reference")
    .fill("Owner approved unshipped fictional cancellation");
  await selected
    .getByRole("button", { name: "Approve cancellation", exact: true })
    .click();
  await expect(selected).toContainText(
    "Approve cancellation completed for Order",
  );
  await expect
    .poll(
      async () =>
        (await pool.query("select status from orders where id=$1", [first.id]))
          .rows[0].status,
    )
    .toBe("cancelled");
  const balance = (
    await pool.query(
      "select sellable_qty,committed_qty from variants where id=$1",
      [first.variant],
    )
  ).rows[0];
  expect(balance).toEqual({ sellable_qty: 1, committed_qty: 0 });
  expect(
    (
      await pool.query("select id from inventory_movements where order_id=$1", [
        first.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (await pool.query("select id from returns where order_id=$1", [first.id]))
      .rowCount,
  ).toBe(0);
  await selected.getByLabel(new RegExp(`${first.sku} —`)).fill("1");
  await selected
    .getByLabel("Delivery refund (BDT)", { exact: true })
    .fill(formatBdtInput(first.delivery));
  await selected
    .getByLabel("Refund reason / approval reference")
    .fill("Refund verified payment after approved unshipped cancellation");
  await selected
    .getByRole("button", { name: "Approve selected refund", exact: true })
    .click();
  await expect(selected).toContainText("Refund approved for Order");
  await selected
    .getByRole("button", { name: "Submit refund payout", exact: true })
    .click();
  await selected
    .getByLabel("Verified payout outcome", { exact: true })
    .selectOption("succeeded");
  await selected
    .getByLabel("Payout reference and verification evidence")
    .fill("Fictional local payout verified PAYOUT-OWNER-TEST");
  await selected
    .getByRole("button", { name: "Reconcile refund payout", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query("select status from refunds where order_id=$1", [
            first.id,
          ])
        ).rows[0]?.status,
    )
    .toBe("succeeded");
  expect(
    (
      await pool.query("select amount_minor from refunds where order_id=$1", [
        first.id,
      ])
    ).rows[0].amount_minor,
  ).toBe(String(first.total));
  await page.screenshot({
    path: "artifacts/refinement/after/desktop-refund-completed.png",
    fullPage: true,
  });
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      selected.getByRole("heading", { name: /Order detail/ }),
    ).toBeVisible();
    await selected
      .getByRole("button", { name: "Refresh selected order" })
      .scrollIntoViewIfNeeded();
    await expect(
      selected.getByRole("button", { name: "Refresh selected order" }),
    ).toBeInViewport();
    await page.screenshot({
      path: `artifacts/refinement/after/mobile-${width}-order-refund.png`,
      fullPage: true,
    });
  }
});

test("COD collection and remittance keep recognizable order context and exact BDT values", async ({
  page,
}) => {
  const o = await fixture("cod", false);
  const actor = { id: "fictional-workflow-fixture", role: "owner" as const };
  await transaction(pool, (c) => confirmCod(c, o.id, actor, randomUUID()));
  await transaction(pool, (c) =>
    dispatchOrder(c, o.id, "FICTIONAL-COURIER", actor, randomUUID()),
  );
  await transaction(pool, (c) =>
    updateShipment(c, o.id, "delivered", actor, randomUUID()),
  );
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "COD settlements", exact: true })
    .click();
  await page
    .getByLabel("Delivered COD order", { exact: true })
    .selectOption(o.id);
  await expect(
    page.getByLabel("Customer collected amount (BDT)", { exact: true }),
  ).toHaveValue(formatBdtInput(o.total));
  await page
    .getByLabel("Customer collection reference / evidence")
    .fill(`Fictional cash-${o.id.slice(0, 8)}`);
  await page
    .getByRole("button", {
      name: "Record verified customer collection",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query("select id from cod_collections where order_id=$1", [
            o.id,
          ])
        ).rowCount,
    )
    .toBe(1);
  const collection = (
    await pool.query("select id from cod_collections where order_id=$1", [o.id])
  ).rows[0];
  await page
    .getByLabel("Outstanding customer collection", { exact: true })
    .selectOption(collection.id);
  await page
    .getByLabel("Courier remitted amount (BDT)", { exact: true })
    .fill(formatBdtInput(o.total));
  await page
    .getByLabel("Courier remittance / receipt reference")
    .fill(`Fictional remittance-${o.id.slice(0, 8)}`);
  await page
    .getByRole("button", {
      name: "Record matched courier remittance",
      exact: true,
    })
    .click();
  await expect
    .poll(async () =>
      Number(
        (
          await pool.query(
            "select coalesce(sum(amount_minor),0) total from remittance_allocations where collection_id=$1",
            [collection.id],
          )
        ).rows[0].total,
      ),
    )
    .toBe(o.total);
  await page.screenshot({
    path: "artifacts/refinement/after/desktop-cod-settlement.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "artifacts/refinement/after/mobile-390-cod-settlement.png",
    fullPage: true,
  });
});

test("late verified payment stays in review until explicit unshipped cancellation enables refund", async ({
  page,
}) => {
  const o = await fixture("online", false);
  await pool.query(
    "update inventory_commitments set expires_at=now()-interval '1 minute' where order_id=$1",
    [o.id],
  );
  const attempt = (
    await pool.query("select * from payment_attempts where order_id=$1", [o.id])
  ).rows[0];
  const result = await transaction(pool, (c) =>
    paymentEvent(c, {
      event_id: randomUUID(),
      attempt_id: attempt.id,
      status: "succeeded",
      amount_minor: o.total,
      currency: "BDT",
      reference: `late-fixture-${randomUUID()}`,
      provider: "development",
    }),
  );
  expect(result.status).toBe("reconciliation_required");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByLabel("Search orders", { exact: true }).fill(o.name);
  await page
    .getByRole("button", {
      name: `Open Order ${o.id.slice(0, 8).toUpperCase()}`,
      exact: true,
    })
    .click();
  const selected = page.getByRole("region", {
    name: "Selected order workspace",
  });
  await expect(selected).toContainText("reconciliation required");
  await expect(selected).toContainText(
    "Approve cancellation of this unshipped order first",
  );
  await expect(
    selected.getByRole("button", { name: "Dispatch order", exact: true }),
  ).toHaveCount(0);
  await expect(
    selected.getByRole("button", {
      name: "Approve selected refund",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({
    path: "artifacts/refinement/after/mobile-360-late-payment-review.png",
    fullPage: true,
  });
  await selected
    .getByLabel("Cancellation reason / approval reference")
    .fill("Resolve late verified payment without fulfillment");
  await selected
    .getByRole("button", { name: "Approve cancellation", exact: true })
    .click();
  await expect(
    selected.getByRole("button", {
      name: "Approve selected refund",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await pool.query("select status from orders where id=$1", [o.id])).rows[0]
      .status,
  ).toBe("cancelled");
  expect(
    (
      await pool.query(
        "select verified from funding_events where order_id=$1",
        [o.id],
      )
    ).rows[0].verified,
  ).toBe(true);
  expect(
    (await pool.query("select id from shipments where order_id=$1", [o.id]))
      .rowCount,
  ).toBe(0);
  expect(
    (await pool.query("select id from returns where order_id=$1", [o.id]))
      .rowCount,
  ).toBe(0);
});

test("delivered return actions retain item context through authorization receipt inspection and independent refund", async ({
  page,
}) => {
  const o = await fixture("online", true);
  const actor = { id: "fictional-return-fixture", role: "owner" as const };
  await transaction(pool, (c) =>
    dispatchOrder(c, o.id, "FICTIONAL-RETURN-TRACK", actor, randomUUID()),
  );
  await transaction(pool, (c) =>
    updateShipment(c, o.id, "delivered", actor, randomUUID()),
  );
  const warrantyItem = (
    await pool.query("select id from order_items where order_id=$1", [o.id])
  ).rows[0];
  const warranty = (
    await pool.query(
      "insert into warranty_claims(order_item_id,status,reason) values($1,'requested','Fictional contextual warranty request') returning id",
      [warrantyItem.id],
    )
  ).rows[0];
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Returns & refunds", exact: true })
    .click();
  await page.getByLabel("Search orders", { exact: true }).fill(o.name);
  await page
    .getByRole("button", {
      name: `Open Order ${o.id.slice(0, 8).toUpperCase()}`,
      exact: true,
    })
    .click();
  const selected = page.getByRole("region", {
    name: "Selected order workspace",
  });
  await selected
    .getByLabel("Return reason", { exact: true })
    .fill("Fictional damaged accessory returned after delivery");
  await selected
    .getByRole("button", { name: "Request this item’s return", exact: true })
    .click();
  await selected
    .getByLabel("Authorization reason / reference", { exact: true })
    .fill("Owner approved fictional inspection");
  await selected
    .getByRole("button", { name: "Authorize return", exact: true })
    .click();
  await selected
    .getByRole("button", {
      name: "Receive authorized items into quarantine",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query("select quarantined_qty from variants where id=$1", [
            o.variant,
          ])
        ).rows[0].quarantined_qty,
    )
    .toBe(1);
  await selected
    .getByLabel("Condition and stock disposition", { exact: true })
    .selectOption("damaged");
  await selected
    .getByRole("button", { name: "Inspect received goods", exact: true })
    .click();
  await selected
    .getByLabel("Write-off reason / evidence", { exact: true })
    .fill("Confirmed damaged fictional returned accessory");
  await selected
    .getByRole("button", { name: "Write off quarantined goods", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query(
            "select disposition from return_items ri join returns r on r.id=ri.return_id where r.order_id=$1",
            [o.id],
          )
        ).rows[0]?.disposition,
    )
    .toBe("disposed");
  await selected.getByLabel(new RegExp(`${o.sku} —`)).fill("1");
  await selected
    .getByLabel("Refund reason / approval reference", { exact: true })
    .fill("Approved refund for received inspected damaged fixture");
  await selected
    .getByRole("button", { name: "Approve selected refund", exact: true })
    .click();
  await expect(selected).toContainText("Refund approved for Order");
  const stock = (
    await pool.query(
      "select sellable_qty,quarantined_qty from variants where id=$1",
      [o.variant],
    )
  ).rows[0];
  expect(stock).toEqual({ sellable_qty: 0, quarantined_qty: 0 });
  expect(
    (await pool.query("select status from refunds where order_id=$1", [o.id]))
      .rows[0].status,
  ).toBe("approved");
  await selected
    .getByLabel("Warranty decision", { exact: true })
    .selectOption("true");
  await selected
    .getByLabel("Decision and resolution evidence", { exact: true })
    .fill("Reviewed fictional claim; resolved under owner-reviewed test terms");
  await selected
    .getByRole("button", { name: "Resolve warranty case", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await pool.query("select status from warranty_claims where id=$1", [
            warranty.id,
          ])
        ).rows[0].status,
    )
    .toBe("resolved");
  await page.screenshot({
    path: "artifacts/refinement/after/desktop-return-inspection.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "artifacts/refinement/after/mobile-390-return-inspection.png",
    fullPage: true,
  });
});
