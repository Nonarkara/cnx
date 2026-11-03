import { afterEach, expect, it, vi } from "vitest";
const { dispatch, limit, context } = vi.hoisted(() => ({ dispatch: vi.fn(), limit: vi.fn(), context: vi.fn() }));
vi.mock("../../../../lib/cnx/governor-dispatch", () => ({ dispatchGovernor: dispatch }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("loads server secrets and requires the dedicated global attempt limiter", async () => {
  vi.stubEnv("CNX_GOVERNOR_PIN", "test-secret"); vi.stubEnv("CNX_DISPATCH_BRIDGE_URL", "https://cdp.nonarkara.org/api/v2/cnx/governor-dispatch"); vi.stubEnv("CNX_DISPATCH_BRIDGE_KEY", "test-key");
  context.mockResolvedValue({ env: { CNX_RL_DISPATCH: { limit } } }); limit.mockResolvedValue({ success: false });
  dispatch.mockImplementation(async (_request, deps) => {
    expect(deps.config).toEqual({ bridgeUrl: "https://cdp.nonarkara.org/api/v2/cnx/governor-dispatch", bridgeKey: "test-key" });
    expect(await deps.allowAttempt()).toBe(false);
    return new Response(null, { status: 429 });
  });
  expect((await POST(new Request("https://cnx.nonarkara.org"))).status).toBe(429);
  expect(limit).toHaveBeenCalledWith({ key: "cnx-governor-dispatch:all-attempts" });
});
it("does not silently skip a missing limiter", async () => {
  context.mockResolvedValue({ env: {} });
  dispatch.mockImplementation(async (_request, deps) => { await expect(deps.allowAttempt()).rejects.toThrow("limiter unavailable"); return new Response(null, { status: 503 }); });
  expect((await POST(new Request("https://cnx.nonarkara.org"))).status).toBe(503);
});

it("routes every credential check to the one fixed durable object", async () => {
  const authorize = vi.fn().mockResolvedValue({ accepted: false, retryAfter: 1800 });
  const getByName = vi.fn().mockReturnValue({ authorize });
  context.mockResolvedValue({ env: { CNX_GOVERNOR_GATE: { getByName } } });
  dispatch.mockImplementation(async (_request, deps) => {
    expect(await deps.authorizePin("test-only-input")).toEqual({ accepted: false, retryAfter: 1800 });
    return new Response(null, { status: 429 });
  });
  await POST(new Request("https://cnx.nonarkara.org"));
  expect(getByName).toHaveBeenCalledWith("governor-pin-v1");
  expect(authorize).toHaveBeenCalledWith("test-only-input");
});
it("fails closed without the durable object", async () => {
  context.mockResolvedValue({ env: {} });
  dispatch.mockImplementation(async (_request, deps) => { await expect(deps.authorizePin("test-only-input")).rejects.toThrow("PIN gate unavailable"); return new Response(null, { status: 503 }); });
  await POST(new Request("https://cnx.nonarkara.org"));
});
