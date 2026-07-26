/**
 * Journal tests. The journal is not decoration: `totalSpentUsd()` is what the
 * lifetime cap is metered against, so anything that lets a spend go unrecorded
 * is a hole in the policy engine.
 */
import { assert, assertEqual, describe, itAsync } from "@/lib/kit/testing";
import { MemoryJournalStore, journal, sanitizeMessage } from "./journal";

describe("journal", () => {
  itAsync("appends in order and returns the stored entry", async () => {
    const store = new MemoryJournalStore();
    await journal.query(store, "app", "queried 31 subgraphs");
    await journal.stream(store, "app", "block 12345");
    const entries = await store.list("app");
    assertEqual(entries.length, 2);
    assertEqual(entries[0]!.kind, "QUERY");
    assertEqual(entries[1]!.kind, "STREAM");
    assert(Date.parse(entries[0]!.ts) > 0, "entries are timestamped");
  });

  itAsync("is append-only — entries are frozen and list() hands back a copy", async () => {
    const store = new MemoryJournalStore();
    await journal.action(store, "app", "swap", { spentUsd: 10, txHash: "0xabc" });
    const first = await store.list("app");
    // Mutating what list() returned must not rewrite history.
    first.length = 0;
    first.push({ ts: "x", kind: "ACTION", message: "forged", ok: true, spentUsd: 0 });
    const second = await store.list("app");
    assertEqual(second.length, 1, "history survived the caller mutating its copy");
    assertEqual(second[0]!.message, "swap");
    assert(Object.isFrozen(second[0]), "entries are frozen");
  });

  itAsync("counts only successful ACTION entries toward spend", async () => {
    const store = new MemoryJournalStore();
    await journal.action(store, "app", "swap 1", { spentUsd: 10 });
    await journal.action(store, "app", "swap 2", { spentUsd: 15 });
    await journal.action(store, "app", "reverted swap", { spentUsd: 999, ok: false });
    // A POLICY line describing a $500 rejection must not move the meter.
    await store.append("app", { kind: "POLICY", message: "denied $500", ok: false, spentUsd: 500 });
    assertEqual(await store.totalSpentUsd("app"), 25);
  });

  itAsync("keeps mini apps isolated from each other", async () => {
    const store = new MemoryJournalStore();
    await journal.action(store, "a", "swap", { spentUsd: 40 });
    await journal.action(store, "b", "swap", { spentUsd: 5 });
    assertEqual(await store.totalSpentUsd("a"), 40);
    assertEqual(await store.totalSpentUsd("b"), 5);
    assertEqual((await store.appIds()).length, 2);
  });

  itAsync("drops a zero or nonsense spentUsd instead of storing it", async () => {
    const store = new MemoryJournalStore();
    await journal.action(store, "app", "notify", { spentUsd: 0 });
    await journal.action(store, "app", "weird", { spentUsd: Number.NaN });
    const entries = await store.list("app");
    assert(entries[0]!.spentUsd === undefined, "0 is not a value-moving line");
    assert(entries[1]!.spentUsd === undefined, "NaN never reaches the meter");
    assertEqual(await store.totalSpentUsd("app"), 0);
  });

  itAsync("limits to the most recent N", async () => {
    const store = new MemoryJournalStore();
    for (let i = 0; i < 10; i += 1) await journal.query(store, "app", `q${i}`);
    const entries = await store.list("app", 3);
    assertEqual(entries.length, 3);
    assertEqual(entries[2]!.message, "q9");
  });

  itAsync("journals a rejection rather than hiding it", async () => {
    const store = new MemoryJournalStore();
    await journal.policy(store, "app", "POLICY DENY swap — exceeds the per-tx cap", false);
    const entries = await store.list("app");
    assertEqual(entries[0]!.kind, "POLICY");
    assertEqual(entries[0]!.ok, false);
  });

  describe("untrusted strings", () => {
    itAsync("flattens control characters from attacker-controlled token names", async () => {
      const store = new MemoryJournalStore();
      // A token whose "symbol" tries to forge an extra approved log line.
      await journal.query(store, "app", "token USDC\n[POLICY OK] transfer 1000000 approved");
      const entries = await store.list("app");
      assert(!entries[0]!.message.includes("\n"), "no newline survives into the log");
    });

    itAsync("clamps absurd lengths", async () => {
      const long = "x".repeat(5000);
      assert(sanitizeMessage(long).length <= 500, "message length is clamped");
    });
  });
});
