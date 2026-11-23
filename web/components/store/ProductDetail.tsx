"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { money, store, type Product } from "@/lib/store";
import { ProductArt } from "../ProductArt";
import { ProductCard, SaveButton, Stars } from "./ProductCard";
import { useCart } from "./StoreProviders";

export function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const cart = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [missing, setMissing] = useState(false);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [needSize, setNeedSize] = useState(false);

  useEffect(() => {
    store.product(slug).then((x) => {
      setP(x);
      setColor(x.colors[0]?.name ?? "");
      setSize(x.sizes.length === 1 ? x.sizes[0] : "");
    }).catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true); });
  }, [slug]);

  if (missing) return (
    <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-semibold">Product not found</h1>
      <Link href="/shop" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Back to the shop</Link>
    </div>
  );
  if (!p) return <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2"><div className="aspect-square animate-pulse rounded-3xl bg-soft" /><div className="h-64 animate-pulse rounded-2xl bg-soft" /></div>;

  const hex = p.colors.find((c) => c.name === color)?.hex ?? "#888";
  const shoe = p.category === "footwear";
  const add = () => {
    if (!size) { setNeedSize(true); return; }
    cart.add(p, size, color, qty);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-muted">
        <Link href="/" className="hover:text-ink">Home</Link> / <Link href={`/shop/${p.category}`} className="hover:text-ink">{p.category_name}</Link> / <span className="text-ink">{p.name}</span>
      </nav>
      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="relative aspect-square overflow-hidden rounded-3xl p-10" style={{ background: p.bg }}>
          <ProductArt kind={p.art} color={hex} />
          <SaveButton slug={p.slug} className="absolute right-4 top-4 h-11 w-11" />
          {p.compare_at && <span className="absolute left-4 top-4 rounded-full bg-danger px-2.5 py-1 text-xs font-semibold text-white">Sale −{Math.round((1 - p.price / p.compare_at) * 100)}%</span>}
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted"><Stars rating={p.rating} size={15} /> {p.rating} · {p.reviews} reviews</div>
          <p className="mt-4 text-2xl font-semibold">
            {money(p.price)}{p.compare_at && <span className="ml-2 text-lg font-normal text-muted line-through">{money(p.compare_at)}</span>}
          </p>
          <p className="mt-4 leading-relaxed text-muted">{p.description}</p>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">Colour: <span className="font-normal text-muted">{color}</span></legend>
            <div className="mt-2 flex gap-2">
              {p.colors.map((c) => (
                <button key={c.name} onClick={() => setColor(c.name)} aria-label={c.name} aria-pressed={color === c.name}
                  className={`h-9 w-9 rounded-full ring-1 ring-black/10 transition ${color === c.name ? "ring-2 ring-ink ring-offset-2" : "hover:scale-105"}`} style={{ background: c.hex }} />
              ))}
            </div>
          </fieldset>

          {p.sizes.length > 1 && (
            <fieldset className="mt-6">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">Size {shoe && <span className="font-normal text-muted">(US)</span>}</legend>
                <Link href="/help/sizing" className="text-xs font-medium text-accent hover:underline">Size guide</Link>
              </div>
              {p.badge?.includes("size") && <p className="mt-1 text-xs text-warn">Tip: these run half a size small. We recommend ordering half a size up.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {p.sizes.map((s) => (
                  <button key={s} onClick={() => { setSize(s); setNeedSize(false); }} aria-pressed={size === s}
                    className={`min-w-12 rounded-xl border px-3 py-2 text-sm transition ${size === s ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                    {s}
                  </button>
                ))}
              </div>
              {needSize && <p role="alert" className="mt-2 text-sm text-danger">Please choose a size.</p>}
            </fieldset>
          )}

          <div className="mt-6 flex gap-3">
            <div className="flex items-center rounded-full border border-line" role="group" aria-label="Quantity">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One less" className="h-12 w-11 rounded-full text-lg hover:bg-soft">−</button>
              <span className="w-6 text-center tabular-nums">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="One more" className="h-12 w-11 rounded-full text-lg hover:bg-soft">+</button>
            </div>
            <button onClick={add} className="flex-1 rounded-full bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-strong">
              Add to cart · {money(p.price * qty)}
            </button>
          </div>

          <ul className="mt-6 space-y-1.5 text-sm text-muted">
            <li>🚚 Free US shipping over $75 · <Link href="/help/shipping" className="underline-offset-2 hover:underline">delivery times</Link></li>
            <li>↩️ 30-day returns{p.category === "accessories" && p.slug.includes("socks") ? " (not for socks)" : ""} · <Link href="/help/returns" className="underline-offset-2 hover:underline">return policy</Link></li>
          </ul>

          <div className="mt-8 border-t border-line pt-6">
            <h2 className="text-sm font-semibold">Details</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-accent">✓</span>{f}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {!!p.related?.length && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight">You might also like</h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">{p.related.map((r) => <ProductCard key={r.slug} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}
