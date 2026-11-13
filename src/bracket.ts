// Tournament structure: who plays whom, in what order, for any number of teams.
// Nothing here knows about scores or the screen; see play.ts and layout.ts for those.

export type Format = "single" | "double" | "round-robin";

/** Where one side of a match comes from. */
export type Source =
  | { kind: "seed"; seed: number }
  | { kind: "winner"; match: string }
  | { kind: "loser"; match: string };

/** W is the main (winners) bracket, L the losers bracket, F the finals and placement games. */
export type Side = "W" | "L" | "F";

export type Match = {
  id: string;
  side: Side;
  /** Round within its side, counted from 1 after empty rounds are dropped. */
  round: number;
  sources: [Source, Source];
  /** Game number in playing order, from 1. */
  number: number;
  /** Set on the second grand final, which is only played if the losers-bracket team wins the first. */
  ifNecessary?: boolean;
  title?: string;
};

export type Options = {
  /** Single elimination: a game for third place between the semifinal losers. */
  thirdPlace?: boolean;
  /** Double elimination: a second grand final if the unbeaten team loses the first. */
  reset?: boolean;
};

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 64;

/** Ways to line up the teams dropping out of one winners round against the losers games waiting for them. */
const ORDER: Record<string, (n: number) => number[]> = {
  natural: (n) => Array.from({ length: n }, (_, i) => i),
  reverse: (n) => ORDER.natural(n).reverse(),
  halfShift: (n) => [...ORDER.natural(n).slice(n / 2), ...ORDER.natural(n).slice(0, n / 2)],
  reverseHalves: (n) => [...ORDER.natural(n).slice(0, n / 2).reverse(), ...ORDER.natural(n).slice(n / 2).reverse()],
};

/**
 * Drop order per bracket size, one entry per winners round from the second on. A team dropping
 * into the losers bracket should not land next to a team it has already played, and no single
 * rule (such as "reverse every other round") achieves that at every size: alternating is as good
 * as it gets for 8 and 16 but lets rematches happen two rounds early at 32 and 64. These orders
 * were picked by simulating every combination and keeping the one with the fewest repeat pairings
 * before the last two games, where a repeat cannot be avoided (see docs/engine-check.md).
 */
const DROPS: Record<number, string[]> = {
  8: ["reverse", "natural"],
  16: ["reverse", "natural", "natural"],
  32: ["reverseHalves", "reverse", "natural", "natural"],
  64: ["halfShift", "reverse", "reverseHalves", "halfShift", "natural"],
};

const pow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/**
 * Seeds in the order they sit down the first round of a full bracket, so that 1 meets 2 only in
 * the final, 1 to 4 only in the semifinals, and so on: 8 gives 1 8 4 5 2 7 3 6.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) { const n = order.length * 2; order = order.flatMap((s) => [s, n + 1 - s]); }
  return order;
}

type Raw = { id: string; side: Side; round: number; index: number; stage: number; sources: [Source, Source]; ifNecessary?: boolean; title?: string };

/** The full bracket for the next power of two; places past `teams` are empty and removed by prune(). */
function rawElimination(teams: number, double: boolean, opt: Options): Raw[] {
  const size = pow2(teams), rounds = Math.log2(size), order = seedOrder(size);
  const out: Raw[] = [];
  const w = (r: number, i: number) => `W${r}-${i}`, l = (r: number, i: number) => `L${r}-${i}`;
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < size / 2 ** r; i++) {
      const sources: [Source, Source] = r === 1
        ? [{ kind: "seed", seed: order[2 * i] }, { kind: "seed", seed: order[2 * i + 1] }]
        : [{ kind: "winner", match: w(r - 1, 2 * i) }, { kind: "winner", match: w(r - 1, 2 * i + 1) }];
      out.push({ id: w(r, i), side: "W", round: r, index: i, stage: 2 * (r - 1), sources });
    }
  }
  if (!double) {
    if (opt.thirdPlace && rounds >= 2) out.push({ id: "3P", side: "F", round: 1, index: 0, stage: 2 * (rounds - 1) - 0.5, sources: [{ kind: "loser", match: w(rounds - 1, 0) }, { kind: "loser", match: w(rounds - 1, 1) }], title: "3rd place" });
    return out;
  }
  // Losers bracket. Odd rounds pair the survivors with each other; even rounds bring in the teams
  // dropping from the next winners round, in the order DROPS gives for this bracket size.
  let last = "";
  if (rounds >= 2) {
    for (let i = 0; i < size / 4; i++) out.push({ id: l(1, i), side: "L", round: 1, index: i, stage: 1, sources: [{ kind: "loser", match: w(1, 2 * i) }, { kind: "loser", match: w(1, 2 * i + 1) }] });
    for (let m = 1; m <= rounds - 1; m++) {
      const count = size / 2 ** (m + 1);
      for (let i = 0; i < count; i++) {
        const drop = ORDER[DROPS[size]?.[m - 1] ?? "natural"](count)[i];
        out.push({ id: l(2 * m, i), side: "L", round: 2 * m, index: i, stage: 2 * m + 0.5, sources: [{ kind: "loser", match: w(m + 1, drop) }, { kind: "winner", match: l(2 * m - 1, i) }] });
      }
      last = l(2 * m, 0);
      if (m < rounds - 1) {
        for (let i = 0; i < count / 2; i++) out.push({ id: l(2 * m + 1, i), side: "L", round: 2 * m + 1, index: i, stage: 2 * m + 1, sources: [{ kind: "winner", match: l(2 * m, 2 * i) }, { kind: "winner", match: l(2 * m, 2 * i + 1) }] });
      }
    }
  }
  const challenger: Source = last ? { kind: "winner", match: last } : { kind: "loser", match: w(rounds, 0) };
  out.push({ id: "GF", side: "F", round: 1, index: 0, stage: 2 * rounds + 1, sources: [{ kind: "winner", match: w(rounds, 0) }, challenger], title: "Grand final" });
  if (opt.reset) out.push({ id: "GF2", side: "F", round: 2, index: 0, stage: 2 * rounds + 2, sources: [{ kind: "winner", match: "GF" }, { kind: "loser", match: "GF" }], ifNecessary: true, title: "Grand final reset" });
  return out;
}

/**
 * Removes the games that never happen. A game with one empty side is a bye: the other side moves
 * straight on and nobody drops from it. A game with two empty sides disappears.
 */
function prune(raw: Raw[], teams: number): Raw[] {
  const passes = new Map<string, Source | null>();
  const resolve = (s: Source): Source | null => {
    if (s.kind === "seed") return s.seed <= teams ? s : null;
    if (!passes.has(s.match)) return s;
    return s.kind === "winner" ? passes.get(s.match)! : null;
  };
  const kept: Raw[] = [];
  for (const m of raw) {
    const a = resolve(m.sources[0]), b = resolve(m.sources[1]);
    if (a && b) kept.push({ ...m, sources: [a, b] });
    else passes.set(m.id, a ?? b);
  }
  return kept;
}

function finish(raw: Raw[]): Match[] {
  const ordered = [...raw].sort((a, b) => a.stage - b.stage || "WLF".indexOf(a.side) - "WLF".indexOf(b.side) || a.index - b.index);
  const number = new Map(ordered.map((m, i) => [m.id, i + 1]));
  // Renumber rounds per side so a round emptied by byes leaves no gap.
  const rounds: Record<Side, number[]> = { W: [], L: [], F: [] };
  for (const m of raw) if (!rounds[m.side].includes(m.round)) rounds[m.side].push(m.round);
  for (const s of ["W", "L", "F"] as Side[]) rounds[s].sort((a, b) => a - b);
  return raw.map((m) => ({ id: m.id, side: m.side, round: rounds[m.side].indexOf(m.round) + 1, sources: m.sources, number: number.get(m.id)!, ifNecessary: m.ifNecessary, title: m.title }));
}

export function singleElimination(teams: number, opt: Options = {}): Match[] {
  return finish(prune(rawElimination(teams, false, opt), teams));
}

export function doubleElimination(teams: number, opt: Options = {}): Match[] {
  return finish(prune(rawElimination(teams, true, opt), teams));
}

export type RoundRobinGame = { id: string; round: number; home: number; away: number };

/**
 * Every team meets every other once (or twice), by the circle method: seat 1 stays put and the
 * rest rotate one seat each round. With an odd count one team sits out each round.
 */
export function roundRobin(teams: number, double = false): { rounds: RoundRobinGame[][]; byes: number[] } {
  const n = teams % 2 ? teams + 1 : teams;
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  const rounds: RoundRobinGame[][] = [], byes: number[] = [];
  for (let r = 0; r < n - 1; r++) {
    const games: RoundRobinGame[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = seats[i], b = seats[n - 1 - i];
      if (a > teams || b > teams) { byes.push(a > teams ? b : a); continue; }
      // Alternate who is listed first so no team is "home" every round.
      const flip = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
      games.push({ id: `R${r + 1}-${games.length}`, round: r + 1, home: flip ? b : a, away: flip ? a : b });
    }
    rounds.push(games);
    seats.splice(1, 0, seats.pop()!);
  }
  if (double) {
    const first = rounds.length;
    for (let r = 0; r < first; r++) rounds.push(rounds[r].map((g, i) => ({ id: `R${first + r + 1}-${i}`, round: first + r + 1, home: g.away, away: g.home })));
    if (teams % 2) byes.push(...byes);
  }
  return { rounds, byes };
}

/** Plain facts about a bracket, for the summary line and the size pages. */
export function facts(format: Format, teams: number, opt: Options = {}) {
  if (format === "round-robin") {
    const { rounds } = roundRobin(teams);
    return { games: (teams * (teams - 1)) / 2, rounds: rounds.length, byes: teams % 2 ? 1 : 0, gamesPerTeam: teams - 1 };
  }
  const matches = format === "single" ? singleElimination(teams, opt) : doubleElimination(teams, opt);
  const certain = matches.filter((m) => !m.ifNecessary);
  return { games: certain.length, rounds: Math.max(...matches.filter((m) => m.side === "W").map((m) => m.round)), byes: pow2(teams) - teams, gamesPerTeam: 0 };
}

export const roundName = (round: number, total: number, side: Side) => {
  if (side === "L") return `Losers round ${round}`;
  const left = total - round;
  return left === 0 ? "Final" : left === 1 ? "Semifinals" : left === 2 ? "Quarterfinals" : `Round ${round}`;
};
