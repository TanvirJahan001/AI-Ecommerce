"use client";
import Link from "next/link";
import Specifications from "./specifications";
import AccessState, { friendlyAccessMessage } from "./access-state";
import { displayBdt } from "@/lib/money-input";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

export type Variant = {
  id: string;
  sku: string;
  label: string;
  price_minor: number;
  available: number;
  compatibility?: string[];
  specifications?: Record<string, unknown>;
  media?: { url: string; alt: string }[];
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category?: string;
  brand?: string;
  variants: Variant[];
};
type CartItem = {
  variant_id: string;
  sku: string;
  name: string;
  quantity: number;
  price_minor: number;
};
type Cart = {
  items: CartItem[];
  items_minor: number;
  delivery_minor: number;
  total_minor: number;
  discount_minor?: number;
  development?: boolean;
};
export type JsonRow = Record<string, unknown>;
export function money(value: unknown) {
  return displayBdt(String(value ?? 0));
}
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function label(value: unknown) {
  return String(value ?? "")
    .replace(/_minor$/, " (BDT)")
    .replaceAll("_", " ");
}
export async function api<T>(
  resource?: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`/api/store${resource ? `?${resource}` : ""}`, {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.code ?? "OPERATION_FAILED",
      response.status,
      friendlyAccessMessage(result.code) ??
        (result.message && !/^[A-Z_]+$/.test(result.message)
          ? result.message
          : "This action could not be completed. Refresh the record and try again."),
    );
  return result as T;
}
export function useResource<T>(resource: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string>();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    api<T>(resource)
      .then((result) => {
        if (alive) {
          setData(result);
          setError("");
          setErrorCode(undefined);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(String(err.message));
          setErrorCode(err.code);
          setData(undefined);
        }
      });
    return () => {
      alive = false;
    };
  }, [resource, version]);
  return { data, error, errorCode, reload: () => setVersion((v) => v + 1) };
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <nav className="shell nav">
          <Link href="/" className="wordmark">
            <span className="logo" aria-hidden="true">
              M
            </span>
            <span>
              Mobile Accessories
              <span className="brand-small">STORE · BANGLADESH</span>
            </span>
          </Link>
          <div className="nav-links">
            <Link href="/">Shop</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/account">Account</Link>
            <Link href="/admin">Admin</Link>
          </div>
        </nav>
      </header>
      <main id="main" className="shell">
        {children}
      </main>
      <footer className="footer">
        <div className="shell footer-grid">
          <div>
            <strong>Mobile Accessories Store</strong>
            <p>Find the right fit. Check every detail.</p>
            <div className="footer-links">
              <Link href="/policies/shipping">Shipping</Link>
              <Link href="/policies/returns">Returns</Link>
              <Link href="/policies/privacy">Privacy</Link>
              <Link href="/policies/contact">Contact</Link>
              <Link href="/recover">Order recovery</Link>
            </div>
          </div>
          <p>
            Bangladesh only · Prices in BDT
            <br />
            Specifications and compatibility are listed per SKU.
          </p>
        </div>
      </footer>
    </>
  );
}
export function Notice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return error ? (
    <div className="notice danger" role="alert">
      {error}
    </div>
  ) : message ? (
    <div className="notice" role="status">
      {message}
    </div>
  ) : null;
}
export function Art({
  type,
  small = false,
}: {
  type: string;
  small?: boolean;
}) {
  const charger = /charg|power|adapter/i.test(type);
  return (
    <div
      className={`product-art ${small ? "small" : ""}`}
      aria-label="Illustrative placeholder"
    >
      <div className={charger ? "charger-art" : "case-art"}>
        {charger ? (
          <>
            <span>POWER</span>
            <i />
          </>
        ) : (
          <>
            <i />
            <i />
            <i />
          </>
        )}
      </div>
      <span className="placeholder-label">Illustrative product</span>
    </div>
  );
}
function ProductVisual({ variant, name }: { variant?: Variant; name: string }) {
  const [failed, setFailed] = useState(false);
  const image = variant?.media?.[0];
  if (!image || failed) return <Art type={name} />;
  return (
    <div className="product-photo">
      {/* Owner-managed images use the browser transport; remote hosts are not fetched by the application server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.alt || name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
export function Storefront({ slug }: { slug?: string }) {
  const { data, error } = useResource<{ products: Product[] }>(
    "resource=catalog",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [device, setDevice] = useState("");
  const [sort, setSort] = useState("name");
  const [brand, setBrand] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(false);
  const products = data?.products || [];
  const selected = slug ? products.find((p) => p.slug === slug) : undefined;
  const devices = [
    ...new Set(
      products.flatMap((p) => p.variants.flatMap((v) => v.compatibility || [])),
    ),
  ];
  const filtered = products
    .filter(
      (p) =>
        `${p.name} ${p.description}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!category || p.category === category) &&
        (!brand || p.brand === brand) &&
        p.variants.some(
          (v) =>
            (!minPrice || v.price_minor >= Number(minPrice) * 100) &&
            (!maxPrice || v.price_minor <= Number(maxPrice) * 100) &&
            (!inStock || v.available > 0) &&
            (!device || v.compatibility?.includes(device)),
        ),
    )
    .sort((a, b) =>
      sort === "price"
        ? Number(a.variants[0]?.price_minor) -
          Number(b.variants[0]?.price_minor)
        : a.name.localeCompare(b.name),
    );
  return (
    <Shell>
      {slug ? (
        <section className="section">
          <Link href="/">← All accessories</Link>
          {selected ? (
            <ProductDetails product={selected} />
          ) : (
            <p>{data ? "This product is unavailable." : "Loading product…"}</p>
          )}
        </section>
      ) : (
        <>
          <section className="hero">
            <div>
              <p className="eyebrow">EVERYDAY TECH, CLEAR CHOICES</p>
              <h1>
                Small accessories.
                <br />
                <span>A better everyday.</span>
              </h1>
              <p>
                Discover cases, chargers and essentials with the specifications
                you need and compatibility you can check.
              </p>
              <a className="button" href="#catalog">
                Explore accessories <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="hero-art">
              <Art type="case" />
              <div className="hero-note">
                <span className="dot" /> Pick your exact device model
              </div>
            </div>
          </section>
          <div className="benefits">
            <span>⌕ &nbsp; Exact model compatibility</span>
            <span>৳ &nbsp; Clear BDT prices</span>
            <span>◎ &nbsp; Bangladesh delivery</span>
          </div>
          <section id="catalog" className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">FIND YOUR ESSENTIALS</p>
                <h2>Made for your daily connection</h2>
              </div>
              <span className="muted">{filtered.length} products</span>
            </div>
            <div className="filters">
              <label>
                Search
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accessories"
                />
              </label>
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {[
                    ...new Set(products.map((p) => p.category).filter(Boolean)),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Device model
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  <option value="">Any device</option>
                  {devices.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Brand
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  <option value="">All brands</option>
                  {[
                    ...new Set(products.map((p) => p.brand).filter(Boolean)),
                  ].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label>
                Minimum price (BDT)
                <input
                  type="number"
                  min="0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </label>
              <label>
                Maximum price (BDT)
                <input
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </label>
              <label className="radio-row">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                />
                In stock only
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="name">Name</option>
                  <option value="price">Price: low to high</option>
                </select>
              </label>
            </div>
            <Notice error={error} />
            {!data && !error ? (
              <p role="status">Loading catalog…</p>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <h3>No matching accessories</h3>
                <p>Try a different search or device model.</p>
                <button
                  onClick={() => {
                    setSearch("");
                    setCategory("");
                    setDevice("");
                    setBrand("");
                    setMinPrice("");
                    setMaxPrice("");
                    setInStock(false);
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="product-grid">
                {filtered.map((p) => (
                  <article className="product-card" key={p.id}>
                    <Link className="image-link" href={`/products/${p.slug}`}>
                      <ProductVisual variant={p.variants[0]} name={p.name} />
                    </Link>
                    <div className="product-copy">
                      <p className="eyebrow">{p.category || "ACCESSORIES"}</p>
                      <h3>
                        <Link href={`/products/${p.slug}`}>{p.name}</Link>
                      </h3>
                      <p className="muted">
                        {p.variants.length} option
                        {p.variants.length === 1 ? "" : "s"} ·{" "}
                        {p.variants.some((v) => v.available > 0)
                          ? "In stock"
                          : "Unavailable"}
                      </p>
                      <div className="card-bottom">
                        <strong>{money(p.variants[0]?.price_minor)}</strong>
                        <Link
                          className="circle-link"
                          href={`/products/${p.slug}`}
                          aria-label={`View ${p.name}`}
                        >
                          ↗
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
function ProductDetails({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const v = product.variants.find((v) => v.id === variantId);
  async function add() {
    setBusy(true);
    setError("");
    try {
      await api(undefined, {
        action: "cart.add",
        variant_id: variantId,
        quantity: 1,
      });
      setMessage("Added to your cart.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="detail-grid">
      <ProductVisual key={variantId} variant={v} name={product.name} />
      <div>
        <p className="eyebrow">{product.category || "ACCESSORIES"}</p>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <label>
          Choose your exact variant
          <select
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setMessage("");
            }}
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · {v.sku}
              </option>
            ))}
          </select>
        </label>
        {v ? (
          <>
            <p className="price">{money(v.price_minor)}</p>
            <p className="badge">
              {v.available > 0
                ? `${v.available} available`
                : "Currently unavailable"}
            </p>
            <h3>Device compatibility</h3>
            <p>
              {v.compatibility?.length
                ? v.compatibility.join(", ")
                : "No model-specific compatibility claim. Check the specifications before ordering."}
            </p>
            <h3>Specifications</h3>
            <Specifications values={v.specifications || {}} />
            <button onClick={add} disabled={busy || v.available < 1}>
              {busy ? "Adding…" : "Add to cart"}
            </button>{" "}
            <Link className="button secondary" href="/cart">
              View cart
            </Link>
            <Notice error={error} message={message} />
          </>
        ) : (
          <p>No active variant.</p>
        )}
      </div>
    </div>
  );
}
export function CartPage() {
  const { data, error, errorCode, reload } = useResource<Cart>("resource=cart");
  const [failure, setFailure] = useState("");
  async function quantity(variant_id: string, value: string) {
    try {
      const quantity = Number(value);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
        throw new Error("Quantity must be between 1 and 99.");
      await api(undefined, { action: "cart.add", variant_id, quantity });
      setFailure("");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  async function remove(variant_id: string) {
    try {
      await api(undefined, { action: "cart.remove", variant_id });
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <Shell>
      <section className="section">
        <p className="eyebrow">YOUR SELECTION</p>
        <h1>Shopping cart</h1>
        <Notice error={failure} />
        {error ? <AccessState code={errorCode} next="/account" /> : null}
        {!data && !error ? (
          <p>Loading your cart…</p>
        ) : !data ? null : !data.items.length ? (
          <div className="empty">
            <h2>Your cart is empty</h2>
            <p>Find an accessory that fits your device.</p>
            <Link className="button" href="/">
              Browse accessories
            </Link>
          </div>
        ) : (
          <div className="checkout-grid">
            <div>
              {data.items.map((item) => (
                <article className="cart-item card" key={item.variant_id}>
                  <Art small type={item.name} />
                  <div>
                    <h3>{item.name}</h3>
                    <p className="muted">{item.sku}</p>
                    <label>
                      Quantity
                      <input
                        aria-label={`Quantity for ${item.name}`}
                        className="quantity"
                        type="number"
                        min="1"
                        max="99"
                        defaultValue={item.quantity}
                        onBlur={(e) =>
                          quantity(item.variant_id, e.target.value)
                        }
                      />
                    </label>
                    <strong>
                      {money(Number(item.price_minor) * item.quantity)}
                    </strong>
                    <br />
                    <button
                      className="text-button"
                      onClick={() => remove(item.variant_id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <aside className="card summary">
              <h2>Order summary</h2>
              <Totals cart={data} />
              <p className="muted">
                Delivery eligibility and final charges are confirmed at
                checkout.
              </p>
              <Link className="button full" href="/checkout">
                Continue to checkout
              </Link>
            </aside>
          </div>
        )}
      </section>
    </Shell>
  );
}
function Totals({
  cart,
}: {
  cart: Pick<
    Cart,
    "items_minor" | "delivery_minor" | "total_minor" | "discount_minor"
  >;
}) {
  return (
    <dl className="totals">
      <div>
        <dt>Items</dt>
        <dd>{money(cart.items_minor)}</dd>
      </div>
      <div>
        <dt>Delivery</dt>
        <dd>{money(cart.delivery_minor)}</dd>
      </div>
      {Number(cart.discount_minor) > 0 ? (
        <div>
          <dt>Discount</dt>
          <dd>−{money(cart.discount_minor)}</dd>
        </div>
      ) : null}
      <div className="total">
        <dt>Total</dt>
        <dd>{money(cart.total_minor)}</dd>
      </div>
    </dl>
  );
}
export function CheckoutPage() {
  const router = useRouter();
  const { data, error } = useResource<Cart>("resource=cart");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [district, setDistrict] = useState("Dhaka");
  const [quotedDistrict, setQuotedDistrict] = useState("Dhaka");
  const [updatedQuote, setUpdatedQuote] = useState<Cart>();
  const [discountCode, setDiscountCode] = useState("");
  const key = useRef("");
  const shownCart = updatedQuote || data;
  async function applyDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(undefined, { action: "discount.apply", code: discountCode });
      const result = await api<Cart>(undefined, { action: "quote", district });
      setUpdatedQuote(result);
      setQuotedDistrict(district);
      setFailure("");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateQuote() {
    setBusy(true);
    try {
      const result = await api<Cart>(undefined, { action: "quote", district });
      setUpdatedQuote(result);
      setQuotedDistrict(district);
      setFailure("");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    const form = new FormData(event.currentTarget);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const result = await api<{ order_id: string }>(undefined, {
        action: "checkout",
        expected_total_minor: shownCart?.total_minor,
        idempotency_key: key.current,
        guest_name: form.get("name"),
        guest_phone: String(form.get("phone") || "").replace(/^01/, "+8801"),
        guest_email: form.get("email"),
        payment_method: form.get("payment_method"),
        address: {
          district: form.get("district"),
          city_upazila: form.get("city"),
          area: form.get("area"),
          street: form.get("street"),
        },
        policy_version: "development-policy-v1",
      });
      router.push(`/orders/${result.order_id}`);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <section className="section">
        <p className="eyebrow">SECURE CHECKOUT</p>
        <h1>Let’s get the details right.</h1>
        {data?.development ? (
          <p className="notice">
            Development checkout · fictional test orders only. No real payment
            or customer message will be sent.
          </p>
        ) : null}
        <Notice error={error || failure} />
        {data?.items.length ? (
          <div className="checkout-grid">
            <form className="card form-stack" onSubmit={submit}>
              <h2>Contact and delivery</h2>
              <div className="field-grid">
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </label>
                <label>
                  Bangladesh mobile number
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    placeholder="01XXXXXXXXX"
                  />
                </label>
              </div>
              <label>
                Email (optional)
                <input name="email" type="email" autoComplete="email" />
              </label>
              <div className="field-grid">
                <label>
                  District
                  <input
                    name="district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                    autoComplete="address-level1"
                  />
                </label>
                <label>
                  City / upazila
                  <input name="city" required autoComplete="address-level2" />
                </label>
              </div>
              <label>
                Area
                <input name="area" required />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={updateQuote}
                disabled={busy}
              >
                Update delivery charge
              </button>
              {district !== quotedDistrict ? (
                <p className="notice">
                  Update delivery charges for this district before placing your
                  order.
                </p>
              ) : null}
              <label>
                House, road and street
                <textarea
                  name="street"
                  required
                  autoComplete="street-address"
                />
              </label>
              <fieldset>
                <legend>Payment method</legend>
                <label className="radio-row">
                  <input
                    type="radio"
                    name="payment_method"
                    value="online"
                    defaultChecked
                  />{" "}
                  Online payment
                </label>
                <label className="radio-row">
                  <input type="radio" name="payment_method" value="cod" /> Cash
                  on delivery (when enabled)
                </label>
              </fieldset>
              <label className="radio-row">
                <input type="checkbox" required /> I have reviewed the order and
                delivery details.
              </label>
              <button disabled={busy || district !== quotedDistrict}>
                {busy ? "Placing order…" : "Place order"}
              </button>
              <p className="muted">
                The server confirms current prices, availability and delivery
                charges. An order is paid only after verified payment.
              </p>
            </form>
            <aside className="card summary">
              <h2>Your order</h2>
              {data.items.map((i) => (
                <p key={i.variant_id}>
                  {i.name} × {i.quantity}
                  <strong className="float-right">
                    {money(Number(i.price_minor) * i.quantity)}
                  </strong>
                </p>
              ))}
              <Totals cart={shownCart || data} />
              <form className="form-stack" onSubmit={applyDiscount}>
                <label>
                  Discount code
                  <input
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    name="discount_code"
                    placeholder="Enter a code"
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Apply discount
                </button>
              </form>
            </aside>
          </div>
        ) : (
          <p>
            {data ? "Your cart is empty." : "Loading checkout…"}{" "}
            <Link href="/cart">Back to cart</Link>
          </p>
        )}
      </section>
    </Shell>
  );
}
export function OrderPage({ id }: { id: string }) {
  const { data, error, reload } = useResource<{
    order: JsonRow;
    development?: boolean;
    items: JsonRow[];
    shipments?: JsonRow[];
    payments?: JsonRow[];
    returns?: JsonRow[];
    refunds?: JsonRow[];
  }>(`resource=orders&id=${encodeURIComponent(id)}`);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  async function retry() {
    try {
      await api(undefined, { action: "payment.retry", order_id: id });
      setMessage("A new payment attempt is ready.");
      setFailure("");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  async function simulate(outcome: string) {
    try {
      await api(undefined, {
        action: "payment.simulate",
        order_id: id,
        outcome,
      });
      setMessage("Development payment event recorded.");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(undefined, {
        action: "request",
        kind: form.get("kind"),
        order_id: id,
        order_item_id: form.get("order_item_id"),
        quantity: Number(form.get("quantity") || 1),
        reason: form.get("reason"),
        idempotency_key: crypto.randomUUID(),
      });
      setMessage("Your request has been recorded.");
      setFailure("");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }

  return (
    <Shell>
      <section className="section">
        <p className="eyebrow">ORDER TRACKING</p>
        <h1>Your order</h1>
        <Notice error={error || failure} message={message} />
        {data ? (
          <>
            <div className="card order-banner">
              <div>
                <span className="muted">Order reference</span>
                <p className="mono">{id}</p>
              </div>
              <span className="badge">{label(data.order.status)}</span>
              <strong>{money(data.order.total_minor)}</strong>
            </div>
            <div className="checkout-grid">
              <section className="card">
                <h2>Items</h2>
                {data.items.map((i, index) => (
                  <p key={String(i.id || index)}>
                    {String(i.name_snapshot || i.name)} × {String(i.quantity)}
                  </p>
                ))}
                <h2>Payment</h2>
                <p>{label(data.order.payment_method)}</p>
                {data.payments?.map((p, index) => (
                  <p key={String(p.id || index)}>
                    <span className="badge">{label(p.status)}</span>{" "}
                    {money(p.amount_minor)}
                  </p>
                ))}
                {data.order.status === "pending_payment" &&
                data.payments?.some((p) => p.status === "failed") ? (
                  <button className="secondary" onClick={retry}>
                    Retry payment safely
                  </button>
                ) : null}
                {data.payments?.some(
                  (p) => p.status === "reconciliation_required",
                ) ? (
                  <p className="notice" role="alert">
                    This payment requires manual review. Do not pay again until
                    the store resolves the discrepancy.
                  </p>
                ) : data.order.status === "pending_payment" ? (
                  <p className="notice">
                    Awaiting verified payment. Closing this browser will not
                    interrupt server verification.
                  </p>
                ) : null}
                {data.development && data.order.payment_method === "online" ? (
                  <div className="notice">
                    <strong>Development payment adapter</strong>
                    <p>
                      Simulate a provider outcome. This does not process real
                      money.
                    </p>
                    <div className="button-row">
                      <button onClick={() => simulate("success")}>
                        Simulate success
                      </button>
                      <button
                        className="secondary"
                        onClick={() => simulate("failed")}
                      >
                        Simulate failure
                      </button>
                      <button
                        className="secondary"
                        onClick={() => simulate("pending")}
                      >
                        Keep pending
                      </button>
                    </div>
                  </div>
                ) : null}
                <h2>Delivery</h2>
                {data.shipments?.length ? (
                  data.shipments.map((s, index) => (
                    <p key={index}>
                      {label(s.status)} ·{" "}
                      {String(s.tracking_ref || "Tracking not assigned")}
                    </p>
                  ))
                ) : (
                  <p className="muted">
                    A shipment has not yet been dispatched.
                  </p>
                )}
              </section>
              <aside className="card">
                <h2>Need help with this order?</h2>
                <p>
                  Requests are reviewed against the order state and applicable
                  policy.
                </p>
                <form className="form-stack" onSubmit={request}>
                  <label>
                    Request type
                    <select name="kind">
                      <option value="cancel">Cancellation</option>
                      <option value="return">Return</option>
                      <option value="warranty">Warranty claim</option>
                    </select>
                  </label>
                  <label>
                    Order item
                    <select name="order_item_id">
                      {data.items.map((i) => (
                        <option key={String(i.id)} value={String(i.id)}>
                          {String(i.name_snapshot || i.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      defaultValue="1"
                      required
                    />
                  </label>
                  <label>
                    Reason
                    <textarea
                      name="reason"
                      minLength={3}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <button className="secondary">Submit request</button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={reload}
                  >
                    Refresh status
                  </button>
                </form>
                <h3>Refund status</h3>
                {data.refunds?.length ? (
                  data.refunds.map((r, index) => (
                    <p key={index}>
                      {label(r.status)} · {money(r.amount_minor)}
                    </p>
                  ))
                ) : (
                  <p className="muted">No refund recorded.</p>
                )}
              </aside>
            </div>
          </>
        ) : !error ? (
          <p role="status">Loading secure order details…</p>
        ) : (
          <div className="card">
            <h2>Order access required</h2>
            <p>
              Use the original browser or your verified order-access link. Your
              phone number alone cannot unlock this order.
            </p>
            <Link href="/recover">Recover order access</Link>
          </div>
        )}
      </section>
    </Shell>
  );
}

export function AccountPage() {
  const { data, error, errorCode, reload } = useResource<{ orders: JsonRow[] }>(
    "resource=account",
  );
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(undefined, {
        action: "account.link",
        order_id: form.get("order_id"),
      });
      setMessage("Order linked to your account.");
      setFailure("");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <section className="section">
        <p className="eyebrow">YOUR STORE ACCOUNT</p>
        <h1>Order history</h1>
        <Notice error={failure || error} message={message} />
        {error ? (
          <AccessState code={errorCode} next="/account" />
        ) : !data ? (
          <p>Loading your account…</p>
        ) : (
          <>
            <div className="card">
              {data.orders.length ? (
                <ul className="order-history">
                  {data.orders.map((o) => (
                    <li className="history-card" key={String(o.id)}>
                      <div>
                        <Link href={`/orders/${o.id}`}>
                          Order {String(o.id).slice(0, 8).toUpperCase()}
                        </Link>
                        <p className="muted">
                          {new Intl.DateTimeFormat("en-BD", {
                            dateStyle: "medium",
                            timeZone: "Asia/Dhaka",
                          }).format(new Date(String(o.created_at)))}
                        </p>
                      </div>
                      <strong>{money(o.total_minor)}</strong>
                      <span className="badge">{label(o.status)}</span>
                      <details>
                        <summary>Full order reference</summary>
                        <code>{String(o.id)}</code>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No linked orders yet.</p>
              )}
            </div>
            <div className="card">
              <h2>Link a previous guest order</h2>
              <p className="muted">
                Use the browser where you placed the order, or first open its
                verified access link. A matching delivery phone number alone
                does not prove ownership.
              </p>
              <form className="command-form" onSubmit={link}>
                <label>
                  Order reference
                  <input name="order_id" required />
                </label>
                <button disabled={busy}>
                  {busy ? "Linking…" : "Link order securely"}
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </Shell>
  );
}

export function RecoveryPage() {
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (!challenge) {
        await api(undefined, {
          action: "recovery.start",
          order_id: form.get("order_id"),
          email: form.get("email"),
        });
        setChallenge("sent");
        setMessage(
          "If these details match the order, a recovery code has been sent to its recorded contact channel.",
        );
      } else {
        const result = await api<{ order_id: string }>(undefined, {
          action: "recovery.complete",
          challenge_id: form.get("challenge_id"),
          code: form.get("code"),
        });
        if (!result.order_id)
          throw new Error("Recovery code could not be verified.");
        router.push(`/orders/${result.order_id}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <section className="section reading">
        <p className="eyebrow">SECURE ORDER ACCESS</p>
        <h1>Recover your order</h1>
        <p>
          Use the email recorded at checkout. A phone number or order reference
          by itself cannot authorize access.
        </p>
        <Notice error={error} message={message} />
        <form className="card form-stack" onSubmit={submit}>
          {!challenge ? (
            <>
              <label>
                Order reference
                <input name="order_id" required />
              </label>
              <label>
                Email recorded at checkout
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Recovery reference
                <input name="challenge_id" required />
              </label>
              <label>
                Recovery code
                <input name="code" autoComplete="one-time-code" required />
              </label>
            </>
          )}
          <button disabled={busy}>
            {busy
              ? "Please wait…"
              : challenge
                ? "Verify and open order"
                : "Request recovery code"}
          </button>
        </form>
        <p className="muted">
          Development uses an isolated local delivery sink. Real delivery must
          be configured before commercial use. If your order has no email or you
          have lost access to it, contact store support for verified recovery.
        </p>
      </section>
    </Shell>
  );
}

export function ContentPage({ slug }: { slug: string }) {
  const { data, error } = useResource<{ pages: JsonRow[] }>("resource=content");
  const page = data?.pages.find((p) => p.slug === slug);
  return (
    <Shell>
      <section className="section reading">
        <Link href="/">← Store</Link>
        <Notice error={error} />
        {page ? (
          <>
            <h1>{String(page.title)}</h1>
            <p className="muted">
              Policy / content version {String(page.version)}
            </p>
            <div className="content-body">{String(page.body)}</div>
          </>
        ) : (
          <>
            <h1>{label(slug)}</h1>
            <p>
              {data
                ? "This content has not been published yet. Please contact the store before placing a commercial order."
                : "Loading content…"}
            </p>
          </>
        )}
      </section>
    </Shell>
  );
}
