"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, label, money, Notice, useResource } from "./store";
import type { JsonRow } from "./store";
import { parseBdtInput } from "@/lib/money-input";

export type OwnerWorkspaceData = {
  orders: JsonRow[];
  order_items?: JsonRow[];
  payment_attempts?: JsonRow[];
  shipments?: JsonRow[];
  returns?: JsonRow[];
  return_items?: JsonRow[];
  refunds?: JsonRow[];
  funding_events?: JsonRow[];
  warranty_claims?: JsonRow[];
  support_notes?: JsonRow[];
  collections?: JsonRow[];
  remittances?: JsonRow[];
  remittance_allocations?: JsonRow[];
};
export type RefundEligibility = {
  branch: string;
  requires_cancellation: boolean;
  reason: string;
  remaining_shipping_minor: number;
  remaining_total_minor: number;
  funding: {
    id: string;
    source: string;
    amount_minor: number;
    remaining_minor: number;
  }[];
  items: {
    order_item_id: string;
    sku: string;
    name: string;
    purchased_quantity: number;
    eligible_quantity: number;
    committed_quantity: number;
    remaining_quantity: number;
    remaining_minor: number;
    unit_net_minors: number[];
  }[];
};
type OrderDetailData = {
  order: JsonRow;
  items: JsonRow[];
  payments: JsonRow[];
  shipments: JsonRow[];
  returns: JsonRow[];
  return_items: JsonRow[];
  refunds: JsonRow[];
  refund_items?: JsonRow[];
  funding_events: JsonRow[];
  warranty_claims: JsonRow[];
  support_notes: JsonRow[];
  refund_eligibility?: RefundEligibility;
};
export const ActionFeedbackContext = createContext<(message: string) => void>(
  () => {},
);
export const orderReference = (id: unknown) =>
  `Order ${String(id ?? "")
    .slice(0, 8)
    .toUpperCase()}`;
const text = (v: unknown) => String(v ?? "");
const number = (v: unknown) => Number(v ?? 0);
const time = (v: unknown) =>
  v
    ? new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(text(v)))
    : "—";

type ActionField = {
  name: string;
  title: string;
  type?: "text" | "number" | "amount" | "textarea" | "select";
  value?: string;
  min?: number;
  max?: number;
  choices?: { value: string; label: string }[];
  optional?: boolean;
};
export function ContextAction({
  title,
  command,
  base,
  fields = [],
  onSaved,
  record,
}: {
  title: string;
  command: string;
  base: Record<string, unknown>;
  fields?: ActionField[];
  onSaved: () => void;
  record: string;
}) {
  const feedback = useContext(ActionFeedbackContext);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const key = useRef<{ signature: string; id: string } | undefined>(undefined);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      action: "admin.command",
      command,
      ...base,
    };
    try {
      for (const f of fields) {
        const v = text(form.get(f.name));
        payload[f.name] =
          f.type === "amount"
            ? parseBdtInput(v)
            : f.type === "number"
              ? Number(v)
              : v;
      }
      if (typeof payload.approved === "string")
        payload.approved = payload.approved === "true";
      const signature = JSON.stringify(payload);
      if (key.current?.signature !== signature)
        key.current = { signature, id: crypto.randomUUID() };
      payload.idempotency_key = key.current.id;
      setBusy(true);
      const result = await api<JsonRow>(undefined, payload);
      key.current = undefined;
      const success = `${title} completed for ${record}${result.amount_minor !== undefined ? ` · ${money(result.amount_minor)}` : ""}.`;
      setMessage(success);
      feedback(success);
      onSaved();
    } catch (err) {
      setError(
        `${(err as Error).message} Refresh this order before retrying if its state changed.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack card" onSubmit={submit}>
      <h3>{title}</h3>
      {fields.map((f) => (
        <label key={f.name}>
          {f.title}
          {f.type === "textarea" ? (
            <textarea
              name={f.name}
              defaultValue={f.value}
              required={!f.optional}
              maxLength={2000}
            />
          ) : f.type === "select" ? (
            <select
              aria-label={f.title}
              name={f.name}
              defaultValue={f.value}
              required={!f.optional}
            >
              {f.choices?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={f.name}
              type={f.type === "number" ? "number" : "text"}
              inputMode={f.type === "amount" ? "decimal" : undefined}
              defaultValue={f.value}
              min={f.min}
              max={f.max}
              step={f.type === "number" ? 1 : undefined}
              required={!f.optional}
            />
          )}
        </label>
      ))}
      <button disabled={busy}>{busy ? "Saving…" : title}</button>
      <Notice error={error} message={message} />
    </form>
  );
}

export default function OrderWorkspace({
  data,
  onSaved,
  initialOrderId = "",
  mode = "orders",
}: {
  data: OwnerWorkspaceData;
  onSaved: () => void;
  initialOrderId?: string;
  mode?: "orders" | "after-sales";
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [method, setMethod] = useState(""),
    [selected, setSelected] = useState(initialOrderId);
  const orders = data.orders.filter(
    (o) =>
      `${orderReference(o.id)} ${o.id} ${o.guest_name} ${o.guest_phone}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!status || o.status === status) &&
      (!method || o.payment_method === method),
  );
  return (
    <>
      <section className="card">
        <h2>
          {mode === "after-sales"
            ? "Find an order for after-sales support"
            : "Orders"}
        </h2>
        <div className="field-grid">
          <label>
            Search orders
            <input
              type="search"
              placeholder="Reference, customer or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Order status
            <select
              aria-label="Order status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {[...new Set(data.orders.map((o) => text(o.status)))].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment method
            <select
              aria-label="Payment method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">All methods</option>
              <option value="online">Online</option>
              <option value="cod">Cash on delivery</option>
            </select>
          </label>
        </div>
        <div className="table-wrap owner-orders-desktop">
          <table style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Placed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={text(o.id)}>
                  <td>{orderReference(o.id)}</td>
                  <td>{text(o.guest_name)}</td>
                  <td>
                    <span className="badge">{label(o.status)}</span>
                  </td>
                  <td>{money(o.total_minor)}</td>
                  <td>{time(o.created_at)}</td>
                  <td>
                    <button
                      className="secondary"
                      aria-expanded={selected === text(o.id)}
                      aria-controls="owner-order-detail"
                      onClick={() => setSelected(text(o.id))}
                    >
                      Open {orderReference(o.id)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="owner-orders-mobile">
          {orders.map((o) => (
            <article className="card" key={text(o.id)}>
              <h3>{orderReference(o.id)}</h3>
              <p>{text(o.guest_name)}</p>
              <p>
                <span className="badge">{label(o.status)}</span> ·{" "}
                {label(o.payment_method)}
              </p>
              <p>
                <strong style={{ whiteSpace: "nowrap" }}>
                  {money(o.total_minor)}
                </strong>
              </p>
              <p>{time(o.created_at)}</p>
              <button
                className="secondary"
                aria-expanded={selected === text(o.id)}
                aria-controls="owner-order-detail"
                onClick={() => setSelected(text(o.id))}
              >
                Open {orderReference(o.id)}
              </button>
            </article>
          ))}
        </div>
        <style jsx>{`
          .owner-orders-mobile {
            display: none;
          }
          @media (max-width: 640px) {
            .owner-orders-desktop {
              display: none;
            }
            .owner-orders-mobile {
              display: grid;
              gap: 12px;
            }
            .owner-orders-mobile .card {
              margin: 0;
              padding: 16px;
            }
          }
        `}</style>
        {!orders.length ? <p>No orders match these filters.</p> : null}
      </section>
      {selected ? (
        <OrderDetail key={selected} id={selected} onSaved={onSaved} />
      ) : (
        <section className="card">
          <h2>Select an order</h2>
          <p>
            Open an order to review its own items, history and available
            actions.
          </p>
        </section>
      )}
    </>
  );
}
function OrderDetail({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [feedback, setFeedback] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data, error, reload } = useResource<OrderDetailData>(
    `resource=admin.order&id=${encodeURIComponent(id)}`,
  );
  useEffect(() => {
    if (data?.order?.id === id) headingRef.current?.focus();
  }, [data?.order?.id, id]);
  const refresh = () => {
    reload();
    onSaved();
  };
  if (error)
    return (
      <section className="card">
        <h2>Order details unavailable</h2>
        <Notice error={error} />
        <button onClick={reload}>Refresh order</button>
      </section>
    );
  if (!data || text(data.order?.id) !== id)
    return <p role="status">Loading selected order…</p>;
  const {
    order,
    items,
    payments = [],
    shipments = [],
    returns = [],
    return_items = [],
    refunds = [],
    warranty_claims = [],
    support_notes = [],
  } = data;
  const ref = orderReference(id);
  const shipment = shipments[0];
  const dispatched = shipments.some((s) =>
    [
      "dispatched",
      "delivered",
      "delivery_failed",
      "retry_scheduled",
      "return_to_origin",
      "returned_to_store",
    ].includes(text(s.status)),
  );
  const cancellable =
    !dispatched &&
    [
      "pending_payment",
      "awaiting_cod_confirmation",
      "confirmed",
      "processing",
      "cancellation_requested",
    ].includes(text(order.status));
  const transitions: Record<string, string[]> = {
    dispatched: ["delivered", "delivery_failed"],
    delivery_failed: ["retry_scheduled", "return_to_origin"],
    retry_scheduled: ["delivered", "delivery_failed"],
    return_to_origin: ["returned_to_store"],
  };
  const shipmentChoices = transitions[text(shipment?.status)] || [];
  const returnable = shipments.some((s) =>
    ["delivered", "return_to_origin", "returned_to_store"].includes(
      text(s.status),
    ),
  );
  return (
    <ActionFeedbackContext.Provider value={setFeedback}>
      <section id="owner-order-detail" aria-label="Selected order workspace">
        <Notice message={feedback} />
        <header className="card">
          <h2 ref={headingRef} tabIndex={-1}>
            Order detail · {ref}
          </h2>
          <p>
            <span className="badge">{label(order.status)}</span> ·{" "}
            {label(order.payment_method)} ·{" "}
            <strong>{money(order.total_minor)}</strong>
          </p>
          <p>
            {text(order.guest_name)} · {text(order.guest_phone)}
          </p>
          <Address value={order.address_snapshot} />
          <details>
            <summary>Full order identifier</summary>
            <p className="mono" style={{ overflowWrap: "anywhere" }}>
              {id}
            </p>
          </details>
          <button className="secondary" onClick={refresh}>
            Refresh selected order
          </button>
        </header>
        <section className="card">
          <h3>Purchased items</h3>
          {items.map((item) => (
            <article className="card" key={text(item.id)}>
              <h4>
                {text(item.name_snapshot)} · {text(item.sku_snapshot)}
              </h4>
              <p>
                {text(item.variant_label_snapshot)} · Quantity{" "}
                {text(item.quantity)} · {money(item.unit_minor)} each
              </p>
              <p>Saved discount: {money(item.discount_minor)}</p>
              <Snapshot item={item} />
              {returnable ? (
                <ItemReturn
                  item={item}
                  returns={returns}
                  returnItems={return_items}
                  orderId={id}
                  record={ref}
                  onSaved={refresh}
                />
              ) : (
                <p className="muted">
                  Physical return receipt is available after delivery or
                  return-to-origin. An unshipped cancellation uses its own
                  refund path.
                </p>
              )}
            </article>
          ))}
        </section>
        <section className="card">
          <h3>Payment and shipment history</h3>
          {payments.map((p) => (
            <p key={text(p.id)}>
              {label(p.status)} · {money(p.amount_minor)} · {time(p.created_at)}
            </p>
          ))}
          {!payments.length ? (
            <p>No online payment attempt; COD does not require one.</p>
          ) : null}
          {shipments.map((s) => (
            <p key={text(s.id)}>
              {label(s.status)} · Tracking{" "}
              {text(s.tracking_ref) || "not yet assigned"}
            </p>
          ))}
          {!shipments.length ? <p>Not dispatched.</p> : null}
        </section>
        <div className="field-grid">
          {order.payment_method === "cod" &&
          order.status === "awaiting_cod_confirmation" ? (
            <ContextAction
              title="Confirm COD order"
              command="cod.confirm"
              base={{ order_id: id }}
              record={ref}
              onSaved={refresh}
            />
          ) : null}
          {cancellable ? (
            <ContextAction
              title="Approve cancellation"
              command="cancel"
              base={{ order_id: id }}
              fields={[
                {
                  name: "reason",
                  title: "Cancellation reason / approval reference",
                  type: "textarea",
                },
              ]}
              record={ref}
              onSaved={refresh}
            />
          ) : null}
          {order.status === "cancellation_requested" ? (
            <ContextAction
              title="Reject cancellation request"
              command="cancel.reject"
              base={{ order_id: id }}
              fields={[
                {
                  name: "reason",
                  title: "Reason for rejecting cancellation",
                  type: "textarea",
                },
              ]}
              record={ref}
              onSaved={refresh}
            />
          ) : null}
          {!dispatched &&
          ["confirmed", "processing"].includes(text(order.status)) ? (
            <ContextAction
              title="Dispatch order"
              command="dispatch"
              base={{ order_id: id }}
              fields={[
                {
                  name: "tracking_ref",
                  title: "Courier booking / tracking reference",
                },
              ]}
              record={ref}
              onSaved={refresh}
            />
          ) : null}
          {shipmentChoices.length ? (
            <ContextAction
              title="Update delivery"
              command="shipment.update"
              base={{ order_id: id }}
              fields={[
                {
                  name: "status",
                  title: "Next delivery step",
                  type: "select",
                  choices: shipmentChoices.map((v) => ({
                    value: v,
                    label: label(v),
                  })),
                },
              ]}
              record={ref}
              onSaved={refresh}
            />
          ) : null}
        </div>
        {!cancellable && dispatched ? (
          <p className="notice">
            This order has dispatched. Use the return workflow rather than
            releasing its stock commitment.
          </p>
        ) : null}
        <section className="card">
          <h3>Returns and inspection</h3>
          {returns.length ? (
            returns.map((ret) => (
              <ReturnCase
                key={text(ret.id)}
                row={ret}
                rows={return_items.filter((i) => i.return_id === ret.id)}
                items={items}
                record={ref}
                onSaved={refresh}
              />
            ))
          ) : (
            <p>No return cases for this order.</p>
          )}
        </section>
        <section className="card">
          <h3>Refund eligibility and approval</h3>
          {data.refund_eligibility ? (
            <RefundApproval
              orderId={id}
              eligibility={data.refund_eligibility}
              record={ref}
              onSaved={refresh}
            />
          ) : (
            <p>
              Refund eligibility is unavailable. Refresh before approving a
              payout.
            </p>
          )}
        </section>
        <section className="card">
          <h3>Refund payouts</h3>
          {refunds.length ? (
            refunds.map((r) => (
              <RefundCase
                key={text(r.id)}
                row={r}
                record={ref}
                onSaved={refresh}
              />
            ))
          ) : (
            <p>No refunds recorded for this order.</p>
          )}
        </section>
        <section className="card">
          <h3>Warranty cases</h3>
          {warranty_claims.length ? (
            warranty_claims.map((w) => (
              <article className="card" key={text(w.id)}>
                <p>
                  {
                    items.find((i) => i.id === w.order_item_id)
                      ?.sku_snapshot as string
                  }{" "}
                  · {label(w.status)} · {text(w.reason)}
                </p>
                {["requested", "reviewing", "approved"].includes(
                  text(w.status),
                ) ? (
                  <ContextAction
                    title="Resolve warranty case"
                    command="warranty.resolve"
                    base={{ claim_id: w.id }}
                    fields={[
                      {
                        name: "approved",
                        title: "Warranty decision",
                        type: "select",
                        choices: [
                          { value: "true", label: "Resolve approved claim" },
                          { value: "false", label: "Reject claim" },
                        ],
                      },
                      {
                        name: "resolution",
                        title: "Decision and resolution evidence",
                        type: "textarea",
                      },
                    ]}
                    record={ref}
                    onSaved={refresh}
                  />
                ) : (
                  <p>{text(w.resolution)}</p>
                )}
              </article>
            ))
          ) : (
            <p>
              No warranty claims for this order. Warranty eligibility remains
              subject to the saved terms and owner review.
            </p>
          )}
        </section>
        <section className="card">
          <h3>Support context</h3>
          {support_notes.map((n) => (
            <p key={text(n.id)}>
              {text(n.note)} <small>{time(n.created_at)}</small>
            </p>
          ))}
          <ContextAction
            title="Save support note"
            command="support.note"
            base={{ order_id: id }}
            fields={[
              { name: "note", title: "Order support note", type: "textarea" },
            ]}
            record={ref}
            onSaved={refresh}
          />
        </section>
      </section>
    </ActionFeedbackContext.Provider>
  );
}
function Address({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const a = value as JsonRow;
  return (
    <p>
      {[a.street, a.area, a.city_upazila, a.district]
        .filter(Boolean)
        .map(text)
        .join(", ")}
    </p>
  );
}
function Snapshot({ item }: { item: JsonRow }) {
  const specs = item.specification_snapshot as JsonRow | undefined;
  return (
    <details>
      <summary>Saved purchase specifications</summary>
      <dl>
        {Object.entries(specs || {}).map(([k, v]) => (
          <div key={k}>
            <dt>{label(k)}</dt>
            <dd>{readable(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
function readable(v: unknown): string {
  if (typeof v === "boolean") return v ? "Included / yes" : "Not included / no";
  if (Array.isArray(v))
    return v
      .map((x) =>
        typeof x === "object" && x && "volts" in x
          ? `${x.volts} V · ${(x as JsonRow).amps} A`
          : readable(x),
      )
      .join(", ");
  if (v && typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => `${label(k)}: ${readable(x)}`)
      .join(" · ");
  return text(v);
}
function ItemReturn({
  item,
  returns,
  returnItems,
  orderId,
  record,
  onSaved,
}: {
  item: JsonRow;
  returns: JsonRow[];
  returnItems: JsonRow[];
  orderId: string;
  record: string;
  onSaved: () => void;
}) {
  const feedback = useContext(ActionFeedbackContext);
  const activeIds = new Set(
    returns.filter((r) => r.status !== "rejected").map((r) => r.id),
  );
  const prior = returnItems
    .filter((r) => r.order_item_id === item.id && activeIds.has(r.return_id))
    .reduce((sum, r) => sum + number(r.quantity), 0);
  const max = number(item.quantity) - prior;
  const [qty, setQty] = useState(1),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const key = useRef(crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(undefined, {
        action: "admin.command",
        command: "return.create",
        order_id: orderId,
        items: [{ order_item_id: item.id, quantity: qty }],
        reason,
        idempotency_key: key.current,
      });
      key.current = crypto.randomUUID();
      const success = `Return request recorded for ${text(item.sku_snapshot)} on ${record}.`;
      setMessage(success);
      feedback(success);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (max < 1)
    return <p>All purchased units already have an active return request.</p>;
  return (
    <form className="form-stack" onSubmit={submit}>
      <h4>Request return for {text(item.sku_snapshot)}</h4>
      <label>
        Return quantity
        <input
          type="number"
          min={1}
          max={max}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          required
        />
      </label>
      <p>
        Up to {max} unit(s) remain available to request. This does not approve
        eligibility or restock goods.
      </p>
      <label>
        Return reason
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          required
        />
      </label>
      <button className="secondary" disabled={busy}>
        Request this item’s return
      </button>
      <Notice error={error} message={message} />
    </form>
  );
}
function ReturnCase({
  row,
  rows,
  items,
  record,
  onSaved,
}: {
  row: JsonRow;
  rows: JsonRow[];
  items: JsonRow[];
  record: string;
  onSaved: () => void;
}) {
  return (
    <article className="card">
      <h4>
        Return {text(row.id).slice(0, 8).toUpperCase()} · {label(row.status)}
      </h4>
      <p>{text(row.reason)}</p>
      {row.status === "requested" ? (
        <div className="field-grid">
          <ContextAction
            title="Authorize return"
            command="return.authorize"
            base={{ return_id: row.id, approved: true }}
            fields={[
              {
                name: "reason",
                title: "Authorization reason / reference",
                type: "textarea",
              },
            ]}
            record={record}
            onSaved={onSaved}
          />
          <ContextAction
            title="Reject return"
            command="return.authorize"
            base={{ return_id: row.id, approved: false }}
            fields={[
              {
                name: "reason",
                title: "Reason for rejecting return",
                type: "textarea",
              },
            ]}
            record={record}
            onSaved={onSaved}
          />
        </div>
      ) : null}
      {["authorized", "in_transit"].includes(text(row.status)) ? (
        <ContextAction
          title="Receive authorized items into quarantine"
          command="return.receive"
          base={{ return_id: row.id }}
          record={record}
          onSaved={onSaved}
        />
      ) : null}
      {rows.map((ri) => (
        <div className="card" key={text(ri.id)}>
          <p>
            {text(items.find((i) => i.id === ri.order_item_id)?.sku_snapshot)} ·{" "}
            {text(ri.quantity)} unit(s) ·{" "}
            {ri.received_at
              ? "Physically received"
              : "Awaiting physical receipt"}
          </p>
          {ri.received_at && !ri.inspection ? (
            <>
              <p>
                Inspection is required before refund eligibility. Restocking
                transfers quarantine to sellable without changing physical
                stock.
              </p>
              <ContextAction
                title="Inspect received goods"
                command="return.inspect"
                base={{ return_item_id: ri.id }}
                fields={[
                  {
                    name: "condition",
                    title: "Condition and stock disposition",
                    type: "select",
                    choices: [
                      {
                        value: "sellable",
                        label:
                          "Sellable — transfer from quarantine to sellable",
                      },
                      {
                        value: "damaged",
                        label: "Damaged — keep in quarantine",
                      },
                      {
                        value: "unavailable",
                        label: "Unavailable — keep in quarantine",
                      },
                    ],
                  },
                ]}
                record={record}
                onSaved={onSaved}
              />
            </>
          ) : (
            <p>
              {ri.inspection
                ? `${label(ri.inspection)} · ${label(ri.disposition)}`
                : ""}
            </p>
          )}
          {ri.inspection && ri.disposition === "quarantined" ? (
            <ContextAction
              title="Write off quarantined goods"
              command="return.dispose"
              base={{ return_item_id: ri.id }}
              fields={[
                {
                  name: "reason",
                  title: "Write-off reason / evidence",
                  type: "textarea",
                },
              ]}
              record={record}
              onSaved={onSaved}
            />
          ) : null}
        </div>
      ))}
    </article>
  );
}
function RefundApproval({
  orderId,
  eligibility: e,
  record,
  onSaved,
}: {
  orderId: string;
  eligibility: RefundEligibility;
  record: string;
  onSaved: () => void;
}) {
  const feedback = useContext(ActionFeedbackContext);
  const [quantities, setQuantities] = useState<Record<string, number>>({}),
    [funding, setFunding] = useState(""),
    [shipping, setShipping] = useState("0.00"),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef<{ signature: string; id: string } | undefined>(undefined);
  const available = e.funding.filter((f) => f.remaining_minor > 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const items = e.items
        .filter((i) => (quantities[i.order_item_id] || 0) > 0)
        .map((i) => ({
          order_item_id: i.order_item_id,
          quantity: quantities[i.order_item_id],
        }));
      if (!items.length)
        throw Error("Choose at least one eligible item quantity.");
      const payload = {
        action: "admin.command",
        command: "refund.reserve",
        order_id: orderId,
        funding_event_id: funding || available[0]?.id,
        items,
        shipping_minor: parseBdtInput(shipping),
        reason,
      };
      const signature = JSON.stringify(payload);
      if (key.current?.signature !== signature)
        key.current = { signature, id: crypto.randomUUID() };
      const result = await api<JsonRow>(undefined, {
        ...payload,
        idempotency_key: key.current.id,
      });
      key.current = undefined;
      setQuantities({});
      const success = `Refund approved for ${record}: ${money(result.amount_minor)}. Submit its payout as the next step.`;
      feedback(success);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>{e.reason}</p>
      <p>
        Remaining refundable value:{" "}
        <strong>{money(e.remaining_total_minor)}</strong>. Remaining delivery
        allocation: {money(e.remaining_shipping_minor)}.
      </p>
      {e.requires_cancellation ? (
        <p className="notice">
          Approve cancellation of this unshipped order first. No physical return
          or receipt is required for that resolution.
        </p>
      ) : available.length && e.items.some((i) => i.remaining_quantity > 0) ? (
        <form className="form-stack" onSubmit={submit}>
          <label>
            Verified funding
            <select
              aria-label="Verified funding"
              value={funding || available[0]?.id}
              onChange={(ev) => setFunding(ev.target.value)}
            >
              {available.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.source === "online"
                    ? "Verified online payment"
                    : "Verified customer COD collection"}{" "}
                  · {money(f.remaining_minor)} remaining
                </option>
              ))}
            </select>
          </label>
          {e.items.map((i) => (
            <label key={i.order_item_id}>
              {i.name} · {i.sku} — {i.remaining_quantity} refundable of{" "}
              {i.purchased_quantity} purchased
              <input
                type="number"
                min={0}
                max={i.remaining_quantity}
                value={quantities[i.order_item_id] || 0}
                disabled={!i.remaining_quantity}
                onChange={(ev) =>
                  setQuantities({
                    ...quantities,
                    [i.order_item_id]: Number(ev.target.value),
                  })
                }
              />
              <small>
                {money(i.remaining_minor)} eligible value remaining; approved
                and unknown payouts already consume capacity.
              </small>
            </label>
          ))}
          <label>
            Delivery refund (BDT)
            <input
              inputMode="decimal"
              value={shipping}
              onChange={(ev) => setShipping(ev.target.value)}
              required
            />
          </label>
          <label>
            Refund reason / approval reference
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              required
              minLength={3}
            />
          </label>
          <button disabled={busy}>Approve selected refund</button>
        </form>
      ) : (
        <p>
          No verified, eligible refundable capacity is currently available.
          Unpaid COD orders have no customer payment to refund; delivered items
          require the applicable received and inspected return.
        </p>
      )}
      <Notice error={error} />
    </>
  );
}
function RefundCase({
  row,
  record,
  onSaved,
}: {
  row: JsonRow;
  record: string;
  onSaved: () => void;
}) {
  return (
    <article className="card">
      <h4>
        Refund {text(row.id).slice(0, 8).toUpperCase()} ·{" "}
        {money(row.amount_minor)}
      </h4>
      <p>
        <span className="badge">{label(row.status)}</span> · {text(row.reason)}
      </p>
      {row.status === "approved" ? (
        <ContextAction
          title="Submit refund payout"
          command="refund.submit"
          base={{ refund_id: row.id }}
          record={record}
          onSaved={onSaved}
        />
      ) : null}
      {["pending", "unknown", "reconciliation_required"].includes(
        text(row.status),
      ) ? (
        <>
          <p className="notice">
            Capacity stays reserved until a definitive payout outcome is
            recorded. An HTTP timeout does not prove failure.
          </p>
          <ContextAction
            title="Reconcile refund payout"
            command="refund.reconcile"
            base={{ refund_id: row.id }}
            fields={[
              {
                name: "outcome",
                title: "Verified payout outcome",
                type: "select",
                choices: [
                  {
                    value: "unknown",
                    label: "Unknown / timed out — retain capacity",
                  },
                  {
                    value: "succeeded",
                    label: "Succeeded — payout evidence verified",
                  },
                  {
                    value: "failed",
                    label: "Definitively failed — release capacity",
                  },
                ],
              },
              {
                name: "evidence",
                title: "Payout reference and verification evidence",
                type: "textarea",
              },
            ]}
            record={record}
            onSaved={onSaved}
          />
        </>
      ) : null}
    </article>
  );
}
