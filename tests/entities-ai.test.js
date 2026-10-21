import test from "node:test";
import assert from "node:assert/strict";
import { Scene, Vector3 } from "three";
import { EntitySystem } from "../src/entities.js";

const worldWith = (extra = () => 0) => ({
  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    return y < 1 ? 3 : extra(x, y, z);
  },
  getHeight() {
    return 0;
  },
  getBiome() {
    return "Meadowlands";
  },
});
const playerAt = (x = 0.5, y = 1, z = 0.5) => ({
  position: new Vector3(x, y, z),
  dead: false,
  health: 100,
  damage() {},
});
function system(world = worldWith(), options = {}) {
  return new EntitySystem(new Scene(), world, options);
}
function aimAt(entity) {
  return {
    origin: entity.position
      .clone()
      .add(new Vector3(0, entity.definition.height * 0.6, 3)),
    direction: new Vector3(0, 0, -1),
  };
}

test("combat applies critical damage, enforces hit cooldown and creates species-specific loot", () => {
  const kills = [];
  const mobs = system(undefined, { onKill: (type) => kills.push(type) });
  try {
    const e = mobs.spawn("hart", new Vector3(0.5, 1, -2));
    let aim = aimAt(e);
    const hit = mobs.attack(aim.origin, aim.direction, 4, 6, true);
    assert.equal(hit.damage, 9);
    assert.equal(e.health, 15);
    assert.equal(hit.killed, false);
    assert.equal(
      mobs.attack(aim.origin, aim.direction, 4, 99),
      null,
      "consecutive hits within cooldown are rejected",
    );
    const far = playerAt(40, 1, 40);
    mobs.updateEntity(e, 0.3, far, 0.4, e.position.distanceTo(far.position));
    aim = aimAt(e);
    const lethal = mobs.attack(aim.origin, aim.direction, 4, 20);
    assert.equal(lethal.killed, true);
    assert.equal(mobs.entities.length, 0);
    assert.deepEqual(kills, ["hart"]);
    assert.equal(mobs.drops.find((d) => d.id === "raw_meat")?.count, 2);
    assert.equal(mobs.drops.find((d) => d.id === "hide")?.count, 1);
    assert.ok(mobs.particles.length > 0, "hits and deaths emit feedback");
  } finally {
    mobs.dispose();
  }
});

test("player attacks cannot hit a creature through solid voxel cover", () => {
  const wall = worldWith((x, y, z) => (z === 0 && y < 4 ? 3 : 0));
  const mobs = system(wall);
  try {
    const e = mobs.spawn("shardling", new Vector3(0.5, 1, -1));
    const origin = new Vector3(0.5, 1.8, 1.5);
    assert.equal(mobs.attack(origin, new Vector3(0, 0, -1), 4, 20), null);
    assert.equal(e.health, e.definition.health);
    mobs.world = worldWith();
    assert.equal(mobs.attack(origin, new Vector3(0, 0, -1), 4, 20)?.damage, 20);
  } finally {
    mobs.dispose();
  }
});

test("hostile melee attacks respect cooldown and solid cover", () => {
  const hits = [];
  const mobs = system(undefined, {
    onDamage: (amount, name) => hits.push({ amount, name }),
  });
  try {
    const e = mobs.spawn("shardling", new Vector3(0.5, 1, 1.5));
    const p = playerAt(0.5, 1, 0.5);
    mobs.updateEntity(e, 0.05, p, 0.9, 1);
    assert.equal(
      hits.length,
      0,
      "attack telegraphs before damage is committed",
    );
    assert.ok(e.windup > 0);
    for (let i = 0; i < 7; i++)
      mobs.updateEntity(e, 0.05, p, 0.9, e.position.distanceTo(p.position));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].amount, 9);
    for (let i = 0; i < 12; i++)
      mobs.updateEntity(e, 0.05, p, 0.9, e.position.distanceTo(p.position));
    assert.equal(hits.length, 1);
    for (let i = 0; i < 16; i++)
      mobs.updateEntity(e, 0.05, p, 0.9, e.position.distanceTo(p.position));
    assert.ok(hits.length >= 2);

    const hiddenHits = [];
    const covered = system(
      worldWith((x, y, z) => (z === 0 && y < 4 ? 3 : 0)),
      { onDamage: (a) => hiddenHits.push(a) },
    );
    try {
      const hidden = covered.spawn("shardling", new Vector3(0.5, 1, 1.1));
      const behindWall = playerAt(0.5, 1, -0.1);
      for (let i = 0; i < 20; i++)
        covered.updateEntity(
          hidden,
          0.05,
          behindWall,
          0.9,
          hidden.position.distanceTo(behindWall.position),
        );
      assert.equal(hiddenHits.length, 0);
      assert.equal(hidden.windup, 0);
    } finally {
      covered.dispose();
    }
  } finally {
    mobs.dispose();
  }
});

test("pickup preserves unaccepted counts and tool durability, then removes only collected items", () => {
  const received = [];
  let capacity = 2;
  const mobs = system(undefined, {
    onPickup: (id, count, durability) => {
      const accepted = Math.min(capacity, count);
      received.push({ id, accepted, durability });
      capacity -= accepted;
      return count - accepted;
    },
  });
  try {
    const p = playerAt();
    const drop = mobs.dropItem("stone", 5, p.position);
    drop.age = 0.6;
    drop.velocity.set(0, 0, 0);
    mobs.updateDrops(0.02, p);
    assert.equal(mobs.drops.length, 1);
    assert.equal(mobs.drops[0].count, 3);
    mobs.updateDrops(0.02, p);
    assert.equal(
      mobs.drops[0].count,
      3,
      "full inventory does not destroy a drop",
    );
    capacity = 10;
    mobs.updateDrops(0.02, p);
    assert.equal(mobs.drops.length, 0);
    assert.equal(
      received.reduce((n, r) => n + r.accepted, 0),
      5,
    );
    const tool = mobs.dropItem("iron_pickaxe", 1, p.position, 83);
    tool.age = 0.6;
    tool.velocity.set(0, 0, 0);
    mobs.updateDrops(0.02, p);
    assert.equal(received.at(-1).durability, 83);
    assert.equal(mobs.drops.length, 0);
  } finally {
    mobs.dispose();
  }
});

test("chasing creatures steer around a tall obstacle without crossing solid cells", () => {
  const w = worldWith((x, y, z) =>
    z === 0 && x >= 0 && x <= 2 && y < 4 ? 3 : 0,
  );
  const mobs = system(w);
  try {
    const e = mobs.spawn("shardling", new Vector3(-0.15, 1, 4.5));
    e.yaw = 0;
    const p = playerAt(-0.15, 1, -10.5);
    let sideways = 0;
    let moved = 0;
    let pursued = false;
    for (let i = 0; i < 600; i++) {
      const before = e.position.clone();
      mobs.updateEntity(e, 0.025, p, 0.9, e.position.distanceTo(p.position));
      assert.equal(
        mobs.solid(e.position.x, e.position.y + 0.1, e.position.z),
        false,
        "mob centre remains outside solid terrain",
      );
      sideways = Math.max(sideways, Math.abs(e.position.x + 0.15));
      pursued ||= e.state === "chase";
      moved += e.position.distanceTo(before);
    }
    assert.equal(
      pursued,
      true,
      "hostile detected the player and entered chase",
    );
    assert.ok(moved > 2, `creature moved ${moved}`);
    assert.ok(sideways > 0.5, `creature steered sideways by ${sideways}`);
  } finally {
    mobs.dispose();
  }
});

test("entity save/load preserves wounded mobs and durable drops and ignores invalid records", () => {
  const original = system();
  const restored = system();
  try {
    const e = original.spawn("duskboar", new Vector3(-12.5, 1, 22.5));
    e.health = 31;
    e.yaw = 1.23;
    e.age = 44;
    const d = original.dropItem("iron_sword", 1, new Vector3(4.5, 1, 7.5), 203);
    d.age = 51;
    const save = JSON.parse(JSON.stringify(original.serialize()));
    save.mobs.push({ type: "unknown_species", position: { x: 0, y: 1, z: 0 } });
    save.mobs.push({ type: "hart", position: { x: null, y: 1, z: 0 } });
    save.drops.push({
      id: "unknown_item",
      count: 2,
      position: { x: 0, y: 1, z: 0 },
    });
    restored.load(save);
    assert.equal(restored.entities.length, 1);
    const mob = restored.entities[0];
    assert.equal(mob.type, "duskboar");
    assert.equal(mob.health, 31);
    assert.equal(mob.age, 44);
    assert.equal(mob.yaw, 1.23);
    assert.deepEqual(mob.position.toArray(), [-12.5, 1, 22.5]);
    assert.equal(restored.drops.length, 1);
    assert.equal(restored.drops[0].id, "iron_sword");
    assert.equal(restored.drops[0].durability, 203);
    assert.equal(restored.drops[0].age, 51);
    assert.deepEqual(
      restored.drops[0].position.toArray(),
      d.position.toArray(),
    );
  } finally {
    original.dispose();
    restored.dispose();
  }
});

test("drop merging, particle cap and disposal keep scene resources bounded", () => {
  const mobs = system();
  const scene = mobs.scene;
  mobs.dropItem("stone", 2, new Vector3(0, 1, 0));
  mobs.dropItem("stone", 3, new Vector3(0, 1, 0));
  assert.equal(mobs.drops.length, 1);
  assert.equal(mobs.drops[0].count, 5);
  mobs.burst(new Vector3(), 0xff0000, 1000);
  assert.equal(mobs.particles.length, 256);
  mobs.updateParticles(2);
  assert.equal(mobs.particleMesh.count, 0);
  mobs.spawn("windbird", new Vector3(4, 1, 3));
  mobs.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(mobs.entities.length, 0);
  assert.equal(mobs.drops.length, 0);
});
