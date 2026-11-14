import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function preparation(extra: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/db-private-schema.ts", "--sql"],
    {
      encoding: "utf8",
      env: {
        // Do not inherit Vitest's worker/loader hooks into a standalone CLI.
        PATH: process.env.PATH,
        NODE_ENV: "test",
        DATABASE_SCHEMA: "store_private",
        DATABASE_EXPOSED_SCHEMAS: "public,graphql_public",
        // Preparation must work without contacting even an unreachable target.
        DATABASE_ADMIN_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        ...extra,
      },
    },
  );
  if (result.error) throw result.error;
  return result;
}

describe("private database boundary preparation", () => {
  it("prepares a fresh scoped boundary without connecting or exposing credentials", () => {
    const result = preparation({});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('CREATE SCHEMA "store_private"');
    expect(result.stdout).toContain("REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");
    expect(result.stdout).toContain("Boundary already exists or conflicts");
    expect(result.stdout).not.toContain("unused:unused");
    expect(result.stdout).not.toMatch(/ALTER SCHEMA (auth|storage|public)/);
    expect(result.stdout).not.toContain("CREATE EXTENSION");
  });

  it.each([
    "public",
    "auth",
    "storage",
    "pg_catalog",
    'private";drop schema auth;--',
  ])("rejects managed or unsafe schema %s before emitting SQL", (schema) => {
    const result = preparation({ DATABASE_SCHEMA: schema });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("rejects an exposed application schema and missing exposure inspection input", () => {
    for (const exposed of ["public,store_private", ""]) {
      const result = preparation({ DATABASE_EXPOSED_SCHEMAS: exposed });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    }
  });
});
