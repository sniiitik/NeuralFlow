"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PixelField } from "@/components/ui/pixel-field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-screen">
      <PixelField />
      <section className="login-content">
        <h1 className="login-brand">NeuralFlow</h1>
        <p className="mt-2 text-base text-[var(--secondary)]">
          Your model operations workspace.
        </p>
        <div className="login-panel mt-7">
          <h2 className="text-lg font-medium tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-[var(--secondary)]">
            Sign in to continue to your workspace.
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              let result;
              try {
                result = await authClient.signIn.email({ email, password });
              } catch {
                setBusy(false);
                setError("Unable to connect. Please try again.");
                return;
              }
              setBusy(false);
              if (result.error) {
                setError("Invalid email or password.");
                return;
              }
              const next = new URLSearchParams(window.location.search).get("next");
              router.push(
                next?.startsWith("/") && !next.startsWith("//") ? next : "/",
              );
              router.refresh();
            }}
          >
            <label className="block text-sm text-[var(--secondary)]">
              Email
              <input
                className="mt-2 w-full rounded-md border border-white/15 bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--secondary)]">
              Password
              <input
                className="mt-2 w-full rounded-md border border-white/15 bg-[var(--background)] px-3 py-2.5 text-[var(--foreground)]"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="btn btn-primary mt-1 h-10 w-full"
              type="submit"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
