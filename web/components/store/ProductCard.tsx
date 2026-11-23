"use client";

import Link from "next/link";
import { useState } from "react";
import { money, type Product } from "@/lib/store";
import { ProductArt } from "../ProductArt";
import { useSaved } from "./StoreProviders";

export function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={i <= Math.round(rating) ? "#d99a1e" : "#dcd8d0"}>
          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" />
        </svg>
      ))}
    </span>
  );
}

export function SaveButton({ slug, className = "" }: { slug: string; className?: string }) {
  const { has, toggle } = useSaved();
  const on = has(slug);
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(slug); }}
      aria-pressed={on}
      aria-label={on ? "Remove from saved items" : "Save for later"}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 transition hover:scale-105 ${on ? "text-danger" : "text-ink"} ${className}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function ProductCard({ p }: { p: Product }) {
  const [color, setColor] = useState(p.colors[0]);
  return (
    <article className="group">
      <Link href={`/products/${p.slug}`} className="block">
        <div className="relative aspect-[5/4] overflow-hidden rounded-2xl" style={{ background: p.bg }}>
          <div className="absolute inset-4 transition duration-300 group-hover:scale-[1.04]"><ProductArt kind={p.art} color={color?.hex ?? "#888"} /></div>
          {(p.badge || p.is_new) && (
            <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.compare_at ? "bg-danger text-white" : "bg-white text-ink"}`}>
              {p.compare_at ? `Sale −${Math.round((1 - p.price / p.compare_at) * 100)}%` : p.badge ?? "New"}
            </span>
          )}
          <SaveButton slug={p.slug} className="absolute right-3 top-3" />
        </div>
      </Link>
      <div className="mt-3 flex items-center gap-1.5">
        {p.colors.map((c) => (
          <button key={c.name} onClick={() => setColor(c)} aria-label={`${c.name}`} aria-pressed={color?.name === c.name}
            className={`h-4 w-4 rounded-full ring-1 ring-black/10 transition ${color?.name === c.name ? "ring-2 ring-ink ring-offset-1" : ""}`} style={{ background: c.hex }} />
        ))}
        <span className="ml-1 text-xs text-muted">{color?.name}</span>
      </div>
      <Link href={`/products/${p.slug}`} className="mt-1.5 block text-sm font-medium leading-snug hover:underline">{p.name}</Link>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Stars rating={p.rating} />{p.rating} ({p.reviews})</div>
      <p className="mt-1 text-sm font-semibold">
        {money(p.price)}{p.compare_at && <span className="ml-2 font-normal text-muted line-through">{money(p.compare_at)}</span>}
      </p>
    </article>
  );
}

export function ProductGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}><div className="aspect-[5/4] animate-pulse rounded-2xl bg-soft" /><div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-soft" /></div>
      ))}
    </div>
  );
}
