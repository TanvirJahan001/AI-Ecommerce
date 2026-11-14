"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api, label, money, Notice, useResource } from "./store";
import type { JsonRow } from "./store";
type AdminData = {
  products: JsonRow[];
  inventory: JsonRow[];
  orders: JsonRow[];
  returns: JsonRow[];
  refunds: JsonRow[];
  collections: JsonRow[];
  remittances: JsonRow[];
  return_items?: JsonRow[];
  funding_events?: JsonRow[];
  order_items?: JsonRow[];
  warranty_claims?: JsonRow[];
  customers?: JsonRow[];
  support_notes?: JsonRow[];
  payment_attempts?: JsonRow[];
  settings?: JsonRow[];
  shipping_rates?: JsonRow[];
  discounts?: JsonRow[];
  notifications?: JsonRow[];
  local_deliveries?: JsonRow[];
  audit?: JsonRow[];
};
const tabs = [
  "Overview",
  "Catalog",
  "Inventory",
  "Orders",
  "Returns & refunds",
  "COD settlements",
  "Discounts",
  "Content",
  "Notifications",
  "Audit",
  "Reports",
  "Settings",
  "Customers",
] as const;
type Tab = (typeof tabs)[number];
export default function Admin() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [selectedOrder, setSelectedOrder] = useState("");
  const { data, error, reload } = useResource<AdminData>("resource=admin");
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const commandKey = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  async function command(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const input: Record<string, unknown> = { action: "admin.command" };
    for (const [k, v] of form.entries()) input[k] = v;
    for (const k of ["quantity", "amount_minor", "shipping_minor"])
      if (input[k]) input[k] = Number(input[k]);
    if (input.command === "store.configure") {
      input.cod_enabled = input.cod_enabled === "true";
      input.online_enabled = input.online_enabled === "true";
      input.enabled = input.enabled === "true";
      input.fee_minor = Number(input.fee_minor);
    }
    if (input.command === "discount.save") {
      input.amount_minor = Number(input.amount_minor);
      input.usage_limit = Number(input.usage_limit);
      input.active = input.active === "true";
    }
    if (input.command === "product.save") {
      input.price_minor = Number(input.price_minor);
      input.published = input.published === "true";
    }
    if (
      input.command === "return.authorize" ||
      input.command === "warranty.resolve"
    )
      input.approved = input.approved === "true";
    if (input.command === "return.inspect") input.condition = input.outcome;
    if (input.command === "cash.collect") input.evidence = input.reference;
    if (input.command === "refund.reconcile") input.evidence = input.reason;
    if (input.command === "refund.reserve")
      input.items = [
        {
          order_item_id: input.order_item_id,
          quantity: Number(input.quantity),
        },
      ];
    if (input.command === "settlement")
      input.allocations = [
        {
          collection_id: input.collection_id,
          amount_minor: Number(input.amount_minor),
        },
      ];
    const signature = JSON.stringify(input);
    if (commandKey.current?.signature !== signature)
      commandKey.current = { signature, key: crypto.randomUUID() };
    input.idempotency_key = commandKey.current.key;
    try {
      await api(undefined, input);
      commandKey.current = undefined;
      setMessage("Action recorded successfully.");
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="wordmark" href="/">
          <span className="logo">M</span>
          <span>
            Store console<small>OWNER WORKSPACE</small>
          </span>
        </Link>
        <nav aria-label="Administration">
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <Link className="admin-store-link" href="/">
          ↗ View storefront
        </Link>
        <Link className="admin-store-link" href="/login">
          Account & security
        </Link>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">MOBILE ACCESSORIES STORE</p>
            <h1>{tab}</h1>
          </div>
          <button className="secondary" onClick={reload}>
            Refresh
          </button>
        </header>
        <Notice error={error || failure} message={message} />
        {!data ? (
          <div className="card">
            <h2>{error ? "Owner access required" : "Loading workspace…"}</h2>
            {error ? (
              <>
                <p>
                  This workspace is restricted to the active store owner.
                  Complete sign-in and MFA to continue.
                </p>
                <Link className="button" href="/login">
                  Sign in
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <>
            {tab === "Overview" ? (
              <>
                <div className="metric-grid">
                  <Metric title="Orders" value={data.orders.length} />
                  <Metric
                    title="Refunds requiring review"
                    value={
                      data.refunds.filter(
                        (r) =>
                          !["succeeded", "failed"].includes(String(r.status)),
                      ).length
                    }
                  />
                  <Metric title="Return cases" value={data.returns.length} />
                  <Metric
                    title="COD collections"
                    value={data.collections.length}
                  />
                </div>
                <section className="card">
                  <h2>Payment exceptions</h2>
                  <Rows
                    rows={(data.payment_attempts || []).filter((p) =>
                      ["reconciliation_required", "failed"].includes(
                        String(p.status),
                      ),
                    )}
                    fields={["id", "order_id", "status", "amount_minor"]}
                  />
                  <h2>Work requiring attention</h2>
                  <p className="muted">
                    Review payment exceptions, pending orders and open
                    after-sale cases before preparing the next shipment.
                  </p>
                  <Rows
                    rows={data.orders.filter((o) =>
                      [
                        "pending_payment",
                        "awaiting_cod_confirmation",
                        "exception",
                        "cancellation_requested",
                      ].includes(String(o.status)),
                    )}
                    fields={["id", "guest_name", "status", "total_minor"]}
                  />
                </section>
              </>
            ) : null}
            {tab === "Catalog" ? (
              <>
                <section className="card">
                  <h2>Products & SKUs</h2>
                  <Rows
                    rows={data.products.flatMap((p) =>
                      Array.isArray(p.variants)
                        ? p.variants.map((v: JsonRow) => ({
                            ...v,
                            name: p.name,
                          }))
                        : [p],
                    )}
                    fields={["id", "name", "sku", "label", "price_minor"]}
                  />
                </section>
                <section className="card">
                  <h2>Create or update a product</h2>
                  <p className="muted">
                    Use an existing product ID to update it; leave it empty for
                    a new family and SKU. Product claims must be supported by
                    verified specifications.
                  </p>
                  <form className="command-form" onSubmit={command}>
                    <input type="hidden" name="command" value="product.save" />
                    <Field
                      label="Product ID (update only)"
                      name="product_id"
                      required={false}
                    />
                    <Field label="Name" name="name" />
                    <Field label="URL slug" name="slug" />
                    <Field label="Category" name="category" required={false} />
                    <Field label="Brand" name="brand" required={false} />
                    <Field label="SKU" name="sku" />
                    <Field label="Variant label" name="label" />
                    <Field
                      label="Price (poisha; BDT 1 = 100)"
                      name="price_minor"
                      type="number"
                    />
                    <label className="wide">
                      Description
                      <textarea name="description" required />
                    </label>
                    <label>
                      Publication
                      <select name="published">
                        <option value="false">Draft</option>
                        <option value="true">Published</option>
                      </select>
                    </label>
                    <button disabled={busy}>Save product</button>
                  </form>
                </section>
                <section className="card">
                  <h2>Variant specifications and fit</h2>
                  <p className="muted">
                    Compatibility belongs to this exact SKU. Use manufacturer or
                    inspected source evidence. Saving replaces the selected
                    variant’s models and specifications.
                  </p>
                  <form className="command-form" onSubmit={command}>
                    <input
                      type="hidden"
                      name="command"
                      value="variant.details"
                    />
                    <Field label="Variant ID" name="variant_id" />
                    <Field
                      label="Verification source / reference"
                      name="source"
                    />
                    <label className="wide">
                      Compatible models (JSON array)
                      <textarea
                        name="models"
                        defaultValue="[]"
                        required
                        placeholder='[{"brand":"Fictional","model":"Phone Z","model_number":"Z-2025"}]'
                      />
                    </label>
                    <label className="wide">
                      Structured specifications (JSON object)
                      <textarea
                        name="specifications"
                        defaultValue="{}"
                        required
                        placeholder='{"output_connector":"USB-C","protocols":["USB Power Delivery"],"max_output_w":30}'
                      />
                    </label>
                    <label className="wide">
                      Product media (optional JSON array)
                      <textarea
                        name="media"
                        defaultValue="[]"
                        placeholder='[{"url":"https://example.test/image.jpg","alt":"Clear case front view"}]'
                      />
                    </label>
                    <button disabled={busy}>Save variant details</button>
                  </form>
                </section>
              </>
            ) : null}
            {tab === "Inventory" ? (
              <>
                <section className="card">
                  <h2>Stock by SKU</h2>
                  <p className="muted">
                    Confirmed orders retain their stock commitment until
                    dispatch or valid cancellation.
                  </p>
                  <Rows
                    rows={data.inventory.map((v) => ({
                      ...v,
                      available:
                        Number(v.sellable_qty) - Number(v.committed_qty),
                    }))}
                    fields={[
                      "id",
                      "sku",
                      "sellable_qty",
                      "committed_qty",
                      "quarantined_qty",
                      "available",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Record a stock movement</h2>
                  <form className="command-form" onSubmit={command}>
                    <label>
                      Movement
                      <select name="command">
                        <option value="stock.receipt">Receive stock</option>
                        <option value="stock.adjust">Adjust stock</option>
                      </select>
                    </label>
                    <Field label="Variant ID" name="variant_id" />
                    <Field label="Quantity" name="quantity" type="number" />
                    <Field label="Reason / receipt reference" name="reason" />
                    <button disabled={busy}>Record movement</button>
                  </form>
                </section>
              </>
            ) : null}
            {tab === "Orders" ? (
              <>
                <section className="card">
                  <h2>Orders</h2>
                  <Rows
                    rows={data.orders}
                    fields={[
                      "id",
                      "guest_name",
                      "status",
                      "payment_method",
                      "total_minor",
                    ]}
                    onSelect={(r) => setSelectedOrder(String(r.id))}
                  />
                </section>
                {selectedOrder ? (
                  <section className="card">
                    <h2>Order detail</h2>
                    <p className="mono">{selectedOrder}</p>
                    {data.orders
                      .filter((o) => o.id === selectedOrder)
                      .map((o) => (
                        <div key={String(o.id)}>
                          <p>
                            <span className="badge">{label(o.status)}</span> ·{" "}
                            {label(o.payment_method)} · {money(o.total_minor)}
                          </p>
                          <p>
                            {String(o.guest_name)} · {String(o.guest_phone)}
                          </p>
                          <h3>Delivery snapshot</h3>
                          <p>
                            {typeof o.address_snapshot === "object"
                              ? Object.entries(o.address_snapshot as JsonRow)
                                  .map(([k, v]) => `${label(k)}: ${String(v)}`)
                                  .join(" · ")
                              : String(o.address_snapshot || "")}
                          </p>
                        </div>
                      ))}
                    <Rows
                      rows={(data.order_items || []).filter(
                        (i) => i.order_id === selectedOrder,
                      )}
                      fields={[
                        "id",
                        "sku_snapshot",
                        "name_snapshot",
                        "quantity",
                        "unit_minor",
                      ]}
                    />
                  </section>
                ) : null}
                <section className="card">
                  <h2>Order items</h2>
                  <Rows
                    rows={data.order_items || []}
                    fields={[
                      "id",
                      "order_id",
                      "sku_snapshot",
                      "name_snapshot",
                      "quantity",
                      "unit_minor",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Process an order</h2>
                  <form className="command-form" onSubmit={command}>
                    <label>
                      Order ID
                      <input
                        name="order_id"
                        value={selectedOrder}
                        onChange={(e) => setSelectedOrder(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Action
                      <select name="command">
                        <option value="cod.confirm">Confirm COD</option>
                        <option value="dispatch">Dispatch shipment</option>
                        <option value="cancel">Approve cancellation</option>
                        <option value="shipment.update">
                          Update delivery status
                        </option>
                      </select>
                    </label>
                    <label>
                      Delivery status
                      <select name="status">
                        <option value="delivered">Delivered</option>
                        <option value="delivery_failed">Delivery failed</option>
                        <option value="retry_scheduled">Retry scheduled</option>
                        <option value="return_to_origin">
                          Return to origin
                        </option>
                        <option value="returned_to_store">
                          Returned to store
                        </option>
                      </select>
                    </label>
                    <Field
                      label="Tracking / evidence reference"
                      name="tracking_ref"
                      required={false}
                    />
                    <Field label="Reason" name="reason" />
                    <button disabled={busy}>Apply action</button>
                  </form>
                </section>
              </>
            ) : null}
            {tab === "Returns & refunds" ? (
              <>
                <section className="card">
                  <h2>Returns & inspection</h2>
                  <Rows
                    rows={data.returns}
                    fields={["id", "order_id", "status", "reason"]}
                  />
                </section>
                <section className="card">
                  <h2>Return items & inspection</h2>
                  <Rows
                    rows={data.return_items || []}
                    fields={[
                      "id",
                      "return_id",
                      "order_item_id",
                      "quantity",
                      "inspection",
                      "disposition",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Verified payment funding</h2>
                  <Rows
                    rows={data.funding_events || []}
                    fields={["id", "order_id", "source", "amount_minor"]}
                  />
                </section>
                <section className="card">
                  <h2>Refund ledger</h2>
                  <Rows
                    rows={data.refunds}
                    fields={["id", "order_id", "status", "amount_minor"]}
                  />
                </section>
                <section className="card">
                  <h2>Warranty claims</h2>
                  <Rows
                    rows={data.warranty_claims || []}
                    fields={[
                      "id",
                      "order_item_id",
                      "status",
                      "reason",
                      "resolution",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Resolve an after-sale request</h2>
                  <form className="command-form" onSubmit={command}>
                    <label>
                      Action
                      <select name="command">
                        <option value="return.authorize">
                          Authorize return
                        </option>
                        <option value="return.receive">
                          Receive return into quarantine
                        </option>
                        <option value="return.inspect">Inspect return</option>
                        <option value="refund.reserve">Approve refund</option>
                        <option value="refund.submit">
                          Submit refund payout
                        </option>
                        <option value="refund.reconcile">
                          Reconcile payout
                        </option>
                        <option value="warranty.resolve">
                          Resolve warranty claim
                        </option>
                      </select>
                    </label>
                    <label>
                      Return decision
                      <select name="approved">
                        <option value="true">Approve</option>
                        <option value="false">Reject</option>
                      </select>
                    </label>
                    <Field label="Order ID" name="order_id" required={false} />
                    <Field
                      label="Order item ID"
                      name="order_item_id"
                      required={false}
                    />
                    <Field
                      label="Item quantity"
                      name="quantity"
                      type="number"
                      required={false}
                    />
                    <Field
                      label="Refund delivery allocation (poisha)"
                      name="shipping_minor"
                      type="number"
                      required={false}
                    />
                    <Field
                      label="Return ID"
                      name="return_id"
                      required={false}
                    />
                    <Field
                      label="Return item ID"
                      name="return_item_id"
                      required={false}
                    />
                    <Field
                      label="Warranty claim ID"
                      name="claim_id"
                      required={false}
                    />
                    <Field
                      label="Warranty resolution"
                      name="resolution"
                      required={false}
                    />
                    <Field
                      label="Refund ID"
                      name="refund_id"
                      required={false}
                    />
                    <Field
                      label="Funding event ID"
                      name="funding_event_id"
                      required={false}
                    />
                    <Field
                      label="Amount (poisha)"
                      name="amount_minor"
                      type="number"
                      required={false}
                    />
                    <label>
                      Inspection / payout outcome
                      <select name="outcome">
                        <option value="sellable">Sellable</option>
                        <option value="damaged">
                          Damaged — keep unavailable
                        </option>
                        <option value="succeeded">Payout succeeded</option>
                        <option value="failed">
                          Definitive payout failure
                        </option>
                        <option value="unknown">
                          Unknown — retain capacity
                        </option>
                      </select>
                    </label>
                    <Field label="Reason / payout reference" name="reason" />
                    <button disabled={busy}>Record resolution</button>
                  </form>
                </section>
              </>
            ) : null}
            {tab === "Discounts" ? (
              <>
                <section className="card">
                  <h2>Simple discount codes</h2>
                  <Rows
                    rows={data.discounts || []}
                    fields={[
                      "code",
                      "amount_minor",
                      "usage_limit",
                      "used_count",
                      "ends_at",
                      "active",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Create or update discount</h2>
                  <form className="command-form" onSubmit={command}>
                    <input type="hidden" name="command" value="discount.save" />
                    <Field label="Code" name="code" />
                    <Field
                      label="Amount (poisha)"
                      name="amount_minor"
                      type="number"
                    />
                    <Field
                      label="Usage limit"
                      name="usage_limit"
                      type="number"
                    />
                    <Field label="Ends at (ISO date/time)" name="ends_at" />
                    <label>
                      Status
                      <select name="active">
                        <option value="true">Active</option>
                        <option value="false">Disabled</option>
                      </select>
                    </label>
                    <button disabled={busy}>Save discount</button>
                  </form>
                </section>
              </>
            ) : null}
            {tab === "Notifications" ? (
              <>
                <section className="card">
                  <h2>Transactional delivery queue</h2>
                  <p className="muted">
                    Pending and failed deliveries remain visible for worker
                    retry and operator follow-up.
                  </p>
                  <Rows
                    rows={data.notifications || []}
                    fields={[
                      "id",
                      "topic",
                      "status",
                      "attempts",
                      "next_attempt_at",
                      "last_error",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Local test delivery sink</h2>
                  <p className="muted">
                    Development messages stay in this isolated sink. This is not
                    evidence of delivery through a real email or SMS provider.
                  </p>
                  {(data.local_deliveries || []).map((delivery, index) => (
                    <details key={String(delivery.id || index)}>
                      <summary>
                        Local delivery {index + 1} ·{" "}
                        {String(delivery.created_at || "")}
                      </summary>
                      <pre className="code-block">
                        {JSON.stringify(delivery.payload, null, 2)}
                      </pre>
                    </details>
                  ))}
                </section>
              </>
            ) : null}
            {tab === "Audit" ? (
              <section className="card">
                <h2>Audit history</h2>
                <Rows
                  rows={data.audit || []}
                  fields={[
                    "created_at",
                    "actor_id",
                    "action",
                    "entity_type",
                    "entity_id",
                    "reason",
                  ]}
                />
              </section>
            ) : null}
            {tab === "Settings" ? (
              <section className="card">
                <h2>Methods and delivery configuration</h2>
                <p>
                  Production checkout remains disabled pending real-provider and
                  business readiness. These controls set the local workflow
                  configuration.
                </p>
                <Rows
                  rows={data.shipping_rates || []}
                  fields={["district", "fee_minor", "enabled"]}
                />
                <form className="command-form" onSubmit={command}>
                  <input type="hidden" name="command" value="store.configure" />
                  <label>
                    COD enabled
                    <select name="cod_enabled">
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                  <label>
                    Online enabled
                    <select name="online_enabled">
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                  <Field label="Delivery district" name="district" />
                  <Field
                    label="Delivery fee (poisha)"
                    name="fee_minor"
                    type="number"
                  />
                  <label>
                    Delivery enabled
                    <select name="enabled">
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                  <button disabled={busy}>Save configuration</button>
                </form>
              </section>
            ) : null}
            {tab === "Notifications" ? (
              <section className="card">
                <h2>Transactional notification template</h2>
                <p>
                  Plain text only. Use {"{order_id}"} for the order reference;
                  local transport sends nothing externally.
                </p>
                <form className="command-form" onSubmit={command}>
                  <input
                    type="hidden"
                    name="command"
                    value="notification.template"
                  />
                  <Field label="Notification topic" name="topic" />
                  <Field label="Notification title" name="title" />
                  <label className="wide">
                    Message
                    <textarea name="body" required />
                  </label>
                  <button disabled={busy}>Save template</button>
                </form>
              </section>
            ) : null}
            {tab === "Customers" ? (
              <section className="card">
                <h2>Customers and support</h2>
                <Rows
                  rows={data.customers || []}
                  fields={["id", "email", "phone_e164", "created_at"]}
                />
                <p>
                  Guest delivery contact and destination remain on the order
                  snapshot. Do not treat the phone number as verified account
                  identity.
                </p>
                <Rows
                  rows={data.support_notes || []}
                  fields={["order_id", "note", "actor_id", "created_at"]}
                />
                <form className="command-form" onSubmit={command}>
                  <input type="hidden" name="command" value="support.note" />
                  <Field label="Support order ID" name="order_id" />
                  <label className="wide">
                    Support note
                    <textarea name="note" maxLength={2000} required />
                  </label>
                  <button disabled={busy}>Save support note</button>
                </form>
              </section>
            ) : null}
            {tab === "Content" ? (
              <section className="card">
                <h2>Store content & policies</h2>
                <p className="muted">
                  Publish only reviewed business terms. New content is versioned
                  by the server.
                </p>
                <form className="command-form" onSubmit={command}>
                  <input type="hidden" name="command" value="content.save" />
                  <Field label="Page slug" name="slug" />
                  <Field label="Title" name="title" />
                  <label className="wide">
                    Page content
                    <textarea name="body" rows={12} required />
                  </label>
                  <button disabled={busy}>Save content</button>
                </form>
              </section>
            ) : null}
            {tab === "Reports" ? <Reports /> : null}
            {tab === "COD settlements" ? (
              <>
                <div className="notice">
                  Customer cash collection and courier remittance are separate
                  events. Delivery alone does not settle the receivable.
                </div>
                <section className="card">
                  <h2>Customer collections</h2>
                  <Rows
                    rows={data.collections}
                    fields={[
                      "id",
                      "order_id",
                      "amount_minor",
                      "collected_at",
                      "proof_ref",
                    ]}
                  />
                </section>
                <section className="card">
                  <h2>Courier remittances</h2>
                  <Rows
                    rows={data.remittances}
                    fields={["reference", "amount_minor", "received_at"]}
                  />
                </section>
                <section className="card">
                  <h2>Record collection or remittance</h2>
                  <form className="command-form" onSubmit={command}>
                    <label>
                      Action
                      <select name="command">
                        <option value="cash.collect">
                          Verify customer cash collection
                        </option>
                        <option value="settlement">
                          Record courier remittance
                        </option>
                      </select>
                    </label>
                    <Field
                      label="Order ID (collection only)"
                      name="order_id"
                      required={false}
                    />
                    <Field
                      label="Collection ID (remittance only)"
                      name="collection_id"
                      required={false}
                    />
                    <Field
                      label="Amount (poisha)"
                      name="amount_minor"
                      type="number"
                    />
                    <Field
                      label="Collection / remittance evidence reference"
                      name="reference"
                    />
                    <button disabled={busy}>Record money movement</button>
                  </form>
                </section>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
function Field({
  label: caption,
  name,
  type = "text",
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {caption}
      <input name={name} type={type} required={required} />
    </label>
  );
}
function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="card metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Rows({
  rows,
  fields,
  onSelect,
}: {
  rows: JsonRow[];
  fields: string[];
  onSelect?: (row: JsonRow) => void;
}) {
  if (!rows?.length)
    return <p className="empty compact">No records to display.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {fields.map((f) => (
              <th key={f}>{label(f)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id || i)}>
              {fields.map((f) => (
                <td key={f}>
                  {f === "id" && onSelect ? (
                    <button
                      className="text-button"
                      onClick={() => onSelect(r)}
                      aria-label={`View order ${String(r.id)}`}
                    >
                      {String(r.id)}
                    </button>
                  ) : f.endsWith("_minor") ? (
                    money(r[f])
                  ) : f.endsWith("_at") && r[f] ? (
                    new Intl.DateTimeFormat("en-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Dhaka",
                    }).format(new Date(String(r[f])))
                  ) : f === "status" ? (
                    <span className="badge">{label(r[f])}</span>
                  ) : typeof r[f] === "boolean" ? (
                    r[f] ? (
                      "Yes"
                    ) : (
                      "No"
                    )
                  ) : (
                    String(r[f] ?? "—")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reports() {
  const { data, error } =
    useResource<Record<string, unknown>>("resource=reports");
  return (
    <>
      <section className="card">
        <h2>Store reports</h2>
        <Notice error={error} />
        {data ? (
          <dl className="totals">
            {Object.entries(data).map(([key, value]) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>{key.endsWith("_minor") ? money(value) : String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Loading totals…</p>
        )}
        <p className="muted">
          Order value, collected funds, refunds and courier receipts represent
          separate measures. These reports are operational summaries, not full
          accounting.
        </p>
      </section>
      <section className="card">
        <h2>Data export</h2>
        <p>
          Exports contain business records. Download only for an authorized
          operational purpose.
        </p>
        <a className="button secondary" href="/api/admin/export?kind=orders">
          Download orders CSV
        </a>
      </section>
    </>
  );
}
