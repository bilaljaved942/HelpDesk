"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

const DEMO = { email: "admin@northwind.example", password: "northwind-demo" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Next.js keeps visited pages alive (hidden): clear the form, including the password, when hidden.
  useLayoutEffect(() => {
    return () => {
      setPassword("");
      setShowPassword(false);
      setError(null);
      setBusy(false);
    };
  }, []);

  const raw = params.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = signup ? await api.signup({ email, password, name }) : await api.login({ email, password });
      setUser(user);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <BubbleIcon />
        </span>
        HelpDesk Agent
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-[0_12px_40px_-16px_rgba(20,30,25,0.18)] sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{signup ? "Create a team account" : "Support team login"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {signup ? "See conversations, reply to customers and manage tickets." : "Log in to the inbox, tickets and stats."}
        </p>

        {!signup && (
          <button
            type="button"
            onClick={() => { setEmail(DEMO.email); setPassword(DEMO.password); }}
            className="mt-5 w-full rounded-xl border border-dashed border-accent/40 bg-accent-soft/50 px-3.5 py-2.5 text-left text-sm transition hover:bg-accent-soft"
          >
            <span className="font-medium text-accent">Use the demo login</span>
            <span className="block text-xs text-muted">{DEMO.email}</span>
          </button>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          {signup && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Name</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ann Taylor" />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <div className="relative">
              <input
                className={`${input} pr-11`}
                type={showPassword ? "text" : "password"}
                required
                minLength={signup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? "At least 8 characters" : ""}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-ink"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5-1.5" />
                    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {busy && <Spinner />}
            {signup ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {signup ? "Already have an account? " : "New team member? "}
          <Link href={`${signup ? "/staff/login" : "/staff/signup"}${raw ? `?next=${encodeURIComponent(raw)}` : ""}`} className="font-medium text-accent hover:underline">
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
      <Link href="/" className="mt-6 text-sm text-muted hover:text-ink">← Back to the store</Link>
    </div>
  );
}

export function BubbleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.6A8 8 0 1121 12z" />
    </svg>
  );
}
