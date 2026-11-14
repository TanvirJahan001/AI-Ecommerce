BEGIN;
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX orders_customer_date_idx ON orders(customer_id,created_at DESC);
CREATE INDEX refunds_order_idx ON refunds(order_id);
CREATE INDEX return_items_return_idx ON return_items(return_id);
CREATE INDEX cart_items_variant_idx ON cart_items(variant_id);
COMMIT;
