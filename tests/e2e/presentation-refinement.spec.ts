const origin = process.env.APP_ORIGIN || "http://localhost:3000";
import { databasePoolConfig } from "../../src/lib/database-config";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";

test("readable charger facts and responsive owned history at 360px, 390px and desktop", async ({
  browser,
}) => {
  // Build ownership through the real API, rather than depending on a prior run's
  // private cookie file from a potentially different application database.
  const context = await browser.newContext({
    extraHTTPHeaders: { Origin: origin },
  });
  const api = context.request;
  const catalog = await (
    await api.get(`${origin}/api/store?resource=catalog`)
  ).json();
  const variant = catalog.products.find(
    (p: { slug: string }) => p.slug === "clear-case",
  ).variants[0];
  expect(
    (
      await api.post(`${origin}/api/store`, {
        data: { action: "cart.add", variant_id: variant.id, quantity: 1 },
      })
    ).ok(),
  ).toBeTruthy();
  const quote = await (
    await api.get(`${origin}/api/store?resource=cart`)
  ).json();
  const checkout = await api.post(`${origin}/api/store`, {
    data: {
      action: "checkout",
      idempotency_key: randomUUID(),
      guest_name: "Fictional Responsive Buyer",
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
  });
  expect(checkout.ok()).toBeTruthy();
  const { order_id } = await checkout.json();
  expect(
    (
      await api.post(`${origin}/api/auth/sign-up/email`, {
        data: {
          email: `responsive-${randomUUID()}@example.test`,
          password: "Fictional-Responsive-Only-123!",
          name: "Fictional Responsive Buyer",
        },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await api.post(`${origin}/api/store`, {
        data: { action: "account.link", order_id },
      })
    ).ok(),
  ).toBeTruthy();
  const page = await context.newPage();
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/products/usb-c-charger`);
    await expect(
      page.getByText("USB Power Delivery", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Cable not included", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("30 W", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "15 V", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "2 A", exact: true }),
    ).toBeVisible();
    expect(await page.locator(".spec-list").innerText()).not.toMatch(
      /\[\{|"volts"|false|true/,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/refinement/after/specifications-${width}.png`,
      fullPage: true,
    });
    await page.goto(`${origin}/account`);
    await expect(page.locator(".history-card").first()).toBeVisible();
    await expect(page.locator(".history-card strong").first()).toContainText(
      "BDT",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/refinement/after/history-${width}.png`,
      fullPage: true,
    });
  }
  await context.close();
});

test("friendly signed-out and denied states retain a safe destination; external destinations are rejected", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/login?next=%2Fadmin");
  expect(await page.locator("body").innerText()).not.toContain(
    "AUTHENTICATION_REQUIRED",
  );
  await page.goto("/login?next=https://example.invalid");
  await page
    .getByRole("button", { name: "Create a customer account", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Fictional Access Presentation");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`presentation-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-Presentation-Only-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  expect((await page.request.get("/api/store?resource=admin")).status()).toBe(
    403,
  );
  expect(await page.locator("body").innerText()).not.toContain(
    "OWNER_REQUIRED",
  );
  await page.screenshot({
    path: "artifacts/refinement/after/access-denied.png",
    fullPage: true,
  });
});

test("expired anonymous session is explained and can restart without restoring prior order grants", async ({
  page,
}) => {
  const db = new Pool(databasePoolConfig());
  try {
    await page.goto("/");
    await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((c) => c.name === "shop"),
      )
      .toBe(true);
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === "shop",
    )!;
    const hash = createHash("sha256").update(cookie.value).digest("hex");
    await db.query(
      "update shopping_sessions set expires_at=now()-interval '1 minute' where id=$1",
      [hash],
    );
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "Session expired" }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      "SESSION_EXPIRED",
    );
    await page
      .getByRole("button", { name: "Start a new shopping session" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your cart is empty" }),
    ).toBeVisible();
    const next = (await page.context().cookies()).find(
      (c) => c.name === "shop",
    )!;
    expect(next.value).not.toBe(cookie.value);
    const newHash = createHash("sha256").update(next.value).digest("hex");
    expect(
      (
        await db.query("select 1 from guest_order_grants where session_id=$1", [
          newHash,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.end();
  }
});

test("MFA-required presentation names the next step without exposing internal codes (UI response fixture)", async ({
  page,
}) => {
  await page.route("**/api/store?resource=admin", (route) =>
    route.fulfill({
      status: 428,
      contentType: "application/json",
      body: JSON.stringify({
        code: "MFA_ENROLLMENT_REQUIRED",
        message: "MFA_ENROLLMENT_REQUIRED",
      }),
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Authenticator setup required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set up authenticator" }),
  ).toHaveAttribute("href", "/login?next=%2Fadmin");
  expect(await page.locator("body").innerText()).not.toContain(
    "MFA_ENROLLMENT_REQUIRED",
  );
  await page.screenshot({
    path: "artifacts/refinement/after/mfa-required-ui-fixture.png",
    fullPage: true,
  });
});

test("existing MFA owner overview uses persisted queue counts and COD controls fit all required widths", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState:
      process.env.STORE_OWNER_STORAGE || "/tmp/store-owner-state.json",
  });
  const page = await context.newPage();
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/admin`);
    await expect(
      page.getByRole("heading", { name: "Work requiring attention" }),
    ).toBeVisible();
    const current = await (
      await page.request.get("/api/store?resource=admin")
    ).json();
    const identity = await (
      await page.request.get("/api/auth/identity")
    ).json();
    expect(identity.user.role).toBe("owner");
    expect(identity.user.twoFactorEnabled).toBe(true);
    await expect(page.locator(".metric strong").first()).toHaveText(
      String(current.orders.length),
    );
    await page.screenshot({
      path: `artifacts/refinement/after/overview-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page
      .getByRole("button", { name: "COD settlements", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Verify customer cash collection",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `artifacts/refinement/after/cod-${width}.png`,
      fullPage: true,
    });
  }
  await context.close();
});
