import { test } from "node:test";
import assert from "node:assert/strict";
import { doubleElimination, roundRobin, seedOrder, singleElimination, type Match, type Source } from "./bracket.ts";

const seeds = (ms: Match[]) => ms.flatMap((m) => m.sources).filter((s): s is Extract<Source, { kind: "seed" }> => s.kind === "seed").map((s) => s.seed).sort((a, b) => a - b);

/** Plays a bracket through, the higher seed always winning, and returns how many games each team lost. */
function play(ms: Match[], upset = false) {
  const win = new Map<string, number>(), lose = new Map<string, number>(), losses = new Map<number, number>();
  const team = (s: Source) => (s.kind === "seed" ? s.seed : s.kind === "winner" ? win.get(s.match) : lose.get(s.match));
  for (const m of [...ms].sort((a, b) => a.number - b.number)) {
    const a = team(m.sources[0]), b = team(m.sources[1]);
    assert.ok(a && b, `game ${m.id} is played before its teams are known`);
    assert.notEqual(a, b, `game ${m.id} has one team on both sides`);
    if (m.ifNecessary && (losses.get(a) ?? 0) !== (losses.get(b) ?? 0)) continue;
    const better = upset ? Math.max(a, b) : Math.min(a, b), worse = a === better ? b : a;
    win.set(m.id, better); lose.set(m.id, worse);
    losses.set(worse, (losses.get(worse) ?? 0) + 1);
  }
  return losses;
}

test("seed order keeps the top seeds apart", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
});

test("single elimination: one game fewer than teams, every team placed once", () => {
  for (let n = 2; n <= 64; n++) {
    const ms = singleElimination(n);
    assert.equal(ms.length, n - 1, `${n} teams`);
    assert.deepEqual(seeds(ms), Array.from({ length: n }, (_, i) => i + 1), `${n} teams`);
    const losses = play(ms);
    assert.equal([...losses.values()].every((v) => v === 1), true);
    assert.equal(losses.size, n - 1, `${n} teams: everyone but the champion loses once`);
  }
});

test("single elimination: byes go to the top seeds", () => {
  const ms = singleElimination(6);
  const firstRound = ms.filter((m) => m.round === 1).flatMap((m) => m.sources).map((s) => (s.kind === "seed" ? s.seed : 0));
  assert.deepEqual(firstRound.sort(), [3, 4, 5, 6]);
});

test("single elimination with a third-place game", () => {
  assert.equal(singleElimination(8, { thirdPlace: true }).length, 8);
  // Three teams: one semifinal is a bye, so there is only one semifinal loser and no game to play.
  assert.equal(singleElimination(3, { thirdPlace: true }).length, 2);
  assert.equal(singleElimination(2, { thirdPlace: true }).length, 1);
});

test("double elimination: 2n-2 games, nobody out before a second loss", () => {
  for (let n = 2; n <= 64; n++) {
    for (const upset of [false, true]) {
      const ms = doubleElimination(n);
      assert.equal(ms.length, 2 * n - 2, `${n} teams`);
      assert.deepEqual(seeds(ms), Array.from({ length: n }, (_, i) => i + 1), `${n} teams`);
      const losses = play(ms, upset);
      const counts = [...losses.values()].sort();
      assert.equal(counts.filter((v) => v === 2).length, n - 1, `${n} teams: all but the champion lose twice`);
      assert.ok(counts.every((v) => v <= 2), `${n} teams: nobody plays on after two losses`);
    }
  }
});

test("double elimination reset is one extra game, played only when needed", () => {
  const ms = doubleElimination(8, { reset: true });
  assert.equal(ms.length, 15);
  assert.equal(ms.filter((m) => m.ifNecessary).length, 1);
  play(ms); play(ms, true);
});

test("double elimination: nine teams is one play-in game, not seven byes drawn as games", () => {
  const ms = doubleElimination(9);
  assert.equal(ms.filter((m) => m.side === "W" && m.round === 1).length, 1);
  assert.equal(ms.length, 16);
});

test("game numbers run 1..n with no gaps", () => {
  for (const n of [3, 5, 8, 9, 13, 16, 31]) {
    for (const ms of [singleElimination(n), doubleElimination(n, { reset: true })]) {
      assert.deepEqual(ms.map((m) => m.number).sort((a, b) => a - b), ms.map((_, i) => i + 1));
    }
  }
});

test("round robin: everyone meets everyone once, nobody plays twice in a round", () => {
  for (let n = 3; n <= 20; n++) {
    const { rounds, byes } = roundRobin(n);
    const games = rounds.flat();
    assert.equal(games.length, (n * (n - 1)) / 2, `${n} teams`);
    assert.equal(new Set(games.map((g) => [g.home, g.away].sort((a, b) => a - b).join("v"))).size, games.length);
    for (const r of rounds) assert.equal(new Set(r.flatMap((g) => [g.home, g.away])).size, r.length * 2);
    assert.equal(rounds.length, n % 2 ? n : n - 1);
    assert.equal(byes.length, n % 2 ? n : 0);
  }
  assert.equal(roundRobin(4, true).rounds.flat().length, 12);
});

test("double elimination keeps teams that have met apart for as long as the size allows", () => {
  // Coin-flip every game with a fixed random sequence and count pairings that happen twice,
  // leaving out the losers final and the grand final, where a repeat cannot be avoided.
  let seed = 12345;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const limit: Record<number, number> = { 8: 0.27, 16: 0.43, 32: 0.42, 64: 0.39 };
  for (const n of [8, 16, 32, 64]) {
    const ms = [...doubleElimination(n)].sort((a, b) => a.number - b.number), lastL = Math.max(...ms.filter((m) => m.side === "L").map((m) => m.round));
    const trials = 6000; let repeats = 0, firstRound = Infinity;
    for (let t = 0; t < trials; t++) {
      const win = new Map<string, number>(), lose = new Map<string, number>(), met = new Set<number>();
      for (const m of ms) {
        const [a, b] = m.sources.map((s) => (s.kind === "seed" ? s.seed : s.kind === "winner" ? win.get(s.match)! : lose.get(s.match)!));
        const k = Math.min(a, b) * 100 + Math.max(a, b);
        if (met.has(k) && m.side === "L" && m.round < lastL) { repeats++; firstRound = Math.min(firstRound, m.round); }
        met.add(k);
        const aWins = rnd() < 0.5; win.set(m.id, aWins ? a : b); lose.set(m.id, aWins ? b : a);
      }
    }
    assert.ok(repeats / trials < limit[n], `${n} teams: ${(repeats / trials).toFixed(3)} repeat pairings a tournament, first in losers round ${firstRound}`);
    assert.ok(firstRound >= { 8: 3, 16: 4, 32: 5, 64: 7 }[n]!, `${n} teams: a repeat as early as losers round ${firstRound}`);
  }
});

test("time slots: one court plays one game at a time, enough courts play a round at a time", async () => {
  const { slots, roundRobinSlots } = await import("./schedule.ts");
  for (const n of [4, 7, 8, 13, 16, 32]) {
    assert.equal(slots(singleElimination(n), 1), n - 1);
    assert.equal(slots(doubleElimination(n), 1), 2 * n - 2);
    assert.equal(slots(singleElimination(n), 64), Math.ceil(Math.log2(n)));
    assert.ok(slots(doubleElimination(n), 2) <= slots(doubleElimination(n), 1));
  }
  assert.equal(slots(doubleElimination(8), 64), 6);
  assert.equal(roundRobinSlots(8, 4), 7);
  assert.equal(roundRobinSlots(8, 2), 14);
  assert.equal(roundRobinSlots(5, 2), 5);
});

test("random teams: everyone placed once, sizes differ by at most one", async () => {
  const { deal, shuffled, parseNames } = await import("./teams.ts");
  for (const [n, k] of [[10, 3], [7, 2], [12, 4], [5, 5], [3, 8]]) {
    const names = Array.from({ length: n }, (_, i) => `p${i}`), teams = deal(shuffled(names), k);
    assert.deepEqual(teams.flat().sort(), [...names].sort());
    const sizes = teams.map((t) => t.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.equal(teams.length, Math.min(n, k));
  }
  assert.deepEqual(parseNames("a, b\nc;\n\n d "), ["a", "b", "c", "d"]);
});
