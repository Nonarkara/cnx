"use client";

// CNX "ถามเชียงใหม่" — ask the dashboard in plain text.
//
// A retrieval-only chatbot: it doesn't have an LLM (Cloudflare Workers
// free tier doesn't host one). Instead it pulls the top-5 documents from
// the CNX RAG corpus (story, open data, fire, flood, air, heritage,
// flights) and shows them as a bulleted answer with source links.
//
// Use:
//   - "how many RFD hotspots in Mae On?"
//   - "which dams above 70%?"
//   - "datasets about water quality"
//   - "Wat Phra Singh" → heritage reference

import { useEffect, useRef, useState } from "react";
import { fetchJsonOrNull } from "../../lib/client-requests";
import { Search, Send, ExternalLink } from "lucide-react";

interface Reference {
  id: string;
  title: string;
  body: string;
  source: string;
  url?: string;
  score: number;
}

const SUGGESTIONS = [
  "Mae On จุดความร้อน",
  "Bhumibol storage",
  "PM2.5 today",
  "Wat Phra Singh",
  "datasets about การศึกษา",
  "inbound flights today",
];

export default function CnxAskChat() {
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ answer: string; references: Reference[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(q: string) {
    if (q.trim().length < 2 || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const json = await fetchJsonOrNull<{ answer: string; references: Reference[] }>(
        `/api/cnx/ask?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!json) throw new Error("Search is unavailable. Please try again.");
      setAnswer(json);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Search failed. Please try again.");
    } finally {
      controllerRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--bg-raised)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2">
        <Search className="h-3.5 w-3.5 text-[var(--cool)]" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
          ถามเชียงใหม่ · Ask
        </span>
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">
          RAG · source corpus
        </span>
      </header>
      <form
        className="flex shrink-0 items-center gap-1 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(query);
          setQuery("");
        }}
      >
        <input
          aria-label="Ask about Chiang Mai"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask: 'Mae On จุดความร้อน' / 'Wat Phra Singh' / 'PM2.5 today'"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
          disabled={busy}
        />
        <button
          aria-label="Search Chiang Mai data"
          type="submit"
          disabled={busy}
          className="flex h-6 w-6 items-center justify-center border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--cool)] hover:bg-[var(--cool-dim)] disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </form>
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--line)] px-3 py-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => { void submit(s); }}
            className="rounded-sm border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[9px] text-[var(--dim)] hover:bg-[var(--sun-dim)] hover:text-[var(--ink)]"
          >
            {s}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-busy={busy} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] text-[var(--ink)]">
        {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
        {busy && <p className="text-[var(--dim)]">Searching…</p>}
        {!busy && !answer && !error && (
          <p className="text-[var(--dim)]">
            Try a question in Thai or English. The bot searches across
            the available open-data catalogue, fire / flood /
            air / flight evidence, and curated heritage references. Source labels
            distinguish measurements, models and scenarios. Top-5
            documents are returned as a bulleted answer.
          </p>
        )}
        {answer && (
          <>
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{answer.answer}</pre>
            <ul className="mt-3 space-y-1">
              {answer.references.map((r) => (
                <li key={r.id} className="border-l-2 border-l-[var(--cool)] bg-[var(--bg)] px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cool)]">
                      [{r.source}] {r.title}
                    </span>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 font-mono text-[8px] text-[var(--dim)] hover:text-[var(--ink)]">
                        <ExternalLink className="h-2.5 w-2.5" /> open
                      </a>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--dim)]">{r.body}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}