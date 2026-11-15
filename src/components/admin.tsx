"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import AccessState from "./access-state";
import { api, label, money, Notice, useResource } from "./store";
import CatalogEditor, { type CatalogProduct } from "./catalog-editor";
import InventoryPanel from "./inventory-panel";
import OrderWorkspace from "./order-workspace";
import CodWorkspace from "./cod-workspace";
import { parseBdtInput } from "@/lib/money-input";
import { authClient } from "@/lib/auth-client";
import type { JsonRow } from "./store";
type AdminData = {
  products: JsonRow[];
  inventory_movements?: JsonRow[];
  shipments?: JsonRow[];
  remittance_allocations?: JsonRow[];
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
  const { data, error, errorCode, reload } =
    useResource<AdminData>("resource=admin");
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    setFailure("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Logout failed");
      // Reload the document so authenticated client state is discarded.
      window.location.replace("/login");
    } catch {
      setFailure("Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }
  const commandKey = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  async function command(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const input: Record<string, unknown> = { action: "admin.command" };
      for (const [k, v] of form.entries()) input[k] = v;
      for (const k of ["quantity"]) if (input[k]) input[k] = Number(input[k]);
      if (input.command === "store.configure") {
        input.cod_enabled = input.cod_enabled === "true";
        input.online_enabled = input.online_enabled === "true";
        input.enabled = input.enabled === "true";
        input.fee_minor = parseBdtInput(String(input.fee_minor));
      }
      if (input.command === "discount.save") {
        input.amount_minor = parseBdtInput(String(input.amount_minor));
        input.usage_limit = Number(input.usage_limit);
        input.active = input.active === "true";
      }
      const signature = JSON.stringify(input);
      if (commandKey.current?.signature !== signature)
        commandKey.current = { signature, key: crypto.randomUUID() };
      input.idempotency_key = commandKey.current.key;
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
        <button type="button" disabled={loggingOut} onClick={logout}>
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
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
        {!data && !error ? (
          <p role="status">Loading administration…</p>
        ) : !data ? (
          <AccessState code={errorCode} next="/admin" onRetry={reload} />
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
              <CatalogEditor
                products={data.products as unknown as CatalogProduct[]}
                onSaved={reload}
              />
            ) : null}
            {tab === "Inventory" ? (
              <InventoryPanel
                products={data.products as unknown as CatalogProduct[]}
                inventory={data.inventory}
                movements={data.inventory_movements || []}
                onSaved={reload}
              />
            ) : null}
            {tab === "Orders" ? (
              <OrderWorkspace data={data} onSaved={reload} />
            ) : null}
            {tab === "Returns & refunds" ? (
              <>
                <p>
                  Choose an order to manage its returns, refunds and warranty
                  cases.
                </p>
                <OrderWorkspace
                  data={data}
                  onSaved={reload}
                  mode="after-sales"
                />
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
                      label="Amount (BDT)"
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
                    label="Delivery fee (BDT)"
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
                  <label>
                    Support order
                    <select name="order_id" required>
                      <option value="">Choose an order</option>
                      {data.orders.map((o) => (
                        <option key={String(o.id)} value={String(o.id)}>
                          Order {String(o.id).slice(0, 8).toUpperCase()} ·{" "}
                          {String(o.guest_name)}
                        </option>
                      ))}
                    </select>
                  </label>
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
              <CodWorkspace data={data} onSaved={reload} />
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
      <input
        name={name}
        type={name.endsWith("_minor") ? "text" : type}
        inputMode={name.endsWith("_minor") ? "decimal" : undefined}
        pattern={name.endsWith("_minor") ? "[0-9]+([.][0-9]{1,2})?" : undefined}
        required={required}
      />
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
