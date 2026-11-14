const origin = process.env.APP_ORIGIN || "http://localhost:3000";
import { test, expect } from "@playwright/test";

test("mobile shopper selects exact case, checks out, and tracks verified development payment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Small accessories. A better everyday.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fictional clear case", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/mobile-storefront.png",
    fullPage: true,
  });
  await page.getByLabel("Device model").selectOption("Fictional Phone Z");
  await expect(
    page.getByRole("link", { name: "Fictional clear case Q", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Fictional clear case", exact: true })
    .click();
  await expect(
    page.getByText("Fictional Phone Z", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional Phone Q", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/mobile-product.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status")).toContainText("Added to your cart");
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(
    page.getByRole("heading", { name: "Shopping cart" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Quantity for Fictional clear case"),
  ).toHaveValue("1");
  await page.screenshot({ path: "artifacts/mobile-cart.png", fullPage: true });
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Full name").fill("Fictional Browser Customer");
  await page.getByLabel("Bangladesh mobile number").fill("01700000000");
  await page.getByLabel("City / upazila").fill("Dhaka");
  await page.getByLabel("Area", { exact: true }).fill("Fictional Test Area");
  await page
    .getByLabel("House, road and street")
    .fill("Illustrative House 10, Test Road");
  await page
    .getByLabel("I have reviewed the order and delivery details.")
    .check();
  await page.screenshot({
    path: "artifacts/mobile-checkout.png",
    fullPage: true,
  });
  // Keyboard submission exercises native form controls and validation.
  await page.getByRole("button", { name: "Place order", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);
  await expect(
    page.getByText("pending payment", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Simulate success" }).click();
  await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "artifacts/mobile-order-tracking.png",
    fullPage: true,
  });
  const details = await page.request.get(
    `/api/store?resource=orders&id=${page.url().split("/").pop()}`,
  );
  expect(details.ok()).toBeTruthy();
  const order = await details.json();
  expect(order.order.status).toBe("confirmed");
  expect(order.payments[0].status).toBe("succeeded");
  const orderId = String(order.order.id);
  const registration = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      email: `browser-${Date.now()}@example.test`,
      password: "Fictional-Only-Password-123!",
      name: "Fictional Browser Account",
    },
  });
  expect(registration.ok()).toBeTruthy();
  await page.goto("/account");
  await expect(page.getByText("No linked orders yet.")).toBeVisible();
  await page.getByLabel("Order reference").fill(orderId);
  await page.getByRole("button", { name: "Link order securely" }).click();
  await expect(page.getByRole("status")).toContainText("Order linked");
  await expect(
    page.getByRole("link", {
      name: `Order ${orderId.slice(0, 8).toUpperCase()}`,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/customer-order-history.png",
    fullPage: true,
  });
});

test("charger specifications remain structured and owner console denies anonymous access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/products/usb-c-charger");
  await expect(
    page.getByRole("heading", { name: "Fictional USB-C 30 W charger" }),
  ).toBeVisible();
  await expect(page.getByText("USB-C", { exact: true })).toBeVisible();
  await expect(
    page.getByText("USB Power Delivery", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/desktop-charger.png",
    fullPage: true,
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin-access-denied.png",
    fullPage: true,
  });
  const response = await page.request.get("/api/store?resource=admin");
  expect([401, 403]).toContain(response.status());
});
