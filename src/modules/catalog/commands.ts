import type { PoolClient } from "pg";
import { z } from "zod";
import { CommerceError, type Actor } from "../commerce/service";

const text = z.string().trim().min(1).max(150);
const connector = z.enum([
  "USB-C",
  "USB-A",
  "Micro-USB",
  "Lightning",
  "3.5 mm",
  "AC",
  "Other",
]);
const specificationsSchema = z
  .object({
    input_connector: connector.optional(),
    output_connector: connector.optional(),
    connector: connector.optional(),
    protocols: z.array(text).max(20).optional(),
    max_output_w: z.number().positive().max(1000).optional(),
    power_profiles: z
      .array(
        z
          .object({
            volts: z.number().positive().max(100),
            amps: z.number().positive().max(30),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    cable_included: z.boolean().optional(),
    cable_type: text.optional(),
    cable_length_m: z.number().positive().max(100).optional(),
    capacity_mah: z.number().int().positive().max(1000000).optional(),
    capacity_wh: z.number().positive().max(10000).optional(),
    nominal_voltage_v: z.number().positive().max(100).optional(),
    plug_type: text.optional(),
    material: text.optional(),
    color: text.optional(),
    fit_note: z.string().trim().max(500).optional(),
  })
  .strict();
const mediaUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (/^\/(?!\/)[A-Za-z0-9/_.-]+$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS URL or local asset path");
export const variantDetailsSchema = z
  .object({
    variant_id: z.string().uuid(),
    source: z.string().trim().min(3).max(1000),
    models: z
      .array(
        z
          .object({
            brand: text,
            model: text,
            model_number: z.string().trim().max(150).default(""),
          })
          .strict(),
      )
      .max(100),
    specifications: specificationsSchema,
    remove_specifications: z
      .array(
        z.enum(
          Object.keys(specificationsSchema.shape) as [string, ...string[]],
        ),
      )
      .max(30)
      .optional(),
    media: z
      .array(
        z
          .object({ url: mediaUrl, alt: z.string().trim().min(3).max(300) })
          .strict(),
      )
      .max(12)
      .optional(),
    category: z
      .object({
        name: text,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(100),
      })
      .strict()
      .optional(),
    brand: text.optional(),
  })
  .strict();
export type VariantDetailsInput = z.input<typeof variantDetailsSchema>;

/** Call inside commerce.transaction. Fit/media replace only this SKU; supplied spec fields patch existing values. */
export async function saveVariantDetails(
  client: PoolClient,
  raw: VariantDetailsInput,
  actor: Actor,
) {
  if (actor.role !== "owner")
    throw new CommerceError("FORBIDDEN", "Owner permission required", 403);
  const input = variantDetailsSchema.parse(raw);
  if (
    input.remove_specifications?.some((key) =>
      Object.hasOwn(input.specifications, key),
    )
  )
    throw new CommerceError(
      "SPECIFICATIONS_CONFLICT",
      "A specification cannot be set and removed in the same command",
      400,
    );
  const keys = input.models.map((model) =>
    JSON.stringify([model.brand, model.model, model.model_number]),
  );
  if (new Set(keys).size !== keys.length)
    throw new CommerceError(
      "MODELS_DUPLICATE",
      "List each device model once",
      400,
    );
  // A connector does not imply protocol or output watts; these remain independently supplied fields.
  const selected = await client.query(
    "SELECT id,product_id FROM variants WHERE id=$1 FOR UPDATE",
    [input.variant_id],
  );
  if (!selected.rowCount)
    throw new CommerceError("NOT_FOUND", "Variant not found", 404);
  const productId = selected.rows[0].product_id as string;
  await client.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [
    productId,
  ]);
  const existingSpecifications = Object.fromEntries(
    (
      await client.query(
        "SELECT attribute,value FROM specifications WHERE variant_id=$1",
        [input.variant_id],
      )
    ).rows.map((row) => [row.attribute, row.value]),
  );
  const merged = { ...existingSpecifications, ...input.specifications };
  for (const key of input.remove_specifications ?? []) delete merged[key];
  const combined = specificationsSchema.parse(
    Object.fromEntries(
      Object.keys(specificationsSchema.shape)
        .filter((key) => merged[key] !== undefined)
        .map((key) => [key, merged[key]]),
    ),
  );
  if (
    combined.max_output_w &&
    combined.power_profiles?.some(
      (profile) => profile.volts * profile.amps > combined.max_output_w! + 0.01,
    )
  ) {
    throw new CommerceError(
      "SPECIFICATIONS_CONFLICT",
      "A power profile exceeds the declared maximum output",
      400,
    );
  }
  if (input.category) {
    const category = await client.query(
      "INSERT INTO categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id",
      [input.category.name, input.category.slug],
    );
    await client.query("UPDATE products SET category_id=$2 WHERE id=$1", [
      productId,
      category.rows[0].id,
    ]);
  }
  if (input.brand) {
    const brand = await client.query(
      "INSERT INTO brands(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
      [input.brand],
    );
    await client.query("UPDATE products SET brand_id=$2 WHERE id=$1", [
      productId,
      brand.rows[0].id,
    ]);
  }
  await client.query("DELETE FROM compatibility WHERE variant_id=$1", [
    input.variant_id,
  ]);
  for (const model of input.models) {
    let device = await client.query(
      "SELECT id FROM device_models WHERE brand=$1 AND model=$2 AND coalesce(model_number,'')=$3 ORDER BY id LIMIT 1",
      [model.brand, model.model, model.model_number],
    );
    if (!device.rowCount)
      device = await client.query(
        "INSERT INTO device_models(brand,model,model_number) VALUES($1,$2,$3) ON CONFLICT(brand,model,model_number) DO UPDATE SET model=excluded.model RETURNING id",
        [model.brand, model.model, model.model_number],
      );
    await client.query(
      "INSERT INTO compatibility(variant_id,device_model_id,fit_note,source,verified_at) VALUES($1,$2,$3,$4,now())",
      [
        input.variant_id,
        device.rows[0].id,
        combined.fit_note ?? "",
        input.source,
      ],
    );
  }
  // Patch only explicit fields. Unknown older fields and their evidence remain intact.
  if (input.remove_specifications?.length)
    await client.query(
      "DELETE FROM specifications WHERE variant_id=$1 AND attribute=ANY($2::text[])",
      [input.variant_id, input.remove_specifications],
    );
  for (const [attribute, value] of Object.entries(input.specifications)) {
    if (value !== undefined)
      await client.query(
        "INSERT INTO specifications(variant_id,attribute,value,source,verified_at) VALUES($1,$2,$3::jsonb,$4,now()) ON CONFLICT(variant_id,attribute) DO UPDATE SET value=excluded.value,source=excluded.source,verified_at=excluded.verified_at",
        [input.variant_id, attribute, JSON.stringify(value), input.source],
      );
  }
  if (input.media) {
    await client.query("DELETE FROM product_media WHERE variant_id=$1", [
      input.variant_id,
    ]);
    for (const [index, media] of input.media.entries())
      await client.query(
        "INSERT INTO product_media(product_id,variant_id,url,alt,sort_order) VALUES($1,$2,$3,$4,$5)",
        [productId, input.variant_id, media.url, media.alt, index],
      );
  }
  await client.query(
    "INSERT INTO audit_events(actor_id,action,entity_type,entity_id,reason,metadata) VALUES($1,'variant.details','variant',$2,$3,$4)",
    [
      actor.id,
      input.variant_id,
      input.source,
      JSON.stringify({
        models: input.models.length,
        specification_fields: Object.keys(input.specifications),
        media_count: input.media?.length,
        product_id: productId,
      }),
    ],
  );
  return {
    variant_id: input.variant_id,
    product_id: productId,
    compatible_models: input.models.length,
    specification_fields: Object.keys(input.specifications),
  };
}
