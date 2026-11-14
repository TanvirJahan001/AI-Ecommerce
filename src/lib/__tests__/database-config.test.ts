import { describe, expect, it } from "vitest";
import {
  databasePoolConfig,
  isolatedTestUrl,
  assertDatabaseSchema,
} from "../database-config";
const legacy = {
  DATABASE_URL: "postgresql://fixture:private@localhost:5432/store",
};
const target = {
  ...legacy,
  DATABASE_PROVIDER: "supabase",
  DATABASE_SCHEMA: "store_private",
  DATABASE_CONNECTION_MODE: "session",
  DATABASE_SSL_MODE: "disable",
  MIGRATION_DATABASE_URL: "postgresql://migrator:private@localhost:5432/store",
};
describe("server PostgreSQL configuration", () => {
  it("requires an explicit PostgreSQL URL without exposing its value", () => {
    for (const DATABASE_URL of [
      undefined,
      "http://localhost:8000",
      "postgresql://secret:private@localhost/store?options=unsafe",
    ]) {
      expect(() => databasePoolConfig({ DATABASE_URL })).toThrow();
      try {
        databasePoolConfig({ DATABASE_URL });
      } catch (e) {
        expect(String(e)).not.toContain("secret:private");
      }
    }
  });
  it("keeps legacy source configuration and explicitly scopes every connection", () => {
    expect(databasePoolConfig(legacy)).toMatchObject({
      options: "-c search_path=public,pg_catalog",
      ssl: false,
    });
    expect(databasePoolConfig(target)).toMatchObject({
      options: "-c search_path=store_private,pg_catalog",
      application_name: "mobile-store-server",
    });
    expect(databasePoolConfig(target, "migration").connectionString).toContain(
      "migrator:",
    );
  });
  it("rejects unverified or transaction pooling and unspecified Supabase TLS", () => {
    for (const mode of [undefined, "transaction", "invalid"])
      expect(() =>
        databasePoolConfig({ ...target, DATABASE_CONNECTION_MODE: mode }),
      ).toThrow("CONNECTION_MODE");
    expect(() =>
      databasePoolConfig({ ...target, DATABASE_SSL_MODE: undefined }),
    ).toThrow("SSL_MODE");
  });
  it("requires a private, safe schema and separate authority for Supabase", () => {
    for (const schema of [
      undefined,
      "public",
      "auth",
      "storage",
      "pg_catalog",
      "foo;drop table orders",
    ])
      expect(() =>
        databasePoolConfig({ ...target, DATABASE_SCHEMA: schema }),
      ).toThrow();
    expect(() =>
      databasePoolConfig(
        { ...target, MIGRATION_DATABASE_URL: undefined },
        "migration",
      ),
    ).toThrow("MIGRATION_DATABASE_URL");
    expect(() =>
      databasePoolConfig(
        { ...target, MIGRATION_DATABASE_URL: target.DATABASE_URL },
        "migration",
      ),
    ).toThrow("distinct");
    expect(() =>
      databasePoolConfig({
        ...target,
        DATABASE_URL: "postgresql://postgres:x@localhost/store",
      }),
    ).toThrow("restricted");
    expect(() =>
      databasePoolConfig(
        {
          ...target,
          MIGRATION_DATABASE_URL: "postgresql://migrator:x@localhost/other",
        },
        "migration",
      ),
    ).toThrow("same host");
  });
  it("rejects destructive tests on the application database despite credential or loopback alias changes", () => {
    expect(() =>
      isolatedTestUrl({
        ...legacy,
        TEST_DATABASE_URL: "postgresql://another:x@127.0.0.1:5432/store",
      }),
    ).toThrow("different database");
    expect(() =>
      isolatedTestUrl({
        ...legacy,
        TEST_DATABASE_URL: "postgresql://fixture:x@different-pooler:6543/store",
      }),
    ).toThrow("different database");
    expect(() => isolatedTestUrl(legacy)).toThrow("TEST_DATABASE_URL");
    expect(
      isolatedTestUrl({
        ...legacy,
        TEST_DATABASE_URL: "postgresql://fixture:x@localhost/store_test",
      }),
    ).toContain("store_test");
  });
  it("fails closed if the configured schema is missing or falls back to pg_catalog", async () => {
    await expect(
      assertDatabaseSchema(
        {
          query: async () => ({
            rows: [{ schema: "pg_catalog", usable: false }],
          }),
        },
        target,
      ),
    ).rejects.toThrow("schema");
    await expect(
      assertDatabaseSchema(
        {
          query: async () => ({
            rows: [{ schema: "store_private", usable: true }],
          }),
        },
        target,
      ),
    ).resolves.toBeUndefined();
  });
});
