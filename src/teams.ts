// Splitting a list of names into teams.

/** Fisher-Yates with the caller's random source, so tests can fix the order. */
export function shuffled<T>(list: T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Deals names round the table into `count` teams, so sizes differ by at most one. */
export function deal(names: string[], count: number): string[][] {
  const teams: string[][] = Array.from({ length: Math.max(1, Math.min(count, names.length)) }, () => []);
  names.forEach((n, i) => teams[i % teams.length].push(n));
  return teams;
}

export const parseNames = (text: string) => text.split(/\r?\n|,|;|\t/).map((s) => s.trim()).filter(Boolean);
