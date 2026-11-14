"use client";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, Notice } from "./store";
import type { CatalogProduct } from "./catalog-editor";
type Row = Record<string, unknown>;
export default function InventoryPanel({
  products,
  inventory,
  movements,
  onSaved,
}: {
  products: CatalogProduct[];
  inventory: Row[];
  movements: Row[];
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [variantId, setVariantId] = useState("");
  const [adjustment, setAdjustment] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef<{ hash: string; key: string }>({ hash: "", key: "" });
  const variants = products.flatMap((p) =>
    p.variants.map((v) => ({ ...v, name: p.name })),
  );
  const filtered = variants.filter((v) =>
    `${v.name} ${v.sku} ${v.label}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = variants.find((v) => v.id === variantId);
  const balance = inventory.find((r) => r.id === variantId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const qty = Number(quantity);
      if (!Number.isSafeInteger(qty) || qty === 0 || (!adjustment && qty < 0))
        throw Error(
          adjustment
            ? "Enter a non-zero whole-number stock change."
            : "Enter a positive whole-number receipt quantity.",
        );
      const hash = JSON.stringify({ variantId, adjustment, qty, reason });
      if (request.current.hash !== hash)
        request.current = { hash, key: crypto.randomUUID() };
      await api(undefined, {
        action: "admin.command",
        command: adjustment ? "stock.adjust" : "stock.receipt",
        variant_id: variantId,
        quantity: qty,
        reason,
        idempotency_key: request.current.key,
      });
      setMessage(
        `${adjustment ? "Adjustment" : "Receipt"} saved for ${selected?.sku}: ${qty > 0 ? "+" : ""}${qty} units. Reloaded balances and movement history show the persisted result.`,
      );
      request.current = { hash: "", key: "" };
      setQuantity("");
      setReason("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <h2>Stock by SKU</h2>
        <label>
          Find inventory product or SKU
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVariantId("");
            }}
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
          {filtered.map((v) => {
            const row = inventory.find((r) => r.id === v.id);
            const sellable = Number(row?.sellable_qty ?? 0),
              committed = Number(row?.committed_qty ?? 0);
            return (
              <article className="card" key={v.id}>
                <h3>{v.name}</h3>
                <p className="mono">{v.sku}</p>
                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                    gap: 12,
                  }}
                >
                  <div>
                    <dt>Sellable</dt>
                    <dd>{sellable}</dd>
                  </div>
                  <div>
                    <dt>Committed</dt>
                    <dd>{committed}</dd>
                  </div>
                  <div>
                    <dt>Quarantined</dt>
                    <dd>{Number(row?.quarantined_qty ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{sellable - committed}</dd>
                  </div>
                </dl>
                <button
                  className="secondary"
                  onClick={() => setVariantId(v.id)}
                  aria-label={`Record stock for ${v.sku}`}
                >
                  Record stock
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section className="card">
        <h2>Record stock movement</h2>
        <Notice error={error} message={message} />
        <form className="form-stack" onSubmit={submit}>
          <label>
            Product / SKU
            <select
              aria-label="Product / SKU"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              required
            >
              <option value="">Select a product and SKU</option>
              {filtered.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.sku} · {v.label}
                </option>
              ))}
            </select>
          </label>
          {balance ? (
            <p>
              Sellable {String(balance.sellable_qty)} · committed{" "}
              {String(balance.committed_qty)} · quarantined{" "}
              {String(balance.quarantined_qty)} · available{" "}
              {Number(balance.sellable_qty) - Number(balance.committed_qty)}
            </p>
          ) : null}
          <label>
            Movement type
            <select
              aria-label="Movement type"
              value={adjustment ? "adjustment" : "receipt"}
              onChange={(e) => setAdjustment(e.target.value === "adjustment")}
            >
              <option value="receipt">Inventory receipt</option>
              <option value="adjustment">Count correction / adjustment</option>
            </select>
          </label>
          <label>
            {adjustment ? "Quantity change" : "Quantity received"}
            <input
              type="number"
              step="1"
              required
              value={quantity}
              min={adjustment ? undefined : 1}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Reason / receipt reference
            <input
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="muted">
            Adjustments cannot reduce sellable stock below existing commitments.
            Returns use receipt into quarantine and inspection, not this
            ordinary receipt workflow.
          </p>
          <button disabled={busy || !variantId}>
            {busy ? "Saving…" : "Save stock movement"}
          </button>
        </form>
      </section>
      <section className="card">
        <h2>
          {selected
            ? `${selected.sku} movement history`
            : "Recent stock movements"}
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {movements
            .filter((m) => !variantId || m.variant_id === variantId)
            .map((m) => (
              <article key={String(m.id)} className="card">
                <h3>
                  {variants.find((v) => v.id === m.variant_id)?.sku ??
                    "Archived SKU"}
                </h3>
                <p>
                  {String(m.kind).replaceAll("_", " ")} ·{" "}
                  {String(m.quantity_delta)} units
                </p>
                <p>{String(m.reason)}</p>
                <p className="muted">
                  Saved{" "}
                  {new Intl.DateTimeFormat("en-BD", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Dhaka",
                  }).format(new Date(String(m.created_at)))}{" "}
                  (Dhaka)
                </p>
              </article>
            ))}
        </div>
        {movements.filter((m) => !variantId || m.variant_id === variantId)
          .length === 0 ? (
          <p>No saved movements for this selection.</p>
        ) : null}
      </section>
    </>
  );
}
