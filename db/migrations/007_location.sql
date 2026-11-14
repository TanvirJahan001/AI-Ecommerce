BEGIN;
CREATE TABLE stock_locations(id text PRIMARY KEY CHECK(id='primary'),name text NOT NULL);
INSERT INTO stock_locations VALUES('primary','Initial stock location');
ALTER TABLE variants ADD COLUMN stock_location_id text NOT NULL DEFAULT 'primary' REFERENCES stock_locations;
COMMIT;
