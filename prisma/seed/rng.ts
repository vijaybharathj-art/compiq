// Deterministic PRNG so re-running the seed produces stable demo data
// (mulberry32 — small, fast, good enough distribution for fixtures).

export function createRng(seed: number) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof createRng>;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function pickN<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool.splice(idx, 1)[0]!);
  }
  return result;
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function daysAgoIso(baseIso: string, days: number, hour = 9, minute = 0): string {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function daysFromIso(baseIso: string, days: number, hour = 9, minute = 0): string {
  return daysAgoIso(baseIso, -days, hour, minute);
}
