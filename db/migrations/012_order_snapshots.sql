BEGIN;
ALTER TABLE order_items ADD COLUMN variant_label_snapshot text NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN specification_snapshot jsonb NOT NULL DEFAULT '{}';
ALTER TABLE order_items ADD COLUMN compatibility_snapshot jsonb NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN policy_snapshot jsonb NOT NULL DEFAULT '{}';
COMMIT;
