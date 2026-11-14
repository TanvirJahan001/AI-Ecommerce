import "server-only";
import { Pool } from "pg";
import { databasePoolConfig } from "./database-config";

const globalForPg = globalThis as unknown as { pgPool?: Pool };
export const db = globalForPg.pgPool ?? new Pool(databasePoolConfig());
if (process.env.NODE_ENV !== "production") globalForPg.pgPool = db;
