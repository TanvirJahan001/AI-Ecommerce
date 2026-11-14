BEGIN;
CREATE TABLE shopping_sessions (id text PRIMARY KEY, expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days');
CREATE TABLE cart_items (session_id text NOT NULL REFERENCES shopping_sessions ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES variants, quantity int NOT NULL CHECK(quantity BETWEEN 1 AND 99), PRIMARY KEY(session_id,variant_id));
CREATE TABLE guest_order_grants (session_id text NOT NULL REFERENCES shopping_sessions, order_id uuid NOT NULL REFERENCES orders, expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', revoked_at timestamptz, PRIMARY KEY(session_id,order_id));
CREATE TABLE store_content (slug text PRIMARY KEY, title text NOT NULL, body text NOT NULL, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE support_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders,kind text NOT NULL CHECK(kind IN ('cancel','return','warranty')),reason text NOT NULL,status text NOT NULL DEFAULT 'requested',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE product_media (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products,url text NOT NULL,alt text NOT NULL);
CREATE TABLE local_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),outbox_id uuid NOT NULL UNIQUE REFERENCES outbox, payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
COMMIT;
