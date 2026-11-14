import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV === "production")
  throw Error("Fictional seed forbidden in production");
try {
  await p.query(
    `insert into categories(name,slug) values('Phone cases','cases'),('Chargers','chargers') on conflict do nothing`,
  );
  for (const [slug, name, category, sku, label, price] of [
    [
      "clear-case",
      "Fictional clear case",
      "cases",
      "CASE-Z-CLEAR",
      "Phone Z · Clear",
      125000,
    ],
    [
      "clear-case-q",
      "Fictional clear case Q",
      "cases",
      "CASE-Q-CLEAR",
      "Phone Q · Clear",
      115000,
    ],
    [
      "usb-c-charger",
      "Fictional USB-C 30 W charger",
      "chargers",
      "CHG-30C",
      "USB-C · PD 30 W",
      185000,
    ],
  ] as const) {
    const product = (
      await p.query(
        `insert into products(category_id,slug,name,description,published) select id,$1,$2,'Illustrative sample; specifications are fictional test data.',true from categories where slug=$3 on conflict(slug) do update set name=excluded.name returning id`,
        [slug, name, category],
      )
    ).rows[0];
    await p.query(
      `insert into variants(product_id,sku,label,price_minor,sellable_qty) values($1,$2,$3,$4,10) on conflict(sku) do nothing`,
      [product.id, sku, label, price],
    );
  }
  for (const model of ["Phone Z", "Phone Q"]) {
    await p.query(
      `insert into device_models(brand,model,model_number) values('Fictional', $1,$1) on conflict do nothing`,
      [model],
    );
    await p.query(
      `insert into compatibility(variant_id,device_model_id,source) select v.id,d.id,'Fictional seed only' from variants v,device_models d where v.sku=$1 and d.model=$2 on conflict do nothing`,
      [model === "Phone Z" ? "CASE-Z-CLEAR" : "CASE-Q-CLEAR", model],
    );
  }
  for (const [a, v] of Object.entries({
    output_connector: "USB-C",
    protocols: ["USB Power Delivery"],
    max_output_w: 30,
    cable_included: false,
    power_profiles: [
      { volts: 5, amps: 3 },
      { volts: 9, amps: 3 },
      { volts: 15, amps: 2 },
    ],
  }))
    await p.query(
      `insert into specifications(variant_id,attribute,value,source) select id,$1,$2::jsonb,'Fictional test fixture' from variants where sku='CHG-30C' on conflict do nothing`,
      [a, JSON.stringify(v)],
    );
  await p.query(
    "insert into inventory_movements(variant_id,actor_id,kind,quantity_delta,physical_delta,sellable_delta,idempotency_key,reason) select id,'fictional-seed','receipt',10,10,10,'seed-opening:'||sku,'Fictional opening stock' from variants where sku in ('CASE-Z-CLEAR','CASE-Q-CLEAR','CHG-30C') on conflict(idempotency_key) do nothing",
  );
  if (process.env.STORE_DEV_ADAPTERS === "true") {
    await p.query(
      "update store_settings set value='true' where key in ('cod_enabled','online_enabled')",
    );
    await p.query(
      "insert into shipping_rates(district,fee_minor,enabled) values('Dhaka',6000,true) on conflict(district) do update set fee_minor=6000,enabled=true",
    );
  }
  console.log(
    "Fictional catalog seeded; development shipping rate is illustrative only",
  );
} finally {
  await p.end();
}
