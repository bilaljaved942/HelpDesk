"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { store, type HelpPage } from "@/lib/store";
import { Spinner } from "../ui";

const ICONS: Record<string, string> = { shipping: "🚚", returns: "↩️", sizing: "📏", warranty: "🛡️", payments: "💳", contact: "💬" };

export function HelpIndex() {
  const [pages, setPages] = useState<HelpPage[] | null>(null);
  useEffect(() => { store.help().then(setPages).catch(() => setPages([])); }, []);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Help center</h1>
      <p className="mt-2 text-muted">Answers about orders, shipping, returns and more. Can&apos;t find it? Open the chat in the corner.</p>
      {!pages ? <div className="mt-8 flex justify-center text-muted"><Spinner /></div> : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {pages.map((p) => (
            <Link key={p.slug} href={`/help/${p.slug}`} className="flex items-center gap-3 rounded-2xl border border-line p-4 transition hover:border-accent/30 hover:bg-bg">
              <span className="text-2xl" aria-hidden>{ICONS[p.slug] ?? "📄"}</span>
              <span className="font-medium">{p.title}</span>
              <span className="ml-auto text-muted" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<HelpPage | null>(null);
  const [all, setAll] = useState<HelpPage[]>([]);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    store.helpPage(slug).then(setPage).catch(() => setMissing(true));
    store.help().then(setAll).catch(() => undefined);
  }, [slug]);

  if (missing) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-semibold">Page not found</h1><Link href="/help" className="mt-4 inline-block text-accent">Help center</Link></div>;
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Help topics" className="hidden lg:block">
        <Link href="/help" className="text-sm font-semibold">Help center</Link>
        <ul className="mt-3 space-y-1 text-sm">
          {all.map((p) => (
            <li key={p.slug}><Link href={`/help/${p.slug}`} aria-current={p.slug === slug ? "page" : undefined}
              className={`block rounded-lg px-3 py-1.5 ${p.slug === slug ? "bg-soft font-medium" : "text-muted hover:text-ink"}`}>{p.title}</Link></li>
          ))}
        </ul>
      </nav>
      <article className="min-w-0">
        <Link href="/help" className="text-sm text-muted hover:text-ink lg:hidden">← Help center</Link>
        {!page ? <div className="mt-10 flex justify-center text-muted"><Spinner /></div> : <Markdown text={page.content ?? ""} />}
        <div className="mt-10 rounded-2xl bg-bg p-5 text-sm">
          <p className="font-medium">Still have a question?</p>
          <p className="mt-1 text-muted">Open the chat in the corner. Our assistant answers from these pages and can pass you to the team.</p>
        </div>
      </article>
    </div>
  );
}

/** Small markdown renderer for help pages: headings, lists, tables, bold. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") ? <strong key={i} className="text-ink">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  const out: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#\s/.test(l)) out.push(<h1 key={i} className="text-3xl font-semibold tracking-tight">{l.slice(2)}</h1>);
    else if (/^##\s/.test(l)) out.push(<h2 key={i} className="mt-8 text-xl font-semibold">{l.slice(3)}</h2>);
    else if (/^###\s/.test(l)) out.push(<h3 key={i} className="mt-6 font-semibold">{l.slice(4)}</h3>);
    else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(l);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ""));
      i--;
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={i} className={`mt-3 space-y-1.5 pl-5 text-muted ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</Tag>);
    } else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[-\s|]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={i} className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg"><tr>{rows[0].map((c) => <th key={c} className="px-3 py-2 text-left font-semibold">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(1).map((r, j) => <tr key={j} className="border-t border-line">{r.map((c, k) => <td key={k} className="px-3 py-2 text-muted">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (l.trim()) out.push(<p key={i} className="mt-3 leading-relaxed text-muted">{inline(l)}</p>);
  }
  return <>{out}</>;
}
