"use client";

import { useState, useRef } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api, money, Notice } from "./store";
import { parseBdtInput, formatBdtInput } from "@/lib/money-input";

type Model = { brand: string; model: string; model_number: string };
type Media = { url: string; alt: string };
export type CatalogVariant = {
  id: string;
  sku: string;
  label: string;
  price_minor: number;
  available: number;
  specifications?: Record<string, unknown>;
  models?: Model[];
  source?: string;
  media?: Media[];
  compatibility?: string[];
};
export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  published?: boolean;
  category?: string;
  brand?: string;
  variants: CatalogVariant[];
};

type Props = { products: CatalogProduct[]; onSaved: () => void };
export default function CatalogEditor({ products, onSaved }: Props) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{
    product?: CatalogProduct;
    variant?: CatalogVariant;
  } | null>(null);
  const matches = products.filter((p) =>
    `${p.name} ${p.variants.map((v) => v.sku).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="card">
        <div className="section-heading">
          <h2>Products & SKUs</h2>
          <button onClick={() => setSelection({})}>Create product</button>
        </div>
        <label>
          Find product or SKU
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or SKU"
          />
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {matches.flatMap((p) =>
            p.variants.map((v) => (
              <article className="card" key={v.id}>
                <h3>{p.name}</h3>
                <p>{v.label}</p>
                <p className="mono">{v.sku}</p>
                <p>
                  <strong style={{ whiteSpace: "nowrap" }}>
                    {money(v.price_minor)}
                  </strong>
                </p>
                <p>
                  <span className="badge">
                    {p.published ? "Published" : "Draft"}
                  </span>
                </p>
                <button
                  className="secondary"
                  onClick={() => setSelection({ product: p, variant: v })}
                  aria-label={`Edit ${v.sku}`}
                >
                  Edit
                </button>
              </article>
            )),
          )}
        </div>
        {matches.length === 0 ? <p>No matching products.</p> : null}
      </section>
      {selection ? (
        <ProductEditor
          key={selection.variant?.id ?? selection.product?.id ?? "new"}
          products={products}
          product={selection.product}
          variant={selection.variant}
          onSaved={() => {
            onSaved();
          }}
          onClose={() => setSelection(null)}
          onSelect={setSelection}
        />
      ) : (
        <section className="card">
          <h2>Catalog editing</h2>
          <p>
            Choose Edit beside a SKU, or create a product. Fit, specifications
            and media belong to the selected SKU.
          </p>
        </section>
      )}
    </>
  );
}
function ProductEditor({
  products,
  product,
  variant,
  onSaved,
  onClose,
  onSelect,
}: {
  products: CatalogProduct[];
  product?: CatalogProduct;
  variant?: CatalogVariant;
  onSaved: () => void;
  onClose: () => void;
  onSelect: (selection: {
    product?: CatalogProduct;
    variant?: CatalogVariant;
  }) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = variant?.specifications ?? {};
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [variantLabel, setVariantLabel] = useState(variant?.label ?? "");
  const [price, setPrice] = useState(
    formatBdtInput(Number(variant?.price_minor ?? 0)),
  );
  const [source, setSource] = useState(variant?.source ?? "");
  const [models, setModels] = useState<Model[]>(variant?.models ?? []);
  const [media, setMedia] = useState<Media[]>(variant?.media ?? []);
  const [spec, setSpec] = useState<Record<string, unknown>>(initial);
  const [profiles, setProfiles] = useState<{ volts: string; amps: string }[]>(
    Array.isArray(initial.power_profiles)
      ? initial.power_profiles.map((p) => ({
          volts: String(p.volts ?? ""),
          amps: String(p.amps ?? ""),
        }))
      : [],
  );
  const [protocols, setProtocols] = useState<string[]>(
    Array.isArray(initial.protocols) ? initial.protocols.map(String) : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [savedProductId, setSavedProductId] = useState(product?.id);
  const [savedVariantId, setSavedVariantId] = useState(variant?.id);
  const [savedListing, setSavedListing] = useState({
    slug: product?.slug ?? "",
    published: product?.published === true,
  });
  const key = useRef("");
  const change = (field: string, value: unknown) =>
    setSpec((s) => ({ ...s, [field]: value }));
  const stringFields = [
    "input_connector",
    "output_connector",
    "connector",
    "cable_type",
    "plug_type",
    "material",
    "color",
    "fit_note",
  ];
  const numberFields = [
    "max_output_w",
    "cable_length_m",
    "capacity_mah",
    "capacity_wh",
    "nominal_voltage_v",
  ];
  function specifications() {
    const result: Record<string, unknown> = {};
    for (const field of stringFields) {
      if (String(spec[field] ?? "").trim())
        result[field] = String(spec[field]).trim();
    }
    for (const field of numberFields) {
      if (spec[field] !== undefined && String(spec[field]) !== "")
        result[field] = Number(spec[field]);
    }
    if (spec.cable_included === true || spec.cable_included === false)
      result.cable_included = spec.cable_included;
    if (protocols.filter((p) => p.trim()).length)
      result.protocols = protocols.map((p) => p.trim()).filter(Boolean);
    if (profiles.length)
      result.power_profiles = profiles.map((p) => ({
        volts: Number(p.volts),
        amps: Number(p.amps),
      }));
    return result;
  }
  async function save(publish: boolean) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const priceMinor = parseBdtInput(price);
      const typed = specifications();
      const hasDetails =
        Object.keys(typed).length > 0 || models.length > 0 || media.length > 0;
      if ((hasDetails || publish) && source.trim().length < 3)
        throw Error(
          "Enter the verification source before saving fit, specifications or publishing.",
        );
      if (!key.current) key.current = crypto.randomUUID();
      const saved = await api<{ product_id: string }>(undefined, {
        action: "admin.command",
        command: "product.save",
        idempotency_key: key.current,
        product_id: savedProductId,
        variant_id: savedVariantId,
        slug,
        name,
        description,
        category,
        brand,
        sku,
        label: variantLabel,
        price_minor: priceMinor,
        published: false,
      });
      setSavedProductId(saved.product_id);
      setSavedListing({ slug, published: false });
      const refreshed = await api<{ products: CatalogProduct[] }>(
        "resource=admin",
      );
      const savedProduct = refreshed.products.find(
        (p) => p.id === saved.product_id,
      );
      const savedVariant = savedProduct?.variants.find((v) => v.sku === sku);
      if (!savedProduct || !savedVariant)
        throw Error(
          "The draft was saved, but the SKU could not be reloaded. Refresh the catalog.",
        );
      setSavedVariantId(savedVariant.id);
      setSavedListing({ slug: savedProduct.slug, published: false });
      if (source.trim().length >= 3) {
        const controlled = [
          ...stringFields,
          ...numberFields,
          "cable_included",
          "protocols",
          "power_profiles",
        ];
        await api(undefined, {
          action: "admin.command",
          command: "variant.details",
          idempotency_key: `${key.current}:details`,
          variant_id: savedVariant.id,
          source,
          models: models.filter((m) => m.brand.trim() || m.model.trim()),
          specifications: typed,
          remove_specifications: controlled.filter(
            (f) => typed[f] === undefined,
          ),
          media,
        });
      }
      if (publish) {
        await api(undefined, {
          action: "admin.command",
          command: "product.save",
          idempotency_key: `${key.current}:publish`,
          product_id: saved.product_id,
          variant_id: savedVariant.id,
          slug,
          name,
          description,
          category,
          brand,
          sku,
          label: variantLabel,
          price_minor: priceMinor,
          published: true,
        });
        setSavedListing({ slug: savedProduct.slug, published: true });
      }
      key.current = "";
      onSaved();
      setMessage(
        `${publish ? "Published" : "Saved draft"}: ${name} · ${sku}. Values were reloaded from the store.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save(false);
  }
  function moveMedia(index: number, direction: number) {
    setMedia((current) => {
      const rows = [...current];
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      [rows[index], rows[target]] = [rows[target], rows[index]];
      return rows;
    });
  }
  const numeric = (field: string, caption: string) => (
    <label key={field}>
      {caption}
      <input
        type="number"
        min="0"
        step="any"
        value={String(spec[field] ?? "")}
        onChange={(e) => change(field, e.target.value)}
      />
    </label>
  );
  return (
    <section className="card" aria-label="Product editor">
      <div className="section-heading">
        <h2>{savedVariantId ? `Edit ${sku}` : "Create product and SKU"}</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close editor
        </button>
      </div>
      <Notice error={error} message={message} />
      {savedProductId && !savedListing.published ? (
        <p>
          This product is a draft and is hidden from the storefront. Use Preview
          product to review it here, then Save and publish when its
          specifications and verification source are ready. Record stock in
          Inventory before selling.
        </p>
      ) : null}
      {product ? (
        <div className="button-row">
          {product.variants.map((v) => (
            <button
              key={v.id}
              className="secondary"
              onClick={() => onSelect({ product, variant: v })}
            >
              {v.sku}
            </button>
          ))}
          <button className="secondary" onClick={() => onSelect({ product })}>
            Add variant
          </button>
        </div>
      ) : null}
      {!product ? (
        <label>
          Product family
          <select
            value={savedProductId ?? ""}
            onChange={(e) => {
              const selected = products.find((p) => p.id === e.target.value);
              if (selected) onSelect({ product: selected });
            }}
          >
            <option value="">New product family</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <form ref={formRef} className="form-stack" onSubmit={submit}>
        <fieldset>
          <legend>Product and sellable variant</legend>
          <div className="field-grid">
            <label>
              Product name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={150}
              />
            </label>
            <label>
              URL slug
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]+"
              />
            </label>
            <label>
              Category
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label>
              Brand
              <input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label>
              SKU
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
              />
            </label>
            <label>
              Variant label
              <input
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                required
              />
            </label>
            <label>
              Price (BDT)
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                aria-describedby="bdt-hint"
              />
            </label>
          </div>
          <p id="bdt-hint" className="muted">
            Enter taka with up to two decimal places, for example 1850.50.
          </p>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Exact SKU compatibility</legend>
          <p className="muted">
            Add only the verified models that fit this SKU. Other variants
            retain their own fit.
          </p>
          {models.map((model, index) => (
            <div className="field-grid" key={index}>
              <label>
                Device brand
                <input
                  value={model.brand}
                  onChange={(e) =>
                    setModels((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, brand: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label>
                Device model
                <input
                  value={model.model}
                  onChange={(e) =>
                    setModels((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, model: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label>
                Model number
                <input
                  value={model.model_number}
                  onChange={(e) =>
                    setModels((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, model_number: e.target.value }
                          : r,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setModels((rows) => rows.filter((_, i) => i !== index))
                }
              >
                Remove model {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setModels((rows) => [
                ...rows,
                { brand: "", model: "", model_number: "" },
              ])
            }
          >
            Add compatible model
          </button>
        </fieldset>
        <fieldset>
          <legend>Specifications</legend>
          <div className="field-grid">
            {[
              ["input_connector", "Input connector"],
              ["output_connector", "Output connector"],
              ["connector", "Other connector"],
            ].map(([field, caption]) => (
              <label key={field}>
                {caption}
                <select
                  aria-label={caption}
                  value={String(spec[field] ?? "")}
                  onChange={(e) => change(field, e.target.value)}
                >
                  <option value="">Not specified</option>
                  {[
                    "USB-C",
                    "USB-A",
                    "Micro-USB",
                    "Lightning",
                    "3.5 mm",
                    "AC",
                    "Other",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            {numeric("max_output_w", "Maximum output (W)")}
            {numeric("cable_length_m", "Cable length (m)")}
            {numeric("capacity_mah", "Capacity (mAh)")}
            {numeric("capacity_wh", "Capacity (Wh)")}
            {numeric("nominal_voltage_v", "Nominal voltage (V)")}
            <label>
              Cable inclusion
              <select
                aria-label="Cable inclusion"
                value={
                  spec.cable_included === true
                    ? "yes"
                    : spec.cable_included === false
                      ? "no"
                      : ""
                }
                onChange={(e) =>
                  change(
                    "cable_included",
                    e.target.value === "yes"
                      ? true
                      : e.target.value === "no"
                        ? false
                        : undefined,
                  )
                }
              >
                <option value="">Not specified</option>
                <option value="yes">Cable included</option>
                <option value="no">Cable not included</option>
              </select>
            </label>
            {[
              ["cable_type", "Cable type"],
              ["plug_type", "Plug type"],
              ["material", "Material"],
              ["color", "Color"],
              ["fit_note", "Fit notes"],
            ].map(([field, caption]) => (
              <label key={field}>
                {caption}
                <input
                  value={String(spec[field] ?? "")}
                  onChange={(e) => change(field, e.target.value)}
                />
              </label>
            ))}
          </div>
          <h3>Supported charging protocols</h3>
          {protocols.map((protocol, index) => (
            <div className="button-row" key={index}>
              <label>
                Protocol {index + 1}
                <input
                  value={protocol}
                  onChange={(e) =>
                    setProtocols((rows) =>
                      rows.map((v, i) => (i === index ? e.target.value : v)),
                    )
                  }
                  required
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setProtocols((rows) => rows.filter((_, i) => i !== index))
                }
              >
                Remove protocol {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setProtocols((rows) => [...rows, ""])}
          >
            Add protocol
          </button>
          <h3>Voltage / current profiles</h3>
          {profiles.map((profile, index) => (
            <div className="field-grid" key={index}>
              <label>
                Profile {index + 1} voltage (V)
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={profile.volts}
                  onChange={(e) =>
                    setProfiles((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, volts: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label>
                Profile {index + 1} current (A)
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={profile.amps}
                  onChange={(e) =>
                    setProfiles((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, amps: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setProfiles((rows) => rows.filter((_, i) => i !== index))
                }
              >
                Remove profile {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setProfiles((rows) => [...rows, { volts: "", amps: "" }])
            }
          >
            Add power profile
          </button>
          <p className="muted">
            Connector shape does not establish protocol, power or device fit.
            Values outside these controls remain preserved.
          </p>
        </fieldset>
        <fieldset>
          <legend>Verification source</legend>
          <label>
            Source or evidence reference
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={1000}
              placeholder="Manufacturer specification or reviewed product label"
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>URL-based media</legend>
          <p className="muted">
            The first image is the cover. Native file upload is not implemented.
          </p>
          {media.map((image, index) => (
            <div className="card" key={index}>
              <label>
                Image {index + 1} URL
                <input
                  type="text"
                  value={image.url}
                  onChange={(e) =>
                    setMedia((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, url: e.target.value } : r,
                      ),
                    )
                  }
                  required
                />
              </label>
              <label>
                Image {index + 1} alt text
                <input
                  value={image.alt}
                  onChange={(e) =>
                    setMedia((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, alt: e.target.value } : r,
                      ),
                    )
                  }
                  required
                  minLength={3}
                />
              </label>
              {/^https:\/\//.test(image.url) || /^\/(?!\/)/.test(image.url) ? (
                <div className="media-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt || "Image preview"}
                    referrerPolicy="no-referrer"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 160,
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={index === 0}
                  onClick={() => moveMedia(index, -1)}
                >
                  Move image {index + 1} up
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={index === media.length - 1}
                  onClick={() => moveMedia(index, 1)}
                >
                  Move image {index + 1} down
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setMedia((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  Remove image {index + 1}
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setMedia((rows) => [...rows, { url: "", alt: "" }])}
          >
            Add image URL
          </button>
        </fieldset>
        <div className="button-row">
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setPreview(!preview)}
          >
            {preview ? "Hide preview" : "Preview product"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (formRef.current?.reportValidity()) void save(true);
            }}
          >
            Save and publish
          </button>
          {savedProductId && savedListing.published ? (
            <Link href={`/products/${savedListing.slug}`} target="_blank">
              Open storefront page
            </Link>
          ) : null}
        </div>
        {preview ? (
          <section className="card" aria-label="Product preview">
            <h3>
              {name || "Product name"} · {variantLabel || "Variant"}
            </h3>
            <p>{description}</p>
            <p>{price || "0.00"} BDT</p>
            <p>
              {models.length
                ? models
                    .map((m) => `${m.brand} ${m.model} ${m.model_number}`)
                    .join(", ")
                : "No device-specific compatibility claim"}
            </p>
            <p>
              {String(spec.output_connector ?? "Connector not specified")} ·{" "}
              {protocols.join(", ") || "Protocols not specified"} ·{" "}
              {String(spec.max_output_w ?? "—")} W
            </p>
            <p>
              {spec.cable_included === true
                ? "Cable included"
                : spec.cable_included === false
                  ? "Cable not included"
                  : "Cable inclusion not specified"}
            </p>
          </section>
        ) : null}
      </form>
    </section>
  );
}
