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
