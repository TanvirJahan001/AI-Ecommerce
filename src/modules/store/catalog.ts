import type { Pool } from "pg";

type ProductRow = {
  id: string;
  [column: string]: unknown;
};
type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  label: string;
  price_minor: string;
  available: number;
};
type MediaRow = { variant_id: string; url: string; alt: string };
type ModelRow = {
  variant_id: string;
  brand: string;
  model: string;
  model_number: string;
  source: string;
};
type SpecificationRow = {
  variant_id: string;
  attribute: string;
  value: unknown;
  source: string;
};

function groupByVariant<T extends { variant_id: string }>(rows: T[]) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const group = result.get(row.variant_id);
    if (group) group.push(row);
    else result.set(row.variant_id, [row]);
  }
  return result;
}

export async function catalog(
  db: Pool,
  options: { includeDrafts?: boolean } = {},
) {
  const products = (
    await db.query<ProductRow>(
      `select p.*,c.name category,b.name brand from products p left join categories c on c.id=p.category_id left join brands b on b.id=p.brand_id where ($1::boolean or p.published=true) order by p.name`,
      [options.includeDrafts === true],
    )
  ).rows;
  if (!products.length) return [];
  const variants = (
    await db.query<VariantRow>(
      `select id,product_id,sku,label,price_minor,sellable_qty-committed_qty available
     from variants where product_id=any($1::uuid[]) and active=true order by sku`,
      [products.map((product) => product.id)],
    )
  ).rows;
  const ids = variants.map((variant) => variant.id);
  // Five queries for the entire catalog, independent of its product/SKU count.
  const [mediaResult, modelResult, specificationResult] = ids.length
    ? await Promise.all([
        db.query<MediaRow>(
          "select variant_id,url,alt from product_media where variant_id=any($1::uuid[]) order by variant_id,sort_order,id",
          [ids],
        ),
        db.query<ModelRow>(
          `select c.variant_id,dm.brand,dm.model,coalesce(dm.model_number,'') model_number,c.source
       from compatibility c join device_models dm on dm.id=c.device_model_id
       where c.variant_id=any($1::uuid[]) order by c.variant_id,dm.brand,dm.model,dm.model_number`,
          [ids],
        ),
        db.query<SpecificationRow>(
          "select variant_id,attribute,value,source from specifications where variant_id=any($1::uuid[]) order by variant_id,attribute",
          [ids],
        ),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }];
  const media = groupByVariant(mediaResult.rows);
  const models = groupByVariant(modelResult.rows);
  const specifications = groupByVariant(specificationResult.rows);
  const byProduct = new Map<string, unknown[]>();
  for (const variant of variants) {
    const fit = models.get(variant.id) ?? [];
    const facts = specifications.get(variant.id) ?? [];
    const entry = {
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      price_minor: Number(variant.price_minor),
      available: variant.available,
      media: (media.get(variant.id) ?? []).map(({ url, alt }) => ({
        url,
        alt,
      })),
      models: fit.map(({ brand, model, model_number }) => ({
        brand,
        model,
        model_number,
      })),
      source: facts[0]?.source ?? fit[0]?.source ?? "",
      compatibility: fit.map(({ brand, model }) => `${brand} ${model}`),
      specifications: Object.fromEntries(
        facts.map(({ attribute, value }) => [attribute, value]),
      ),
    };
    const group = byProduct.get(variant.product_id);
    if (group) group.push(entry);
    else byProduct.set(variant.product_id, [entry]);
  }
  return products.map((product) => ({
    ...product,
    variants: byProduct.get(product.id) ?? [],
  }));
}
