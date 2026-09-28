// Shared plumbing for data the off-Cloudflare relay (scripts/relay-flights.mjs)
// pushes into CNX_FLIGHTS_KV: authenticated, size-capped, validated ingest,
// and staleness-checked reads. Upstreams that block Cloudflare's network,
// or work that Workers can't do (image decoding), run on the relay instead.

import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 1_048_576;

type Guard<T> = (v: unknown) => v is T;

async function kv() {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  return env.CNX_FLIGHTS_KV ?? null;
}

/** POST handler body: secret check, 1 MB cap, JSON parse, validation, store. */
export async function ingestRelayJson<T>(request: Request, key: string, isValid: Guard<T>, ttlSeconds: number): Promise<Response> {
  const secret = process.env.CNX_FLIGHTS_RELAY_SECRET;
  if (!secret) return NextResponse.json({ error: "relay ingest not configured" }, { status: 503 });
  if (request.headers.get("x-relay-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "payload exceeds 1 MB" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isValid(body)) return NextResponse.json({ error: "payload failed validation" }, { status: 422 });
  const store = await kv();
  if (!store) return NextResponse.json({ error: "CNX_FLIGHTS_KV binding missing" }, { status: 500 });
  await store.put(key, JSON.stringify(body), { expirationTtl: ttlSeconds });
  return NextResponse.json({ ok: true });
}

/** Last relay copy, or null when absent, invalid, or older than maxAgeMs. */
export async function readRelayJson<T extends { generatedAt: string }>(key: string, maxAgeMs: number, isValid: Guard<T>): Promise<T | null> {
  try {
    const store = await kv();
    if (!store) return null;
    const raw = await store.get(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    if (Date.now() - Date.parse(parsed.generatedAt) > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── small validators shared by the relay payload guards ──

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isStr = (v: unknown, max = 500): v is string => typeof v === "string" && v.length <= max;
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);
/** https only — these URLs end up in <a href> and <img src>. */
export const isHttpsUrl = (v: unknown): v is string => isStr(v, 2_000) && /^https:\/\/[^\s"'<>]+$/.test(v);
export const isIsoDate = (v: unknown): v is string => isStr(v, 40) && !Number.isNaN(Date.parse(v));
