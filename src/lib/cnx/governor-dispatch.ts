export interface DispatchConfig {
  bridgeUrl: string;
  bridgeKey: string;
}
export interface DispatchDependencies {
  config: DispatchConfig;
  allowAttempt: () => Promise<boolean>;
  authorizePin: (pin: string) => Promise<{ accepted: boolean; retryAfter?: number }>;
  fetch: typeof fetch;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}

async function boundedJson(body: ReadableStream<Uint8Array> | null, max: number): Promise<unknown> {
  if (!body) throw new Error("empty");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error("large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally { reader.releaseLock(); }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** The CDP owner keeps Telegram credentials, recipient routing and the outbox. */
export async function dispatchGovernor(request: Request, deps: DispatchDependencies): Promise<Response> {
  let origin: string;
  try { origin = new URL(request.url).origin; } catch { return reply(403, { error: "same-origin request required" }); }
  if (request.headers.get("origin") !== origin || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
    return reply(403, { error: "same-origin request required" });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415, { error: "JSON required" });
  const { bridgeUrl, bridgeKey } = deps.config;
  let bridge: URL;
  try { bridge = new URL(bridgeUrl); } catch { return reply(503, { error: "dispatch not configured" }); }
  if (!bridgeKey || bridge.protocol !== "https:" || bridge.hostname !== "cdp.nonarkara.org" || bridge.port || bridge.username || bridge.password || bridge.search || bridge.hash || bridge.pathname !== "/api/v2/cnx/governor-dispatch") {
    return reply(503, { error: "dispatch not configured" });
  }
  try { if (!await deps.allowAttempt()) return reply(429, { error: "Too many attempts. Try again later." }); }
  catch { return reply(503, { error: "dispatch protection unavailable" }); }
  if (Number(request.headers.get("content-length")) > 8192) return reply(413, { error: "request too large" });
  let body: unknown;
  try { body = await boundedJson(request.body, 8192); }
  catch (error) { return reply(error instanceof Error && error.message === "large" ? 413 : 400, { error: "invalid request" }); }
  if (!object(body) || Object.keys(body).some(k => !["pin", "latitude", "longitude", "instruction", "requestId"].includes(k))
    || typeof body.pin !== "string" || body.pin.length > 128
    || typeof body.latitude !== "number" || !Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90
    || typeof body.longitude !== "number" || !Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180
    || typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.instruction)
    || typeof body.requestId !== "string" || !UUID.test(body.requestId)) return reply(400, { error: "invalid request" });
  let authorization;
  try { authorization = await deps.authorizePin(body.pin); }
  catch { return reply(503, { error: "PIN protection unavailable" }); }
  if (!authorization || typeof authorization.accepted !== "boolean") return reply(503, { error: "PIN protection unavailable" });
  if (!authorization.accepted) {
    if (authorization.retryAfter && Number.isFinite(authorization.retryAfter) && authorization.retryAfter > 0) {
      const response = reply(429, { error: "PIN attempts locked. Try again later." });
      response.headers.set("Retry-After", String(Math.ceil(authorization.retryAfter)));
      return response;
    }
    return reply(401, { error: "PIN not accepted" });
  }
  try {
    const upstream = await deps.fetch(bridge.href, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", "X-API-Key": bridgeKey, "Idempotency-Key": body.requestId },
      body: JSON.stringify({ requestId: body.requestId, latitude: body.latitude, longitude: body.longitude, instruction: body.instruction.trim(), source: "cnx" }),
    });
    if (!upstream.ok) { await upstream.body?.cancel(); return reply(502, { error: "Dispatch not confirmed. Check the request status before retrying." }); }
    const receipt = await boundedJson(upstream.body, 4096);
    if (!object(receipt) || receipt.requestId !== body.requestId || typeof receipt.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(receipt.id) || typeof receipt.status !== "string" || !["queued", "sent"].includes(receipt.status)) {
      return reply(502, { error: "Dispatch receipt unavailable. Check the request status before retrying." });
    }
    return reply(receipt.status === "queued" ? 202 : 200, { receipt: { id: receipt.id, status: receipt.status, requestId: body.requestId } });
  } catch { return reply(502, { error: "Dispatch not confirmed. Check the request status before retrying." }); }
}
