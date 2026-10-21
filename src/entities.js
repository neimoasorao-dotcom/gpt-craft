import * as THREE from "three";
import { BLOCKS, ITEMS } from "./data.js";

// Models, sounds and behaviour are original. Coordinates are feet positions.
const SPECIES = {
  hart: {
    name: "草原ジカ",
    health: 24,
    speed: 1.55,
    flee: 4.1,
    height: 1.35,
    radius: 0.42,
    color: 0xa77b4f,
    food: 2,
    hide: 1,
  },
  mossback: {
    name: "モスバック",
    health: 32,
    speed: 0.75,
    flee: 2.4,
    height: 0.95,
    radius: 0.52,
    color: 0xa5af78,
    food: 3,
    hide: 2,
  },
  hare: {
    name: "砂ウサギ",
    health: 12,
    speed: 1.3,
    flee: 4.8,
    height: 0.65,
    radius: 0.24,
    color: 0xd5c39d,
    food: 1,
    hide: 0,
  },
  windbird: {
    name: "風渡り鳥",
    health: 10,
    speed: 1.2,
    flee: 4.2,
    height: 0.55,
    radius: 0.24,
    color: 0x739995,
    food: 1,
    hide: 0,
    feathers: 2,
  },
  shardling: {
    name: "影の結晶獣",
    health: 42,
    speed: 2.1,
    flee: 0,
    height: 1.35,
    radius: 0.43,
    color: 0x52577e,
    damage: 9,
    hostile: true,
  },
  duskboar: {
    name: "宵の牙獣",
    health: 65,
    speed: 1.6,
    flee: 0,
    height: 1.0,
    radius: 0.53,
    color: 0x66545d,
    damage: 13,
    hostile: true,
  },
};
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const fract = (x) => x - Math.floor(x);
const seedRandom = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
let nextEntityId = 1;

export class EntitySystem {
  constructor(scene, world, options = {}) {
    this.scene = scene;
    this.world = world;
    this.options = options;
    this.entities = [];
    this.drops = [];
    this.particles = [];
    this.clock = 0;
    this.spawnTimer = 0.2;
    this.mode = options.mode || "survival";
    this.maxEntities = 20;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.materials = new Map();
    this.modelGeometry = new Map();
    this.batchedMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });
    this.randomSeed = 7459;
    this._tmp = new THREE.Object3D();
    this.particleMesh = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ vertexColors: false }),
      256,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    this.stats = { entities: 0, drops: 0, particles: 0 };
  }

  random() {
    this.randomSeed += 1;
    return seedRandom(this.randomSeed);
  }
  get count() {
    return this.entities.length;
  }

  material(color, emissive = false) {
    const key = `${color}:${emissive}`;
    if (!this.materials.has(key)) {
      this.materials.set(
        key,
        new THREE.MeshLambertMaterial({
          color,
          ...(emissive ? { emissive: color, emissiveIntensity: 0.8 } : {}),
        }),
      );
    }
    return this.materials.get(key);
  }

  box(group, sx, sy, sz, x, y, z, color, emissive = false) {
    const mesh = new THREE.Mesh(this.geometry, this.material(color, emissive));
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  model(type) {
    const group = new THREE.Group();
    const limbs = [];
    const definition = SPECIES[type];
    const body = definition.color;
    let head;
    if (type === "hart") {
      this.box(group, 0.55, 0.56, 1.05, 0, 0.93, 0, body);
      this.box(group, 0.25, 0.59, 0.29, 0, 1.23, -0.43, 0xc29665);
      head = this.box(group, 0.32, 0.3, 0.49, 0, 1.48, -0.6, 0xc99e6e);
      for (const s of [-1, 1]) {
        this.box(group, 0.23, 0.08, 0.16, s * 0.25, 1.6, -0.52, body);
        this.box(group, 0.055, 0.42, 0.06, s * 0.12, 1.83, -0.53, 0xe1c9a1);
        this.box(group, 0.2, 0.055, 0.06, s * 0.2, 1.94, -0.53, 0xe1c9a1);
        this.box(group, 0.045, 0.16, 0.05, s * 0.28, 2, -0.53, 0xe1c9a1);
        this.box(group, 0.04, 0.065, 0.055, s * 0.168, 1.51, -0.76, 0x1c2421);
      }
      this.box(group, 0.2, 0.1, 0.15, 0, 1.39, -0.86, 0x42382a);
      this.box(group, 0.18, 0.16, 0.22, 0, 1.08, 0.58, 0xe2d5b9);
      for (const x of [-0.19, 0.19])
        for (const z of [-0.34, 0.34]) {
          const pivot = new THREE.Group();
          pivot.position.set(x, 0.73, z);
          group.add(pivot);
          this.box(pivot, 0.12, 0.65, 0.14, 0, -0.32, 0, body);
          this.box(pivot, 0.13, 0.13, 0.16, 0, -0.64, 0, 0x42382d);
          limbs.push(pivot);
        }
    } else if (type === "mossback") {
      this.box(group, 0.82, 0.64, 1.07, 0, 0.68, 0, body);
      this.box(group, 0.74, 0.13, 0.95, 0, 1.02, 0, 0x6e8a56);
      this.box(group, 0.22, 0.14, 0.26, -0.16, 1.14, 0.13, 0x95a965);
      this.box(group, 0.17, 0.13, 0.16, 0.24, 1.11, -0.13, 0xc3ba70);
      head = this.box(group, 0.4, 0.42, 0.36, 0, 0.79, -0.64, 0xd7cfa8);
      for (const s of [-1, 1]) {
        this.box(group, 0.18, 0.1, 0.18, s * 0.28, 0.93, -0.57, 0x79735c);
        this.box(group, 0.045, 0.07, 0.05, s * 0.14, 0.86, -0.83, 0x252c2a);
      }
      for (const x of [-0.28, 0.28])
        for (const z of [-0.33, 0.33]) {
          const pivot = new THREE.Group();
          pivot.position.set(x, 0.46, z);
          group.add(pivot);
          this.box(pivot, 0.17, 0.42, 0.17, 0, -0.21, 0, 0x655e4c);
          limbs.push(pivot);
        }
    } else if (type === "hare") {
      this.box(group, 0.32, 0.3, 0.52, 0, 0.28, 0, body);
      head = this.box(group, 0.27, 0.28, 0.26, 0, 0.45, -0.22, body);
      for (const s of [-1, 1]) {
        this.box(group, 0.065, 0.36, 0.09, s * 0.085, 0.73, -0.18, body);
        this.box(group, 0.035, 0.24, 0.02, s * 0.085, 0.74, -0.23, 0xba907d);
        this.box(group, 0.035, 0.055, 0.03, s * 0.142, 0.5, -0.3, 0x23282b);
      }
      this.box(group, 0.13, 0.15, 0.12, 0, 0.31, 0.3, 0xf5ecda);
      for (const x of [-0.14, 0.14])
        for (const z of [-0.15, 0.2]) {
          const pivot = new THREE.Group();
          pivot.position.set(x, 0.17, z);
          group.add(pivot);
          this.box(pivot, 0.11, 0.16, 0.21, 0, -0.08, -0.02, body);
          limbs.push(pivot);
        }
    } else if (type === "windbird") {
      this.box(group, 0.32, 0.32, 0.42, 0, 0.27, 0, body);
      head = this.box(group, 0.23, 0.24, 0.23, 0, 0.48, -0.15, 0xa5c4b5);
      this.box(group, 0.14, 0.09, 0.16, 0, 0.45, -0.32, 0xe0b875);
      this.box(group, 0.2, 0.08, 0.3, 0, 0.28, 0.3, 0x4b7474).rotation.x = -0.3;
      for (const side of [-1, 1]) {
        this.box(
          group,
          0.035,
          0.045,
          0.03,
          side * 0.12,
          0.51,
          -0.235,
          0x263b3b,
        );
        const wing = new THREE.Group();
        wing.position.set(side * 0.2, 0.35, 0);
        group.add(wing);
        this.box(wing, 0.12, 0.23, 0.37, side * 0.03, -0.05, 0.025, 0x507f7c);
        limbs.push(wing);
        this.box(group, 0.035, 0.15, 0.04, side * 0.09, 0.075, 0, 0x9d7f54);
      }
    } else if (type === "shardling") {
      this.box(group, 0.55, 0.62, 0.38, 0, 0.9, 0, body);
      this.box(group, 0.42, 0.32, 0.36, 0, 1.35, -0.05, 0x68759a);
      this.box(
        group,
        0.15,
        0.18,
        0.15,
        -0.1,
        1.59,
        -0.03,
        0x87d8ce,
        true,
      ).rotation.z = 0.25;
      this.box(
        group,
        0.12,
        0.12,
        0.12,
        0.18,
        1.51,
        0.02,
        0xbbeedb,
        true,
      ).rotation.z = -0.3;
      for (const s of [-1, 1]) {
        this.box(
          group,
          0.1,
          0.055,
          0.025,
          s * 0.1,
          1.36,
          -0.244,
          0xe6fbd9,
          true,
        );
        const arm = new THREE.Group();
        arm.position.set(s * 0.36, 1.13, 0);
        group.add(arm);
        this.box(arm, 0.16, 0.64, 0.18, 0, -0.32, 0, body);
        limbs.push(arm);
      }
      for (const x of [-0.17, 0.17]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.64, 0);
        group.add(pivot);
        this.box(pivot, 0.21, 0.63, 0.24, 0, -0.31, 0, 0x40485f);
        limbs.push(pivot);
      }
    } else {
      this.box(group, 0.75, 0.58, 1.08, 0, 0.68, 0, body);
      this.box(group, 0.25, 0.18, 0.75, 0, 1.05, 0.05, 0x3b394b);
      head = this.box(group, 0.57, 0.45, 0.43, 0, 0.68, -0.64, 0x7b6370);
      this.box(group, 0.32, 0.22, 0.22, 0, 0.59, -0.94, 0xa28a91);
      for (const s of [-1, 1]) {
        this.box(group, 0.12, 0.28, 0.12, s * 0.23, 0.59, -0.92, 0xf2d8b2);
        this.box(
          group,
          0.07,
          0.07,
          0.04,
          s * 0.22,
          0.81,
          -0.87,
          0xf0a477,
          true,
        );
        this.box(group, 0.17, 0.2, 0.1, s * 0.23, 0.99, -0.62, 0x4c3d4b);
      }
      for (const x of [-0.25, 0.25])
        for (const z of [-0.3, 0.35]) {
          const pivot = new THREE.Group();
          pivot.position.set(x, 0.45, z);
          group.add(pivot);
          this.box(pivot, 0.18, 0.44, 0.2, 0, -0.22, 0, 0x3c3844);
          limbs.push(pivot);
        }
    }
    this.batchModelPart(group, `${type}:body`);
    limbs.forEach((limb, i) => this.batchModelPart(limb, `${type}:limb:${i}`));
    group.userData.limbs = limbs;
    group.userData.head = head;
    return group;
  }

  // Collapse static coloured cuboids into a single vertex-coloured draw call.
  // Cached species geometry is reused by every creature of that species.
  batchModelPart(group, key) {
    const parts = group.children.filter(
      (child) => child.isMesh && !(child.material.emissive?.getHex() > 0),
    );
    if (!parts.length) return;
    let geometry = this.modelGeometry.get(key);
    if (!geometry) {
      const positions = [],
        normals = [],
        colors = [];
      for (const part of parts) {
        part.updateMatrix();
        const source = this.geometry.toNonIndexed();
        source.applyMatrix4(part.matrix);
        const p = source.getAttribute("position"),
          n = source.getAttribute("normal");
        const color = part.material.color;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i), p.getY(i), p.getZ(i));
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          colors.push(color.r, color.g, color.b);
        }
        source.dispose();
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      geometry.computeBoundingSphere();
      this.modelGeometry.set(key, geometry);
    }
    for (const part of parts) group.remove(part);
    const mesh = new THREE.Mesh(geometry, this.batchedMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  solid(x, y, z) {
    const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return id !== 0 && id !== 5 && (BLOCKS[id]?.solid ?? true);
  }

  surface(x, z) {
    let y = Math.min(94, Math.floor(this.world.getHeight(x, z)) + 9);
    for (; y > 1; y--) {
      const id = this.world.getBlock(Math.floor(x), y, Math.floor(z));
      if (id === 5) return null;
      if (
        id &&
        ![7, 21, 22, 25, 26, 34].includes(id) &&
        (BLOCKS[id]?.solid ?? true)
      )
        return y + 1;
    }
    return null;
  }

  spawn(type, position) {
    if (!SPECIES[type]) type = "hart";
    const group = this.model(type);
    const p =
      position instanceof THREE.Vector3
        ? position.clone()
        : new THREE.Vector3(position.x, position.y, position.z);
    group.position.copy(p);
    this.scene.add(group);
    const def = SPECIES[type];
    const entity = {
      id: nextEntityId++,
      type,
      definition: def,
      group,
      position: p,
      health: def.health,
      velocity: new THREE.Vector3(),
      yaw: this.random() * Math.PI * 2,
      direction: new THREE.Vector3(),
      state: "idle",
      timer: 1 + this.random() * 3,
      attackCooldown: 0,
      hitCooldown: 0,
      fleeTimer: 0,
      age: 0,
      gait: this.random() * 10,
      home: p.clone(),
      stuck: 0,
      grounded: true,
      avoidTimer: 0,
      avoidYaw: 0,
      windup: 0,
      healthDisplay: 0,
      vocalTimer: 4 + this.random() * 12,
    };
    this.entities.push(entity);
    return entity;
  }

  trySpawn(player, time) {
    if (this.entities.length >= this.maxEntities) return;
    const hostileCount = this.entities.filter(
      (e) => e.definition.hostile,
    ).length;
    const night = time < 0.23 || time > 0.77;
    const underground =
      player.position.y <
      this.world.getHeight(player.position.x, player.position.z) - 6;
    for (let i = 0; i < 5; i++) {
      const angle = this.random() * Math.PI * 2;
      const distance = (this.entities.length < 4 ? 8 : 14) + this.random() * 25;
      const x =
        Math.floor(player.position.x + Math.cos(angle) * distance) + 0.5;
      const z =
        Math.floor(player.position.z + Math.sin(angle) * distance) + 0.5;
      let y = this.surface(x, z);
      if (underground && this.random() < 0.5) {
        for (
          let by = Math.floor(player.position.y + 2);
          by >= player.position.y - 5;
          by--
        ) {
          if (
            this.solid(x, by - 1, z) &&
            !this.solid(x, by, z) &&
            !this.solid(x, by + 1, z)
          ) {
            y = by;
            break;
          }
        }
      }
      if (y == null || Math.abs(y - player.position.y) > 18) continue;
      if (
        this.entities.some(
          (e) => Math.hypot(e.position.x - x, e.position.z - z) < 4,
        )
      )
        continue;
      let type;
      if (
        (night || underground) &&
        hostileCount < 7 &&
        this.random() < 0.65 &&
        this.mode !== "peaceful"
      )
        type = this.random() < 0.75 ? "shardling" : "duskboar";
      else {
        const biome = String(this.world.getBiome(x, z)).toLowerCase();
        if (/desert|dune|砂|荒野/.test(biome)) type = "hare";
        else if (/forest|wood|森/.test(biome))
          type = this.random() < 0.65 ? "hart" : "mossback";
        else
          type =
            this.random() < 0.3
              ? "hart"
              : this.random() < 0.65
                ? "mossback"
                : "windbird";
      }
      this.spawn(type, new THREE.Vector3(x, y, z));
      return;
    }
  }

  canStand(x, y, z, entity) {
    const r = entity.definition.radius * 0.8;
    for (const ox of [-r, r])
      for (const oz of [-r, r]) {
        if (
          this.solid(x + ox, y + 0.06, z + oz) ||
          this.solid(x + ox, y + entity.definition.height * 0.8, z + oz)
        )
          return false;
      }
    return true;
  }

  walkableHeight(x, z, entity) {
    const y = entity.position.y;
    for (const offset of [0, 1, -1]) {
      const by = Math.round(y) + offset;
      if (Math.abs(by - y) > 1.15) continue;
      if (this.solid(x, by - 0.1, z) && this.canStand(x, by, z, entity))
        return by;
    }
    return null;
  }

  update(dt, player, time = 0.4) {
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !player.dead) {
      this.trySpawn(player, time);
      this.spawnTimer = this.entities.length < 6 ? 0.3 : 2.8;
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      const dist = e.position.distanceTo(player.position);
      if (dist > 95 || e.position.y < -8) {
        this.removeEntity(i);
        continue;
      }
      this.updateEntity(e, dt, player, time, dist);
    }
    this.updateDrops(dt, player);
    this.updateParticles(dt);
    this.stats.entities = this.entities.length;
    this.stats.drops = this.drops.length;
    this.stats.particles = this.particles.length;
  }

  updateEntity(e, dt, player, time, distance) {
    e.age += dt;
    e.timer -= dt;
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.hitCooldown = Math.max(0, e.hitCooldown - dt);
    e.fleeTimer = Math.max(0, e.fleeTimer - dt);
    e.avoidTimer = Math.max(0, (e.avoidTimer || 0) - dt);
    e.vocalTimer = (e.vocalTimer || 10) - dt;
    e.healthDisplay = Math.max(0, (e.healthDisplay || 0) - dt);
    if (e.healthSprite)
      e.healthSprite.visible = e.healthDisplay > 0 && distance < 24;
    if (e.vocalTimer <= 0) {
      if (distance < 18)
        this.options.onSound?.(
          `creature_${e.type}`,
          e.position,
          1 - distance / 24,
        );
      e.vocalTimer = 9 + this.random() * 18;
    }
    if (e.windup > 0) {
      e.windup = Math.max(0, e.windup - dt);
      if (
        e.windup === 0 &&
        !player.dead &&
        this.mode !== "creative" &&
        distance < 1.9 &&
        Math.abs(e.position.y - player.position.y) < 1.7 &&
        this.lineOfSight(
          e.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
          player.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        )
      ) {
        if (this.options.onDamage)
          this.options.onDamage(e.definition.damage, e.definition.name);
        else player.damage?.(e.definition.damage, e.definition.name);
        this.burst(
          player.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
          0xdb765b,
          6,
        );
        e.velocity.add(
          new THREE.Vector3(-Math.sin(e.yaw) * 1.5, 0, -Math.cos(e.yaw) * 1.5),
        );
        this.options.onSound?.("creature_strike", e.position);
      }
    }
    let speed = 0;
    let targetYaw = e.yaw;
    const hostile = e.definition.hostile;
    e.sightTimer = (e.sightTimer || 0) - dt;
    if (hostile && distance < 20 && e.sightTimer <= 0) {
      const a = e.position
        .clone()
        .add(new THREE.Vector3(0, e.definition.height * 0.8, 0));
      const b = player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      e.canSee = this.lineOfSight(a, b);
      e.sightTimer = 0.35 + this.random() * 0.2;
    }
    const aware =
      distance < (hostile ? 20 : 5.5) && !player.dead && (!hostile || e.canSee);
    const dark =
      time < 0.23 ||
      time > 0.77 ||
      e.position.y < this.world.getHeight(e.position.x, e.position.z) - 6;
    if (hostile && aware && this.mode !== "creative") {
      e.state = "chase";
      targetYaw =
        Math.atan2(
          player.position.x - e.position.x,
          player.position.z - e.position.z,
        ) + Math.PI;
      speed = e.definition.speed;
      if (e.type === "duskboar" && distance > 5 && distance < 12) speed *= 1.6;
      if (
        distance < 1.5 &&
        Math.abs(e.position.y - player.position.y) < 1.7 &&
        !e.attackCooldown &&
        this.lineOfSight(
          e.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
          player.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
        )
      ) {
        e.attackCooldown = e.type === "duskboar" ? 1.5 : 1.15;
        e.state = "attack";
        e.windup = e.type === "duskboar" ? 0.42 : 0.32;
        e.windupDuration = e.windup;
        this.burst(
          e.position
            .clone()
            .add(new THREE.Vector3(0, e.definition.height * 0.9, 0)),
          0xe7ad78,
          3,
        );
        this.options.onSound?.("creature_windup", e.position);
      }
    } else if (
      (!hostile && (e.fleeTimer > 0 || distance < 3.2)) ||
      (hostile && !dark)
    ) {
      e.state = "flee";
      targetYaw = Math.atan2(
        player.position.x - e.position.x,
        player.position.z - e.position.z,
      );
      speed = hostile ? 1 : e.definition.flee;
      if (hostile && !dark && e.age > 45 && distance > 30) {
        e.health = 0;
        this.burst(e.position, 0xa4b3be, 6);
        this.removeEntity(this.entities.indexOf(e));
        return;
      }
    } else if (e.timer <= 0) {
      e.state = this.random() < 0.38 ? "idle" : "wander";
      e.timer = 2 + this.random() * 5;
      e.yaw += (this.random() - 0.5) * 3;
      if (e.position.distanceTo(e.home) > 18)
        e.yaw =
          Math.atan2(e.home.x - e.position.x, e.home.z - e.position.z) +
          Math.PI;
      targetYaw = e.yaw;
    }
    if (e.state === "wander") speed = e.definition.speed * 0.65;
    if (e.state === "idle") speed = 0;
    if (e.windup > 0) {
      speed = 0;
      e.state = "attack";
    }
    if (e.avoidTimer > 0) targetYaw = e.avoidYaw;
    let deltaYaw = Math.atan2(
      Math.sin(targetYaw - e.yaw),
      Math.cos(targetYaw - e.yaw),
    );
    e.yaw += clamp(deltaYaw, -dt * 4.5, dt * 4.5);
    const dx = -Math.sin(e.yaw) * speed * dt;
    const dz = -Math.cos(e.yaw) * speed * dt;
    const nx = e.position.x + dx;
    const nz = e.position.z + dz;
    const ahead = this.walkableHeight(
      e.position.x - Math.sin(e.yaw) * 0.8,
      e.position.z - Math.cos(e.yaw) * 0.8,
      e,
    );
    let ground = this.walkableHeight(nx, nz, e);
    if (speed > 0 && (ground == null || ahead == null)) {
      // Steer around ledges, water and solids; alternate search side avoids oscillation.
      let found = false;
      for (const turn of [0.7, -0.7, 1.4, -1.4, 1.75, -1.75, 2.6]) {
        const a = e.yaw + turn;
        const tx = e.position.x - Math.sin(a) * 0.85;
        const tz = e.position.z - Math.cos(a) * 0.85;
        if (this.walkableHeight(tx, tz, e) != null) {
          e.yaw = a;
          e.avoidYaw = a;
          e.avoidTimer = 0.6 + this.random() * 0.4;
          found = true;
          break;
        }
      }
      e.stuck += dt;
      if (!found || e.stuck > 3) {
        e.state = "idle";
        e.timer = 0.6;
        e.stuck = 0;
      }
      speed = 0;
    } else if (speed > 0) {
      e.position.x = nx;
      e.position.z = nz;
      e.position.y += clamp(ground - e.position.y, -dt * 6, dt * 6);
      e.stuck = 0;
    }
    // Gravity and lateral knockback remain active even when the AI is standing still.
    const below = this.solid(e.position.x, e.position.y - 0.12, e.position.z);
    if (!below) {
      e.velocity.y = Math.max(-20, e.velocity.y - 18 * dt);
      const testY = e.position.y + e.velocity.y * dt;
      if (this.canStand(e.position.x, testY, e.position.z, e))
        e.position.y = testY;
      else {
        e.position.y = Math.floor(e.position.y) + 0.01;
        e.velocity.y = 0;
      }
    } else {
      e.velocity.y = Math.max(0, e.velocity.y);
    }
    const kx = e.position.x + e.velocity.x * dt;
    const kz = e.position.z + e.velocity.z * dt;
    if (this.canStand(kx, e.position.y, kz, e)) {
      e.position.x = kx;
      e.position.z = kz;
    }
    e.velocity.x *= Math.exp(-8 * dt);
    e.velocity.z *= Math.exp(-8 * dt);
    e.gait += dt * speed * 5;
    e.group.position.copy(e.position);
    e.group.rotation.y = e.yaw;
    e.group.rotation.x =
      e.windup > 0
        ? -Math.sin((1 - e.windup / e.windupDuration) * Math.PI) * 0.22
        : 0;
    const pulse =
      e.hitCooldown > 0 ? 1 + Math.sin(e.hitCooldown * 28) * 0.045 : 1;
    e.group.scale.set(pulse, pulse, pulse);
    e.group.position.y +=
      (e.type === "hare" || e.type === "windbird") && speed > 0
        ? Math.abs(Math.sin(e.gait * 1.6)) * 0.16
        : Math.sin(e.gait * 2) * speed * 0.008;
    e.group.userData.limbs.forEach((limb, i) => {
      limb.rotation.x =
        Math.sin(e.gait + (i % 2 ? Math.PI : 0)) * Math.min(0.6, speed * 0.2);
    });
  }

  updateHealthSprite(entity) {
    if (typeof document === "undefined") return;
    if (!entity.healthSprite) {
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 88;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(0, entity.definition.height + 0.53, 0);
      sprite.scale.set(1.3, 0.3, 1);
      sprite.renderOrder = 4;
      entity.group.add(sprite);
      entity.healthSprite = sprite;
      entity.healthCanvas = canvas;
    }
    const canvas = entity.healthCanvas,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(14, 28, 29, .82)";
    ctx.beginPath();
    ctx.roundRect(16, 3, 352, 79, 12);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "500 25px system-ui, sans-serif";
    ctx.fillStyle = "#f0e9d6";
    ctx.fillText(entity.definition.name, 192, 29);
    ctx.fillStyle = "rgba(235, 232, 212, .18)";
    ctx.fillRect(36, 57, 312, 7);
    ctx.fillStyle = entity.definition.hostile ? "#dda183" : "#b6cf9e";
    ctx.fillRect(
      36,
      57,
      312 * Math.max(0, entity.health / entity.definition.health),
      7,
    );
    entity.healthSprite.material.map.needsUpdate = true;
    entity.healthSprite.visible = true;
  }

  lineOfSight(from, to) {
    const delta = new THREE.Vector3(
      to.x - from.x,
      to.y - from.y,
      to.z - from.z,
    );
    const length = delta.length();
    const steps = Math.max(1, Math.ceil(length / 0.2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (
        this.solid(
          from.x + delta.x * t,
          from.y + delta.y * t,
          from.z + delta.z * t,
        )
      )
        return false;
    }
    return true;
  }

  attack(origin, direction, range = 4, damage = 6, critical = false) {
    let closest = null;
    let best = range + 1;
    const dir = new THREE.Vector3(
      direction.x,
      direction.y,
      direction.z,
    ).normalize();
    for (const e of this.entities) {
      if (e.hitCooldown > 0) continue;
      const center = e.position
        .clone()
        .add(new THREE.Vector3(0, e.definition.height * 0.6, 0));
      const delta = center.sub(origin);
      const distance = delta.dot(dir);
      if (distance < 0 || distance > range || distance > best) continue;
      const offset = delta.clone().addScaledVector(dir, -distance).length();
      if (offset < Math.max(0.55, e.definition.height * 0.52)) {
        closest = e;
        best = distance;
      }
    }
    if (!closest) return null;
    const e = closest;
    const hitPoint = new THREE.Vector3(
      origin.x,
      origin.y,
      origin.z,
    ).addScaledVector(dir, best);
    if (!this.lineOfSight(origin, hitPoint)) return null;
    const dealt = damage * (critical ? 1.5 : 1);
    e.health -= dealt;
    e.hitCooldown = 0.28;
    e.fleeTimer = 6;
    e.windup = 0;
    e.healthDisplay = 5;
    this.updateHealthSprite(e);
    this.options.onSound?.(`creature_${e.type}`, e.position, 0.8);
    const push = new THREE.Vector3(dir.x, 0, dir.z)
      .normalize()
      .multiplyScalar(4.5);
    e.velocity.add(push);
    e.velocity.y = 2.3;
    this.burst(
      e.position
        .clone()
        .add(new THREE.Vector3(0, e.definition.height * 0.5, 0)),
      critical ? 0xf4db97 : 0xc98d76,
      critical ? 18 : 9,
    );
    const result = {
      type: e.type,
      name: e.definition.name,
      damage: dealt,
      killed: e.health <= 0,
      position: e.position.clone(),
      distance: best,
    };
    if (e.health <= 0) {
      if (e.definition.hostile) {
        this.dropItem("crystal", e.type === "duskboar" ? 2 : 1, e.position);
        this.dropItem("coal", 1, e.position);
        this.dropItem("ember", e.type === "duskboar" ? 2 : 1, e.position);
        if (this.random() < 0.22) this.dropItem("ancient_shard", 1, e.position);
      } else {
        this.dropItem("raw_meat", e.definition.food, e.position);
        if (e.definition.hide)
          this.dropItem("hide", e.definition.hide, e.position);
        if (e.definition.feathers)
          this.dropItem("feather", e.definition.feathers, e.position);
      }
      this.burst(
        e.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
        e.definition.color,
        18,
      );
      this.options.onKill?.(e.type);
      this.removeEntity(this.entities.indexOf(e));
    }
    return result;
  }

  dropItem(id, count, position, durability) {
    if (!(count > 0)) return;
    // Merge nearby identical stacks before adding another draw call.
    const existing = this.drops.find(
      (d) =>
        d.id === id &&
        d.durability === durability &&
        d.position.distanceToSquared(position) < 1.2 &&
        d.count + count <= (ITEMS[id]?.stack || 64),
    );
    if (existing) {
      existing.count += count;
      existing.age = 0;
      return existing;
    }
    if (this.drops.length >= 100) this.removeDrop(0);
    const group = new THREE.Group();
    const color = ITEMS[id]?.color || "#d1b986";
    const mesh = this.box(
      group,
      0.23,
      0.23,
      0.23,
      0,
      0,
      0,
      color,
      id === "crystal",
    );
    mesh.rotation.set(0.3, 0.5, 0.2);
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.29, 0.29),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.13,
        wireframe: true,
      }),
    );
    group.add(ring);
    const p = new THREE.Vector3(position.x, position.y + 0.35, position.z);
    group.position.copy(p);
    this.scene.add(group);
    const drop = {
      id,
      count: Math.floor(count),
      durability,
      position: p,
      group,
      age: 0,
      velocity: new THREE.Vector3(
        (this.random() - 0.5) * 1.4,
        2.2,
        (this.random() - 0.5) * 1.4,
      ),
      phase: this.random() * 6,
      grounded: false,
    };
    this.drops.push(drop);
    return drop;
  }

  updateDrops(dt, player) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const distance = d.position.distanceTo(
        player.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
      );
      if (distance < 2 && d.age > 0.55 && !player.dead) {
        const left = this.options.onPickup
          ? this.options.onPickup(d.id, d.count, d.durability)
          : d.count;
        if (left < d.count) {
          this.burst(d.position, 0xe9d9a0, 5);
          d.count = left;
        }
        if (d.count <= 0) {
          this.removeDrop(i);
          continue;
        }
      }
      if (d.age > 600 || d.position.y < -16 || distance > 130) {
        this.removeDrop(i);
        continue;
      }
      d.velocity.y = Math.max(-15, d.velocity.y - 14 * dt);
      const next = d.position.clone().addScaledVector(d.velocity, dt);
      if (this.solid(next.x, next.y - 0.16, next.z)) {
        if (d.velocity.y < 0) {
          d.position.y = Math.floor(next.y - 0.16) + 1.17;
          d.velocity.y = 0;
          d.velocity.x *= 0.75;
          d.velocity.z *= 0.75;
          d.grounded = true;
        }
      } else {
        d.position.copy(next);
        d.grounded = false;
      }
      d.velocity.x *= Math.exp(-3 * dt);
      d.velocity.z *= Math.exp(-3 * dt);
      d.group.position.copy(d.position);
      if (d.grounded)
        d.group.position.y += Math.sin(this.clock * 2.4 + d.phase) * 0.055;
      d.group.rotation.y += dt * 0.85;
    }
  }

  burst(position, color = 0xe5c68e, count = 10) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this.particles.length < 256; i++) {
      const angle = this.random() * Math.PI * 2;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * (1 + this.random() * 2),
        1 + this.random() * 3,
        Math.sin(angle) * (1 + this.random() * 2),
      );
      this.particles.push({
        position: new THREE.Vector3(position.x, position.y, position.z),
        velocity,
        life: 0.4 + this.random() * 0.6,
        maxLife: 1,
        color: c.clone(),
        size: 0.045 + this.random() * 0.065,
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 7 * dt;
      p.position.addScaledVector(p.velocity, dt);
    }
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      this._tmp.position.copy(p.position);
      this._tmp.rotation.set(p.life * 4, p.life * 6, p.life * 2);
      this._tmp.scale.setScalar(p.size * Math.min(1, p.life * 3));
      this._tmp.updateMatrix();
      this.particleMesh.setMatrixAt(i, this._tmp.matrix);
      this.particleMesh.setColorAt(i, p.color);
    });
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor)
      this.particleMesh.instanceColor.needsUpdate = true;
  }

  removeEntity(index) {
    if (index < 0) return;
    const [e] = this.entities.splice(index, 1);
    if (e) {
      this.scene.remove(e.group);
      if (e.healthSprite) {
        e.healthSprite.material.map.dispose();
        e.healthSprite.material.dispose();
      }
    }
  }
  removeDrop(index) {
    const [d] = this.drops.splice(index, 1);
    if (d) {
      this.scene.remove(d.group);
      const ring = d.group.children[1];
      ring?.geometry.dispose();
      ring?.material.dispose();
    }
  }

  serialize() {
    return {
      version: 1,
      randomSeed: this.randomSeed,
      clock: this.clock,
      mobs: this.entities.map((e) => ({
        type: e.type,
        position: { x: e.position.x, y: e.position.y, z: e.position.z },
        health: e.health,
        yaw: e.yaw,
        age: e.age,
      })),
      drops: this.drops.map((d) => ({
        id: d.id,
        count: d.count,
        durability: d.durability,
        position: { x: d.position.x, y: d.position.y - 0.35, z: d.position.z },
        age: d.age,
      })),
    };
  }

  load(data) {
    if (!data || typeof data !== "object") return;
    while (this.entities.length) this.removeEntity(0);
    while (this.drops.length) this.removeDrop(0);
    if (Number.isFinite(data.clock)) this.clock = Math.max(0, data.clock);
    for (const m of (Array.isArray(data.mobs) ? data.mobs : []).slice(
      0,
      this.maxEntities,
    )) {
      if (!SPECIES[m.type] || !validPosition(m.position)) continue;
      const e = this.spawn(m.type, m.position);
      e.health = clamp(
        Number(m.health) || e.definition.health,
        1,
        e.definition.health,
      );
      e.yaw = Number(m.yaw) || 0;
      e.age = Number(m.age) || 0;
    }
    for (const d of (Array.isArray(data.drops) ? data.drops : []).slice(
      0,
      100,
    )) {
      if (!ITEMS[d.id] || !validPosition(d.position) || !(d.count > 0))
        continue;
      const item = this.dropItem(
        d.id,
        Math.min(999, d.count),
        d.position,
        d.durability,
      );
      if (item) {
        item.age = clamp(Number(d.age) || 0, 0, 599);
        item.velocity.set(0, 0, 0);
      }
    }
    // Construction uses random phases; continuation uses the saved RNG state.
    if (Number.isFinite(data.randomSeed)) this.randomSeed = data.randomSeed;
  }

  dispose() {
    while (this.entities.length) this.removeEntity(0);
    while (this.drops.length) this.removeDrop(0);
    this.scene.remove(this.particleMesh);
    this.particleMesh.material.dispose();
    this.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.modelGeometry.forEach((g) => g.dispose());
    this.modelGeometry.clear();
    this.batchedMaterial.dispose();
    this.materials.clear();
    this.particles.length = 0;
  }
}

function validPosition(p) {
  return (
    p && [p.x, p.y, p.z].every((n) => Number.isFinite(n) && Math.abs(n) < 1e8)
  );
}
export { SPECIES };
