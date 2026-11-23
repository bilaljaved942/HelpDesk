"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { store, type Product } from "@/lib/store";
import { ProductCard, ProductGridSkeleton } from "./ProductCard";
import { NAV } from "./StoreChrome";

const TITLES: Record<string, [string, string]> = {
  all: ["All products", "Everything we make, built to last."],
  new: ["New arrivals", "Fresh for the autumn season."],
  sale: ["Sale", "Great gear, for less. While it lasts."],
  jackets: ["Jackets", "Waterproof shells, down and fleece."],
  footwear: ["Footwear", "Hiking boots and trail runners."],
  packs: ["Packs", "Day packs with built-in rain covers."],
  tents: ["Tents", "Light, fast-pitching shelters."],
  accessories: ["Accessories", "Trousers, socks and the rest."],
};

const SORTS = {
  featured: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  rating: "Top rated",
} as const;
type Sort = keyof typeof SORTS;

export function Shop() {
  const params = useParams<{ category?: string }>();
  const search = useSearchParams();
  const category = params.category ?? "all";
  const q = search.get("q") ?? "";
  const [products, setProducts] = useState<Product[] | null>(null);
  const [sort, setSort] = useState<Sort>("featured");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opts = category === "sale" ? { sale: true } : category === "new" ? { new: true }
      : category === "all" ? {} : { category };
    store.products({ ...opts, q: q || undefined }).then(setProducts).catch((e) => setError(e.message));
  }, [category, q]);

  const [title, sub] = q ? [`Results for “${q}”`, `${products?.length ?? "…"} products`] : TITLES[category] ?? ["Not found", ""];
  const sorted = [...(products ?? [])].sort((a, b) =>
    sort === "price-asc" ? a.price - b.price : sort === "price-desc" ? b.price - a.price : sort === "rating" ? b.rating - a.rating : 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link href="/" className="hover:text-ink">Home</Link> / <Link href="/shop" className="hover:text-ink">Shop</Link>{category !== "all" && <> / <span className="text-ink">{TITLES[category]?.[0]}</span></>}</nav>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-muted">{sub}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full border border-line bg-card px-3 py-1.5">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        <Link href="/shop" className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${category === "all" && !q ? "border-ink bg-ink text-white" : "border-line hover:bg-soft"}`}>All</Link>
        {NAV.map((n) => {
          const on = n.href === `/shop/${category}`;
          return <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${on ? "border-ink bg-ink text-white" : "border-line hover:bg-soft"}`}>{n.label}</Link>;
        })}
      </div>
      <div className="mt-8">
        {error ? <p className="text-danger">{error}</p> : !products ? <ProductGridSkeleton /> : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-12 text-center">
            <p className="font-medium">No products found</p>
            <p className="mt-1 text-sm text-muted">Try another search, or browse all products.</p>
            <Link href="/shop" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Browse all</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">{sorted.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
        )}
      </div>
    </div>
  );
}
