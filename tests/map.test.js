import test from "node:test";
import assert from "node:assert/strict";
import {
  NavigationMap,
  mapProject,
  mapUnproject,
  encodeExploration,
  decodeExploration,
} from "../src/map.js";

test("field map projection round-trips negative coordinates at every zoom range", () => {
  for (const scale of [0.35, 0.8, 1, 3.2, 7, 12])
    for (const x of [-1600, -1, 0, 2.4, 49000]) {
      const center = { x: 41, z: -128 },
        p = mapProject(x, -731, center, scale, 1100, 640),
        q = mapUnproject(p.x, p.y, center, scale, 1100, 640);
      assert.ok(Math.abs(q.x - x) < 1e-9);
      assert.ok(Math.abs(q.z + 731) < 1e-9);
    }
});
test("map center and north keep the same world direction under zoom", () => {
  const center = { x: -144, z: 80 };
  assert.deepEqual(mapProject(-144, 80, center, 3, 800, 500), {
    x: 400,
    y: 250,
  });
  assert.ok(mapProject(-144, 79, center, 3, 800, 500).y < 250);
  assert.ok(mapProject(-145, 80, center, 3, 800, 500).x < 400);
});
test("compact exploration serialization preserves crossed negative chunk boundaries", () => {
  const visited = new Set(["-125,-6", "0,0", "174,384", "-1,0"]);
  assert.deepEqual(decodeExploration(encodeExploration(visited)), visited);
  assert.deepEqual(decodeExploration("0.0|0.0|-1.0"), new Set(["0,0", "-1,0"]));
});
test("malformed and oversized exploration cannot create invalid map cells", () => {
  assert.equal(
    decodeExploration("not-data|Infinity.1|__proto__.0|NaN.8|.0").size,
    0,
  );
  assert.equal(decodeExploration("a".repeat(2000001)).size, 0);
  assert.equal(decodeExploration(null).size, 0);
  assert.deepEqual(
    decodeExploration("bad|0.0|overflowoverflow.0"),
    new Set(["0,0"]),
  );
});

test("large expedition records split safely within save string size limits and reload", () => {
  const explored = new Set(
    Array.from({ length: 20000 }, (_, i) => `${i - 10000},${(i % 200) - 100}`),
  );
  const source = { explored, waypoint: { x: -12, z: 45 } },
    data = NavigationMap.prototype.toJSON.call(source);
  assert.ok(Array.isArray(data.explored));
  assert.ok(data.explored.every((s) => s.length <= 60000));
  const target = {
    tiles: new Map(),
    queue: [],
    queued: new Set(),
    failedTiles: new Set(),
    discoveryRevision: 0,
    schedule() {},
  };
  NavigationMap.prototype.load.call(target, data);
  assert.deepEqual(target.explored, explored);
  assert.deepEqual(target.waypoint, source.waypoint);
});
