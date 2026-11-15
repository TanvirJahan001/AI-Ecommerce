"use client";
import Link from "next/link";
export function friendlyAccessMessage(code: string) {
  return (
    {
      AUTHENTICATION_REQUIRED: "Sign in to continue.",
      LOGIN_REQUIRED: "Sign in to view your orders.",
      SESSION_EXPIRED:
        "Your shopping session has expired. Start a new shopping session to continue. You can recover guest order access if needed.",
      MFA_ENROLLMENT_REQUIRED:
        "Set up your authenticator to open the owner console.",
      OWNER_REQUIRED: "This account does not have owner access.",
      FORBIDDEN:
        "You do not have access to this record. Use verified order access or contact the store.",
    } as Record<string, string>
  )[code];
}
export default function AccessState({
  code,
  next = "/account",
}: {
  code?: string;
  next?: string;
}) {
  const denied = code === "OWNER_REQUIRED" || code === "FORBIDDEN";
  const mfa = code === "MFA_ENROLLMENT_REQUIRED";
  return (
    <section className="card access-state">
      <h2>
        {mfa
          ? "Authenticator setup required"
          : denied
            ? "Access denied"
            : code === "SESSION_EXPIRED"
              ? "Session expired"
              : "Sign in to continue"}
      </h2>
      <p>
        {friendlyAccessMessage(code ?? "AUTHENTICATION_REQUIRED") ??
          "Sign in using an account with access to this page."}
      </p>
      {code === "SESSION_EXPIRED" ? null : !denied || mfa ? (
        <Link
          className="button"
          href={`/login?next=${encodeURIComponent(next)}`}
        >
          {mfa ? "Set up authenticator" : "Sign in"}
        </Link>
      ) : (
        <Link className="button secondary" href="/account">
          Open your account
        </Link>
      )}{" "}
      {code === "SESSION_EXPIRED" ? (
        <button
          className="secondary"
          onClick={async () => {
            const r = await fetch("/api/store", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "session.restart" }),
            });
            if (r.ok) window.location.reload();
          }}
        >
          Start a new shopping session
        </button>
      ) : null}{" "}
      <Link href="/recover">Recover guest order access</Link>
    </section>
  );
}
