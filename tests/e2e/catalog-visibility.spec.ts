import { test, expect } from "@playwright/test";
import type { CatalogProduct } from "../../src/components/catalog-editor";

test("drafts use the editor preview and public links follow the saved publication and slug", async ({
  page,
}) => {
  const product: CatalogProduct = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "draft-preview-fixture",
    name: "Draft preview fixture",
    description: "Fictional editor fixture",
    published: false,
    variants: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        sku: "DRAFT-PREVIEW-FIXTURE",
        label: "Blue",
        price_minor: 10000,
        available: 0,
        source: "Fictional reviewed label",
        specifications: { color: "Blue" },
      },
    ],
  };
  await page.route("**/api/store**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.command === "product.save") {
        product.slug = body.slug;
        product.published = body.published;
      }
      await route.fulfill({ json: { product_id: product.id } });
    } else {
      await route.fulfill({
        json: {
          products: [product],
          orders: [],
          refunds: [],
          returns: [],
          collections: [],
        },
      });
    }
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Edit ${product.variants[0].sku}`,
      exact: true,
    })
    .click();
  const editor = page.getByRole("region", { name: "Product editor" });
  await expect(editor).toContainText("draft and is hidden from the storefront");
  await expect(
    editor.getByRole("link", { name: "Open storefront page" }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Preview product", exact: true })
    .click();
  await expect(
    editor.getByRole("region", { name: "Product preview" }),
  ).toContainText(product.name);

  await editor
    .getByRole("button", { name: "Save and publish", exact: true })
    .click();
  await expect(editor.getByRole("status")).toContainText("Published:");
  const link = editor.getByRole("link", { name: "Open storefront page" });
  await expect(link).toHaveAttribute("href", "/products/draft-preview-fixture");
  await editor.getByLabel("URL slug", { exact: true }).fill("unsaved-new-slug");
  await expect(link).toHaveAttribute("href", "/products/draft-preview-fixture");

  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Saved draft:");
  await expect(link).toHaveCount(0);
  await expect(editor).toContainText("draft and is hidden from the storefront");
});

test("extension-injected body attributes do not trigger a hydration error", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|server rendered HTML/i.test(message.text())
    )
      hydrationErrors.push(message.text());
  });
  page.on("pageerror", (error) => hydrationErrors.push(error.message));
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: { products: [] } }),
  );
  await page.addInitScript(() => {
    const decorate = () => {
      if (!document.body) return false;
      document.body.setAttribute("data-new-gr-c-s-check-loaded", "14.1347.0");
      document.body.setAttribute("data-gr-ext-installed", "");
      return true;
    };
    if (!decorate()) {
      const observer = new MutationObserver(() => {
        if (decorate()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("searchbox", { name: "Search", exact: true }),
  ).toBeVisible();
  // A working filter confirms React hydrated and attached handlers.
  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill("hydration check");
  await expect(
    page.getByRole("searchbox", { name: "Search", exact: true }),
  ).toHaveValue("hydration check");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Search", exact: true }),
  ).toHaveValue("");
  await expect(page.locator("body")).toHaveAttribute(
    "data-gr-ext-installed",
    "",
  );
  expect(hydrationErrors).toEqual([]);
});
