"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Doc, type SearchHit } from "@/lib/api";
import { PageHeader } from "./DashboardShell";
import { ErrorBanner, Spinner, timeAgo } from "./ui";

const ACCEPT = ".md,.markdown,.txt,.pdf,.docx";

export function Docs() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => {
    api.docs().then(setDocs).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/staff/login?next=/dashboard/docs");
      else setError(e.message);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) await api.uploadDoc(f);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Delete "${d.title}"? The assistant will stop using it.`)) return;
    await api.deleteDoc(d.id).then(load).catch((e) => setError(e.message));
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      setHits(await api.search(q.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <PageHeader title="Help docs" sub="The assistant answers only from these. Upload FAQ, policies or guides (PDF, Word, Markdown or text)." />
      <div className="grid gap-6 px-4 py-6 sm:px-8 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
            className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${dragging ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-muted/40"}`}
          >
            <input type="file" multiple accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            {busy ? <Spinner className="h-5 w-5 text-accent" /> : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent" aria-hidden>
                <path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <p className="mt-2 text-sm font-semibold">{busy ? "Reading and indexing…" : "Drop files here or click to upload"}</p>
            <p className="mt-0.5 text-xs text-muted">PDF, DOCX, MD or TXT · split into sections and made searchable in seconds</p>
          </label>

          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            {!docs ? <div className="flex justify-center p-8 text-muted"><Spinner /></div> : docs.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">No docs yet. Upload one, or run <code>python scripts/seed.py</code>.</p>
            ) : (
              <ul>
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden><path d="M7 3h8l4 4v14H7zM15 3v4h4" strokeLinejoin="round" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{d.title}</p>
                      <p className="truncate text-xs text-muted">{d.filename} · {d.chunks} sections · {d.words} words · added {timeAgo(d.created_at)}</p>
                    </div>
                    <button onClick={() => remove(d)} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger-soft hover:text-danger">Delete</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <section className="h-fit rounded-2xl border border-line bg-card p-5">
          <h2 className="text-sm font-semibold">Test the search</h2>
          <p className="text-xs text-muted">See which sections the assistant would read for a question. Scores above about 0 are a strong match; below −6.5 counts as “not in the docs”.</p>
          <form onSubmit={search} className="mt-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. can I return worn boots?" aria-label="Test question"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white" />
            <button disabled={searching} className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {searching && <Spinner />} Search
            </button>
          </form>
          {hits && (
            <ol className="mt-4 space-y-2.5">
              {hits.map((h, i) => (
                <li key={i} className={`rounded-xl border p-3 ${h.score < -6.5 ? "border-line opacity-60" : "border-accent/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{h.label}</p>
                    <span className={`shrink-0 font-mono text-xs ${h.score >= 0 ? "text-accent" : "text-muted"}`}>{h.score.toFixed(1)}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">{h.snippet}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
