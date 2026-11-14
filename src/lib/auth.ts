import { Pool } from "pg";
import { databasePoolConfig } from "./database-config";
import { createStoreAuth } from "./auth-config";
const globalAuth = globalThis as unknown as { storeAuthPool?: Pool };
export const authPool =
  globalAuth.storeAuthPool ??
  new Pool(databasePoolConfig(process.env, "runtime", 5));
if (process.env.NODE_ENV !== "production") globalAuth.storeAuthPool = authPool;
export const auth = createStoreAuth(authPool);
