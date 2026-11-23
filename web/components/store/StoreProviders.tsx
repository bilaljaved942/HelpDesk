"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { store, type Customer, type Product } from "@/lib/store";

/* ---------------- customer account ---------------- */

type AccountState = {
  customer: Customer | null;
  loading: boolean;
  setCustomer: (c: Customer | null) => void;
  logout: () => Promise<void>;
};
const AccountCtx = createContext<AccountState | null>(null);

/* ---------------- cart (kept in the browser, like most shops) ---------------- */

export type CartLine = { slug: string; name: string; price: number; size: string; color: string; hex: string; art: string; bg: string; qty: number };
type CartState = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (p: Product, size: string, color: string, qty: number) => void;
  setQty: (i: number, qty: number) => void;
  drop: (i: number) => void;
  empty: () => void;
};
const CartCtx = createContext<CartState | null>(null);

/* ---------------- saved items ---------------- */

type SavedState = { saved: string[]; toggle: (slug: string) => void; has: (slug: string) => boolean };
const SavedCtx = createContext<SavedState | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export function StoreProviders({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    store.me().then(setCustomer).catch(() => setCustomer(null)).finally(() => setLoading(false));
    Promise.resolve().then(() => {
      setLines(read<CartLine[]>("nw_cart", []));
      setSaved(read<string[]>("nw_saved", []));
      setLoaded(true);
    });
  }, []);

  useEffect(() => { if (loaded) write("nw_cart", lines); }, [lines, loaded]);
  useEffect(() => { if (loaded) write("nw_saved", saved); }, [saved, loaded]);

  const logout = useCallback(async () => {
    await store.logout().catch(() => undefined);
    setCustomer(null);
    try {
      localStorage.removeItem("helpdesk_chat");   // the chat belonged to this account
    } catch {
      /* private mode */
    }
  }, []);

  const add = useCallback((p: Product, size: string, color: string, qty: number) => {
    const hex = p.colors.find((c) => c.name === color)?.hex ?? p.colors[0]?.hex ?? "#999";
    setLines((cur) => {
      const i = cur.findIndex((l) => l.slug === p.slug && l.size === size && l.color === color);
      if (i >= 0) return cur.map((l, j) => (j === i ? { ...l, qty: Math.min(10, l.qty + qty) } : l));
      return [...cur, { slug: p.slug, name: p.name, price: p.price, size, color, hex, art: p.art, bg: p.bg, qty }];
    });
    setOpen(true);
  }, []);

  const cart: CartState = {
    lines,
    count: lines.reduce((a, l) => a + l.qty, 0),
    subtotal: Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100,
    open,
    setOpen,
    add,
    setQty: (i, qty) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, qty: Math.max(1, Math.min(10, qty)) } : l))),
    drop: (i) => setLines((cur) => cur.filter((_, j) => j !== i)),
    empty: () => setLines([]),
  };

  const savedState: SavedState = {
    saved,
    has: (slug) => saved.includes(slug),
    toggle: (slug) => setSaved((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug])),
  };

  return (
    <AccountCtx.Provider value={{ customer, loading, setCustomer, logout }}>
      <CartCtx.Provider value={cart}>
        <SavedCtx.Provider value={savedState}>{children}</SavedCtx.Provider>
      </CartCtx.Provider>
    </AccountCtx.Provider>
  );
}

export function useAccount() {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount must be inside <StoreProviders>");
  return c;
}
export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart must be inside <StoreProviders>");
  return c;
}
export function useSaved() {
  const c = useContext(SavedCtx);
  if (!c) throw new Error("useSaved must be inside <StoreProviders>");
  return c;
}
