"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function intendedDestination() {
  if (typeof window === "undefined") return null;
  const path = new URLSearchParams(window.location.search).get("next");
  return path &&
    (/^\/(account|admin)$/.test(path) || /^\/orders\/[a-f0-9-]{36}$/.test(path))
    ? path
    : null;
}
type Enrollment = { uri: string; backupCodes: string[] };
export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [setup, setSetup] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function finish() {
    const identity = await fetch("/api/auth/identity", {
      cache: "no-store",
    }).then((r) => r.json());
    if (!identity.authenticated)
      throw new Error("Sign-in could not be verified. Please try again.");
    if (identity.user.role === "owner" && !identity.user.twoFactorEnabled) {
      setSetup(true);
      setChallenge(false);
      setMessage("Enroll an authenticator app before opening administration.");
    } else
      router.push(
        intendedDestination() ??
          (identity.user.role === "owner" ? "/admin" : "/account"),
      );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const values = new FormData(event.currentTarget);
    try {
      if (challenge || enrollment) {
        const result =
          recovery && !enrollment
            ? await authClient.twoFactor.verifyBackupCode({
                code: String(values.get("code")),
              })
            : await authClient.twoFactor.verifyTotp({
                code: String(values.get("code")),
              });
        if (result.error)
          throw new Error(result.error.message || "Invalid code");
        if (enrollment) {
          setMessage(
            "Authenticator verified. Save the recovery codes before continuing to administration.",
          );
          setEnrollment(null);
          router.push(intendedDestination() ?? "/admin");
        } else await finish();
      } else if (setup) {
        const result = await authClient.twoFactor.enable({
          password: String(values.get("password")),
          issuer: "Mobile Accessories Store",
        });
        if (result.error)
          throw new Error(result.error.message || "Enrollment failed");
        const data = result.data as { totpURI: string; backupCodes: string[] };
        setEnrollment({ uri: data.totpURI, backupCodes: data.backupCodes });
        setMessage(
          "Add this account to your authenticator and save recovery codes privately. Then enter its current code.",
        );
      } else {
        const email = String(values.get("email")),
          password = String(values.get("password"));
        const result = register
          ? await authClient.signUp.email({
              email,
              password,
              name: String(values.get("name")),
            })
          : await authClient.signIn.email({ email, password });
        if (result.error)
          throw new Error(result.error.message || "Authentication failed");
        if (
          result.data &&
          "twoFactorRedirect" in result.data &&
          result.data.twoFactorRedirect
        )
          setChallenge(true);
        else await finish();
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to continue. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell section" style={{ maxWidth: 600 }}>
      <Link href="/">← Store</Link>
      <h1>
        {challenge
          ? "Verify your authenticator"
          : setup
            ? "Set up administrator MFA"
            : register
              ? "Create a customer account"
              : "Sign in"}
      </h1>
      <p>
        Owner accounts require an authenticator code. A delivery phone number
        does not verify an account or link previous orders.
      </p>
      <form className="card" onSubmit={submit}>
        {!challenge && !setup && (
          <>
            {register && (
              <p>
                <label>
                  Name{" "}
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </label>
              </p>
            )}
            <p>
              <label>
                Email{" "}
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            </p>
          </>
        )}
        {!challenge && !enrollment && (
          <p>
            <label>
              Password{" "}
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
              />
            </label>
          </p>
        )}
        {enrollment && (
          <section>
            <h2>Authenticator setup</h2>
            <p>
              Add a time-based account to your authenticator using this setup
              key:
            </p>
            <p>
              <code>{new URL(enrollment.uri).searchParams.get("secret")}</code>
            </p>
            <p>Or import this account URI:</p>
            <p style={{ overflowWrap: "anywhere" }}>
              <code>{enrollment.uri}</code>
            </p>
            <h3>Private recovery codes</h3>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {enrollment.backupCodes.join("\n")}
            </pre>
            <p>
              Store these securely before verifying. They are not included in
              logs.
            </p>
          </section>
        )}
        {challenge && (
          <p>
            <label>
              <input
                type="checkbox"
                checked={recovery}
                onChange={(e) => setRecovery(e.target.checked)}
              />{" "}
              Use a private recovery code
            </label>
          </p>
        )}
        {(challenge || enrollment) && (
          <p>
            <label>
              {recovery && !enrollment ? "Recovery code" : "Authenticator code"}{" "}
              <input
                name="code"
                inputMode={recovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={recovery ? undefined : "[0-9]{6}"}
                required
                maxLength={recovery ? 64 : 6}
              />
            </label>
          </p>
        )}
        <button disabled={busy} type="submit">
          {busy
            ? "Working…"
            : challenge || enrollment
              ? "Verify code"
              : setup
                ? "Start MFA enrollment"
                : register
                  ? "Create account"
                  : "Sign in"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
      {!challenge && !setup && (
        <p>
          <button
            type="button"
            onClick={() => {
              setRegister(!register);
              setMessage("");
            }}
          >
            {register ? "Use an existing account" : "Create a customer account"}
          </button>
        </p>
      )}
    </main>
  );
}
