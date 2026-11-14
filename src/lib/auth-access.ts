import { auth, authPool } from "./auth";

export class AccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

export async function getIdentity(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const access = await authPool.query<{
    role: "owner" | "customer";
    active: boolean;
  }>("select role,active from store_access where user_id=$1", [
    session.user.id,
  ]);
  if (access.rows[0]?.active === false) return null;
  return { ...session, role: access.rows[0]?.role ?? "customer" };
}

export async function requireOwner(
  requestHeaders: Headers,
  options: { allowMfaSetup?: boolean } = {},
) {
  const identity = await getIdentity(requestHeaders);
  if (!identity) throw new AccessError(401, "AUTHENTICATION_REQUIRED");
  if (identity.role !== "owner") throw new AccessError(403, "OWNER_REQUIRED");
  if (!options.allowMfaSetup && !identity.user.twoFactorEnabled)
    throw new AccessError(428, "MFA_ENROLLMENT_REQUIRED");
  return identity;
}

/** Invoke for every own-order operation. A phone number/email match never links an order. */
export async function customerIdForIdentity(userId: string) {
  const result = await authPool.query<{ id: string }>(
    "insert into customers(auth_subject) values($1) on conflict(auth_subject) do update set auth_subject=excluded.auth_subject returning id",
    [userId],
  );
  return result.rows[0].id;
}

/** Cookie-authenticated mutations must originate from the one configured application origin. */
export function requireSameOrigin(request: Request) {
  const expected = new URL(process.env.APP_ORIGIN || "http://localhost:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new AccessError(403, "INVALID_ORIGIN");
}

/** Owner command: deactivation atomically revokes sessions; reenabling does not restore them. */
export async function setAccountActive(
  requestHeaders: Headers,
  userId: string,
  active: boolean,
  reason: string,
) {
  const owner = await requireOwner(requestHeaders);
  if (reason.trim().length < 3) throw new AccessError(400, "REASON_REQUIRED");
  const client = await authPool.connect();
  try {
    await client.query("begin");
    const target = await client.query(
      'select id from "user" where id=$1 for update',
      [userId],
    );
    if (!target.rowCount) throw new AccessError(404, "USER_NOT_FOUND");
    await client.query(
      "insert into store_access(user_id,role,active) values($1,'customer',$2) on conflict(user_id) do update set active=excluded.active",
      [userId, active],
    );
    if (!active)
      await client.query('delete from "session" where "userId"=$1', [userId]);
    await client.query(
      "insert into audit_events(actor_id,action,entity_type,reason,metadata) values($1,$2,'auth_user',$3,$4)",
      [
        owner.user.id,
        active ? "account.activate" : "account.deactivate",
        reason,
        JSON.stringify({ user_id: userId }),
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
