BEGIN;
CREATE TABLE guest_recovery_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders,code_hash text NOT NULL,attempts int NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX recovery_order_date ON guest_recovery_challenges(order_id,created_at);
COMMIT;
