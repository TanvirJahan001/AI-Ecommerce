import { test, expect } from "@playwright/test";

test("admin waits for data and does not confuse service errors with sign-out", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/store?resource=admin", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE" } });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("status").filter({ hasText: "Loading administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("heading", { name: "Unable to load this page" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/store?resource=admin");
  await page.route("**/api/store?resource=admin", (route) =>
    route.fulfill({ status: 401, json: { code: "AUTHENTICATION_REQUIRED" } }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("existing owner session skips the login and MFA form", async ({
  page,
}) => {
  await page.route("**/api/auth/identity", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        user: { role: "owner", twoFactorEnabled: true },
      },
    }),
  );
  await page.route("**/api/store?resource=admin", (route) =>
    route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE" } }),
  );
  await page.goto("/login");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("failed session check offers retry instead of asking for credentials", async ({
  page,
}) => {
  await page.route("**/api/auth/identity", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/auth/identity");
  await page.route("**/api/auth/identity", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("admin logout handles failure and redirects only after successful sign-out", async ({
  page,
}) => {
  await page.route("**/api/store?resource=admin", (route) =>
    route.fulfill({
      json: {
        products: [],
        inventory: [],
        orders: [],
        returns: [],
        refunds: [],
        collections: [],
        remittances: [],
      },
    }),
  );
  await page.route("**/api/auth/identity", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  let attempts = 0;
  await page.route("**/api/auth/sign-out", async (route) => {
    expect(route.request().method()).toBe("POST");
    attempts++;
    await route.fulfill(
      attempts === 1
        ? { status: 503, json: { message: "Temporarily unavailable" } }
        : { json: { success: true } },
    );
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByText("Unable to log out. Please try again."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("authenticator screen supports mobile, recovery codes and device trust", async ({
  page,
}) => {
  await page.route("**/api/auth/identity", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({ json: { twoFactorRedirect: true } }),
  );
  let verified = false;
  await page.route("**/api/auth/two-factor/verify-totp", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      code: "012345",
      trustDevice: true,
    });
    verified = true;
    await route.fulfill({
      status: 400,
      json: { message: "Invalid code. Please try again." },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fictional-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One more step" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "/tmp/authenticator-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/authenticator-mobile.png",
    fullPage: true,
  });
  await page
    .getByLabel("Trust this device for 30 days", { exact: false })
    .check();
  await page.getByLabel("Authenticator code", { exact: true }).fill("012345");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("status")).toContainText("Invalid code");
  expect(verified).toBe(true);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeEmpty();
  await expect(page.getByRole("status")).toBeEmpty();
  await page.getByRole("button", { name: "Use authenticator code" }).click();
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeVisible();
});
