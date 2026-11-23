"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { money2, store, type Address, type StoreMeta } from "@/lib/store";
import { ProductArt } from "../ProductArt";
import { Spinner } from "../ui";
import { CartLines, FreeShippingBar } from "./StoreChrome";
import { useAccount, useCart } from "./StoreProviders";

export function CartPage() {
  const cart = useCart();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your cart</h1>
      {cart.lines.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="font-medium">Your cart is empty</p>
          <Link href="/shop" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Start shopping</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-line px-5"><CartLines /></div>
          <aside className="h-fit space-y-4 rounded-2xl border border-line bg-bg p-5">
            <FreeShippingBar subtotal={cart.subtotal} />
            <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="font-semibold">{money2(cart.subtotal)}</span></div>
            <p className="text-xs text-muted">Shipping is calculated at checkout.</p>
            <Link href="/checkout" className="block rounded-full bg-accent py-3 text-center text-sm font-semibold text-white hover:bg-accent-strong">Checkout</Link>
            <Link href="/shop" className="block text-center text-sm text-muted hover:text-ink">Continue shopping</Link>
          </aside>
        </div>
      )}
    </div>
  );
}

const EMPTY: Address = { name: "", line1: "", line2: "", city: "", region: "", zip: "", country: "United States" };

export function Checkout() {
  const router = useRouter();
  const cart = useCart();
  const { customer, loading } = useAccount();
  const [meta, setMeta] = useState<StoreMeta | null>(null);
  const [addr, setAddr] = useState<Address>(EMPTY);
  const [method, setMethod] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store.meta().then(setMeta).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!loading && !customer) router.replace("/login?next=/checkout");
    if (customer) Promise.resolve().then(() => setAddr((a) => (a.name ? a : { ...a, name: customer.name })));
  }, [customer, loading, router]);

  if (loading || !customer) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (cart.lines.length === 0) return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Your cart is empty</h1>
      <Link href="/shop" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Start shopping</Link>
    </div>
  );

  const us = addr.country === "United States";
  const shipping = !meta ? 0 : !us ? meta.international_price
    : method === "standard" && cart.subtotal >= meta.free_over ? 0 : meta.shipping[method].price;
  const total = cart.subtotal + shipping;
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  const place = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const order = await store.placeOrder({
        items: cart.lines.map((l) => ({ slug: l.slug, size: l.size, color: l.color, qty: l.qty })),
        ship_to: addr,
        method: us ? method : "standard",
      });
      cart.empty();
      router.push(`/account/orders/${order.number}?placed=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";
  return (
    <form onSubmit={place} className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <section>
          <h2 className="font-semibold">Contact</h2>
          <p className="mt-1 text-sm text-muted">Signed in as <b className="text-ink">{customer.email}</b>. Your order confirmation and updates go here.</p>
        </section>
        <section>
          <h2 className="font-semibold">Shipping address</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="sr-only">Full name</span><input className={input} required value={addr.name} onChange={set("name")} placeholder="Full name" autoComplete="name" /></label>
            <label className="sm:col-span-2"><span className="sr-only">Address</span><input className={input} required value={addr.line1} onChange={set("line1")} placeholder="Street address" autoComplete="address-line1" /></label>
            <label className="sm:col-span-2"><span className="sr-only">Apartment</span><input className={input} value={addr.line2} onChange={set("line2")} placeholder="Apartment, suite (optional)" autoComplete="address-line2" /></label>
            <label><span className="sr-only">City</span><input className={input} required value={addr.city} onChange={set("city")} placeholder="City" autoComplete="address-level2" /></label>
            <label><span className="sr-only">State / region</span><input className={input} value={addr.region} onChange={set("region")} placeholder={us ? "State" : "Region"} autoComplete="address-level1" /></label>
            <label><span className="sr-only">ZIP / postcode</span><input className={input} required value={addr.zip} onChange={set("zip")} placeholder={us ? "ZIP code" : "Postcode"} autoComplete="postal-code" /></label>
            <label><span className="sr-only">Country</span>
              <select className={input} value={addr.country} onChange={set("country")} autoComplete="country-name">
                {(meta?.countries ?? ["United States"]).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section>
          <h2 className="font-semibold">Shipping method</h2>
          {us ? (
            <div className="mt-3 space-y-2">
              {meta && Object.entries(meta.shipping).map(([key, s]) => {
                const price = key === "standard" && cart.subtotal >= meta.free_over ? 0 : s.price;
                return (
                  <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${method === key ? "border-accent bg-accent-soft/40" : "border-line hover:bg-bg"}`}>
                    <input type="radio" name="method" value={key} checked={method === key} onChange={() => setMethod(key)} className="accent-[var(--accent)]" />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-semibold">{price === 0 ? "Free" : money2(price)}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-line bg-bg px-4 py-3 text-sm">International shipping · 7–14 business days · {money2(meta?.international_price ?? 24.95)}. Import duties are paid on delivery.</p>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Payment</h2>
          <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">This is a practice store: no payment is taken and nothing will be shipped.</p>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-line bg-bg p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="space-y-3">
          {cart.lines.map((l) => (
            <li key={`${l.slug}-${l.size}-${l.color}`} className="flex items-center gap-3 text-sm">
              <span className="relative h-14 w-14 shrink-0 rounded-lg p-1" style={{ background: l.bg }}>
                <ProductArt kind={l.art} color={l.hex} />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] text-white">{l.qty}</span>
              </span>
              <span className="min-w-0 flex-1"><span className="block truncate">{l.name}</span><span className="text-xs text-muted">{l.color} · {l.size}</span></span>
              <span>{money2(l.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money2(cart.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{shipping === 0 ? "Free" : money2(shipping)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{money2(total)}</dd></div>
        </dl>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60">
          {busy && <Spinner />} Place order · {money2(total)}
        </button>
        <p className="text-center text-xs text-muted">By placing your order you agree to our <Link href="/help/returns" className="underline">returns policy</Link>.</p>
      </aside>
    </form>
  );
}
