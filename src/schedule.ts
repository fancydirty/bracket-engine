// How many time slots a bracket needs on a given number of courts.
import type { Match } from "./bracket.ts";

/**
 * Plays the games in numbered order, as many per slot as there are courts, never starting a game
 * before both games that feed it are over. A slot is one game length. The "if needed" second
 * grand final is left out.
 */
export function slots(matches: Match[], courts: number): number {
  const done = new Map<string, number>();
  const waiting = matches.filter((m) => !m.ifNecessary).sort((a, b) => a.number - b.number);
  let slot = 0;
  while (waiting.length) {
    slot++;
    let used = 0;
    for (let i = 0; i < waiting.length && used < courts;) {
      const m = waiting[i];
      if (m.sources.every((s) => s.kind === "seed" || (done.get(s.match) ?? Infinity) < slot)) { done.set(m.id, slot); waiting.splice(i, 1); used++; } else i++;
    }
  }
  return slot;
}

/** Round robin, the simple way: finish a round before starting the next. */
export const roundRobinSlots = (teams: number, courts: number) => (teams % 2 ? teams : teams - 1) * Math.ceil(Math.floor(teams / 2) / courts);
