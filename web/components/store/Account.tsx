"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { money2, shortDate, store, type Product, type StoreOrder } from "@/lib/store";
import { Spinner } from "../ui";
import { ProductCard } from "./ProductCard";
import { useAccount, useSaved } from "./StoreProviders";

const DEMO = { email: "sara@example.com", password: "sara-demo-1" };

export function CustomerAuth({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setCustomer } = useAccount();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const raw = params.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";

  // Next.js keeps visited pages alive: clear the password when the page is hidden.
  useLayoutEffect(() => () => { setPassword(""); setError(null); setBusy(false); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = signup ? await store.signup({ name, email, password }) : await store.login({ email, password });
      setCustomer(c);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const input = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{signup ? "Create an account" : "Log in"}</h1>
      <p className="mt-2 text-muted">{signup ? "Track orders, check out faster and save your favourites." : "Welcome back. Log in to see your orders."}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {signup && (
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Name</span>
            <input className={input} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="block"><span className="mb-1.5 block text-sm font-medium">Email</span>
          <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium">Password</span>
          <div className="relative">
            <input className={`${input} pr-16`} type={show ? "text" : "password"} required minLength={signup ? 8 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : ""} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-ink">{show ? "Hide" : "Show"}</button>
          </div>
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60">
          {busy && <Spinner />}{signup ? "Create account" : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New to Northwind? "}
        <Link href={`${signup ? "/login" : "/signup"}${raw ? `?next=${encodeURIComponent(raw)}` : ""}`} className="font-medium text-accent hover:underline">
          {signup ? "Log in" : "Create an account"}
        </Link>
      </p>
      {!signup && (
        <button type="button" onClick={() => { setEmail(DEMO.email); setPassword(DEMO.password); }}
          className="mt-8 w-full rounded-xl border border-dashed border-line px-4 py-3 text-left text-xs text-muted transition hover:bg-bg">
          Testing? Use the sample account <b className="text-ink">{DEMO.email}</b> (it already has orders).
        </button>
      )}
    </div>
  );
}

export const STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "Processing", cls: "bg-warn-soft text-warn" },
  shipped: { label: "On its way", cls: "bg-info-soft text-info" },
  delivered: { label: "Delivered", cls: "bg-accent-soft text-accent" },
  cancelled: { label: "Cancelled", cls: "bg-soft text-muted" },
};

export function AccountPage() {
  const router = useRouter();
  const { customer, loading, logout } = useAccount();
  const { saved } = useSaved();
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const leaving = useRef(false);   // logging out: go home, not to the login page

  useEffect(() => {
    if (!loading && !customer && !leaving.current) router.replace("/login?next=/account");
    if (customer) store.orders().then(setOrders).catch(() => setOrders([]));
  }, [customer, loading, router]);
  useEffect(() => {
    store.products().then(setProducts).catch(() => undefined);
  }, []);

  if (loading || !customer) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  const savedProducts = products.filter((p) => saved.includes(p.slug));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">My account</p>
          <h1 className="text-3xl font-semibold tracking-tight">Hi, {customer.name.split(" ")[0] || "there"}</h1>
          <p className="mt-1 text-sm text-muted">{customer.email}</p>
        </div>
        <button onClick={async () => { leaving.current = true; router.push("/"); await logout(); }} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-soft">Log out</button>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Orders</h2>
        {!orders ? <div className="mt-4 h-24 animate-pulse rounded-2xl bg-soft" /> : orders.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">No orders yet. <Link href="/shop" className="font-medium text-accent">Start shopping</Link></p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {orders.map((o) => (
              <li key={o.number}>
                <Link href={`/account/orders/${o.number}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 transition hover:bg-bg">
                  <span className="font-semibold">Order #{o.number}</span>
                  <span className="text-sm text-muted">{shortDate(o.placed_at)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[o.status]?.cls}`}>{STATUS[o.status]?.label}</span>
                  <span className="text-sm text-muted">{o.items.reduce((a, i) => a + i.qty, 0)} items</span>
                  <span className="ml-auto font-semibold">{money2(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="saved" className="mt-12 scroll-mt-24">
        <h2 className="text-xl font-semibold">Saved items</h2>
        {savedProducts.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Tap ♡ on any product to save it here.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">{savedProducts.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
        )}
      </section>

      <section className="mt-12 rounded-2xl bg-bg p-6">
        <h2 className="font-semibold">Need help with an order?</h2>
        <p className="mt-1 text-sm text-muted">Open the chat in the corner. Our assistant can see your orders and answer right away, or pass you to the team.</p>
      </section>
    </div>
  );
}

export function OrderPage() {
  const { number } = useParams<{ number: string }>();
  const placed = useSearchParams().get("placed") === "1";
  const router = useRouter();
  const { customer, loading } = useAccount();
  const [o, setO] = useState<StoreOrder | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!loading && !customer) router.replace(`/login?next=/account/orders/${number}`);
    if (customer) store.order(number).then(setO).catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true); });
  }, [customer, loading, number, router]);

  if (missing) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-semibold">Order not found</h1><Link href="/account" className="mt-4 inline-block text-accent">Back to my account</Link></div>;
  if (!o) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;

  const steps = [
    { label: "Ordered", date: o.placed_at, done: true },
    { label: "Shipped", date: o.shipped_at, done: !!o.shipped_at },
    { label: "Delivered", date: o.delivered_at ?? o.eta, done: !!o.delivered_at },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {placed && (
        <div className="mb-8 rounded-2xl bg-accent-soft p-6 text-center">
          <p className="text-3xl" aria-hidden>🎉</p>
          <h1 className="mt-2 text-2xl font-semibold">Thank you! Your order is confirmed.</h1>
          <p className="mt-1 text-sm text-muted">Order <b className="text-ink">#{o.number}</b>. We&apos;ll email {customer?.email} when it ships.</p>
        </div>
      )}
      <Link href="/account" className="text-sm text-muted hover:text-ink">← My account</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!placed && <h1 className="text-2xl font-semibold">Order #{o.number}</h1>}
        {placed && <h2 className="text-xl font-semibold">Order #{o.number}</h2>}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[o.status]?.cls}`}>{STATUS[o.status]?.label}</span>
        <span className="text-sm text-muted">Placed {shortDate(o.placed_at)}</span>
      </div>

      <ol className="mt-6 flex rounded-2xl border border-line p-5" aria-label="Order progress">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 flex-col items-center text-center text-sm">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : s.done ? "bg-accent" : "bg-line"}`} />
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-accent text-white" : "bg-soft text-muted ring-1 ring-line"}`}>{s.done ? "✓" : i + 1}</span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? "bg-transparent" : steps[i + 1].done ? "bg-accent" : "bg-line"}`} />
            </div>
            <span className="mt-1.5 font-medium">{s.label}</span>
            <span className="text-xs text-muted">{s.done ? shortDate(s.date) : s.label === "Delivered" && o.eta ? `est. ${shortDate(o.eta)}` : ""}</span>
          </li>
        ))}
      </ol>
      {o.tracking && <p className="mt-3 text-sm text-muted">Tracking: {o.carrier} <span className="font-mono text-ink">{o.tracking}</span></p>}

      <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_240px]">
        <section>
          <h2 className="font-semibold">Items</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {o.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span><Link href={`/products/${it.slug}`} className="font-medium hover:underline">{it.name}</Link><span className="block text-xs text-muted">{it.color} · {it.size} · qty {it.qty}</span></span>
                <span>{money2(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money2(o.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Shipping ({o.shipping_method})</dt><dd>{o.shipping_cost ? money2(o.shipping_cost) : "Free"}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money2(o.total)}</dd></div>
          </dl>
        </section>
        <section className="text-sm">
          <h2 className="font-semibold">Shipping to</h2>
          <address className="mt-2 not-italic leading-relaxed text-muted">
            {o.ship_to.name}<br />{o.ship_to.line1}{o.ship_to.line2 && <><br />{o.ship_to.line2}</>}<br />
            {o.ship_to.city}{o.ship_to.region && `, ${o.ship_to.region}`} {o.ship_to.zip}<br />{o.ship_to.country}
          </address>
          <div className="mt-6 rounded-xl bg-bg p-4">
            <p className="font-medium">Questions about this order?</p>
            <p className="mt-1 text-muted">Ask in the chat: “Where is my order {o.number}?”</p>
          </div>
        </section>
      </div>
    </div>
  );
}
