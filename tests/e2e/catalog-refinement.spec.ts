import { test, expect } from "@playwright/test";
test.use({
  storageState:
    process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
  viewport: { width: 1440, height: 1000 },
});
test("owner edits catalog and stock using structured controls, exact BDT and ordered URL media", async ({
  page,
  browser,
}) => {
  const suffix = Date.now();
  const sku = `TYPED-${suffix}`,
    name = `Fictional typed charger ${suffix}`,
    slug = `typed-charger-${suffix}`;
  await page.goto("/admin");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  const editor = page.getByRole("region", { name: "Product editor" });
  await editor.getByLabel("Product name", { exact: true }).fill(name);
  await editor.getByLabel("URL slug", { exact: true }).fill(slug);
  await editor.getByLabel("SKU", { exact: true }).fill(sku);
  await editor
    .getByLabel("Variant label", { exact: true })
    .fill("USB-C · Clear");
  await editor.getByLabel("Price (BDT)", { exact: true }).fill("1850.50");
  await editor
    .getByLabel("Description", { exact: true })
    .fill("Fictional owner-control verification product.");
  await editor
    .getByRole("button", { name: "Add compatible model", exact: true })
    .click();
  await editor.getByLabel("Device brand", { exact: true }).fill("Fictional");
  await editor.getByLabel("Device model", { exact: true }).fill("Typed Phone");
  await editor.getByLabel("Model number", { exact: true }).fill("T-1");
  await editor
    .getByLabel("Output connector", { exact: true })
    .selectOption("USB-C");
  await editor.getByLabel("Maximum output (W)", { exact: true }).fill("30");
  await editor
    .getByLabel("Cable inclusion", { exact: true })
    .selectOption("no");
  await editor
    .getByRole("button", { name: "Add protocol", exact: true })
    .click();
  await editor
    .getByLabel("Protocol 1", { exact: true })
    .fill("USB Power Delivery");
  await editor
    .getByRole("button", { name: "Add power profile", exact: true })
    .click();
  await editor.getByLabel("Profile 1 voltage (V)", { exact: true }).fill("15");
  await editor.getByLabel("Profile 1 current (A)", { exact: true }).fill("2");
  await editor.getByLabel("Color", { exact: true }).fill("Blue");
  await editor
    .getByLabel("Source or evidence reference", { exact: true })
    .fill("Fictional label verification for browser test");
  await editor
    .getByRole("button", { name: "Add image URL", exact: true })
    .click();
  await editor
    .getByLabel("Image 1 URL", { exact: true })
    .fill("/test-assets/media-a.svg");
  await editor
    .getByLabel("Image 1 alt text", { exact: true })
    .fill("Fictional test A");
  await editor
    .getByRole("button", { name: "Add image URL", exact: true })
    .click();
  await editor
    .getByLabel("Image 2 URL", { exact: true })
    .fill("/test-assets/media-b.svg");
  await editor
    .getByLabel("Image 2 alt text", { exact: true })
    .fill("Fictional test B");
  await editor
    .getByRole("button", { name: "Move image 2 up", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  await expect(
    editor.getByRole("region", { name: "Product preview" }),
  ).toContainText("1850.50 BDT");
  await editor
    .getByRole("button", { name: "Save and publish", exact: true })
    .click();
  await expect(editor.getByRole("status")).toContainText(
    `Published: ${name} · ${sku}`,
  );
  await editor.getByLabel("Color", { exact: true }).fill("");
  const republished = page.waitForResponse(
    (response) =>
      response.url().includes("/api/store") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.command === "product.save" &&
      response.request().postDataJSON()?.published === true,
  );
  await editor
    .getByRole("button", { name: "Save and publish", exact: true })
    .click();
  await republished;
  await page.reload();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByLabel("Find product or SKU", { exact: true }).fill(sku);
  await page.getByRole("button", { name: `Edit ${sku}`, exact: true }).click();
  await expect(page.getByLabel("Price (BDT)", { exact: true })).toHaveValue(
    "1850.50",
  );
  await expect(
    page.getByLabel("Output connector", { exact: true }),
  ).toHaveValue("USB-C");
  await expect(page.getByLabel("Device model", { exact: true })).toHaveValue(
    "Typed Phone",
  );
  await expect(page.getByLabel("Image 1 URL", { exact: true })).toHaveValue(
    "/test-assets/media-b.svg",
  );
  const data = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  const product = data.products.find((p: { slug: string }) => p.slug === slug);
  expect(Number(product.variants[0].price_minor)).toBe(185050);
  expect(product.variants[0].specifications.cable_included).toBe(false);
  expect(product.variants[0].specifications.color).toBeUndefined();
  await page.screenshot({
    path: "artifacts/refinement-after-catalog-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByLabel("Find inventory product or SKU", { exact: true })
    .fill(sku);
  await page
    .getByRole("button", { name: `Record stock for ${sku}`, exact: true })
    .click();
  await page.getByLabel("Quantity received", { exact: true }).fill("3");
  await page
    .getByLabel("Reason / receipt reference", { exact: true })
    .fill("Fictional structured receipt");
  await page
    .getByRole("button", { name: "Save stock movement", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    `Receipt saved for ${sku}`,
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByLabel("Find inventory product or SKU", { exact: true })
    .fill(sku);
  await page
    .getByRole("button", { name: `Record stock for ${sku}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${sku} movement history`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional structured receipt", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Movement type", { exact: true })
    .selectOption("adjustment");
  await page.getByLabel("Quantity change", { exact: true }).fill("-1");
  await page
    .getByLabel("Reason / receipt reference", { exact: true })
    .fill("Fictional counted adjustment");
  await page
    .getByRole("button", { name: "Save stock movement", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    `Adjustment saved for ${sku}`,
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByLabel("Find inventory product or SKU", { exact: true })
    .fill(sku);
  await page
    .getByRole("button", { name: `Record stock for ${sku}`, exact: true })
    .click();
  await expect(
    page.getByText("Fictional counted adjustment", { exact: true }),
  ).toBeVisible();
  const afterAdjustment = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  expect(
    Number(
      afterAdjustment.inventory.find(
        (v: { id: string }) => v.id === product.variants[0].id,
      ).sellable_qty,
    ),
  ).toBe(2);
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const shopper = await guest.newPage();
  await shopper.goto(`http://localhost:3000/products/${slug}`);
  await expect(
    shopper.getByText("BDT 1,850.50", { exact: true }),
  ).toBeVisible();
  await expect(
    shopper.getByText("USB Power Delivery", { exact: true }),
  ).toBeVisible();
  await expect(
    shopper.getByText("Cable not included", { exact: true }),
  ).toBeVisible();
  await expect(shopper.getByText(/15 V.*2 A/)).toBeVisible();
  await shopper.screenshot({
    path: "artifacts/refinement-after-charger-mobile.png",
    fullPage: true,
  });
  await guest.close();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Catalog", exact: true }).click();
    await page.getByLabel("Find product or SKU", { exact: true }).fill(sku);
    await page
      .getByRole("button", { name: `Edit ${sku}`, exact: true })
      .click();
    await expect(page.getByLabel("Price (BDT)", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/refinement-after-editor-${width}.png`,
      fullPage: true,
    });
  }
});

test("renaming a selected SKU retains its identity, specifications and stock", async ({
  page,
}) => {
  const suffix = Date.now(),
    sku = `RENAME-${suffix}`,
    renamed = `RENAMED-${suffix}`,
    slug = `rename-fixture-${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  const created = await page.request.post("/api/store", {
    headers,
    data: {
      action: "admin.command",
      command: "product.save",
      slug,
      name: "Fictional SKU rename fixture",
      description: "Fictional owner editor regression",
      sku,
      label: "Original fixture",
      price_minor: 185050,
      published: false,
    },
  });
  expect(created.status()).toBe(200);
  const productId = (await created.json()).product_id;
  const first = (
    await (await page.request.get("/api/store?resource=admin")).json()
  ).products.find((p: { id: string }) => p.id === productId);
  const variant = first.variants[0];
  expect(
    (
      await page.request.post("/api/store", {
        headers,
        data: {
          action: "admin.command",
          command: "variant.details",
          variant_id: variant.id,
          source: "Fictional rename verification source",
          models: [],
          specifications: {
            output_connector: "USB-C",
            protocols: ["USB Power Delivery"],
            max_output_w: 30,
            cable_included: false,
          },
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/store", {
        headers,
        data: {
          action: "admin.command",
          command: "stock.receipt",
          variant_id: variant.id,
          quantity: 5,
          reason: "Fictional rename opening receipt",
          idempotency_key: crypto.randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByLabel("Find product or SKU", { exact: true }).fill(sku);
  await page.getByRole("button", { name: `Edit ${sku}`, exact: true }).click();
  await expect(
    page.getByLabel("Source or evidence reference", { exact: true }),
  ).toHaveValue("Fictional rename verification source");
  await page.getByLabel("SKU", { exact: true }).fill(renamed);
  await page
    .getByRole("button", { name: "Save and publish", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    `Published: Fictional SKU rename fixture · ${renamed}`,
  );
  const after = await (
    await page.request.get("/api/store?resource=admin")
  ).json();
  const saved = after.products.find((p: { id: string }) => p.id === productId);
  expect(saved.variants).toHaveLength(1);
  expect(saved.variants[0].id).toBe(variant.id);
  expect(saved.variants[0].sku).toBe(renamed);
  expect(saved.variants[0].specifications).toMatchObject({
    output_connector: "USB-C",
    protocols: ["USB Power Delivery"],
    max_output_w: 30,
    cable_included: false,
  });
  expect(saved.variants[0].source).toBe("Fictional rename verification source");
  expect(
    Number(
      after.inventory.find((v: { id: string }) => v.id === variant.id)
        .sellable_qty,
    ),
  ).toBe(5);
  await page.reload();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByLabel("Find product or SKU", { exact: true }).fill(renamed);
  await page
    .getByRole("button", { name: `Edit ${renamed}`, exact: true })
    .click();
  await expect(page.getByLabel("Price (BDT)", { exact: true })).toHaveValue(
    "1850.50",
  );
});
