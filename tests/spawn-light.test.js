import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EntitySystem } from "../src/entities.js";

function fixture(mode = "survival") {
  const blocks = new Map(),
    edits = {},
    editsByChunk = new Map();
  let reads = 0;
  const world = {
    edits,
    editsByChunk,
    getHeight: () => 10,
    getBiome: () => "Meadowlands",
    getBlock(x, y, z) {
      reads++;
      return (
        blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ??
        (Math.floor(y) <= 10 ? 3 : 0)
      );
    },
  };
  const system = new EntitySystem(new THREE.Scene(), world, { mode });
  system.random = () => 0;
  const put = (x, y, z, id, index = true) => {
    const key = `${x},${y},${z}`;
    blocks.set(key, id);
    if (index) {
      edits[key] = id;
      const chunk = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
      if (!editsByChunk.has(chunk)) editsByChunk.set(chunk, {});
      editsByChunk.get(chunk)[key] = id;
    }
  };
  return {
    world,
    system,
    put,
    get reads() {
      return reads;
    },
  };
}
const player = (x = 0.5, z = 0.5) => ({
  position: new THREE.Vector3(x, 11, z),
  health: 100,
  dead: false,
});

test("nearby placed light prevents hostile night spawning without suppressing passive life", () => {
  const dark = fixture();
  dark.system.trySpawn(player(), 0.9);
  assert.equal(dark.system.entities[0].definition.hostile, true);
  const lit = fixture();
  lit.put(10, 11, 1, 16);
  lit.system.trySpawn(player(), 0.9);
  assert.equal(lit.system.entities.length, 1);
  assert.ok(lit.system.entities.every((e) => !e.definition.hostile));
  dark.system.dispose();
  lit.system.dispose();
});
test("light lookup crosses negative chunk boundaries and honors removal", () => {
  const f = fixture();
  f.put(-15, 11, -1, 30);
  assert.equal(f.system.isSpawnLit(-16.5, 11, -0.5), true);
  f.put(-15, 11, -1, 0);
  assert.equal(f.system.isSpawnLit(-16.5, 11, -0.5), false);
  f.put(-15, 11, -1, 32);
  delete f.world.editsByChunk;
  assert.equal(f.system.isSpawnLit(-16.5, 11, -0.5), true);
  f.system.dispose();
});
test("sealed walls block light protection while unedited natural emitters are recognized", () => {
  const f = fixture();
  f.put(10, 11, 0, 32, false);
  assert.equal(f.system.isSpawnLit(8.5, 11, 0.5), true);
  f.put(9, 11, 0, 3, false);
  assert.equal(f.system.isSpawnLit(8.5, 11, 0.5), false);
  f.system.dispose();
});
test("spatial lookup ignores far-world edits and bounds natural light probes", () => {
  const f = fixture();
  const poison = {};
  Object.defineProperty(poison, "unrelated", {
    enumerable: true,
    get() {
      throw new Error("far chunk inspected");
    },
  });
  f.world.editsByChunk.set("1000,1000", poison);
  assert.equal(f.system.isSpawnLit(8.5, 11, 0.5), false);
  assert.ok(f.reads <= 45);
  f.system.dispose();
});
test("daylight spawning, population cap and unlit creative spawning keep their existing rules", () => {
  const day = fixture();
  day.system.trySpawn(player(), 0.4);
  assert.equal(day.system.entities.length, 1);
  assert.ok(!day.system.entities[0].definition.hostile);
  day.system.maxEntities = 1;
  day.system.trySpawn(player(), 0.4);
  assert.equal(day.system.entities.length, 1);
  const creative = fixture("creative");
  creative.system.trySpawn(player(), 0.9);
  assert.equal(creative.system.entities[0].definition.hostile, true);
  day.system.dispose();
  creative.system.dispose();
});
