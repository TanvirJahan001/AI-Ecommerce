import { test, expect } from "@playwright/test";

const products = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "homepage-fixture",
    name: "Homepage fixture case",
    description: "Fictional browser fixture",
    variants: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        sku: "HOME-FIXTURE",
        label: "Blue",
        price_minor: 25000,
        available: 3,
      },
    ],
  },
];

test("customer navigation excludes administration and loads the catalog with one lightweight request", async ({
  page,
}) => {
  let catalogReads = 0;
  let legacyReads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/store?resource=catalog")) legacyReads++;
  });
  await page.route("**/api/catalog", async (route) => {
    catalogReads++;
    await route.fulfill({ json: { products } });
  });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Shop", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Cart", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: products[0].name, exact: true }),
  ).toBeVisible();
  expect(catalogReads).toBe(1);
  expect(legacyReads).toBe(0);
});

test("catalog failure ends the loading state and retry loads products", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/catalog", async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({
        status: 503,
        json: {
          code: "CATALOG_UNAVAILABLE",
          message: "Products could not be loaded. Please retry in a moment.",
        },
      });
    else await route.fulfill({ json: { products } });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Products could not be loaded",
  );
  await expect(page.getByText("Loading catalog…", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("0 products", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry catalog", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: products[0].name, exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("the live public catalog is readable without a session and admin remains protected", async ({
  request,
}) => {
  const response = await request.get("/api/catalog");
  expect(response.ok()).toBeTruthy();
  expect(Array.isArray((await response.json()).products)).toBe(true);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toContain("no-store");
  const admin = await request.get("/api/store?resource=admin");
  expect([401, 403]).toContain(admin.status());
});
