"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { store, type Product } from "@/lib/store";
import { ProductArt } from "../ProductArt";
import { ProductCard, ProductGridSkeleton } from "./ProductCard";

const CATEGORIES = [
  { slug: "jackets", name: "Jackets", art: "jacket", color: "#2d6a52", bg: "#e4ece7" },
  { slug: "footwear", name: "Footwear", art: "boots", color: "#7a5232", bg: "#efe7dd" },
  { slug: "packs", name: "Packs", art: "pack", color: "#9a7a2a", bg: "#eeeadb" },
  { slug: "tents", name: "Tents", art: "tent", color: "#d08a2e", bg: "#e6ece2" },
];

export function Home() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    store.products().then(setProducts).catch(() => setProducts([]));
  }, []);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1f5f4a] to-[#0f2f25] text-white">
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-25" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
          <path d="M0 160 L180 60 L320 130 L520 20 L700 120 L860 50 L1040 130 L1200 70 L1200 160 Z" fill="#0b241c" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-[1.15fr_1fr] md:items-center">
          <div>
            <p className="text-sm font-medium text-[#9fe0c2]">Autumn collection 2026</p>
            <h1 className="mt-2 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Gear for the long way round.</h1>
            <p className="mt-4 max-w-md text-white/80">Waterproof jackets, boots and packs built to last a lifetime, and backed by a warranty that says so.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/shop/jackets" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-white/90">Shop jackets</Link>
              <Link href="/help/sizing" className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10">Find your size</Link>
            </div>
          </div>
          <div className="relative hidden aspect-square max-h-[380px] md:block" aria-hidden>
            <div className="absolute left-[6%] top-[4%] h-[58%] w-[58%] rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15"><ProductArt kind="jacket" color="#7ee2b0" /></div>
            <div className="absolute bottom-[4%] right-[4%] h-[52%] w-[52%] rounded-[2rem] bg-white/10 p-6 ring-1 ring-white/15"><ProductArt kind="boots" color="#e9b872" /></div>
            <div className="absolute bottom-[10%] left-[14%] h-[30%] w-[30%] rounded-3xl bg-white/10 p-3 ring-1 ring-white/15"><ProductArt kind="pack" color="#f0d58a" /></div>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-5 text-sm sm:px-6 lg:grid-cols-4">
          {([
            ["🚚", "Free shipping", "on US orders over $75", "/help/shipping"],
            ["↩️", "30-day returns", "free US return label", "/help/returns"],
            ["🛡️", "Lifetime warranty", "jackets, packs, tents", "/help/warranty"],
            ["💬", "Help 24/7", "chat with us any time", "/help/contact"],
          ] as const).map(([icon, title, sub, href]) => (
            <Link key={title} href={href} className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-bg">
              <span className="text-xl" aria-hidden>{icon}</span>
              <span><span className="block font-semibold">{title}</span><span className="block text-xs text-muted">{sub}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight">Shop by category</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/shop/${c.slug}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-bg p-3 transition hover:border-accent/30 hover:bg-card">
              <span className="h-14 w-14 shrink-0 rounded-xl p-1" style={{ background: c.bg }}><ProductArt kind={c.art} color={c.color} /></span>
              <span className="font-medium">{c.name}</span>
              <span className="ml-auto text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Best sellers</h2>
          <Link href="/shop" className="text-sm font-medium text-accent hover:underline">View all</Link>
        </div>
        <div className="mt-5">
          {!products ? <ProductGridSkeleton /> : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
              {products.slice(0, 6).map((p) => <ProductCard key={p.slug} p={p} />)}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto mb-14 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 overflow-hidden rounded-3xl bg-[#f1ebe0] p-8 md:grid-cols-[1fr_auto] md:items-center md:p-10">
          <div>
            <p className="text-sm font-semibold text-warn">Built to last</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">A lifetime warranty on every jacket, pack and tent.</h2>
            <p className="mt-2 max-w-xl text-muted">Broken zip after five years? We repair it, replace it or give you store credit. That&apos;s it.</p>
          </div>
          <Link href="/help/warranty" className="h-fit rounded-full bg-ink px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-black">How the warranty works</Link>
        </div>
      </section>
    </>
  );
}
