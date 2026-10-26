const DAY_MS = 24 * 60 * 60 * 1000;
// A visit counts half as much after this long
const HALF_LIFE_MS = 14 * DAY_MS;
// Palette picks remembered per item, and items remembered overall
const MAX_PICKS_PER_ITEM = 10;
const MAX_PICKED_ITEMS = 500;
// Repeated picks of one item within this window count once
const DEDUPE_MS = 60 * 1000;

/**
 * Ranks items by how recently and often they were used. Two signals feed it:
 * - Zotero's own attachment lastRead (set on open, close and page turns,
 *   synced, and present before this plugin was installed)
 * - picks made through the palette, which also cover items without files
 */
export class Recency {
  private lastRead = new Map<number, number>();
  // Insertion order doubles as least-recently-picked order for eviction
  private picks = new Map<number, number[]>();

  constructor(private now: () => number = Date.now) {}

  setLastRead(itemID: number, ms: number) {
    if (ms > (this.lastRead.get(itemID) ?? 0)) this.lastRead.set(itemID, ms);
  }

  pick(itemID: number) {
    const now = this.now();
    const times = this.picks.get(itemID) ?? [];
    if (times.length && now - times[times.length - 1] < DEDUPE_MS) return false;
    times.push(now);
    if (times.length > MAX_PICKS_PER_ITEM) times.shift();
    this.picks.delete(itemID);
    this.picks.set(itemID, times);
    if (this.picks.size > MAX_PICKED_ITEMS) {
      this.picks.delete(this.picks.keys().next().value!);
    }
    return true;
  }

  forget(itemID: number) {
    this.lastRead.delete(itemID);
    this.picks.delete(itemID);
  }

  /** Sum of exponentially decayed visits; 1.0 is roughly "used just now". */
  score(itemID: number) {
    const now = this.now();
    const decay = (t: number) =>
      Math.pow(0.5, Math.max(0, now - t) / HALF_LIFE_MS);
    let score = 0;
    const read = this.lastRead.get(itemID);
    if (read) score += decay(read);
    for (const t of this.picks.get(itemID) ?? []) score += decay(t);
    return score;
  }

  /** Most recently/frequently used items, best first. */
  top(limit: number) {
    const ids = new Set([...this.lastRead.keys(), ...this.picks.keys()]);
    return [...ids]
      .map((id) => ({ id, score: this.score(id) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ id }) => id);
  }

  serializePicks() {
    return JSON.stringify(Object.fromEntries(this.picks));
  }

  loadPicks(json: string) {
    this.picks.clear();
    const parsed = JSON.parse(json || "{}") as Record<string, number[]>;
    const entries = Object.entries(parsed)
      .filter(([, times]) => Array.isArray(times) && times.length)
      // Restore least-recently-picked first so eviction order survives
      .sort(([, a], [, b]) => a[a.length - 1] - b[b.length - 1]);
    for (const [id, times] of entries) this.picks.set(Number(id), times);
  }
}
