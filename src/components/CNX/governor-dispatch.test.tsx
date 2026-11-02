// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetLangForTests } from "../../hooks/useLang";
import CnxGovernorDispatch from "./CNXGovernorDispatch";
const KEY = "cnx-pending-governor-dispatch";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); __resetLangForTests("en"); sessionStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<CnxGovernorDispatch latitude={18.78} longitude={98.98} onClose={() => {}} />));
it("recovers the exact uncertain payload across a remount without retaining the PIN", async () => {
  const pending = { requestId: "11111111-1111-4111-8111-111111111111", latitude: 19.1, longitude: 99.1, instruction: "Check this road" };
  sessionStorage.setItem(KEY, JSON.stringify(pending));
  const transport = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", transport);
  await render();
  expect(container.textContent).toContain(pending.requestId); expect(container.textContent).toContain("19.10000, 99.10000");
  const text = container.querySelector("textarea")!;
  expect(text.value).toBe(pending.instruction); expect(text.disabled).toBe(true);
  expect(container.querySelector("input")!.value).toBe("");
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject(pending);
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(pending);
  expect(sessionStorage.getItem(KEY)).not.toContain('"pin"');
});
it("removes a pending request only on its matching receipt", async () => {
  const pending = { requestId: "11111111-1111-4111-8111-111111111111", latitude: 19.1, longitude: 99.1, instruction: "Check this road" };
  sessionStorage.setItem(KEY, JSON.stringify(pending));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ receipt: { requestId: pending.requestId, id: "outbox-1", status: "queued" } }, { status: 202 })));
  await render();
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(sessionStorage.getItem(KEY)).toBeNull(); expect(container.textContent).toContain("Queued for delivery");
  expect(container.textContent).toContain("does not confirm acknowledgement or completion");
});
it("freezes an unconfirmed payload after a mismatched success receipt", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ receipt: { requestId: "different", id: "outbox-1", status: "sent" } }));
  vi.stubGlobal("fetch", transport);
  await render();
  const textarea = container.querySelector("textarea")!;
  expect(textarea.disabled).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Check this road");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(JSON.parse(transport.mock.calls[0][1].body).instruction).toBe("Check this road");
  expect(container.querySelector("textarea")!.disabled).toBe(true);
  expect(sessionStorage.getItem(KEY)).not.toBeNull(); expect(container.textContent).toContain("Delivery is unconfirmed");
});
