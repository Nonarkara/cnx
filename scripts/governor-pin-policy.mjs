const INITIAL_LOCK_MS = 30 * 60_000;
const MAX_LOCK_MS = 24 * 60 * 60_000;

export function initializePinStorage(storage) {
  if (!storage?.sql || typeof storage.transactionSync !== "function") throw new Error("PIN protection unavailable");
  storage.transactionSync(() => {
    storage.sql.exec("CREATE TABLE IF NOT EXISTS pin_guard (id INTEGER PRIMARY KEY CHECK (id = 1), failures INTEGER NOT NULL, strikes INTEGER NOT NULL, locked_until INTEGER NOT NULL)");
    storage.sql.exec("INSERT OR IGNORE INTO pin_guard (id, failures, strikes, locked_until) VALUES (1, 0, 0, 0)");
  });
}

async function secretMatches(supplied, secret) {
  const hashes = await Promise.all([supplied, secret].map(value => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const left = new Uint8Array(hashes[0]);
  const right = new Uint8Array(hashes[1]);
  const subtle = crypto.subtle;
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(left, right);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

/** All state decisions happen synchronously in the one credential's transaction. */
export async function authorizePin(storage, secret, supplied, now = Date.now) {
  if (!storage?.sql || typeof storage.transactionSync !== "function" || typeof secret !== "string" || !secret || secret.length > 128) throw new Error("PIN protection unavailable");
  // Malformed RPC input is a failed attempt too; it cannot bypass the budget.
  const validInput = typeof supplied === "string" && supplied.length <= 128;
  const matches = await secretMatches(validInput ? supplied : "", secret);
  return storage.transactionSync(() => {
    const rows = storage.sql.exec("SELECT failures, strikes, locked_until FROM pin_guard WHERE id = 1").toArray();
    const state = rows[0];
    if (!state || ![state.failures, state.strikes, state.locked_until].every(n => Number.isSafeInteger(n) && n >= 0) || state.failures >= 5) throw new Error("PIN protection unavailable");
    const time = now();
    if (state.locked_until > time) return { accepted: false, retryAfter: Math.ceil((state.locked_until - time) / 1000) };
    if (validInput && matches) {
      storage.sql.exec("UPDATE pin_guard SET failures = ?, strikes = ?, locked_until = ? WHERE id = 1", 0, 0, 0);
      return { accepted: true };
    }
    const failures = state.failures + 1;
    const strikes = state.strikes + (failures === 5 ? 1 : 0);
    const lockMs = failures === 5 ? Math.min(MAX_LOCK_MS, INITIAL_LOCK_MS * 2 ** Math.min(strikes - 1, 6)) : 0;
    storage.sql.exec("UPDATE pin_guard SET failures = ?, strikes = ?, locked_until = ? WHERE id = 1", failures === 5 ? 0 : failures, strikes, lockMs ? time + lockMs : 0);
    return { accepted: false, ...(lockMs ? { retryAfter: lockMs / 1000 } : {}) };
  });
}
