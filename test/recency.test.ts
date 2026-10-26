import { assert } from "chai";
import { Recency } from "../src/modules/recency";

const DAY = 24 * 60 * 60 * 1000;

describe("recency", function () {
  it("decays with a two-week half-life", function () {
    let now = 100 * DAY;
    const recency = new Recency(() => now);
    recency.setLastRead(1, now - 14 * DAY);
    assert.closeTo(recency.score(1), 0.5, 1e-9);
    now += 14 * DAY;
    assert.closeTo(recency.score(1), 0.25, 1e-9);
  });

  it("dedupes rapid picks and counts spaced ones", function () {
    let now = 100 * DAY;
    const recency = new Recency(() => now);
    assert.isTrue(recency.pick(1));
    assert.isFalse(recency.pick(1));
    now += DAY;
    assert.isTrue(recency.pick(1));
    assert.isAbove(recency.score(1), 1.9);
  });

  it("ranks top items and round-trips picks", function () {
    const now = 100 * DAY;
    const recency = new Recency(() => now);
    recency.setLastRead(1, now - 30 * DAY);
    recency.setLastRead(2, now - DAY);
    recency.pick(3);
    assert.deepEqual(recency.top(3), [3, 2, 1]);

    const restored = new Recency(() => now);
    restored.loadPicks(recency.serializePicks());
    assert.deepEqual(restored.top(3), [3]);
  });
});
