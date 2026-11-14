BEGIN;
CREATE TABLE order_support_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders,actor_id text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX support_notes_order_idx ON order_support_notes(order_id,created_at);
COMMIT;
