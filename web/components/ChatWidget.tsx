"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatStatus, type Message, type OrderFacts, type Source } from "@/lib/api";
import { store, type Customer } from "@/lib/store";
import { BubbleIcon } from "./AuthForm";
import { Spinner, clock } from "./ui";

const KEY = "helpdesk_chat";
const SUGGESTIONS = ["Where is my order 1042?", "How do returns work for shoes?", "Do you ship to Canada?", "I want a refund"];
const ASK_HUMAN = "I'd like to talk to a person, please.";

type Session = { id: string; token: string };
type Pending = { status: string; text: string } | null;

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the chat just won't survive a reload */
  }
}

/** The customer's chat. `floating` = launcher bubble + panel (store page); otherwise fills its container. */
export function ChatWidget({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(!floating);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ai");
  const [pending, setPending] = useState<Pending>(null);
  const [animateId, setAnimateId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const [me, setMe] = useState<Customer | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);
  const tempId = useRef(-1); // optimistic messages get negative ids until the server's arrive
  const busy = pending !== null;

  const merge = useCallback((incoming: Message[], replace = false) => {
    setMessages((cur) => {
      const base = replace ? [] : cur.filter((m) => m.id > 0);
      const seen = new Set(base.map((m) => m.id));
      const next = [...base, ...incoming.filter((m) => !seen.has(m.id))];
      lastId.current = next.reduce((mx, m) => Math.max(mx, m.id), 0);
      return next;
    });
  }, []);

  const scrollDown = useCallback((smooth = true) => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // a logged-in shopper doesn't need to type their name and email
  useEffect(() => {
    store.me().then(setMe).catch(() => setMe(null));
  }, [open]);

  // restore a chat from an earlier visit
  useEffect(() => {
    const s = loadSession();
    if (!s) {
      Promise.resolve().then(() => setReady(true));
      return;
    }
    api
      .chat(s.id, s.token)
      .then((c) => {
        setSession(s);
        setStatus(c.status);
        merge(c.messages, true);
      })
      .catch(() => saveSession(null))
      .finally(() => setReady(true));
  }, [merge]);

  // poll for replies from the support team (and status changes)
  useEffect(() => {
    if (!session || busy) return;
    const t = setInterval(() => {
      api
        .chat(session.id, session.token, lastId.current)
        .then((c) => {
          setStatus(c.status);
          if (c.messages.length) {
            merge(c.messages);
            if (floating && !open) setUnread((n) => n + c.messages.length);
          }
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 404) {
            saveSession(null);
            setSession(null);
          }
        });
    }, 3000);
    return () => clearInterval(t);
  }, [session, busy, merge, floating, open]);

  useEffect(() => {
    scrollDown();
  }, [messages, pending, scrollDown]);

  // grow the input with its text (up to ~5 lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const start = async (name?: string, email?: string) => {
    setError(null);
    try {
      const c = await api.startChat(me ? {} : { name, email });
      const s = { id: c.id, token: c.token! };
      saveSession(s);
      setSession(s);
      setStatus(c.status);
      merge(c.messages, true);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || !session || busy) return;
    setDraft("");
    setError(null);
    setMenu(false);
    const temp: Message = { id: tempId.current--, role: "customer", content: t, author: "", sources: [], meta: {}, created_at: "" };
    setMessages((m) => [...m, temp]);
    setPending(status === "ai" ? { status: "Thinking…", text: "" } : { status: "", text: "" });
    const before = lastId.current;
    try {
      await api.streamMessage(session.id, session.token, t, (ev) => {
        if (ev.type === "status") setPending((p) => ({ status: ev.text, text: p?.text ?? "" }));
        else if (ev.type === "token") setPending((p) => ({ status: "", text: (p?.text ?? "") + ev.text }));
        else if (ev.type === "reset") setPending((p) => ({ status: p?.status ?? "", text: "" }));
        else if (ev.type === "error") setError(ev.text);
        else if (ev.type === "done") setStatus(ev.conversation.status);
      });
      const c = await api.chat(session.id, session.token);
      setStatus(c.status);
      const fresh = c.messages.filter((m) => m.id > before && m.role === "ai").pop();
      setAnimateId(fresh?.id ?? null);
      merge(c.messages, true);
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(t);
    } finally {
      setPending(null);
    }
  };

  const vote = async (m: Message, value: "up" | "down") => {
    if (!session) return;
    const next = m.meta.feedback === value ? "none" : value;
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, meta: { ...x.meta, feedback: next === "none" ? undefined : next } } : x)));
    api.feedback(session.id, session.token, m.id, next).catch(() => undefined);
  };

  const newChat = () => {
    saveSession(null);
    setSession(null);
    setMessages([]);
    setStatus("ai");
    setError(null);
    setMenu(false);
    lastId.current = 0;
  };

  const lastAi = [...messages].reverse().find((m) => m.role !== "customer");
  const offerOpen = status === "ai" && !busy && !!lastAi?.meta?.offered_handoff;
  const noQuestionsYet = messages.filter((m) => m.role === "customer").length === 0;
  const lastAnswerId = [...messages].reverse().find((m) => m.role === "ai" && (m.meta?.route === "answer" || m.meta?.route === "order"))?.id;

  const subtitle = status === "human" ? "A team member is with you" : status === "closed" ? "This chat has ended" : "Typically replies instantly";

  const panel = (
    <section
      aria-label="Customer support chat"
      className={
        floating
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-card sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[620px] sm:max-h-[calc(100vh-8rem)] sm:w-[380px] sm:rounded-[28px] sm:shadow-[0_30px_80px_-24px_rgba(8,30,22,0.45)] sm:ring-1 sm:ring-black/5"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-card shadow-[0_30px_80px_-30px_rgba(8,30,22,0.35)] ring-1 ring-black/5"
      }
    >
      {/* header */}
      <header className="flex items-center gap-3 bg-gradient-to-br from-accent to-accent-strong px-5 py-4 text-white">
        <BrandMark size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">Northwind Support</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/75">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "closed" ? "bg-white/40" : "bg-[#7ee2b0]"}`} />{subtitle}
          </p>
        </div>
        {session && (
          <div className="relative">
            <HeaderButton label="Chat options" onClick={() => setMenu((m) => !m)} expanded={menu}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </HeaderButton>
            {menu && (
              <div role="menu" className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-2xl bg-card py-1.5 text-sm text-ink shadow-xl ring-1 ring-black/5">
                {status === "ai" && (
                  <button role="menuitem" onClick={() => sendText(ASK_HUMAN)} disabled={busy} className="block w-full px-4 py-2 text-left hover:bg-soft disabled:opacity-50">Talk to a person</button>
                )}
                <button role="menuitem" onClick={newChat} className="block w-full px-4 py-2 text-left hover:bg-soft">Start a new chat</button>
              </div>
            )}
          </div>
        )}
        {floating && (
          <HeaderButton label="Close chat" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </HeaderButton>
        )}
      </header>

      {!ready ? (
        <div className="flex flex-1 items-center justify-center text-muted"><Spinner /></div>
      ) : !session ? (
        <StartForm onStart={start} error={error} me={me} />
      ) : (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-5" aria-live="polite">
            {messages.map((m, i) => (
              <Bubble key={m.id} m={m} prev={messages[i - 1]} animate={m.id === animateId} showVote={m.id === lastAnswerId}
                onGrow={() => scrollDown(false)} onVote={vote} onAnimated={() => setAnimateId(null)} />
            ))}
            {pending && (pending.text ? (
              <Bubble m={{ id: 0, role: "ai", content: pending.text, author: "", sources: [], meta: {}, created_at: "" }}
                prev={messages[messages.length - 1]} streaming />
            ) : pending.status ? (
              <div className="mt-3 flex items-center gap-2">
                <BrandMark size={26} />
                <span className="flex gap-1 rounded-2xl rounded-bl-md bg-soft px-3.5 py-3">
                  <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                </span>
                <span className="text-xs text-muted">{pending.status}</span>
              </div>
            ) : null)}

            {noQuestionsYet && !busy && (
              <div className="mt-4 flex flex-col items-end gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => sendText(s)} className="rounded-full border border-accent/25 px-3.5 py-1.5 text-[13px] text-accent transition hover:bg-accent-soft">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {offerOpen && (
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => sendText("No thanks")} className="rounded-full border border-line px-3.5 py-1.5 text-[13px] transition hover:bg-soft">No thanks</button>
                <button onClick={() => sendText("Yes, please connect me with the team.")} className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-strong">Yes, connect me</button>
              </div>
            )}
          </div>

          {error && <p role="alert" className="mx-4 mb-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

          {status === "closed" ? (
            <div className="px-4 pb-5 pt-2 text-center">
              <button onClick={newChat} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong">Start a new chat</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); sendText(draft); }} className="px-3 pb-3 pt-1">
              <div className="flex items-end gap-1.5 rounded-[22px] bg-soft py-1.5 pl-4 pr-1.5 ring-accent/30 transition focus-within:bg-white focus-within:ring-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(draft); }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder={status === "human" ? "Message our team…" : "Ask a question…"}
                  aria-label="Your message"
                  className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted"
                />
                <button type="submit" disabled={!draft.trim() || busy} aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent-strong disabled:bg-transparent disabled:text-muted">
                  {busy ? <Spinner /> : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                  )}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );

  if (!floating) return panel;
  return (
    <>
      {open && panel}
      <button
        onClick={() => { setOpen((o) => !o); setUnread(0); }}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        className={`fixed bottom-6 right-6 z-50 h-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_14px_34px_-10px_rgba(20,70,50,0.7)] transition hover:scale-[1.03] hover:bg-accent-strong ${open ? "hidden w-14 sm:flex" : "flex gap-2 pl-4 pr-5"}`}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        ) : (
          <><BubbleIcon size={20} /><span className="text-sm font-semibold">Chat with us</span></>
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px]">{unread}</span>
        )}
      </button>
    </>
  );
}

function HeaderButton({ label, onClick, expanded, children }: { label: string; onClick: () => void; expanded?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} aria-expanded={expanded} aria-haspopup={expanded !== undefined ? "menu" : undefined}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white">
      {children}
    </button>
  );
}

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24"><path d="M2 20l7-12 4 6 3-4 6 10z" fill="var(--accent)" /></svg>
    </span>
  );
}

function StartForm({ onStart, error, me }: { onStart: (name?: string, email?: string) => Promise<void>; error: string | null; me: Customer | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (n?: string, e?: string) => {
    setBusy(true);
    await onStart(n, e);
    setBusy(false);
  };
  const input = "w-full rounded-2xl bg-soft px-4 py-3 text-sm outline-none ring-accent/30 transition placeholder:text-muted focus:bg-white focus:ring-2";
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-gradient-to-b from-accent-strong to-[#0f3328] px-6 pb-16 pt-4 text-white">
        <p className="text-2xl font-semibold leading-snug">Hi {me ? me.name.split(" ")[0] : "there"} 👋<br />How can we help?</p>
        <p className="mt-2 text-sm text-white/70">Ask about orders, returns, sizing or shipping.</p>
      </div>
      <div className="-mt-10 px-4 pb-6">
        <div className="rounded-3xl bg-card p-5 shadow-[0_12px_32px_-14px_rgba(8,30,22,0.35)] ring-1 ring-black/5">
          {me ? (
            <>
              <p className="text-sm font-semibold">Start a conversation</p>
              <p className="mt-1 text-xs text-muted">Signed in as {me.email}</p>
              <button onClick={() => go()} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60">
                {busy ? <Spinner /> : <BubbleIcon size={16} />} Start chat
              </button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); go(name, email); }} className="space-y-2.5">
              <p className="pb-1 text-sm font-semibold">Start a conversation</p>
              <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" />
              <input className={input} required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email" autoComplete="email" />
              <button disabled={busy} className="!mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60">
                {busy ? <Spinner /> : <BubbleIcon size={16} />} Start chat
              </button>
            </form>
          )}
          {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
        </div>
        {!me && (
          <p className="mt-4 text-center text-xs text-muted">
            Have an account? <a href="/login" className="font-medium text-accent hover:underline">Log in</a> to skip this step.
          </p>
        )}
      </div>
    </div>
  );
}

/** Reveal text a few characters at a time, like someone typing. */
function useReveal(text: string, enabled: boolean, onTick?: () => void, onDone?: () => void) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  // keep the latest callbacks without restarting the timer when the parent re-renders
  const tick = useRef(onTick);
  const done = useRef(onDone);
  useEffect(() => {
    tick.current = onTick;
    done.current = onDone;
  });
  useEffect(() => {
    if (!enabled) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = reduce ? text.length : Math.max(2, Math.ceil(text.length / 90));
    const t = setInterval(() => {
      setN((c) => {
        const next = Math.min(text.length, c + step);
        if (next >= text.length) {
          clearInterval(t);
          setTimeout(() => done.current?.(), 0);
        }
        return next;
      });
      tick.current?.();
    }, 16);
    return () => clearInterval(t);
  }, [enabled, text]);
  return enabled ? text.slice(0, n) : text;
}


function Bubble({ m, prev, streaming = false, animate = false, showVote = false, onGrow, onVote, onAnimated }: {
  m: Message; prev?: Message; streaming?: boolean; animate?: boolean; showVote?: boolean; onGrow?: () => void;
  onVote?: (m: Message, v: "up" | "down") => void; onAnimated?: () => void;
}) {
  const shown = useReveal(m.content, animate, onGrow, onAnimated);
  const revealing = animate && shown.length < m.content.length;
  const time = m.created_at ? clock(m.created_at) : undefined;

  if (m.meta?.route === "event") {
    return <p className="my-4 text-center text-[11px] text-muted">{m.content}</p>;
  }
  // consecutive messages from the same side are grouped: less spacing, one avatar / name
  const grouped = !!prev && prev.meta?.route !== "event" && prev.role === m.role;
  const gap = grouped ? "mt-1" : "mt-4 first:mt-0";

  if (m.role === "customer") {
    return (
      <div className={`flex justify-end ${gap}`}>
        <div title={time} className="max-w-[80%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-white">{m.content}</div>
      </div>
    );
  }

  const human = m.role === "agent";
  const order = m.meta?.order;
  const handoff = m.meta?.route === "handoff";
  return (
    <div className={`flex items-start gap-2 ${gap}`}>
      <span className="w-[26px] shrink-0">
        {!grouped && (human ? (
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#e9b872] text-[10px] font-semibold text-[#4a3310]" aria-hidden>
            {(m.author || "T").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
        ) : <BrandMark size={26} />)}
      </span>
      <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1.5">
        {human && !grouped && <span className="px-1 text-[11px] text-muted">{m.author || "Support team"} · Northwind</span>}
        <div title={time} className={`rounded-[20px] rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-ink ${human ? "bg-[#fbf1e1]" : "bg-soft"}`}>
          <Formatted text={shown} />
          {(streaming || revealing) && <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-muted/60 align-middle" />}
        </div>
        {!revealing && !streaming && (
          <>
            {order?.found && <OrderCard o={order} />}
            {handoff && m.meta?.ticket_number && (
              <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />Ticket #{m.meta.ticket_number} · we&apos;ll reply here
              </p>
            )}
            {m.sources?.length > 0 && !order && <Sources sources={m.sources} />}
            {showVote && onVote && m.id > 0 && (
              <div className="flex items-center gap-0.5 px-1 text-[11px] text-muted">
                {m.meta.feedback ? <span className="mr-1">Thanks!</span> : <span className="mr-1">Helpful?</span>}
                {(["up", "down"] as const).map((v) => (
                  <button key={v} onClick={() => onVote(m, v)} aria-pressed={m.meta.feedback === v} aria-label={v === "up" ? "Helpful" : "Not helpful"}
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-soft ${m.meta.feedback === v ? "bg-soft text-ink" : ""}`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={m.meta.feedback === v ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden
                      style={v === "down" ? { transform: "rotate(180deg)" } : undefined}>
                      <path d="M7 10v11H4V10zM7 10l4-7a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.4 7A2 2 0 0117.1 21H7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STEPS = ["Ordered", "Shipped", "Delivered"] as const;

function OrderCard({ o }: { o: OrderFacts }) {
  const reached = o.status === "delivered" ? 3 : o.status === "shipped" ? 2 : 1;
  const short = (d?: string | null) => (d ? d.replace(/^\w+, /, "").replace(/, \d{4}$/, "") : "");
  const next = o.status === "delivered" ? `Delivered ${short(o.delivered)}` : o.estimated_delivery ? `Arrives by ${short(o.estimated_delivery)}` : "";
  return (
    <div className="w-full rounded-2xl bg-card p-3.5 text-xs ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Order #{o.order_number}</p>
        <p className="font-medium text-accent">{next}</p>
      </div>
      <div className="mt-3 flex gap-1" aria-label={`Order progress: ${STEPS[reached - 1]}`} role="img">
        {STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i < reached ? "bg-accent" : "bg-soft"}`} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        {STEPS.map((s, i) => <span key={s} className={i < reached ? "font-medium text-ink" : ""}>{s}</span>)}
      </div>
      {!!o.items?.length && <p className="mt-3 text-muted">{o.items.join(" · ")}</p>}
      {o.tracking_number && <p className="mt-1 text-muted">{o.carrier} <span className="font-mono text-ink">{o.tracking_number}</span></p>}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  const first = sources[0];
  return (
    <div className="w-full px-1">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex max-w-full items-center gap-1 text-[11px] text-muted transition hover:text-accent">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 3h8l4 4v14H7zM15 3v4h4" strokeLinejoin="round" /></svg>
        <span className="truncate">{first.heading || first.document}{sources.length > 1 ? ` +${sources.length - 1}` : ""}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {sources.map((s, i) => (
            <blockquote key={i} className="rounded-xl bg-card px-3 py-2 text-[11px] leading-relaxed text-muted ring-1 ring-line">
              <span className="block font-medium text-ink">{s.document}{s.heading ? ` › ${s.heading}` : ""}</span>
              {s.snippet}{s.snippet.length >= 280 ? "…" : ""}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}


/** Tiny formatter for model output: **bold**, line breaks and "- " lists. */
export function Formatted({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
        if (item) return <div key={i} className="flex gap-1.5 pl-1"><span className="text-muted">•</span><span>{bold(item[1])}</span></div>;
        return line.trim() ? <p key={i} className={i ? "mt-1" : ""}>{bold(line)}</p> : null;
      })}
    </>
  );
}
