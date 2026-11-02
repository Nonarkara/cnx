import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { authorizePin, initializePinStorage } from "../../../scripts/governor-pin-policy.mjs";

const databases: DatabaseSync[] = [];
function fixture() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  const storage = {
    sql: { exec(query: string, ...values: (string | number)[]) {
      const statement = db.prepare(query);
      // StatementSync.columns() is newer than the CI baseline (Node 22.12).
      const rows = /^\s*SELECT\b/i.test(query) ? statement.all(...values) : (statement.run(...values), []);
      return { toArray: () => rows };
    } },
    transactionSync<T>(callback: () => T): T {
      db.exec("BEGIN");
      try { const result = callback(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  initializePinStorage(storage);
  return { db, storage };
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
describe("one-credential durable PIN budget", () => {
  it("serializes concurrent guesses and locks the entire credential after five failures", async () => {
    const { storage, db } = fixture();
    const results = await Promise.all(Array.from({ length: 40 }, () => authorizePin(storage, "test-secret", "wrong", () => 1000)));
    expect(results.every(result => !result.accepted)).toBe(true);
    expect(results.filter(result => result.retryAfter === 1800)).toHaveLength(36);
    expect(db.prepare("SELECT failures, strikes, locked_until FROM pin_guard").get()).toMatchObject({ failures: 0, strikes: 1, locked_until: 1801000 });
    expect(await authorizePin(storage, "test-secret", "test-secret", () => 1000)).toEqual({ accepted: false, retryAfter: 1800 });
  });
  it("keeps failure counts and cooldown after new instances initialize the same persistent SQL state", async () => {
    const { storage, db } = fixture();
    for (let i = 0; i < 4; i++) await authorizePin(storage, "test-secret", "wrong", () => 1000);
    initializePinStorage(storage);
    expect(await authorizePin(storage, "test-secret", "wrong", () => 1000)).toEqual({ accepted: false, retryAfter: 1800 });
    initializePinStorage(storage);
    expect(await authorizePin(storage, "test-secret", "test-secret", () => 2000)).toEqual({ accepted: false, retryAfter: 1799 });
    expect(JSON.stringify(db.prepare("SELECT * FROM pin_guard").all())).not.toContain("test-secret");
  });
  it("doubles successive lockouts, caps at 24h and never extends a lock for blocked traffic", async () => {
    const { storage } = fixture();
    let time = 1000;
    for (const seconds of [1800, 3600, 7200, 14400, 28800, 57600, 86400, 86400]) {
      for (let i = 0; i < 4; i++) expect(await authorizePin(storage, "test-secret", "wrong", () => time)).toEqual({ accepted: false });
      expect(await authorizePin(storage, "test-secret", "wrong", () => time)).toEqual({ accepted: false, retryAfter: seconds });
      expect(await authorizePin(storage, "test-secret", "wrong", () => time + 1000)).toEqual({ accepted: false, retryAfter: seconds - 1 });
      time += seconds * 1000;
    }
  });
  it("resets the failed count only after a valid unlocked authorization", async () => {
    const { storage, db } = fixture();
    for (let i = 0; i < 4; i++) await authorizePin(storage, "test-secret", "wrong", () => 1000);
    expect(await authorizePin(storage, "test-secret", "test-secret", () => 1000)).toEqual({ accepted: true });
    expect(db.prepare("SELECT failures, strikes, locked_until FROM pin_guard").get()).toMatchObject({ failures: 0, strikes: 0, locked_until: 0 });
  });
  it("rejects missing secret, corrupt state, storage errors and unsupported storage", async () => {
    const { storage, db } = fixture();
    await expect(authorizePin(storage, "", "test", () => 1000)).rejects.toThrow("unavailable");
    await expect(authorizePin({}, "test-secret", "test", () => 1000)).rejects.toThrow("unavailable");
    db.exec("UPDATE pin_guard SET failures = 99");
    await expect(authorizePin(storage, "test-secret", "test-secret", () => 1000)).rejects.toThrow("unavailable");
    expect(() => initializePinStorage({})).toThrow("unavailable");
  });
  it("counts malformed RPC values as failed attempts", async () => {
    const { storage, db } = fixture();
    for (const input of [null, {}, "x".repeat(129)]) expect(await authorizePin(storage, "test-secret", input, () => 1000)).toEqual({ accepted: false });
    expect(db.prepare("SELECT failures FROM pin_guard").get()).toMatchObject({ failures: 3 });
  });
});
