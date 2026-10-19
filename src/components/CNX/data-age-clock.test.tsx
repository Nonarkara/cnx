// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DataAge } from "./CNXDataAge";

vi.mock("../../hooks/useLang", () => ({ useLang: () => ({ lang: "en" }) }));

it("refreshes its clock when a current observation arrives between timer ticks", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const start = Date.parse("2026-10-15T01:00:00Z");
  vi.setSystemTime(start);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(DataAge, { source: "Measured", observedAt: start })));
    const time = container.querySelector("time");
    expect(time?.dateTime).toBe("2026-10-15T01:00:00.000Z");
    expect(time?.title).toContain("08:00");
    expect(time?.title).toContain("UTC+7");
    // Move wall time without firing the 30-second display interval.
    vi.setSystemTime(start + 10_000);
    await act(async () => root.render(createElement(DataAge, { source: "Measured", observedAt: start + 10_000 })));
    expect(container.textContent).toBe("Measured · just now");
    await act(async () => root.render(createElement(DataAge, { source: "Measured", observedAt: start + 3_600_000 })));
    expect(container.textContent).toContain("timestamp is in the future");
    await act(async () => root.render(createElement(DataAge, { source: "Measured", observedAt: "invalid" })));
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).toContain("timestamp unreadable");
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
