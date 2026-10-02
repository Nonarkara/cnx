import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
vi.mock("../../../../lib/cnx/opensky", () => ({ fetchAircraftMetadata: vi.fn(async () => []) }));
import { fetchAircraftMetadata } from "../../../../lib/cnx/opensky";
afterEach(() => vi.clearAllMocks());
it.each(["not-an-aircraft", "abcdef,../../token", "abcde", "abcdefg"])("rejects invalid aircraft ID %s before upstream", async (id) => {
  const response = await GET(new Request(`https://cnx.test/api/cnx/aircraft?icao24=${encodeURIComponent(id)}`));
  expect(response.status).toBe(400);
  expect(fetchAircraftMetadata).not.toHaveBeenCalled();
});
it("accepts actual six-digit hex ICAO IDs", async () => {
  expect((await GET(new Request("https://cnx.test/api/cnx/aircraft?icao24=abcdef,ABC123"))).status).toBe(200);
  expect(fetchAircraftMetadata).toHaveBeenCalledWith(["abcdef", "ABC123"]);
});
