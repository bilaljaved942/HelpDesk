"use client";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 font-medium hover:underline" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const TONES = {
  green: "bg-accent-soft text-accent",
  blue: "bg-info-soft text-info",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  gray: "bg-soft text-muted",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const PRIORITY_TONE = { high: "red", medium: "amber", low: "gray" } as const;
export const TICKET_STATUS = {
  open: { label: "Open", tone: "blue" },
  in_progress: { label: "In progress", tone: "amber" },
  solved: { label: "Solved", tone: "green" },
} as const;

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-soft text-xs font-semibold text-ink ring-1 ring-line ${className}`}>
      {initials}
    </span>
  );
}
