BEGIN;
ALTER TABLE shopping_sessions ADD COLUMN discount_code text;
COMMIT;
