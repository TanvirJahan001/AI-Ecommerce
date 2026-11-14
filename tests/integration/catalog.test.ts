import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { saveVariantDetails } from "../../src/modules/catalog/commands";
import { transaction } from "../../src/modules/commerce/service";
const url = process.env.TEST_DATABASE_URL;
const schema = `catalog_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: url });
const pool = new Pool({
  connectionString: url,
  options: `-c search_path=${schema},public`,
});
const owner = { id: "fictional-owner", role: "owner" as const };
describe.skipIf(!url)("owner catalog persistence", () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of [
      "001_initial.sql",
      "003_store.sql",
      "007_catalog_media.sql",
      "013_catalog_refinement.sql",
    ])
      await pool.query(await readFile(`db/migrations/${file}`, "utf8"));
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  it("persists SKU-specific compatibility and independently structured charger fields", async () => {
    const product = (
      await pool.query(
        "INSERT INTO products(slug,name) VALUES('fixture','Fictional fixture') RETURNING id",
      )
    ).rows[0];
    const variants = (
      await pool.query(
        "INSERT INTO variants(product_id,sku,label,price_minor) VALUES($1,'FIX-Z','Z case',10000),($1,'FIX-Q','Q case',10000) RETURNING id,sku",
        [product.id],
      )
    ).rows;
    await transaction(pool, (c) =>
      saveVariantDetails(
        c,
        {
          variant_id: variants[0].id,
          source: "Illustrative label review",
          models: [
            { brand: "Fictional", model: "Phone Z", model_number: "Z-1" },
          ],
          specifications: { color: "Clear" },
          media: [{ url: "/samples/case.svg", alt: "Illustrative clear case" }],
          category: { name: "Cases", slug: "cases" },
          brand: "Fictional",
        },
        owner,
      ),
    );
    await transaction(pool, (c) =>
      saveVariantDetails(
        c,
        {
          variant_id: variants[1].id,
          source: "Illustrative manufacturer sheet",
          models: [
            { brand: "Fictional", model: "Phone Q", model_number: "Q-1" },
          ],
          specifications: {
            output_connector: "USB-C",
            protocols: ["USB Power Delivery"],
            max_output_w: 30,
            power_profiles: [
              { volts: 5, amps: 3 },
              { volts: 15, amps: 2 },
            ],
            cable_included: false,
          },
        },
        owner,
      ),
    );
    const fit = await pool.query(
      "SELECT c.variant_id,dm.model FROM compatibility c JOIN device_models dm ON dm.id=c.device_model_id ORDER BY dm.model",
    );
    expect(fit.rows).toEqual([
      { variant_id: variants[1].id, model: "Phone Q" },
      { variant_id: variants[0].id, model: "Phone Z" },
    ]);
    const specs = await pool.query(
      "SELECT attribute,value FROM specifications WHERE variant_id=$1",
      [variants[1].id],
    );
    const values = Object.fromEntries(
      specs.rows.map((row) => [row.attribute, row.value]),
    );
    expect(values.output_connector).toBe("USB-C");
    expect(values.protocols).toEqual(["USB Power Delivery"]);
    expect(values.max_output_w).toBe(30);
    expect(values.cable_included).toBe(false);
    expect(
      (await pool.query("SELECT variant_id,alt FROM product_media")).rows,
    ).toEqual([{ variant_id: variants[0].id, alt: "Illustrative clear case" }]);
    expect(
      (
        await pool.query(
          "SELECT id FROM audit_events WHERE action='variant.details'",
        )
      ).rowCount,
    ).toBe(2);
    // Replacing one SKU's fit never changes its sibling's fit.
    await transaction(pool, (c) =>
      saveVariantDetails(
        c,
        {
          variant_id: variants[0].id,
          source: "Updated fictional review",
          models: [],
          specifications: {},
        },
        owner,
      ),
    );
    expect(
      (await pool.query("SELECT variant_id FROM compatibility")).rows,
    ).toEqual([{ variant_id: variants[1].id }]);
  });
  it("rejects unprivileged edits, unsupported fields, contradictory power profiles, and unsafe media", async () => {
    const variant = (
      await pool.query("SELECT id FROM variants WHERE sku='FIX-Z'")
    ).rows[0];
    const base = {
      variant_id: variant.id,
      source: "Fictional reviewed source",
      models: [],
      specifications: {},
    };
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(c, base, { id: "buyer", role: "customer" }),
      ),
    ).rejects.toThrow("Owner permission");
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(
          c,
          {
            ...base,
            specifications: {
              max_output_w: 30,
              power_profiles: [{ volts: 20, amps: 5 }],
            },
          },
          owner,
        ),
      ),
    ).rejects.toThrow("exceeds");
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(
          c,
          { ...base, media: [{ url: "javascript:alert(1)", alt: "Unsafe" }] },
          owner,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(
          c,
          {
            ...base,
            specifications: { max_output_w: 30 },
            remove_specifications: ["max_output_w"],
          },
          owner,
        ),
      ),
    ).rejects.toThrow("set and removed");
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(
          c,
          { ...base, specifications: { certified: true } as never },
          owner,
        ),
      ),
    ).rejects.toThrow();
    expect(
      (await pool.query("SELECT id FROM audit_events WHERE actor_id='buyer'"))
        .rowCount,
    ).toBe(0);
  });
  it("preserves unedited specifications and sources, supports explicit removals and persists media ordering", async () => {
    const variant = (
      await pool.query("SELECT id FROM variants WHERE sku='FIX-Q'")
    ).rows[0];
    await pool.query(
      "INSERT INTO specifications(variant_id,attribute,value,source) VALUES($1,'legacy_approved_fact','{\"label\":\"Original\"}','Historical source')",
      [variant.id],
    );
    const before = (
      await pool.query(
        "SELECT value FROM specifications WHERE variant_id=$1 AND attribute='power_profiles'",
        [variant.id],
      )
    ).rows[0].value;
    await transaction(pool, (c) =>
      saveVariantDetails(
        c,
        {
          variant_id: variant.id,
          source: "Fictional revised review",
          models: [],
          specifications: { color: "Blue" },
          media: [
            { url: "/samples/two.svg", alt: "Second image now cover" },
            { url: "/samples/one.svg", alt: "Original image now second" },
          ],
        },
        owner,
      ),
    );
    expect(
      (
        await pool.query(
          "SELECT value,source FROM specifications WHERE variant_id=$1 AND attribute='legacy_approved_fact'",
          [variant.id],
        )
      ).rows[0],
    ).toEqual({ value: { label: "Original" }, source: "Historical source" });
    expect(
      (
        await pool.query(
          "SELECT value FROM specifications WHERE variant_id=$1 AND attribute='power_profiles'",
          [variant.id],
        )
      ).rows[0].value,
    ).toEqual(before);
    expect(
      (
        await pool.query(
          "SELECT url,sort_order FROM product_media WHERE variant_id=$1 ORDER BY sort_order",
          [variant.id],
        )
      ).rows,
    ).toEqual([
      { url: "/samples/two.svg", sort_order: 0 },
      { url: "/samples/one.svg", sort_order: 1 },
    ]);
    await transaction(pool, (c) =>
      saveVariantDetails(
        c,
        {
          variant_id: variant.id,
          source: "Fictional removal review",
          models: [],
          specifications: {},
          remove_specifications: ["color"],
        },
        owner,
      ),
    );
    expect(
      (
        await pool.query(
          "SELECT value FROM specifications WHERE variant_id=$1 AND attribute='color'",
          [variant.id],
        )
      ).rowCount,
    ).toBe(0);
    await expect(
      transaction(pool, (c) =>
        saveVariantDetails(
          c,
          {
            variant_id: variant.id,
            source: "Fictional contradiction check",
            models: [],
            specifications: { max_output_w: 10 },
          },
          owner,
        ),
      ),
    ).rejects.toThrow("exceeds");
  });
});
