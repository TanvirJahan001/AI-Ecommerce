import type { Pool } from "pg";
export async function catalog(
  db: Pool,
  options: { includeDrafts?: boolean } = {},
) {
  const p = (
    await db.query(
      `select p.*,c.name category,b.name brand from products p left join categories c on c.id=p.category_id left join brands b on b.id=p.brand_id where ($1::boolean or published=true) order by p.name`,
      [options.includeDrafts === true],
    )
  ).rows;
  for (const product of p) {
    const variants = (
      await db.query(
        `select id,sku,label,price_minor,sellable_qty-committed_qty available from variants where product_id=$1 and active=true order by sku`,
        [product.id],
      )
    ).rows;
    for (const v of variants) {
      v.price_minor = Number(v.price_minor);
      v.media = (
        await db.query(
          "select url,alt from product_media where variant_id=$1 order by sort_order,id",
          [v.id],
        )
      ).rows;
      v.models = (
        await db.query(
          "select dm.brand,dm.model,coalesce(dm.model_number,'') model_number from compatibility c join device_models dm on dm.id=c.device_model_id where c.variant_id=$1 order by dm.brand,dm.model",
          [v.id],
        )
      ).rows;
      v.source =
        (
          await db.query(
            "select source from specifications where variant_id=$1 union all select source from compatibility where variant_id=$1 limit 1",
            [v.id],
          )
        ).rows[0]?.source ?? "";
      v.compatibility = (
        await db.query(
          `select dm.brand||' '||dm.model model from compatibility c join device_models dm on dm.id=c.device_model_id where variant_id=$1`,
          [v.id],
        )
      ).rows.map((r) => r.model);
      v.specifications = Object.fromEntries(
        (
          await db.query(
            "select attribute,value from specifications where variant_id=$1",
            [v.id],
          )
        ).rows.map((r) => [r.attribute, r.value]),
      );
    }
    product.variants = variants;
  }
  return p;
}
