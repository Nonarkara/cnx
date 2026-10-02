import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../../../lib/cnx/snapshot-store", () => ({ summariseRecentDays: vi.fn(async (days: number) => ({ days })) }));
import { summariseRecentDays } from "../../../../lib/cnx/snapshot-store";
import { GET } from "./route";
afterEach(() => vi.clearAllMocks());
it.each(["nope", "Infinity"])("rejects invalid days %s without reading stored files", async (days) => {
  expect((await GET(new Request(`https://cnx.test/trend?days=${days}`))).status).toBe(400);
  expect(summariseRecentDays).not.toHaveBeenCalled();
});
it("bounds fractional and oversized date windows", async () => {
  await GET(new Request("https://cnx.test/trend?days=1000.5"));
  expect(summariseRecentDays).toHaveBeenCalledWith(90);
});
