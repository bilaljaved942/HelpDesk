import Link from "next/link";

export const metadata = { title: "About us" };

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold text-accent">About us</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-tight">Outdoor gear, made to last.</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">
        Northwind Outfitters started in 2009 in a garage in Portland, Oregon, with one waterproof jacket and a simple idea:
        make gear good enough to keep for life, and stand behind it.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[["2009", "founded in Portland"], ["Lifetime", "warranty on jackets, packs and tents"], ["1 tree", "planted for every order"]].map(([a, b]) => (
          <div key={a} className="rounded-2xl bg-bg p-5"><p className="text-2xl font-semibold">{a}</p><p className="mt-1 text-sm text-muted">{b}</p></div>
        ))}
      </div>
      <h2 className="mt-12 text-xl font-semibold">Visit us</h2>
      <p className="mt-2 text-muted">Flagship store, 1200 Pine Street, Portland, Oregon. Open daily 10 am – 7 pm. Online orders can be returned in the store.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong">Shop the collection</Link>
        <Link href="/help/contact" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-soft">Contact us</Link>
      </div>
    </div>
  );
}
