import { chromium } from "@playwright/test";
import { chmod, access } from "node:fs/promises";
const stage = process.argv[2] ?? "before";
if (!["before", "after"].includes(stage))
  throw Error("Stage must be before/after");
if (process.env.STORE_DEV_ADAPTERS !== "true")
  throw Error("Development captures only");
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  args: ["--no-sandbox"],
});
try {
  const owner = await browser.newContext({
    storageState: "/tmp/store-owner-state.json",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await owner.newPage();
  await page.goto("http://localhost:3000/admin");
  await page
    .getByRole("heading", { name: "Work requiring attention" })
    .waitFor();
  for (const [tab, file] of [
    ["Overview", "overview"],
    ["Catalog", "catalog"],
    ["Inventory", "inventory"],
    ["Orders", "orders"],
    ["Returns & refunds", "returns"],
    ["COD settlements", "cod"],
  ] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.screenshot({
      path: `artifacts/refinement/${stage}/desktop-${file}.png`,
      fullPage: true,
    });
  }
  const customerFile = "/tmp/refinement-customer-state.json";
  let existing = false;
  try {
    await access(customerFile);
    existing = true;
  } catch {}
  const customer = await browser.newContext({
    ...(existing ? { storageState: customerFile } : {}),
    viewport: { width: 390, height: 844 },
  });
  const cp = await customer.newPage();
  if (!existing) {
    const origin = "http://localhost:3000";
    const headers = { Origin: origin };
    await customer.request.post(origin + "/api/auth/sign-up/email", {
      headers,
      data: {
        email: `refinement-${Date.now()}@example.test`,
        password: crypto.randomUUID() + "!Safe",
        name: "Fictional Refinement Customer",
      },
    });
    const catalog = await (
      await customer.request.get(origin + "/api/store?resource=catalog")
    ).json();
    const variant = catalog.products.find(
      (p: { slug: string }) => p.slug === "clear-case",
    ).variants[0];
    await customer.request.post(origin + "/api/store", {
      headers,
      data: { action: "cart.add", variant_id: variant.id, quantity: 1 },
    });
    const quote = await (
      await customer.request.get(origin + "/api/store?resource=cart")
    ).json();
    const checkout = await customer.request.post(origin + "/api/store", {
      headers,
      data: {
        action: "checkout",
        idempotency_key: crypto.randomUUID(),
        guest_name: "Fictional Refinement Customer",
        guest_phone: "+8801712345678",
        payment_method: "cod",
        expected_total_minor: quote.total_minor,
        address: {
          district: "Dhaka",
          city_upazila: "Dhaka",
          area: "Fictional",
          street: "Fictional Road",
        },
      },
    });
    if (!checkout.ok()) throw Error("Capture fixture checkout failed");
    const o = await checkout.json();
    await customer.request.post(origin + "/api/store", {
      headers,
      data: { action: "account.link", order_id: o.order_id },
    });
    await customer.storageState({ path: customerFile });
    await chmod(customerFile, 0o600);
  }
  for (const width of [360, 390]) {
    await cp.setViewportSize({ width, height: 844 });
    await cp.goto("http://localhost:3000/products/usb-c-charger");
    await cp
      .getByRole("heading", { name: "Specifications", exact: true })
      .waitFor();
    await cp.screenshot({
      path: `artifacts/refinement/${stage}/mobile-${width}-specifications.png`,
      fullPage: true,
    });
    await cp.goto("http://localhost:3000/account");
    await cp
      .getByRole("heading", { name: "Link a previous guest order" })
      .waitFor();
    await cp.screenshot({
      path: `artifacts/refinement/${stage}/mobile-${width}-history.png`,
      fullPage: true,
    });
  }
  await owner.close();
  await customer.close();
} finally {
  await browser.close();
}
