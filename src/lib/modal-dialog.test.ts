// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateModalDialog } from "./modal-dialog";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.reverse().forEach((cleanup) => cleanup());
  cleanups.length = 0;
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});
function open() {
  document.body.innerHTML = '<button id="launch-dialog">Open</button><div id="dialog" tabindex="-1"><button id="first" tabindex="0">Close</button><button hidden>Hidden</button><a href="#" id="last" tabindex="0">Source</a></div>';
  const opener = document.querySelector<HTMLElement>('#launch-dialog')!;
  opener.focus();
  const dialog = document.querySelector<HTMLElement>('#dialog')!;
  const close = vi.fn();
  const cleanup = activateModalDialog(dialog, close);
  cleanups.push(cleanup);
  return { opener, dialog, close, cleanup };
}

describe('modal dialog keyboard behaviour', () => {
  it('moves focus inside, traps forward and backward Tab, and blocks background focus', () => {
    const { opener } = open();
    const first = document.querySelector<HTMLElement>('#first')!;
    const last = document.querySelector<HTMLElement>('#last')!;
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);
    opener.focus();
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe('hidden');
  });
  it('restores focus and scrolling when closed', () => {
    const { opener, cleanup } = open();
    cleanup();
    cleanups.pop();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });
  it('Escape closes only the top dialog; closing it returns focus to the underlying dialog', () => {
    const { close, dialog } = open();
    const nested = document.createElement('div');
    nested.tabIndex = -1;
    nested.innerHTML = '<button tabindex="0">Nested close</button>';
    dialog.append(nested);
    const nestedClose = vi.fn();
    const cleanup = activateModalDialog(nested, nestedClose);
    cleanups.push(cleanup);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(nestedClose).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    cleanup();
    cleanups.pop();
    expect(document.activeElement?.id).toBe('first');
    expect(document.body.style.overflow).toBe('hidden');
  });
});
