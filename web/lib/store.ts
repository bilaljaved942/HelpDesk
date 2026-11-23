// The demo shop's API (products, help pages, customer accounts, orders).
import { ApiError } from "./api";

export type Color = { name: string; hex: string };
export type Product = {
  slug: string;
  name: string;
  category: string;
  category_name: string;
  price: number;
  compare_at: number | null;
  description: string;
  features: string[];
  sizes: string[];
  colors: Color[];
  art: string;
  bg: string;
  rating: number;
  reviews: number;
  badge: string | null;
  is_new: boolean;
  related?: Product[];
};
export type Customer = { id: string; email: string; name: string };
export type OrderLine = { slug: string; name: string; size: string; color: string; qty: number; price: number };
export type Address = { name: string; line1: string; line2: string; city: string; region: string; zip: string; country: string };
export type StoreOrder = {
  number: string;
  status: "processing" | "shipped" | "delivered" | "cancelled";
  items: OrderLine[];
  subtotal: number;
  shipping_cost: number;
  total: number;
  shipping_method: string;
  ship_to: Address;
  carrier: string;
  tracking: string;
  placed_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  eta: string | null;
};
export type ShippingOption = { label: string; price: number; days: number; carrier: string };
export type StoreMeta = {
  categories: Record<string, string>;
  shipping: Record<string, ShippingOption>;
  free_over: number;
  countries: string[];
  international_price: number;
};
export type HelpPage = { slug: string; title: string; content?: string; updated_at?: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("We couldn't reach the store. Please check your connection.", 0);
  }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]) {
        const field = body.detail[0].loc?.[body.detail[0].loc.length - 1];
        msg = field === "password" ? "Password must be at least 8 characters."
          : field === "email" ? "Please enter a valid email address."
          : `Please check the ${String(field ?? "form").replace("_", " ")} field.`;
      }
    } catch {
      /* not JSON */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const store = {
  products: (p: { category?: string; q?: string; sale?: boolean; new?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (p.category) qs.set("category", p.category);
    if (p.q) qs.set("q", p.q);
    if (p.sale) qs.set("sale", "true");
    if (p.new) qs.set("new", "true");
    return call<Product[]>(`/api/store/products?${qs}`);
  },
  product: (slug: string) => call<Product>(`/api/store/products/${slug}`),
  meta: () => call<StoreMeta>("/api/store/meta"),
  help: () => call<HelpPage[]>("/api/store/help"),
  helpPage: (slug: string) => call<HelpPage>(`/api/store/help/${slug}`),

  me: () => call<Customer>("/api/store/auth/me"),
  signup: (b: { name: string; email: string; password: string }) => call<Customer>("/api/store/auth/signup", post(b)),
  login: (b: { email: string; password: string }) => call<Customer>("/api/store/auth/login", post(b)),
  logout: () => call<{ ok: boolean }>("/api/store/auth/logout", { method: "POST" }),

  placeOrder: (b: { items: { slug: string; size: string; color: string; qty: number }[]; ship_to: Address; method: string }) =>
    call<StoreOrder>("/api/store/orders", post(b)),
  orders: () => call<StoreOrder[]>("/api/store/orders"),
  order: (n: string) => call<StoreOrder>(`/api/store/orders/${n}`),
};

export const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
export const money2 = (n: number) => `$${n.toFixed(2)}`;
export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
