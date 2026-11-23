"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Stats } from "@/lib/api";
import { useRouter } from "next/navigation";
import { PageHeader } from "./DashboardShell";
import { ErrorBanner } from "./ui";

// validated pair (dataviz validator, light surface): AI = green, team = amber
const AI = "#1e8a64";
const TEAM = "#b8741a";

export function Overview() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats(days).then(setS).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/staff/login?next=/dashboard");
      else setError(e.message);
    });
  }, [days, router]);

  return (
    <>
      <PageHeader title="Overview" sub="How the AI assistant and your team are doing">
        <div role="group" aria-label="Time range" className="flex rounded-full border border-line bg-bg p-0.5 text-sm">
          {[7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
              className={`rounded-full px-3 py-1 transition ${days === d ? "bg-card font-semibold shadow-sm" : "text-muted hover:text-ink"}`}>
              Last {d} days
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="space-y-6 px-4 py-6 sm:px-8">
        {error && <ErrorBanner message={error} />}
        {!s ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <Tile label="Conversations" value={s.conversations} />
              <Tile label="Solved by AI" value={`${Math.round(s.ai_resolution_rate * 100)}%`}
                sub={`${s.resolved_by_ai} of ${s.conversations} with no human needed`} />
              <Tile label="Handed to the team" value={s.handed_off} sub={`${s.tickets_created} tickets created`} />
              <Tile label="Helpful answers" value={s.feedback.up + s.feedback.down ? `${Math.round((s.feedback.up / (s.feedback.up + s.feedback.down)) * 100)}%` : "–"}
                sub={s.feedback.up + s.feedback.down ? `👍 ${s.feedback.up} · 👎 ${s.feedback.down} from customers` : "No ratings yet"} />
              <Tile label="Open tickets" value={s.open_tickets}
                sub={s.avg_reply_seconds ? `AI replies in ${s.avg_reply_seconds}s on average` : undefined}
                link={{ href: "/dashboard/tickets", label: "View tickets" }} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Card title="Conversations per day">
                <DailyChart daily={s.daily} />
              </Card>
              <Card title="Why chats went to the team">
                {s.handoff_reasons.length ? (
                  <BarList rows={s.handoff_reasons.map((r) => ({ label: r.reason, value: r.count }))} color={TEAM} />
                ) : <Empty>No hand-offs yet.</Empty>}
              </Card>
            </div>

            <Card title="What customers ask about" sub="Help-doc section used for each AI answer, plus order look-ups">
              {s.top_topics.length ? (
                <BarList rows={s.top_topics.map((t) => ({ label: t.topic, value: t.count }))} color={AI} />
              ) : <Empty>No answered questions yet. Try the chat on the demo store.</Empty>}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Tile({ label, value, sub, link }: { label: string; value: string | number; sub?: string; link?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
      {link && <Link href={link.href} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">{link.label} →</Link>}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/** Stacked bars: solved by AI (bottom) + handed off (top), 2px gap between segments. */
function DailyChart({ daily }: { daily: Stats["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.conversations));
  const H = 160;
  const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString([], { weekday: daily.length <= 7 ? "short" : undefined, month: daily.length > 7 ? "short" : undefined, day: daily.length > 7 ? "numeric" : undefined });
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: AI }} />Solved by AI</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TEAM }} />Handed to the team</span>
      </div>
      <div className="relative">
        <div className="flex items-end gap-1.5 border-b border-line" style={{ height: H }} role="img"
          aria-label={`Conversations per day: ${daily.map((d) => `${d.date} ${d.conversations} (${d.handed_off} handed off)`).join(", ")}`}>
          {daily.map((d, i) => {
            const ai = d.conversations - d.handed_off;
            return (
              <div key={d.date} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className={`mx-auto flex w-full max-w-9 flex-col justify-end gap-[2px] ${hover === i ? "opacity-100" : hover !== null ? "opacity-60" : ""}`}>
                  {d.handed_off > 0 && <div className="rounded-t" style={{ height: (d.handed_off / max) * (H - 8), background: TEAM }} />}
                  {ai > 0 && <div className={d.handed_off ? "" : "rounded-t"} style={{ height: (ai / max) * (H - 8), background: AI }} />}
                </div>
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-36 -translate-x-1/2 rounded-lg border border-line bg-card px-2.5 py-2 text-xs shadow-lg">
                    <p className="font-semibold">{label(d.date)}</p>
                    <p className="text-muted">{d.conversations} conversations</p>
                    <p className="text-muted">{ai} solved by AI · {d.handed_off} to team</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5 text-[11px] text-muted">
          {daily.map((d, i) => (
            <span key={d.date} className="flex-1 text-center tabular-nums">{daily.length <= 7 || i % 5 === 0 ? label(d.date) : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarList({ rows, color }: { rows: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="text-sm" title={`${r.label}: ${r.value}`}>
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums text-muted">{r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-soft">
            <div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
