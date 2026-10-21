import test from "node:test";
import assert from "node:assert/strict";
import {
  Terrain,
  meshChunk,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  SEA_LEVEL,
  seedNumber,
} from "../src/worldgen.js";

const index = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;

test("same seed regenerates byte-identical chunks, distinct seeds alter terrain", () => {
  const a = new Terrain("QA-sunrise"),
    b = new Terrain("QA-sunrise"),
    c = new Terrain("QA-moonrise");
  const start = performance.now();
  const one = a.generate(0, 0),
    two = b.generate(0, 0),
    three = c.generate(0, 0);
  assert.deepEqual(one, two);
  assert.notDeepEqual(one, three);
  assert.equal(one.length, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  console.info(
    `Terrain: three chunks generated in ${(performance.now() - start).toFixed(1)} ms`,
  );
  assert.equal(seedNumber("QA-sunrise"), seedNumber("QA-sunrise"));
});

test("negative chunk coordinates use floor-consistent global voxel positions and apply edits", () => {
  const terrain = new Terrain("QA-border");
  const edits = { "-16,60,-1": 8, "-1,61,-16": 20, "-17,62,-17": 32 };
  const data = terrain.generate(-1, -1, edits);
  assert.equal(data[index(0, 60, 15)], 8);
  assert.equal(data[index(15, 61, 0)], 20);
  for (const [x, y, z] of [
    [0, 0, 0],
    [15, 0, 15],
    [0, 25, 15],
    [15, 31, 0],
    [7, 70, 7],
  ]) {
    assert.equal(data[index(x, y, z)], terrain.block(-16 + x, y, -16 + z));
  }
  assert.equal(terrain.block(-16, -1, -16), 23);
  assert.equal(terrain.block(-16, WORLD_HEIGHT, -16), 0);
});

test("spawn is above sea and underground contains air, resources and immutable bedrock", () => {
  const terrain = new Terrain("QA-resources");
  assert.ok(terrain.column(0, 5).h > SEA_LEVEL);
  const data = terrain.generate(0, 0);
  const ores = new Set();
  let caves = 0;
  for (let z = 0; z < CHUNK_SIZE; z++)
    for (let x = 0; x < CHUNK_SIZE; x++) {
      assert.equal(data[index(x, 0, z)], 23);
      for (let y = 5; y < terrain.column(x, z).h - 4; y++) {
        const id = data[index(x, y, z)];
        if (id === 0) caves++;
        if (id >= 10 && id <= 13) ores.add(id);
      }
    }
  assert.ok(caves > 0, "subsurface caves must exist");
  assert.ok(ores.size >= 2, "resource progression must have several ores");
});

test("multi-field terrain generates diverse biomes and bounded heights across wide coordinates", () => {
  const terrain = new Terrain("QA-exploration");
  const biomes = new Set();
  let low = Infinity,
    high = -Infinity;
  for (let z = -1800; z <= 1800; z += 73)
    for (let x = -1800; x <= 1800; x += 79) {
      const c = terrain.column(x, z);
      biomes.add(c.biome);
      low = Math.min(low, c.h);
      high = Math.max(high, c.h);
      assert.ok(c.h >= 1 && c.h < WORLD_HEIGHT - 10);
    }
  assert.ok(biomes.size >= 4, `expected varied biomes; got ${[...biomes]}`);
  assert.ok(
    high - low > 25,
    "continental and peak terrain should have substantial relief",
  );
});

test("chunk mesher removes hidden faces, including edits in adjacent negative-coordinate chunks", () => {
  const empty = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  const terrain = { block: () => 0, column: () => ({ h: 0 }) };
  empty[index(15, 40, 8)] = 3;
  const isolated = meshChunk(terrain, -1, 0, empty);
  assert.equal(isolated.solid.position.length / 3, 36);
  const border = meshChunk(terrain, -1, 0, empty, { "0,40,8": 3 });
  assert.equal(border.solid.position.length / 3, 30);
  assert.equal(border.solid.normal.length, border.solid.position.length);
  assert.equal(border.solid.uv.length * 3, border.solid.position.length * 2);
  assert.equal(border.solid.color.length, border.solid.position.length);
  assert.ok([...border.solid.position].every(Number.isFinite));
});

test("contiguous water does not emit internal faces and stays in separate mesh batch", () => {
  const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  data[index(4, 40, 4)] = 5;
  data[index(5, 40, 4)] = 5;
  const result = meshChunk(
    { block: () => 0, column: () => ({ h: 0 }) },
    0,
    0,
    data,
  );
  assert.equal(result.water.position.length / 3, 60);
  assert.equal(result.solid.position.length, 0);
});

test("crossed plant backfaces preserve upright UVs on both viewing sides", () => {
  const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  data[index(4, 40, 4)] = 21;
  const { solid } = meshChunk(
    { block: () => 0, column: () => ({ h: 0 }) },
    0,
    0,
    data,
  );
  assert.equal(solid.position.length / 3, 24);
  for (let i = 0; i < solid.position.length / 3; i++) {
    const upper = solid.position[i * 3 + 1] > 40.3;
    const v = solid.uv[i * 2 + 1];
    assert.ok(
      upper ? v > 0.7 : v < 0.7,
      `plant vertex ${i} texture should be upright`,
    );
  }
});
