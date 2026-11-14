import { getIdentity } from "@/lib/auth-access";
export async function GET(request: Request) {
  const identity = await getIdentity(request.headers);
  return Response.json(
    identity
      ? {
          authenticated: true,
          user: {
            id: identity.user.id,
            name: identity.user.name,
            role: identity.role,
            twoFactorEnabled: identity.user.twoFactorEnabled ?? false,
          },
        }
      : { authenticated: false },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
