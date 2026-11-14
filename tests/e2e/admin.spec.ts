const origin = process.env.APP_ORIGIN || "http://localhost:3000";
import { test, expect, request } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({
  storageState:
    process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
  viewport: { width: 1440, height: 1000 },
});
test("MFA-authenticated owner operates inventory and reviews commercial queues", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Work requiring attention" }),
  ).toBeVisible();
  const response = await page.request.get("/api/store?resource=admin");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Products & SKUs" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-catalog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Stock by SKU" }),
  ).toBeVisible();
  const variant = data.inventory.find(
    (v: { sku: string }) => v.sku === "CHG-30C",
  );
  await page
    .getByRole("button", { name: "Record stock for CHG-30C", exact: true })
    .click();
  await page.getByLabel("Quantity received", { exact: true }).fill("1");
  await page
    .getByLabel("Reason / receipt reference")
    .fill("Fictional browser receipt verification");
  await page.getByRole("button", { name: "Save stock movement" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Receipt saved for CHG-30C",
  );
  const refreshed = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  expect(
    Number(
      refreshed.inventory.find((v: { id: string }) => v.id === variant.id)
        .sellable_qty,
    ),
  ).toBe(Number(variant.sellable_qty) + 1);
  await page.screenshot({
    path: "artifacts/admin-inventory.png",
    fullPage: true,
  });
  const buyer = await request.newContext({
    storageState: { cookies: [], origins: [] },
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  // Fresh databases have no historical orders. Create this test's own order
  // through checkout rather than depending on another test or preserved data.
  expect(
    (
      await buyer.post("/api/store", {
        headers: { Origin: origin },
        data: { action: "cart.add", variant_id: variant.id, quantity: 1 },
      })
    ).ok(),
  ).toBeTruthy();
  const quote = await (await buyer.get("/api/store?resource=cart")).json();
  expect(
    (
      await buyer.post("/api/store", {
        headers: { Origin: origin },
        data: {
          action: "checkout",
          idempotency_key: randomUUID(),
          guest_name: "Fictional Owner Workflow Buyer",
          guest_phone: "+8801712345678",
          payment_method: "cod",
          expected_total_minor: quote.total_minor,
          address: {
            district: "Dhaka",
            city_upazila: "Dhaka",
            area: "Fictional",
            street: "Fictional Street",
          },
        },
      })
    ).ok(),
  ).toBeTruthy();
  await buyer.dispose();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("button", { name: /Open Order / })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /^Order detail ·/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-order-detail.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Returns & refunds", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Find an order for after-sales support",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Open Order / })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Returns and inspection", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-returns-refunds.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "COD settlements", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Customer collections" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-cod-settlement.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Store reports" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download orders CSV" }),
  ).toBeVisible();
});

test("owner content and discounts persist and become visible to shoppers", async ({
  page,
  browser,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Work requiring attention" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const content =
    "Fictional browser verification content. No commercial promises.";
  await page
    .getByLabel("Page slug", { exact: true })
    .fill("browser-verification");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Fictional verification page");
  await page.getByLabel("Page content", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Save content" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Action recorded successfully",
  );
  await page.getByRole("button", { name: "Discounts", exact: true }).click();
  const code = `BROWSER${Date.now()}`;
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByLabel("Amount (BDT)", { exact: true }).fill("10.00");
  await page.getByLabel("Usage limit", { exact: true }).fill("1");
  await page
    .getByLabel("Ends at (ISO date/time)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString());
  await page.getByRole("button", { name: "Save discount" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Action recorded successfully",
  );
  const guest = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });
  const shopper = await guest.newPage();
  await shopper.goto(`${origin}/policies/browser-verification`);
  await expect(shopper.getByText(content, { exact: true })).toBeVisible();
  await shopper.goto(`${origin}/products/usb-c-charger`);
  await shopper.getByRole("button", { name: "Add to cart" }).click();
  await expect(shopper.getByRole("status")).toContainText("Added to your cart");
  await shopper.goto(`${origin}/checkout`);
  await shopper.getByLabel("Discount code", { exact: true }).fill(code);
  await shopper.getByRole("button", { name: "Apply discount" }).click();
  await expect(shopper.getByText("−BDT 10.00", { exact: true })).toBeVisible();
  await shopper.screenshot({
    path: "artifacts/mobile-discount-quote.png",
    fullPage: true,
  });
  await guest.close();
});

test("owner configures a local delivery rate through Settings", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Methods and delivery configuration" }),
  ).toBeVisible();
  await page
    .getByLabel("Delivery district", { exact: true })
    .fill("Fictional test district");
  await page.getByLabel("Delivery fee (BDT)", { exact: true }).fill("70.50");
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Action recorded successfully",
  );
  const data = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  expect(
    Number(
      data.shipping_rates.find(
        (r: { district: string }) => r.district === "Fictional test district",
      ).fee_minor,
    ),
  ).toBe(7050);
});

test("owner drafts, specifies and publishes a SKU without reassignment to another family", async ({
  page,
}) => {
  const headers = { Origin: origin };
  const suffix = Date.now();
  const item = {
    action: "admin.command",
    command: "product.save",
    slug: `fixture-${suffix}`,
    sku: `FIXTURE-${suffix}`,
    name: "Fictional catalog verification",
    description: "Fictional browser fixture only",
    label: "Clear",
    price_minor: 120000,
    published: false,
  };
  const draft = await page.request.post("/api/store", { headers, data: item });
  expect(draft.status()).toBe(200);
  const productId = (await draft.json()).product_id;
  let catalog = await (
    await page.request.get("/api/store?resource=catalog")
  ).json();
  expect(catalog.products.some((p: { id: string }) => p.id === productId)).toBe(
    false,
  );
  const admin = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  const product = admin.products.find(
    (p: { id: string }) => p.id === productId,
  );
  const variantId = product.variants[0].id;
  const details = await page.request.post("/api/store", {
    headers,
    data: {
      action: "admin.command",
      command: "variant.details",
      variant_id: variantId,
      source: "Fictional API verification",
      models: [
        { brand: "Fictional", model: "Fixture Phone", model_number: "FX" },
      ],
      specifications: { color: "Clear" },
    },
  });
  expect(details.status()).toBe(200);
  const published = await page.request.post("/api/store", {
    headers,
    data: { ...item, product_id: productId, published: true },
  });
  expect(published.status()).toBe(200);
  catalog = await (
    await page.request.get("/api/store?resource=catalog")
  ).json();
  expect(catalog.products.some((p: { id: string }) => p.id === productId)).toBe(
    true,
  );
  const conflict = await page.request.post("/api/store", {
    headers,
    data: { ...item, slug: `other-${suffix}` },
  });
  expect(conflict.status()).toBe(409);
});
