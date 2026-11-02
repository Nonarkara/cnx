import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchGovernor, type DispatchDependencies } from "./governor-dispatch";

const requestId = "63e86943-fab8-43a7-aeb2-a32d8e220ab9";
const payload = { pin: "test-only-secret", latitude: 18.78, longitude: 98.98, instruction: "Inspect this crossing", requestId };
function request(body: unknown = payload, headers: Record<string, string> = {}) {
  return new Request("https://cnx.nonarkara.org/api/cnx/governor-dispatch", { method: "POST", headers: { origin: "https://cnx.nonarkara.org", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
let deps: DispatchDependencies;
beforeEach(() => {
  deps = { config: { bridgeUrl: "https://cdp.nonarkara.org/api/v2/cnx/governor-dispatch", bridgeKey: "test-only-key" }, allowAttempt: vi.fn().mockResolvedValue(true), authorizePin: vi.fn(async pin => ({ accepted: pin === "test-only-secret" })), fetch: vi.fn().mockResolvedValue(Response.json({ requestId, id: "outbox_123", status: "queued" })) };
});
describe("governor dispatch boundary", () => {
  it("confirms only a matching actual queued receipt; forwards neither PIN nor recipient", async () => {
    const response = await dispatchGovernor(request(), deps);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ receipt: { id: "outbox_123", status: "queued", requestId } });
    const [url, options] = vi.mocked(deps.fetch).mock.calls[0];
    expect(url).toBe(deps.config.bridgeUrl);
    expect(options).toMatchObject({ redirect: "error", cache: "no-store", headers: { "X-API-Key": "test-only-key", "Idempotency-Key": requestId } });
    expect(JSON.parse(String(options?.body))).toEqual({ requestId, latitude: 18.78, longitude: 98.98, instruction: "Inspect this crossing", source: "cnx" });
  });
  it("rejects wrong or unequal-length PINs without contacting CDP", async () => {
    for (const pin of ["wrong", "", "another-test-key"]) expect((await dispatchGovernor(request({ ...payload, pin }), deps)).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("fails closed for unavailable central protection and forwards lockout duration", async () => {
    deps.authorizePin = vi.fn().mockRejectedValue(new Error("private gate error"));
    expect((await dispatchGovernor(request(), deps)).status).toBe(503);
    deps.authorizePin = vi.fn().mockResolvedValue({ accepted: false, retryAfter: 1800 });
    const locked = await dispatchGovernor(request(), deps);
    expect(locked.status).toBe(429); expect(locked.headers.get("retry-after")).toBe("1800");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("requires exact same-origin JSON, including an Origin header", async () => {
    expect((await dispatchGovernor(request(payload, { origin: "https://elsewhere.test" }), deps)).status).toBe(403);
    expect((await dispatchGovernor(request(payload, { "sec-fetch-site": "cross-site" }), deps)).status).toBe(403);
    expect((await dispatchGovernor(request(payload, { "content-type": "text/plain" }), deps)).status).toBe(415);
    const missing = request(); missing.headers.delete("origin");
    expect((await dispatchGovernor(missing, deps)).status).toBe(403);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("fails closed for missing config and unsafe or generic bridge URLs", async () => {
    for (const bridgeUrl of ["", "https://example.org/api/v2/cnx/governor-dispatch", "http://cdp.nonarkara.org/api/v2/cnx/governor-dispatch", "https://cdp.nonarkara.org/api/reports", "https://cdp.nonarkara.org/api/v2/cnx/governor-dispatch?token=bad", "https://user@cdp.nonarkara.org/api/v2/cnx/governor-dispatch"]) {
      expect((await dispatchGovernor(request(), { ...deps, config: { ...deps.config, bridgeUrl } })).status).toBe(503);
    }
    expect((await dispatchGovernor(request(), { ...deps, config: { ...deps.config, bridgeKey: "" } })).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("bounds attempts, including wrong PINs, and fails closed on missing limiter", async () => {
    deps.allowAttempt = vi.fn().mockResolvedValue(false);
    const response = await dispatchGovernor(request({ ...payload, pin: "wrong" }), deps);
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    deps.allowAttempt = vi.fn().mockRejectedValue(new Error("private limiter failure"));
    const failure = await dispatchGovernor(request(), deps);
    expect(failure.status).toBe(503); expect(await failure.text()).not.toContain("private");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("rejects arbitrary recipients, malformed coordinates, text and identities", async () => {
    for (const patch of [{ chatId: "forbidden" }, { recipient: "forbidden" }, { latitude: 91 }, { longitude: -181 }, { latitude: "18" }, { instruction: " " }, { instruction: "x".repeat(2001) }, { instruction: "bad\u0000text" }, { requestId: "not-an-id" }]) {
      expect((await dispatchGovernor(request({ ...payload, ...patch }), deps)).status).toBe(400);
    }
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("caps actual streamed bytes even with a false length header", async () => {
    expect((await dispatchGovernor(request({ ...payload, instruction: "x".repeat(9000) }, { "content-length": "1" }), deps)).status).toBe(413);
    expect((await dispatchGovernor(request(payload, { "content-length": "9000" }), deps)).status).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("does not turn upstream errors, invalid receipts, or timeouts into success", async () => {
    for (const response of [Response.json({ error: "private upstream" }, { status: 403 }), Response.json({ requestId, id: "x", status: "delivered" }), Response.json({ requestId, id: "x", status: ["sent"] }), Response.json({ requestId: "wrong", id: "x", status: "sent" }), new Response("not-json"), new Response("x".repeat(5000))]) {
      deps.fetch = vi.fn().mockResolvedValue(response);
      const result = await dispatchGovernor(request(), deps);
      expect(result.status).toBe(502); expect(await result.text()).not.toContain("private upstream");
    }
    deps.fetch = vi.fn().mockRejectedValue(new Error("secret-token-url"));
    const timeout = await dispatchGovernor(request(), deps);
    expect(timeout.status).toBe(502); expect(await timeout.text()).not.toContain("secret-token-url");
  });
  it("reports sent only when the bridge explicitly confirms it", async () => {
    deps.fetch = vi.fn().mockResolvedValue(Response.json({ requestId, id: "outbox_123", status: "sent" }));
    expect((await dispatchGovernor(request(), deps)).status).toBe(200);
  });
});
