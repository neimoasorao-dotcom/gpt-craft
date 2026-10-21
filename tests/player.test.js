import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { Player, raycastVoxel } from "../src/player.js";

const makeWorld = (blocks = new Map()) => ({
  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    return blocks.get(`${x},${y},${z}`) ?? (y < 0 ? 3 : 0);
  },
  getHeight() {
    return -1;
  },
  getSpawn() {
    return { x: 0.5, y: 0.001, z: 0.5 };
  },
});
const advance = (p, seconds, keys = []) => {
  for (let t = 0; t < seconds; t += 1 / 120)
    p.update(
      1 / 120,
      { keys: new Set(keys), locked: true },
      { headBob: false },
    );
};

test("voxel raycast selects a distant face with correct adjacent placement cell", () => {
  const w = makeWorld(new Map([["0,1,-3", 3]]));
  const hit = raycastVoxel(
    w,
    new Vector3(0.5, 1.5, 0.5),
    new Vector3(0, 0, -1),
    6,
  );
  assert.deepEqual([hit.x, hit.y, hit.z], [0, 1, -3]);
  assert.equal(hit.distance, 2.5);
  assert.equal(hit.normal.z, 1);
  assert.deepEqual(hit.previous, { x: 0, y: 1, z: -2 });
  assert.equal(hit.point.z, -2);
});

test("voxel raycast ignores water, normalizes directions and respects reach", () => {
  const w = makeWorld(
    new Map([
      ["1,1,0", 5],
      ["3,1,0", 8],
    ]),
  );
  const hit = raycastVoxel(
    w,
    { x: 0.5, y: 1.5, z: 0.5 },
    { x: 12, y: 0, z: 0 },
    3,
  );
  assert.equal(hit.id, 8);
  assert.equal(hit.distance, 2.5);
  assert.equal(
    raycastVoxel(w, { x: 0.5, y: 1.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 2),
    null,
  );
});

test("voxel raycast crosses negative chunk-like boundaries and exact planes", () => {
  const w = makeWorld(new Map([["-17,1,0", 3]]));
  const hit = raycastVoxel(
    w,
    { x: -16, y: 1.5, z: 0.5 },
    { x: -1, y: 0, z: 0 },
    6,
  );
  assert.equal(hit.x, -17);
  assert.equal(hit.distance, 0);
  assert.equal(hit.normal.x, 1);
  assert.equal(
    raycastVoxel(w, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    null,
  );
  assert.equal(
    raycastVoxel(w, { x: NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    null,
  );
});

test("controller accelerates forward, stops at a high wall and never tunnels", () => {
  const blocks = new Map();
  for (let x = -2; x < 3; x++)
    for (let y = 0; y < 4; y++) blocks.set(`${x},${y},-3`, 3);
  const p = new Player(new PerspectiveCamera(), makeWorld(blocks), { yaw: 0 });
  advance(p, 0.2);
  advance(p, 2, ["KeyW", "ShiftLeft"]);
  assert.ok(p.position.z >= -1.7002 && p.position.z < -1.6, `${p.position.z}`);
  assert.ok(p.position.y >= -0.001 && p.position.y < 0.01);
  assert.equal(p.grounded, true);
});

test("controller jumps, lands and does not damage a normal jump", () => {
  const p = new Player(new PerspectiveCamera(), makeWorld(), { yaw: 0 });
  advance(p, 0.1);
  advance(p, 0.2, ["Space"]);
  assert.ok(p.position.y > 0.8);
  advance(p, 1.5);
  assert.ok(p.position.y < 0.01 && p.position.y > -0.01);
  assert.equal(p.health, 100);
  assert.equal(p.grounded, true);
});

test("falling causes damage", () => {
  const p = new Player(new PerspectiveCamera(), makeWorld(), {
    position: { x: 0.5, y: 12, z: 0.5 },
  });
  advance(p, 2);
  assert.ok(p.health < 40, String(p.health));
  assert.ok(p.position.y < 0.01);
});

test("crouching respects ceilings and standing block placement excludes the player", () => {
  const blocks = new Map([["0,2,0", 3]]);
  const p = new Player(new PerspectiveCamera(), makeWorld(blocks));
  advance(p, 0.2, ["KeyC"]);
  assert.equal(p.isCrouching, true);
  blocks.set("0,1,0", 3);
  advance(p, 0.1);
  assert.equal(p.isCrouching, true);
  assert.equal(p.intersectsBlock(0, 0, 0), true);
  assert.equal(p.intersectsBlock(1, 0, 0), false);
});

test("survival consumes oxygen and reports drowning after oxygen is exhausted", () => {
  const water = new Map();
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++)
      for (let y = 0; y < 15; y++) water.set(`${x},${y},${z}`, 5);
  const damage = [];
  const p = new Player(new PerspectiveCamera(), makeWorld(water), {
    onDamage: (amount, source) => damage.push(source),
  });
  p.oxygen = 1;
  advance(p, 1.3);
  assert.equal(p.underwater, true);
  assert.equal(p.oxygen, 0);
  assert.ok(damage.includes("溺水"));
});

test("creative flight toggles with V and ignores survival damage", () => {
  const p = new Player(new PerspectiveCamera(), makeWorld(), {
    mode: "creative",
  });
  advance(p, 1, ["Space"]);
  assert.ok(p.position.y > 5);
  assert.equal(p.damage(1000, "敵"), false);
  advance(p, 1 / 120, ["KeyV"]);
  assert.equal(p.flying, false);
  advance(p, 0.1, ["KeyV"]);
  assert.equal(p.flying, false);
});

test("save/load preserves player position, orientation and survival stats", () => {
  const p = new Player(new PerspectiveCamera(), makeWorld());
  p.position.set(-25.5, 39.25, 80);
  p.look(50, -25);
  p.health = 71;
  p.hunger = 42;
  p.oxygen = 34;
  const data = p.serialize();
  const restored = new Player(new PerspectiveCamera(), makeWorld());
  restored.load(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.serialize(), data);
  restored.respawn();
  assert.equal(restored.health, 100);
  assert.equal(restored.dead, false);
  assert.deepEqual(restored.position.toArray(), [0.5, 0.001, 0.5]);
});

test("water cushions a high fall and restores air after leaving it", () => {
  const water = new Map();
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++)
      for (let y = 0; y < 3; y++) water.set(`${x},${y},${z}`, 5);
  const p = new Player(new PerspectiveCamera(), makeWorld(water), {
    position: { x: 0.5, y: 12, z: 0.5 },
  });
  advance(p, 3);
  assert.equal(p.health, 100);
  assert.equal(p.inWater, true);
  p.position.set(10, 5, 10);
  p.oxygen = 1;
  advance(p, 0.2);
  assert.ok(p.oxygen > 5);
});

test("one-voxel steps require headroom and crouching prevents falling from a ledge", () => {
  const blocks = new Map([
    ["0,0,-1", 3],
    ["0,0,-2", 3],
    ["0,0,-3", 3],
    ["0,0,-4", 3],
  ]);
  const p = new Player(new PerspectiveCamera(), makeWorld(blocks), { yaw: 0 });
  advance(p, 0.1);
  advance(p, 0.6, ["KeyW"]);
  assert.ok(p.position.y > 0.98, String(p.position.y));
  assert.ok(p.position.z < 0, String(p.position.z));
  const roof = new Map(blocks);
  roof.set("0,2,0", 3);
  roof.set("0,2,-1", 3);
  const covered = new Player(new PerspectiveCamera(), makeWorld(roof), {
    yaw: 0,
  });
  advance(covered, 0.1);
  advance(covered, 0.6, ["KeyW"]);
  assert.ok(covered.position.z > 0.299, String(covered.position.z));
  assert.ok(covered.position.y < 0.01);
  const ledgeWorld = {
    getSpawn: () => ({ x: 0.5, y: 1.001, z: 0.5 }),
    getHeight: () => 0,
    getBlock: (x, y, z) =>
      Math.floor(x) === 0 && Math.floor(z) === 0 && Math.floor(y) === 0 ? 3 : 0,
  };
  const sneaking = new Player(new PerspectiveCamera(), ledgeWorld, { yaw: 0 });
  advance(sneaking, 0.2);
  advance(sneaking, 2, ["KeyW", "KeyC"]);
  assert.ok(sneaking.position.z > -0.3, String(sneaking.position.z));
  assert.ok(sneaking.position.y > 0.99, String(sneaking.position.y));
});

test("sprint exhaustion recovers before re-enabling sprint and comfort mode keeps FOV fixed", () => {
  const p = new Player(new PerspectiveCamera(75), makeWorld(), { yaw: 0 });
  advance(p, 0.1);
  p.stamina = 4;
  p.update(
    0.05,
    { keys: new Set(["KeyW", "ShiftLeft"]), locked: true },
    { fov: 82, headBob: false },
  );
  assert.equal(p.sprinting, false);
  advance(p, 0.5, ["KeyW", "ShiftLeft"]);
  assert.equal(p.sprinting, false);
  advance(p, 1.4, ["KeyW", "ShiftLeft"]);
  assert.equal(p.sprinting, true);
  p.camera.fov = 82;
  for (let i = 0; i < 10; i++)
    p.update(
      0.02,
      { keys: new Set(["KeyW", "ShiftLeft"]), locked: true },
      { fov: 82, headBob: false },
    );
  assert.equal(p.camera.fov, 82);
});

test("equipped glider trades stamina for controlled falling and a safe landing", () => {
  const p = new Player(new PerspectiveCamera(), makeWorld(), {
    position: { x: 0.5, y: 12, z: 0.5 },
    yaw: 0,
  });
  p.glider = true;
  advance(p, 0.2);
  advance(p, 1, ["Space", "KeyW"]);
  assert.equal(p.gliding, true);
  assert.ok(p.velocity.y >= -2.501, String(p.velocity.y));
  assert.ok(p.position.y > 8, String(p.position.y));
  assert.ok(p.position.z < -4, String(p.position.z));
  assert.ok(p.stamina < 95);
  advance(p, 5, ["Space", "KeyW"]);
  assert.ok(p.position.y < 0.01);
  assert.equal(p.health, 100);
  assert.equal(p.gliding, false);

  const ordinary = new Player(new PerspectiveCamera(), makeWorld(), {
    position: { x: 0.5, y: 12, z: 0.5 },
  });
  advance(ordinary, 0.8, ["Space"]);
  assert.equal(ordinary.gliding, false);
  assert.ok(ordinary.velocity.y < -10);
});

test("armor reduces creature damage, invulnerability rejects repeat hits and death/respawn transition once", () => {
  const notices = [];
  let deaths = 0;
  const p = new Player(new PerspectiveCamera(), makeWorld(), {
    onDamage: (amount, source) => notices.push({ amount, source }),
    onDeath: () => deaths++,
  });
  p.armor = 0.45;
  assert.equal(p.damage(20, "影の結晶獣"), true);
  assert.equal(p.health, 89);
  assert.equal(p.damage(20, "影の結晶獣"), false);
  assert.equal(p.health, 89);
  advance(p, 0.6);
  assert.equal(p.damage(10, "落下"), true);
  assert.equal(p.health, 79, "armor does not absorb environmental damage");
  advance(p, 0.6);
  p.damage(1000, "影の結晶獣");
  assert.equal(p.dead, true);
  assert.equal(p.health, 0);
  assert.equal(deaths, 1);
  assert.equal(p.damage(20), false);
  assert.equal(deaths, 1);
  assert.equal(notices.length, 3);
  p.respawn();
  assert.equal(p.dead, false);
  assert.equal(p.health, 100);
  assert.equal(p.damage(20), false, "respawn has a brief grace interval");
});

test("coarse and variable game-frame timesteps preserve landed support and accept jump input", () => {
  for (const frameTimes of [[0.06], [1 / 60, 0.06, 0.04, 0.016, 0.055]]) {
    const world = {
      getSpawn: () => ({ x: 0.5, y: 37.05, z: 5.5 }),
      getHeight: () => 36,
      getBlock: (x, y, z) => (Math.floor(y) <= 36 ? 3 : 0),
    };
    const p = new Player(new PerspectiveCamera(75), world, { yaw: 0 });
    const step = (dt, keys = []) =>
      p.update(
        dt,
        { keys: new Set(keys), locked: true },
        { headBob: false, fov: 75 },
      );
    for (let i = 0; i < 30; i++) step(frameTimes[i % frameTimes.length]);
    assert.equal(
      p.grounded,
      true,
      "resting contact survives zero-velocity substeps",
    );
    assert.ok(Math.abs(p.position.y - 37) < 0.002);
    step(0.06, ["Space"]);
    assert.ok(p.position.y > 37.3, `jump moved feet to ${p.position.y}`);
    assert.ok(p.velocity.y > 0);
    assert.equal(p.grounded, false);
    let peak = p.position.y;
    for (let i = 0; i < 50; i++) {
      step(frameTimes[i % frameTimes.length]);
      peak = Math.max(peak, p.position.y);
    }
    assert.ok(peak > 38, `jump reached ${peak}`);
    assert.equal(p.grounded, true);
    assert.equal(p.health, 100);
  }
});

test("coarse multi-substep landing still applies accumulated fall damage exactly once", () => {
  let landings = 0;
  const p = new Player(new PerspectiveCamera(), makeWorld(), {
    position: { x: 0.5, y: 12, z: 0.5 },
    onLand: () => landings++,
  });
  for (let i = 0; i < 35; i++)
    p.update(0.06, { keys: new Set(), locked: true }, { headBob: false });
  assert.equal(p.grounded, true);
  assert.ok(p.health > 30 && p.health < 40, `health ${p.health}`);
  assert.equal(landings, 1);
});

test("validated compact save coordinates restore the player and bed spawn", () => {
  const player = new Player(new PerspectiveCamera(), makeWorld());
  player.load({
    position: [-17.5, 42.25, 63.5],
    spawn: [8.5, 37.05, -3.5],
    health: 74,
  });
  assert.deepEqual(player.position.toArray(), [-17.5, 42.25, 63.5]);
  assert.deepEqual(player.spawn.toArray(), [8.5, 37.05, -3.5]);
  assert.equal(player.health, 74);
  player.load({ position: [1, 2], health: 74 });
  assert.deepEqual(player.position.toArray(), [-17.5, 42.25, 63.5]);
});
