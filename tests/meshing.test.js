import test from "node:test";
import assert from "node:assert/strict";
import {
  Terrain,
  meshChunk,
  CHUNK_SIZE as S,
  WORLD_HEIGHT as H,
} from "../src/worldgen.js";
const index = (x, y, z) => (y * S + z) * S + x;
const directions = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const cross = new Set([16, 21, 22, 30, 34, 36]);
const clear = new Set([0, 5, 16, 20, 21, 22, 30, 34, 36]);
const transparent = new Set([0, 5, 7, 16, 20, 21, 22, 25, 26, 30, 34, 36]);
function tile(id, n) {
  if (id === 1) return n[1] === 0 ? 37 : n[1] === -1 ? 2 : 1;
  if (id === 6 && n[1]) return 38;
  if (id === 17 && n[1] === 1) return 39;
  if (id === 18 && n[2] === 1) return 40;
  return id;
}
const key = (x, y, z, n, t) => `${x},${y},${z}|${n.join(",")}|${t}`;
function expectedFaces(terrain, cx, cz, data, edits = {}) {
  const found = new Set();
  const get = (x, y, z) =>
    y < 0
      ? 23
      : y >= H
        ? 0
        : x >= 0 && x < S && z >= 0 && z < S
          ? data[index(x, y, z)]
          : (edits[`${cx * S + x},${y},${cz * S + z}`] ??
            terrain.block(cx * S + x, y, cz * S + z));
  for (let y = 0; y < H; y++)
    for (let z = 0; z < S; z++)
      for (let x = 0; x < S; x++) {
        const id = data[index(x, y, z)];
        if (!id || id === 5 || cross.has(id)) continue;
        for (const n of directions) {
          const neighbor = get(x + n[0], y + n[1], z + n[2]);
          if (
            clear.has(neighbor) ||
            (transparent.has(neighbor) && neighbor !== id)
          )
            found.add(key(x, y, z, n, tile(id, n)));
        }
      }
  return found;
}
function rasterizedFaces(mesh) {
  const found = new Set();
  for (let q = 0; q < mesh.position.length / 18; q++) {
    const offset = q * 18,
      n = Array.from(mesh.normal.slice(offset, offset + 3)),
      axis = n.findIndex((v) => v !== 0),
      axes = [0, 1, 2].filter((a) => a !== axis);
    const corners = [0, 1, 2, 5].map((i) =>
      Array.from(mesh.position.slice(offset + i * 3, offset + i * 3 + 3)),
    );
    if (!corners.every((c) => Math.abs(c[axis] - corners[0][axis]) < 1e-6))
      continue;
    const mins = axes.map((a) => Math.min(...corners.map((c) => c[a]))),
      maxs = axes.map((a) => Math.max(...corners.map((c) => c[a])));
    if ([...mins, ...maxs].some((v) => Math.abs(v - Math.round(v)) > 1e-5))
      continue;
    const uvOffset = q * 12,
      t = mesh.atlasTile[uvOffset] + (7 - mesh.atlasTile[uvOffset + 1]) * 8;
    for (let v = mins[1]; v < maxs[1]; v++)
      for (let u = mins[0]; u < maxs[0]; u++) {
        const p = [];
        p[axis] = corners[0][axis] - (n[axis] > 0 ? 1 : 0);
        p[axes[0]] = u;
        p[axes[1]] = v;
        const face = key(...p, n, t);
        assert.ok(!found.has(face), `duplicate face ${face}`);
        found.add(face);
      }
  }
  return found;
}
test("greedy rectangles cover the same textured voxel faces over seeded and edited chunk boundaries", () => {
  for (const [seed, cx, cz] of [
    ["wildbound", 0, 0],
    ["qa-sunrise-42", -1, -1],
    ["a-cavern", 2, -3],
  ]) {
    const terrain = new Terrain(seed),
      edits = {
        [`${cx * S - 1},40,${cz * S}`]: 20,
        [`${cx * S},40,${cz * S}`]: 8,
        [`${cx * S + 15},40,${cz * S + 15}`]: 35,
      };
    const data = terrain.generate(cx, cz, edits),
      mesh = meshChunk(terrain, cx, cz, data, edits).solid;
    assert.deepEqual(
      rasterizedFaces(mesh),
      expectedFaces(terrain, cx, cz, data, edits),
    );
    for (const [name, array] of Object.entries(mesh))
      assert.ok(
        array.every(Number.isFinite),
        `${name} must have finite values`,
      );
  }
});
test("a large flat slab collapses to six rectangles while textures retain per-voxel repeats", () => {
  const data = new Uint8Array(S * S * H);
  for (let z = 3; z < 11; z++)
    for (let x = 2; x < 12; x++) data[index(x, 40, z)] = 3;
  const terrain = { block: () => 0, column: () => ({ h: 40 }) },
    mesh = meshChunk(terrain, 0, 0, data).solid;
  assert.equal(mesh.position.length / 9, 12);
  const top = [];
  for (let q = 0; q < mesh.position.length / 18; q++)
    if (mesh.normal[q * 18 + 1] === 1) top.push(q);
  assert.equal(top.length, 1);
  const q = top[0],
    uv = mesh.repeatUv.slice(q * 12, q * 12 + 12);
  assert.equal(Math.max(...uv.filter((_, i) => i % 2 === 0)), 10);
  assert.equal(Math.max(...uv.filter((_, i) => i % 2 === 1)), 8);
  assert.deepEqual(rasterizedFaces(mesh), expectedFaces(terrain, 0, 0, data));
});
test("different blocks, sunlight bands and original plant alpha quads are not lost by merging", () => {
  const data = new Uint8Array(S * S * H);
  for (let x = 1; x < 7; x++) {
    data[index(x, 40, 2)] = x < 4 ? 3 : 19;
    data[index(x, 41, 5)] = 7;
  }
  data[index(8, 41, 2)] = 21;
  const terrain = { block: () => 0, column: (x) => ({ h: x < 4 ? 40 : 60 }) },
    mesh = meshChunk(terrain, 0, 0, data).solid;
  assert.deepEqual(rasterizedFaces(mesh), expectedFaces(terrain, 0, 0, data));
  let crossedQuads = 0;
  for (let q = 0; q < mesh.atlasTile.length / 12; q++)
    if (mesh.atlasTile[q * 12] + (7 - mesh.atlasTile[q * 12 + 1]) * 8 === 21)
      crossedQuads++;
  assert.equal(crossedQuads, 4);
  assert.ok(
    Math.min(...mesh.color) < 0.5,
    "subsurface shading must remain on deep faces",
  );
});

test("world diagnostics count indexed triangles rather than unique vertices", async () => {
  const THREE = await import("three");
  const { World } = await import("../src/world.js");
  const indexed = new THREE.BoxGeometry(1, 1, 1),
    plain = indexed.toNonIndexed();
  const world = {
    chunks: new Map([
      ["0,0", { solid: { geometry: indexed } }],
      ["1,0", { water: { geometry: plain } }],
    ]),
    stats: {},
  };
  World.prototype.recount.call(world);
  assert.equal(world.stats.chunks, 2);
  assert.equal(world.stats.triangles, 24);
  indexed.dispose();
  plain.dispose();
});
