// Shared modal keyboard behaviour. A stack keeps nested dialogs from
// closing together and restores focus to the control that opened each one.
const dialogs: HTMLElement[] = [];
let originalOverflow = "";
const FOCUSABLE = 'a[href], button, input, select, textarea, iframe, video[controls], [tabindex]';

function controls(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (current === dialog) break;
    }
    return true;
  });
}

export function activateModalDialog(dialog: HTMLElement, onClose: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (dialogs.length === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  dialogs.push(dialog);
  const focusFirst = () => (controls(dialog)[0] ?? dialog).focus();
  focusFirst();
  const onFocus = (event: FocusEvent) => {
    if (dialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) focusFirst();
  };
  const onKey = (event: KeyboardEvent) => {
    if (dialogs.at(-1) !== dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const elements = controls(dialog);
      const first = elements[0] ?? dialog;
      const last = elements.at(-1) ?? dialog;
      if (elements.length === 0 || !dialog.contains(document.activeElement)
        || (event.shiftKey && document.activeElement === first)
        || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocus);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus);
    const index = dialogs.indexOf(dialog);
    if (index >= 0) dialogs.splice(index, 1);
    if (dialogs.length === 0) document.body.style.overflow = originalOverflow;
    if (opener?.isConnected) opener.focus();
  };
}
