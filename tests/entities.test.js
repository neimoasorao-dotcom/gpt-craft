import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EntitySystem } from "../src/entities.js";
function fixture(options = {}) {
  const blocks = new Map();
  const world = {
    getHeight: () => 0,
    getBiome: () => "Meadowlands",
    getBlock: (x, y, z) =>
      blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ??
      (y < 0 ? 3 : 0),
  };
  const scene = new THREE.Scene();
  const system = new EntitySystem(scene, world, options);
  return { world, blocks, scene, system };
}
const playerAt = (x = 0, y = 0, z = 0) => ({
  position: new THREE.Vector3(x, y, z),
  health: 100,
  dead: false,
  damage() {},
});
test("creature hit feedback, invulnerability interval, death and resource drops", () => {
  const f = fixture();
  const mob = f.system.spawn("hart", { x: 0, y: 0, z: -2 });
  const origin = new THREE.Vector3(0, 0.8, 0),
    dir = new THREE.Vector3(0, 0, -1);
  const hit = f.system.attack(origin, dir, 4, 12);
  assert.equal(hit.type, "hart");
  assert.equal(hit.killed, false);
  assert.equal(mob.health, 12);
  assert.equal(f.system.attack(origin, dir, 4, 12), null);
  mob.hitCooldown = 0;
  const kill = f.system.attack(origin, dir, 4, 12);
  assert.equal(kill.killed, true);
  assert.equal(f.system.count, 0);
  assert.ok(f.system.drops.some((d) => d.id === "raw_meat"));
  assert.ok(f.system.drops.some((d) => d.id === "hide"));
  assert.ok(f.system.particles.length > 0);
  f.system.dispose();
});
test("melee attacks cannot damage creatures through terrain", () => {
  const f = fixture();
  const mob = f.system.spawn("shardling", { x: 0, y: 0, z: -3 });
  f.blocks.set("0,0,-2", 3);
  f.blocks.set("0,1,-2", 3);
  const origin = new THREE.Vector3(0, 0.8, 0),
    dir = new THREE.Vector3(0, 0, -1);
  assert.equal(f.system.attack(origin, dir, 4, 10), null);
  assert.equal(mob.health, mob.definition.health);
  f.blocks.clear();
  assert.ok(f.system.attack(origin, dir, 4, 10));
  assert.equal(mob.health, mob.definition.health - 10);
  f.system.dispose();
});
test("item pickup retries leftovers and removes only the collected quantity", () => {
  let capacity = 2,
    received = 0;
  const f = fixture({
    onPickup: (id, count) => {
      const accepted = Math.min(capacity, count);
      capacity -= accepted;
      received += accepted;
      return count - accepted;
    },
  });
  const item = f.system.dropItem("stone", 5, new THREE.Vector3(0, 0, 0));
  item.age = 1;
  item.velocity.set(0, 0, 0);
  f.system.updateDrops(0.016, playerAt());
  assert.equal(received, 2);
  assert.equal(f.system.drops[0].count, 3);
  capacity = 10;
  f.system.updateDrops(0.016, playerAt());
  assert.equal(received, 5);
  assert.equal(f.system.drops.length, 0);
  f.system.dispose();
});
test("mob and durable item state survive serialization, malformed entries are ignored", () => {
  const f = fixture();
  const mob = f.system.spawn("mossback", { x: 2, y: 0, z: -2 });
  mob.health = 19;
  mob.yaw = 0.7;
  f.system.dropItem("iron_pickaxe", 1, new THREE.Vector3(1, 0, 1), 123);
  const saved = f.system.serialize();
  saved.mobs.push({ type: "invalid", position: { x: 0, y: 0, z: 0 } });
  saved.drops.push({ id: "stone", count: 2, position: { x: NaN, y: 0, z: 0 } });
  const other = fixture();
  other.system.load(saved);
  assert.equal(other.system.count, 1);
  assert.equal(other.system.entities[0].health, 19);
  assert.equal(other.system.entities[0].type, "mossback");
  assert.equal(other.system.drops.length, 1);
  assert.equal(other.system.drops[0].durability, 123);
  f.system.dispose();
  other.system.dispose();
});
test("spawning respects population cap and passive daylight surface behavior", () => {
  const f = fixture();
  f.world.getHeight = () => 10;
  f.world.getBlock = (x, y, z) => (Math.floor(y) <= 10 ? 3 : 0);
  const player = playerAt(0, 11, 0);
  for (let i = 0; i < 200; i++) f.system.trySpawn(player, 0.4);
  assert.ok(f.system.count > 0);
  assert.ok(f.system.count <= f.system.maxEntities);
  assert.ok(f.system.entities.every((e) => !e.definition.hostile));
  for (const e of f.system.entities) {
    assert.ok(e.position.distanceTo(player.position) > 7);
    assert.ok(Number.isFinite(e.position.y));
  }
  f.system.dispose();
});
