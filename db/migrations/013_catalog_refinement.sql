BEGIN;
ALTER TABLE product_media ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0);
WITH ordered AS (SELECT id,row_number() OVER(PARTITION BY variant_id ORDER BY id)-1 AS position FROM product_media)
UPDATE product_media media SET sort_order=ordered.position FROM ordered WHERE media.id=ordered.id;
CREATE INDEX product_media_variant_order_idx ON product_media(variant_id,sort_order,id);
COMMIT;
