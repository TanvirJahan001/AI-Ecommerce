"use client";

import { useState } from "react";
import { money, Notice } from "./store";
import type { JsonRow } from "./store";
import { formatBdtInput } from "@/lib/money-input";
import {
  ContextAction,
  ActionFeedbackContext,
  orderReference,
} from "./order-workspace";
import type { OwnerWorkspaceData } from "./order-workspace";
const text = (v: unknown) => String(v ?? "");
export default function CodWorkspace({
  data,
  onSaved,
}: {
  data: OwnerWorkspaceData;
  onSaved: () => void;
}) {
  const [orderId, setOrderId] = useState(""),
    [collectionId, setCollectionId] = useState(""),
    [message, setMessage] = useState("");
  const collections = data.collections || [],
    allocations = data.remittance_allocations || [],
    shipments = data.shipments || [];
  const eligible = data.orders.filter(
    (o) =>
      o.payment_method === "cod" &&
      !collections.some((c) => c.order_id === o.id) &&
      shipments.some((s) => s.order_id === o.id && s.status === "delivered"),
  );
  const order = eligible.find((o) => o.id === orderId) || eligible[0];
  const outstanding = collections
    .map((c): JsonRow & { remaining_minor: number } => ({
      ...c,
      remaining_minor:
        Number(c.amount_minor) -
        allocations
          .filter((a) => a.collection_id === c.id)
          .reduce((sum, a) => sum + Number(a.amount_minor), 0),
    }))
    .filter((c) => c.remaining_minor > 0);
  const collection =
    outstanding.find((c) => c.id === collectionId) || outstanding[0];
  const recognizable = (o: JsonRow | undefined) =>
    o
      ? `${orderReference(o.id)} · ${text(o.guest_name)} · ${money(o.total_minor)}`
      : "Unknown order";
  return (
    <ActionFeedbackContext.Provider value={setMessage}>
      <div className="notice">
        Verified customer cash collection funds a possible refund. Courier
        remittance is a separate movement; delivery alone does not settle the
        receivable.
      </div>
      <Notice message={message} />
      <div className="field-grid">
        <section className="card">
          <h2>Verify customer cash collection</h2>
          {order ? (
            <>
              <label>
                Delivered COD order
                <select
                  aria-label="Delivered COD order"
                  value={text(order.id)}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  {eligible.map((o) => (
                    <option key={text(o.id)} value={text(o.id)}>
                      {recognizable(o)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Expected customer payment:{" "}
                <strong>{money(order.total_minor)}</strong>. Record evidence
                from the customer collection, not an assumed courier remittance.
              </p>
              <ContextAction
                key={text(order.id)}
                title="Record verified customer collection"
                command="cash.collect"
                base={{ order_id: order.id }}
                fields={[
                  {
                    name: "amount_minor",
                    title: "Customer collected amount (BDT)",
                    type: "amount",
                    value: formatBdtInput(Number(order.total_minor)),
                  },
                  {
                    name: "evidence",
                    title: "Customer collection reference / evidence",
                  },
                ]}
                record={orderReference(order.id)}
                onSaved={onSaved}
              />
            </>
          ) : (
            <p>
              No delivered, uncollected COD orders are eligible. Dispatch and
              delivery must be recorded first; unpaid cancellation creates no
              refundable funding.
            </p>
          )}
        </section>
        <section className="card">
          <h2>Match courier remittance</h2>
          {collection ? (
            <>
              <label>
                Outstanding customer collection
                <select
                  aria-label="Outstanding customer collection"
                  value={text(collection.id)}
                  onChange={(e) => setCollectionId(e.target.value)}
                >
                  {outstanding.map((c) => (
                    <option key={text(c.id)} value={text(c.id)}>
                      {recognizable(
                        data.orders.find((o) => o.id === c.order_id),
                      )}{" "}
                      · {money(c.remaining_minor)} outstanding
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Outstanding:{" "}
                <strong>{money(collection.remaining_minor)}</strong>. Remitting
                money does not change the customer’s payment amount.
              </p>
              <RemittanceAction
                key={text(collection.id)}
                collection={collection}
                record={orderReference(collection.order_id)}
                onSaved={onSaved}
              />
            </>
          ) : (
            <p>No unmatched COD collection amount remains.</p>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Customer collections</h2>
        <div
          className="table-wrap"
          role="region"
          aria-label="COD collection ledger"
          tabIndex={0}
        >
          <table style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Collected</th>
                <th>Matched remittance</th>
                <th>Outstanding</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => {
                const matched = allocations
                  .filter((a) => a.collection_id === c.id)
                  .reduce((sum, a) => sum + Number(a.amount_minor), 0);
                return (
                  <tr key={text(c.id)}>
                    <td>{orderReference(c.order_id)}</td>
                    <td>{money(c.amount_minor)}</td>
                    <td>{money(matched)}</td>
                    <td>{money(Number(c.amount_minor) - matched)}</td>
                    <td>{text(c.proof_ref)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!collections.length ? (
          <p>No verified customer cash collections yet.</p>
        ) : null}
      </section>
      <section className="card">
        <h2>Courier remittances and recorded matches</h2>
        {(data.remittances || []).map((r) => (
          <article className="card" key={text(r.id)}>
            <h3>
              {text(r.reference)} · {money(r.amount_minor)}
            </h3>
            {allocations
              .filter((a) => a.remittance_id === r.id)
              .map((a, index) => {
                const c = collections.find((c) => c.id === a.collection_id);
                return (
                  <p key={index}>
                    {orderReference(c?.order_id)} · {money(a.amount_minor)}{" "}
                    matched
                  </p>
                );
              })}
            <small>
              {r.received_at
                ? new Intl.DateTimeFormat("en-BD", {
                    timeZone: "Asia/Dhaka",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(text(r.received_at)))
                : ""}
            </small>
          </article>
        ))}
        {!data.remittances?.length ? (
          <p>No courier remittance has been recorded.</p>
        ) : null}
      </section>
    </ActionFeedbackContext.Provider>
  );
}
import { useContext, useRef } from "react";
import type { FormEvent } from "react";
import { api } from "./store";
import { parseBdtInput } from "@/lib/money-input";
function RemittanceAction({
  collection,
  record,
  onSaved,
}: {
  collection: JsonRow & { remaining_minor: number };
  record: string;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
      formatBdtInput(collection.remaining_minor),
    ),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const feedback = useContext(ActionFeedbackContext);
  const key = useRef<{ signature: string; id: string } | undefined>(undefined);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const minor = parseBdtInput(amount);
      if (minor < 1 || minor > collection.remaining_minor)
        throw Error(
          "Remittance must be positive and no greater than this collection's outstanding amount.",
        );
      const payload = {
        action: "admin.command",
        command: "settlement",
        reference,
        allocations: [{ collection_id: collection.id, amount_minor: minor }],
      };
      const signature = JSON.stringify(payload);
      if (key.current?.signature !== signature)
        key.current = { signature, id: crypto.randomUUID() };
      await api(undefined, { ...payload, idempotency_key: key.current.id });
      key.current = undefined;
      feedback(
        `Courier remittance ${reference} recorded for ${record}: ${money(minor)}.`,
      );
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        Courier remitted amount (BDT)
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label>
        Courier remittance / receipt reference
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          minLength={3}
        />
      </label>
      <button disabled={busy}>Record matched courier remittance</button>
      <Notice error={error} />
    </form>
  );
}
