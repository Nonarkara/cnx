/** A one-minute assessment poll may miss ten cycles before it loses currency. */
export function isVerdictCurrent(computedAt: string, now = Date.now()): boolean {
  const stamp = Date.parse(computedAt);
  return Number.isFinite(stamp) && now - stamp >= -60_000 && now - stamp <= 600_000;
}
