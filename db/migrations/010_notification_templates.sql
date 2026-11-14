BEGIN;
CREATE TABLE notification_templates(topic text PRIMARY KEY,title text NOT NULL,body text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO notification_templates(topic,title,body) VALUES('order.created','Order received','Your order {order_id} was received.'),('payment.succeeded','Payment confirmed','Payment for order {order_id} was verified.'),('order.cancelled','Order cancelled','Order {order_id} was cancelled. Refund status is tracked separately.');
COMMIT;
