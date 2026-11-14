BEGIN;
CREATE TABLE http_checkout_results(session_id text NOT NULL REFERENCES shopping_sessions,key text NOT NULL,request_hash text NOT NULL,order_id uuid NOT NULL REFERENCES orders,PRIMARY KEY(session_id,key));
COMMIT;
