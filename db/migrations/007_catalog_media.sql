BEGIN;
ALTER TABLE product_media ADD COLUMN variant_id uuid REFERENCES variants;
CREATE INDEX product_media_variant_idx ON product_media(variant_id);
COMMIT;
