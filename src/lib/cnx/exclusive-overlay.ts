/**
 * Two overlays on this board can sit over the map's own controls, so only
 * one of them may be open at a time: the verdict band's evidence panel and
 * the map's Layers control.
 *
 * Why this has to be enforced: the panel is right-anchored to the band and
 * is 358 px wide at a 390 px viewport, while the Layers control opens over
 * the map's left column. With both open, the panel covered 95% of the
 * basemap `<select>` at 390 px and 15% at 768 px — the same defect class
 * `docs/SHIP-AUDIT.md` records as already paid for once ("Desktop verdict
 * overlay covered map controls"). Two open overlays are the user's doing;
 * one of them being unreachable is not.
 *
 * The two live in different trees — the band's `<details>` and a map the
 * page loads dynamically — so the agreement is made on the document.
 */

/** Every exclusive overlay on the board has an id. */
export type ExclusiveOverlayId = "verdict-panel" | "map-layers";

export const EXCLUSIVE_OVERLAY_EVENT = "cnx:exclusive-overlay";

/**
 * Announce that an exclusive overlay has opened. Every other exclusive
 * overlay closes itself in response.
 */
export function claimExclusiveOverlay(id: ExclusiveOverlayId): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent<{ id: ExclusiveOverlayId }>(EXCLUSIVE_OVERLAY_EVENT, { detail: { id } }),
  );
}

/**
 * Close this overlay whenever another one opens. Returns the unsubscribe.
 *
 * The handler ignores its own claim, so opening an overlay that is already
 * open cannot close it, and two overlays cannot close each other in a loop.
 */
export function onExclusiveOverlay(id: ExclusiveOverlayId, close: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ id: ExclusiveOverlayId }>).detail;
    if (detail && detail.id !== id) close();
  };
  document.addEventListener(EXCLUSIVE_OVERLAY_EVENT, handler);
  return () => document.removeEventListener(EXCLUSIVE_OVERLAY_EVENT, handler);
}
