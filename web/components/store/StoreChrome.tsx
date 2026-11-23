"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { money2 } from "@/lib/store";
import { ProductArt } from "../ProductArt";
import { useAccount, useCart, useSaved } from "./StoreProviders";

export const NAV = [
  { href: "/shop/new", label: "New" },
  { href: "/shop/jackets", label: "Jackets" },
  { href: "/shop/footwear", label: "Footwear" },
  { href: "/shop/packs", label: "Packs" },
  { href: "/shop/tents", label: "Tents" },
  { href: "/shop/accessories", label: "Accessories" },
  { href: "/shop/sale", label: "Sale" },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2 text-lg font-semibold tracking-tight ${light ? "text-white" : ""}`}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden><path d="M2 20l7-12 4 6 3-4 6 10z" fill={light ? "#7ee2b0" : "var(--accent)"} /></svg>
      Northwind<span className="hidden font-normal sm:inline"> Outfitters</span>
    </Link>
  );
}

function IconButton({ label, d, onClick, href, badge }: { label: string; d: string; onClick?: () => void; href?: string; badge?: number }) {
  const inner = (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
      {!!badge && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{badge}</span>}
    </>
  );
  const cls = "relative flex h-10 w-10 items-center justify-center rounded-full text-ink transition hover:bg-soft";
  return href ? <Link href={href} aria-label={label} className={cls}>{inner}</Link> : <button onClick={onClick} aria-label={label} className={cls}>{inner}</button>;
}

export function StoreHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const cart = useCart();
  const { customer } = useAccount();
  const { saved } = useSaved();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);

  // close the mobile menu when the page changes
  useEffect(() => {
    Promise.resolve().then(() => setMenu(false));
  }, [pathname]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <button onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-soft lg:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d={menu ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
        </button>
        <Logo />
        <form onSubmit={search} role="search" className="ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-full border border-line bg-bg px-3.5 py-2 text-sm transition focus-within:border-accent focus-within:bg-white md:flex">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jackets, boots…" aria-label="Search products" className="w-full bg-transparent outline-none placeholder:text-muted" />
        </form>
        <div className="ml-auto flex items-center md:ml-0">
          <IconButton label={customer ? `Account: ${customer.name}` : "Log in"} href={customer ? "/account" : "/login"} d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />
          <IconButton label="Saved items" href="/account#saved" badge={saved.length} d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
          <IconButton label={`Cart, ${cart.count} items`} onClick={() => cart.setOpen(true)} badge={cart.count} d="M6 7h12l-1 13H7zM9 7a3 3 0 016 0" />
        </div>
      </div>
      {menu && (
        <div className="border-t border-line bg-card px-4 pb-4 lg:hidden">
          <form onSubmit={search} role="search" className="mt-3 flex items-center gap-2 rounded-full border border-line bg-bg px-3.5 py-2 text-sm">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search products" className="w-full bg-transparent outline-none" />
          </form>
          <nav className="mt-2 grid grid-cols-2 gap-1" aria-label="Shop">
            <Link href="/shop" className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-soft">Shop all</Link>
            <Link href="/help" className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-soft">Help center</Link>
            <Link href={customer ? "/account" : "/login"} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-soft">{customer ? "My account" : "Log in"}</Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export function FreeShippingBar({ subtotal }: { subtotal: number }) {
  const left = Math.max(0, 75 - subtotal);
  return (
    <div className="text-xs">
      <p className={left ? "text-muted" : "font-medium text-accent"}>
        {left ? <>You&apos;re <b className="text-ink">{money2(left)}</b> away from free US shipping</> : "✓ Your order ships free (US standard)"}
      </p>
      <div className="mt-1.5 h-1.5 rounded-full bg-soft"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (subtotal / 75) * 100)}%` }} /></div>
    </div>
  );
}

export function CartLines({ compact = false }: { compact?: boolean }) {
  const cart = useCart();
  return (
    <ul className="divide-y divide-line">
      {cart.lines.map((l, i) => (
        <li key={`${l.slug}-${l.size}-${l.color}`} className="flex gap-3 py-4">
          <Link href={`/products/${l.slug}`} className={`shrink-0 overflow-hidden rounded-xl p-1.5 ${compact ? "h-20 w-20" : "h-24 w-24"}`} style={{ background: l.bg }}>
            <ProductArt kind={l.art} color={l.hex} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <Link href={`/products/${l.slug}`} className="text-sm font-medium leading-snug hover:underline">{l.name}</Link>
              <span className="text-sm font-semibold">{money2(l.price * l.qty)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{l.color} · {l.size}</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center rounded-full border border-line" role="group" aria-label={`Quantity of ${l.name}`}>
                <button onClick={() => (l.qty > 1 ? cart.setQty(i, l.qty - 1) : cart.drop(i))} aria-label="One less" className="h-8 w-8 rounded-full text-lg leading-none hover:bg-soft">−</button>
                <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">{l.qty}</span>
                <button onClick={() => cart.setQty(i, l.qty + 1)} disabled={l.qty >= 10} aria-label="One more" className="h-8 w-8 rounded-full text-lg leading-none hover:bg-soft disabled:opacity-30">+</button>
              </div>
              <button onClick={() => cart.drop(i)} className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline">Remove</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!cart.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cart]);

  if (!cart.open) return null;
  return (
    <div className="fixed inset-0 z-[55]">
      <button className="absolute inset-0 bg-black/30" aria-label="Close cart" onClick={() => cart.setOpen(false)} />
      <aside role="dialog" aria-modal="true" aria-label="Your cart" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">Your cart {cart.count > 0 && <span className="text-muted">({cart.count})</span>}</h2>
          <button onClick={() => cart.setOpen(false)} aria-label="Close cart" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-soft">✕</button>
        </div>
        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-4xl" aria-hidden>🎒</p>
            <p className="font-medium">Your cart is empty</p>
            <button onClick={() => { cart.setOpen(false); router.push("/shop"); }} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong">Start shopping</button>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-3"><FreeShippingBar subtotal={cart.subtotal} /></div>
            <div className="flex-1 overflow-y-auto px-5"><CartLines compact /></div>
            <div className="space-y-3 border-t border-line px-5 py-4">
              <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="font-semibold">{money2(cart.subtotal)}</span></div>
              <p className="text-xs text-muted">Shipping and taxes are calculated at checkout.</p>
              <button onClick={() => { cart.setOpen(false); router.push("/checkout"); }} className="w-full rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong">Checkout</button>
              <button onClick={() => { cart.setOpen(false); router.push("/cart"); }} className="w-full rounded-full border border-line py-2.5 text-sm font-medium hover:bg-soft">View cart</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function StoreFooter() {
  const cols: [string, [string, string][]][] = [
    ["Help", [["Shipping", "/help/shipping"], ["Returns & refunds", "/help/returns"], ["Size guide", "/help/sizing"], ["Warranty & care", "/help/warranty"], ["Payments & accounts", "/help/payments"], ["Contact us", "/help/contact"]]],
    ["Shop", [["New arrivals", "/shop/new"], ["Jackets", "/shop/jackets"], ["Footwear", "/shop/footwear"], ["Packs", "/shop/packs"], ["Tents", "/shop/tents"], ["Sale", "/shop/sale"]]],
    ["Company", [["About us", "/about"], ["Help center", "/help"], ["My account", "/account"], ["Staff login", "/staff/login"]]],
  ];
  return (
    <footer className="bg-[#10231c] text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-3 text-white/60">Outdoor gear since 2009. One tree planted for every order.</p>
          <p className="mt-3 text-white/60">Flagship store: 1200 Pine Street, Portland, Oregon</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <p className="font-semibold text-white">{title}</p>
            <ul className="mt-2 space-y-1.5">
              {links.map(([label, href]) => <li key={href}><Link href={href} className="text-white/60 transition hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/50">© 2026 Northwind Outfitters · Prices in USD</p>
    </footer>
  );
}
