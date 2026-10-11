// One language per mode (Palette slop field guide, pattern B3): the board
// shows Thai OR English, never both stacked. Thai is the default — the
// governor's office reads Thai. Source data (news headlines, place and
// shelter names, agency names) is shown as published in either mode; the
// interface around it follows the mode.

export type Lang = "th" | "en";

export const DEFAULT_LANG: Lang = "th";
export const LANG_STORAGE_KEY = "cnx-lang";

/** Pick the string for the current mode. A missing English string falls back
 *  to Thai rather than rendering blank. */
export function pick(lang: Lang, th: string, en: string | null | undefined): string {
  return lang === "en" && en ? en : th;
}

export function isLang(v: unknown): v is Lang {
  return v === "th" || v === "en";
}

const THAI = /[฀-๿]/g;

/** Thai characters in a string — the B3 test counts these in English mode. */
export function thaiCharCount(s: string): number {
  return (s.match(THAI) ?? []).length;
}
