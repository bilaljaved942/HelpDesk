"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Health } from "@/lib/api";
import { BubbleIcon } from "./AuthForm";
import { useAuth } from "./AuthProvider";
import { ToastProvider } from "./Toast";
import { Avatar } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "M4 13l2.5-8h11l2.5 8v6H4zM4 13h5l1 2h4l1-2h5" },
  { href: "/dashboard/tickets", label: "Tickets", icon: "M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4zM10 6v12" },
  { href: "/dashboard/docs", label: "Help docs", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const tick = () => {
      api.health().then(setHealth).catch(() => setHealth(null));
      api.conversations().then((c) => setWaiting(c.filter((x) => x.waiting_for_team).length)).catch(() => undefined);
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, []);

  const active = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <ToastProvider>
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-card md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex h-14 items-center gap-2 px-4 md:h-16 md:px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white"><BubbleIcon /></span>
          <span className="text-sm font-semibold">HelpDesk Agent</span>
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-0">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                active(n.href) ? "bg-soft font-semibold text-ink" : "text-muted hover:bg-soft hover:text-ink"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              {n.label}
              {n.label === "Inbox" && waiting > 0 && (
                <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{waiting}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden space-y-3 p-4 md:block">
          <div className="rounded-xl border border-line p-3 text-xs">
            <p className="mb-1.5 font-semibold text-ink">System</p>
            <Status ok={!!health?.ok} label="API + database" />
            <Status ok={!!health?.llm} label={health?.model ?? "AI model"} />
            <Status ok={!!health?.hubspot} label={health?.hubspot ? "HubSpot sync on" : "HubSpot not connected"} neutral={!health?.hubspot} />
          </div>
          <Link href="/" className="block text-xs text-muted hover:text-ink">↗ Open the store</Link>
          {user && (
            <div className="flex items-center gap-2.5 border-t border-line pt-3">
              <Avatar name={user.name || user.email} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name || "Support team"}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              <button onClick={logout} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-soft hover:text-danger">Log out</button>
            </div>
          )}
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
    </ToastProvider>
  );
}

function Status({ ok, label, neutral = false }: { ok: boolean; label: string; neutral?: boolean }) {
  return (
    <p className="flex items-center gap-2 py-0.5 text-muted">
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-[#1e8a64]" : neutral ? "bg-line" : "bg-danger"}`} />
      <span className="truncate">{label}</span>
    </p>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-card px-4 py-5 sm:px-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
