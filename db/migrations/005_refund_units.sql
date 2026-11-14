BEGIN;
CREATE TABLE refund_unit_allocations(refund_id uuid NOT NULL REFERENCES refunds,order_item_id uuid NOT NULL,unit_index integer NOT NULL,PRIMARY KEY(refund_id,order_item_id,unit_index),FOREIGN KEY(order_item_id,unit_index) REFERENCES order_item_unit_allocations(order_item_id,unit_index));
CREATE INDEX refund_unit_item_idx ON refund_unit_allocations(order_item_id,unit_index);
COMMIT;
