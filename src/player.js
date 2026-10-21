import * as THREE from "three";
import { BLOCKS } from "./data.js";

const EPSILON = 0.0001;
const HALF_WIDTH = 0.3;
const STANDING_HEIGHT = 1.78;
const CROUCH_HEIGHT = 1.24;
const EMPTY_KEYS = new Set();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const solid = (id) =>
  id !== 0 && id !== 5 && (BLOCKS[id]?.solid ?? ![16, 21, 22, 34].includes(id));

/** First-person controller. Position is the centre of the player's feet. */
export class Player {
  constructor(camera, world, options = {}) {
    this.camera = camera;
    this.world = world;
    this.options = options;
    this.mode = options.mode || "survival";
    const start = options.position ||
      world.getSpawn?.() || { x: 0.5, y: world.getHeight(0, 0) + 1.02, z: 4.5 };
    this.spawn = new THREE.Vector3(start.x, start.y, start.z);
    this.position = this.spawn.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = finite(options.yaw, -0.23);
    this.pitch = finite(options.pitch, -0.13);
    this.health = 100;
    this.hunger = 100;
    this.oxygen = 100;
    this.stamina = 100;
    this.armor = 0;
    this.grounded = false;
    this.inWater = false;
    this.underwater = false;
    this.dead = false;
    this.isCrouching = false;
    this.sprinting = false;
    this._sprintExhausted = false;
    this.glider = false;
    this.gliding = false;
    this._glideExhausted = false;
    this.flying = this.mode === "creative";
    this.height = STANDING_HEIGHT;
    this._eyeHeight = 1.61;
    this._bob = 0;
    this._bobOffset = 0;
    this._stepDistance = 0;
    this._jumpHeld = false;
    this._flightHeld = false;
    this._coyote = 0;
    this._jumpBuffer = 0;
    this._damageCooldown = 0;
    this._hurtTime = 0;
    this._hazardTime = 0;
    this._fallTop = start.y;
    this._shake = 0;
    this._landing = 0;
    this._stepCameraOffset = 0;
    this._direction = new THREE.Vector3();
    this._syncCamera(0, { fov: camera.fov || 75, headBob: false });
  }

  get eyePosition() {
    return this.camera.position;
  }
  get direction() {
    return this.camera.getWorldDirection(this._direction);
  }
  get creative() {
    return this.mode === "creative";
  }

  look(dx, dy, sensitivity = 1) {
    if (this.dead) return;
    const speed = clamp(finite(sensitivity, 1), 0.05, 4) * 0.002;
    this.yaw -= finite(dx, 0) * speed;
    this.pitch = clamp(
      this.pitch - finite(dy, 0) * speed,
      -Math.PI / 2 + 0.015,
      Math.PI / 2 - 0.015,
    );
    this.yaw =
      ((((this.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  _collides(x, y, z, height = this.height) {
    const minX = Math.floor(x - HALF_WIDTH + EPSILON);
    const maxX = Math.floor(x + HALF_WIDTH - EPSILON);
    const minY = Math.floor(y + EPSILON);
    const maxY = Math.floor(y + height - EPSILON);
    const minZ = Math.floor(z - HALF_WIDTH + EPSILON);
    const maxZ = Math.floor(z + HALF_WIDTH - EPSILON);
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (solid(this.world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  intersectsBlock(x, y, z) {
    return (
      this.position.x + HALF_WIDTH > x + EPSILON &&
      this.position.x - HALF_WIDTH < x + 1 - EPSILON &&
      this.position.y + this.height > y + EPSILON &&
      this.position.y < y + 1 - EPSILON &&
      this.position.z + HALF_WIDTH > z + EPSILON &&
      this.position.z - HALF_WIDTH < z + 1 - EPSILON
    );
  }

  _moveAxis(axis, distance, allowStep) {
    if (Math.abs(distance) < 1e-8) return false;
    const before = this.position[axis];
    this.position[axis] += distance;
    if (!this._collides(this.position.x, this.position.y, this.position.z))
      return false;
    this.position[axis] = before;

    // A one-voxel terrain step is traversed only with headroom and a clear landing.
    // Crouching disables assistance, allowing deliberate ledge work and precise mining.
    if (allowStep && axis !== "y" && !this.isCrouching && !this.inWater) {
      const oldY = this.position.y;
      const stepHeight = 1.015;
      this.position.y += stepHeight;
      if (!this._collides(this.position.x, this.position.y, this.position.z)) {
        this.position[axis] += distance;
        if (
          !this._collides(this.position.x, this.position.y, this.position.z)
        ) {
          // Lower onto the actual tread instead of hovering above it.
          let low = 0,
            high = stepHeight;
          for (let i = 0; i < 11; i++) {
            const down = (low + high) * 0.5;
            if (
              this._collides(
                this.position.x,
                oldY + stepHeight - down,
                this.position.z,
              )
            )
              high = down;
            else low = down;
          }
          this.position.y = oldY + stepHeight - low;
          this._stepCameraOffset += this.position.y - oldY;
          this.grounded = true;
          this._fallTop = this.position.y;
          return false;
        }
        this.position[axis] = before;
      }
      this.position.y = oldY;
    }

    // Sweep to the last non-overlapping position. The timestep bounds displacement
    // below a voxel, so this also stops tunnelling through thin walls.
    let low = 0,
      high = 1;
    for (let i = 0; i < 13; i++) {
      const t = (low + high) * 0.5;
      this.position[axis] = before + distance * t;
      if (this._collides(this.position.x, this.position.y, this.position.z))
        high = t;
      else low = t;
    }
    this.position[axis] = before + distance * low;
    return true;
  }

  update(dt, input = {}, settings = {}) {
    dt = clamp(finite(dt, 0), 0, 0.1);
    if (!dt) return;
    const keys = input.locked === false ? EMPTY_KEYS : input.keys || EMPTY_KEYS;
    if (input.locked !== false && (input.mouseDX || input.mouseDY))
      this.look(input.mouseDX || 0, input.mouseDY || 0, settings.sensitivity);
    this._damageCooldown = Math.max(0, this._damageCooldown - dt);
    this._hurtTime = Math.max(0, this._hurtTime - dt);
    this._shake = Math.max(0, this._shake - dt * 3);
    this._landing *= Math.exp(-dt * 13);
    this._stepCameraOffset *= Math.exp(-dt * 10);
    if (this.dead) {
      this._syncCamera(dt, settings);
      return;
    }

    const jump = keys.has("Space");
    const toggleFlight = keys.has("KeyV");
    if (this.creative && toggleFlight && !this._flightHeld) {
      this.flying = !this.flying;
      this.velocity.y = 0;
      this._fallTop = this.position.y;
    }
    this._flightHeld = toggleFlight;
    if (jump && !this._jumpHeld) this._jumpBuffer = 0.14;
    this._jumpHeld = jump;
    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);

    const crouch =
      keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC");
    if (crouch) this.isCrouching = true;
    else if (
      !this._collides(
        this.position.x,
        this.position.y,
        this.position.z,
        STANDING_HEIGHT,
      )
    )
      this.isCrouching = false;
    this.height = this.isCrouching ? CROUCH_HEIGHT : STANDING_HEIGHT;

    const atFeet = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.15),
      Math.floor(this.position.z),
    );
    const atChest = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.9),
      Math.floor(this.position.z),
    );
    this.inWater = atFeet === 5 || atChest === 5;
    this.underwater =
      this.world.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y + this._eyeHeight),
        Math.floor(this.position.z),
      ) === 5;

    if (this.grounded) this._coyote = 0.11;
    else this._coyote = Math.max(0, this._coyote - dt);

    if (this.stamina <= 4 && !this.creative) this._glideExhausted = true;
    else if (this.stamina >= 24 || this.grounded || this.creative)
      this._glideExhausted = false;
    this.gliding =
      !!this.glider &&
      !this.flying &&
      !this.inWater &&
      !this.grounded &&
      jump &&
      this.velocity.y < -0.15 &&
      !this._glideExhausted;

    let forward = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0);
    let strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const length = Math.hypot(forward, strafe);
    if (length > 1) {
      forward /= length;
      strafe /= length;
    }
    if (this.gliding && length === 0) forward = -0.7;
    if (this.stamina <= 4 && !this.creative) this._sprintExhausted = true;
    else if (this.stamina >= 24 || this.creative) this._sprintExhausted = false;
    this.sprinting =
      !this.gliding &&
      !this._sprintExhausted &&
      (keys.has("ShiftLeft") || keys.has("ShiftRight")) &&
      length > 0 &&
      !this.isCrouching &&
      this.stamina > 4 &&
      (this.hunger > 8 || this.creative);
    const speed = this.flying
      ? this.sprinting
        ? 14
        : 8
      : this.inWater
        ? 3
        : this.gliding
          ? 7.4
          : this.isCrouching
            ? 2.1
            : this.sprinting
              ? 6.6
              : 4.3;
    const sin = Math.sin(this.yaw),
      cos = Math.cos(this.yaw);
    const targetX = (strafe * cos + forward * sin) * speed;
    const targetZ = (forward * cos - strafe * sin) * speed;
    const acceleration = this.flying
      ? 10
      : this.inWater
        ? 6
        : this.grounded
          ? length
            ? 19
            : 14
          : this.gliding
            ? 3.5
            : 5;
    const response = 1 - Math.exp(-acceleration * dt);
    this.velocity.x += (targetX - this.velocity.x) * response;
    this.velocity.z += (targetZ - this.velocity.z) * response;
    this.stamina = clamp(
      this.stamina +
        (!this.creative && this.gliding
          ? -7
          : this.sprinting && !this.creative
            ? -12
            : 13) *
          dt,
      0,
      100,
    );

    if (this.flying) {
      this.velocity.y +=
        (((jump ? 1 : 0) - (crouch ? 1 : 0)) * speed - this.velocity.y) *
        (1 - Math.exp(-10 * dt));
      this.grounded = false;
    } else if (this.inWater) {
      this.velocity.y +=
        ((jump ? 4.2 : crouch ? -3.2 : atChest === 5 ? 0.65 : -1.4) -
          this.velocity.y) *
        (1 - Math.exp(-3 * dt));
      this._fallTop = this.position.y;
    } else if (this.gliding) {
      this.velocity.y = Math.max(-2.5, this.velocity.y - 7 * dt);
      this._fallTop = this.position.y;
    } else {
      if (this._jumpBuffer > 0 && this._coyote > 0) {
        this.velocity.y = 8.4;
        this._jumpBuffer = 0;
        this._coyote = 0;
        this.grounded = false;
      }
      this.velocity.y = Math.max(-38, this.velocity.y - 25 * dt);
    }

    const originalX = this.position.x,
      originalZ = this.position.z;
    const substeps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const stepDt = dt / substeps;
    let landed = false;
    const wasGrounded = this.grounded;
    for (let i = 0; i < substeps; i++) {
      const mayStep =
        !this.flying &&
        (this.grounded || this._coyote > 0) &&
        this.velocity.y <= 0;
      // Sneaking keeps feet on their supporting ledge.
      for (const axis of ["x", "z"]) {
        let amount = this.velocity[axis] * stepDt;
        if (
          this.isCrouching &&
          this.grounded &&
          !this.flying &&
          !this.inWater
        ) {
          const testX = this.position.x + (axis === "x" ? amount : 0);
          const testZ = this.position.z + (axis === "z" ? amount : 0);
          if (!this._collides(testX, this.position.y - 0.52, testZ)) amount = 0;
        }
        if (this._moveAxis(axis, amount, mayStep)) this.velocity[axis] = 0;
      }
      const vy = this.velocity.y;
      if (this._moveAxis("y", vy * stepDt, false)) {
        if (vy < 0) {
          this.grounded = true;
          landed = true;
        }
        this.velocity.y = 0;
      } else if (!this.flying) {
        // After one substep lands, vertical velocity is zero for the remaining
        // substeps. Keep that confirmed contact while support remains below;
        // a falling player must never become grounded merely from this probe.
        this.grounded =
          vy === 0 &&
          this.grounded &&
          this._collides(
            this.position.x,
            this.position.y - 0.002,
            this.position.z,
          );
      }
      this._fallTop = Math.max(this._fallTop, this.position.y);
    }
    if (this.grounded && !this.flying) {
      if (landed && !wasGrounded) {
        const fall = this._fallTop - this.position.y;
        if (!this.inWater) {
          if (fall > 3.8) this.damage((fall - 3.8) * 8, "落下");
          this._landing = clamp(fall * 0.025, 0, 0.2);
          if (fall > 0.5) this.options.onLand?.(fall);
        }
      }
      this._fallTop = this.position.y;
      this.gliding = false;
    }

    const moved = Math.hypot(
      this.position.x - originalX,
      this.position.z - originalZ,
    );
    if (this.grounded && !this.flying && !this.inWater && moved > 0.001) {
      this._stepDistance += moved;
      if (this._stepDistance > (this.isCrouching ? 1.65 : 1.85)) {
        this._stepDistance = 0;
        this.options.onStep?.(
          this.world.getBlock(
            Math.floor(this.position.x),
            Math.floor(this.position.y - 0.05),
            Math.floor(this.position.z),
          ),
        );
      }
    }
    this._survival(dt);
    if (this.position.y < -16) {
      if (this.creative) this.respawn();
      else this.damage(100, "深淵");
    }
    this._syncCamera(dt, settings, moved);
  }

  _survival(dt) {
    if (this.creative) {
      this.health = 100;
      this.hunger = 100;
      this.oxygen = 100;
      return;
    }
    this.hunger = Math.max(
      0,
      this.hunger -
        dt *
          (0.017 + (this.sprinting ? 0.045 : 0) + (this.inWater ? 0.025 : 0)),
    );
    if (this.underwater) this.oxygen = Math.max(0, this.oxygen - dt * 8);
    else this.oxygen = Math.min(100, this.oxygen + dt * 25);
    if (this.hunger > 65 && this.health < 100 && this._hurtTime <= 0) {
      const healed = Math.min(dt * 1.2, 100 - this.health);
      this.health += healed;
      this.hunger -= healed * 0.18;
    }
    this._hazardTime += dt;
    if (this._hazardTime >= 1) {
      this._hazardTime %= 1;
      if (this.oxygen <= 0) this.damage(10, "溺水");
      else if (
        solid(
          this.world.getBlock(
            Math.floor(this.position.x),
            Math.floor(this.position.y + this.height - 0.12),
            Math.floor(this.position.z),
          ),
        )
      )
        this.damage(6, "窒息");
      else if (this.hunger <= 0) this.damage(2, "空腹");
      else {
        for (const [dx, dz] of [
          [0.4, 0],
          [-0.4, 0],
          [0, 0.4],
          [0, -0.4],
        ]) {
          if (
            this.world.getBlock(
              Math.floor(this.position.x + dx),
              Math.floor(this.position.y + 0.3),
              Math.floor(this.position.z + dz),
            ) === 27
          ) {
            this.damage(3, "サボテン");
            break;
          }
        }
      }
    }
  }

  _syncCamera(dt, settings, moved = 0) {
    const targetEye = this.isCrouching ? 1.08 : 1.61;
    this._eyeHeight +=
      (targetEye - this._eyeHeight) * (dt ? 1 - Math.exp(-dt * 16) : 1);
    const bobEnabled = settings.headBob !== false;
    if (bobEnabled && this.grounded && moved > 0.0001 && !this.flying)
      this._bob += moved * 7.8;
    const targetBob =
      bobEnabled && this.grounded && moved > 0.0001
        ? Math.sin(this._bob) * (this.isCrouching ? 0.018 : 0.036)
        : 0;
    this._bobOffset +=
      (targetBob - this._bobOffset) * (dt ? 1 - Math.exp(-dt * 15) : 1);
    const shake = bobEnabled ? this._shake * 0.015 : 0;
    this.camera.position.set(
      this.position.x + Math.sin(this._hurtTime * 47) * shake,
      this.position.y +
        this._eyeHeight +
        this._bobOffset -
        (bobEnabled ? this._landing : 0) -
        this._stepCameraOffset,
      this.position.z,
    );
    this.camera.rotation.set(
      this.pitch + Math.sin(this._hurtTime * 27) * shake,
      this.yaw,
      Math.sin(this._hurtTime * 33) * shake,
      "YXZ",
    );
    const fov =
      clamp(finite(settings.fov, 75), 50, 110) +
      (this.sprinting && bobEnabled ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.005) {
      this.camera.fov +=
        (fov - this.camera.fov) * (dt ? 1 - Math.exp(-dt * 6) : 1);
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  damage(amount, source = "危険") {
    if (
      this.dead ||
      this.creative ||
      this._damageCooldown > 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return false;
    const armor = clamp(
      finite(this.options.getArmor?.() ?? this.armor, 0),
      0,
      0.8,
    );
    const environmental = ["落下", "溺水", "窒息", "空腹", "深淵"].includes(
      source,
    );
    const dealt = amount * (environmental ? 1 : 1 - armor);
    this.health = Math.max(0, this.health - dealt);
    this._damageCooldown = 0.55;
    this._hurtTime = 6;
    this._shake = 1;
    this.options.onDamage?.(dealt, source);
    if (this.health <= 0) {
      this.dead = true;
      this.gliding = false;
      this.velocity.set(0, 0, 0);
      this.options.onDeath?.(source);
    }
    return true;
  }

  heal(amount) {
    if (!this.dead && Number.isFinite(amount))
      this.health = clamp(this.health + Math.max(0, amount), 0, 100);
  }

  respawn(position) {
    const point = position || this.spawn;
    this.position.set(point.x, point.y, point.z);
    this.velocity.set(0, 0, 0);
    this.health = 100;
    this.hunger = 85;
    this.oxygen = 100;
    this.stamina = 100;
    this._sprintExhausted = false;
    this._glideExhausted = false;
    this.gliding = false;
    this.dead = false;
    this._damageCooldown = 1.5;
    this._hurtTime = 0;
    this._shake = 0;
    this._fallTop = this.position.y;
    this._landing = 0;
    this._stepCameraOffset = 0;
    this._jumpBuffer = 0;
    this._coyote = 0;
    this.grounded = false;
    this._syncCamera(0, { fov: this.camera.fov, headBob: false });
  }

  serialize() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      spawn: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      hunger: this.hunger,
      oxygen: this.oxygen,
      stamina: this.stamina,
      mode: this.mode,
      flying: this.flying,
      dead: this.dead,
    };
  }

  load(data = {}) {
    const p = Array.isArray(data.position)
      ? { x: data.position[0], y: data.position[1], z: data.position[2] }
      : data.position;
    if (
      p &&
      [p.x, p.y, p.z].every(Number.isFinite) &&
      Math.abs(p.x) < 1e7 &&
      Math.abs(p.z) < 1e7 &&
      p.y > -100 &&
      p.y < 10000
    )
      this.position.set(p.x, p.y, p.z);
    const spawn = Array.isArray(data.spawn)
      ? { x: data.spawn[0], y: data.spawn[1], z: data.spawn[2] }
      : data.spawn;
    if (spawn && [spawn.x, spawn.y, spawn.z].every(Number.isFinite))
      this.spawn.set(spawn.x, spawn.y, spawn.z);
    this.yaw = finite(data.yaw, this.yaw);
    this.pitch = clamp(
      finite(data.pitch, this.pitch),
      -Math.PI / 2 + 0.015,
      Math.PI / 2 - 0.015,
    );
    this.health = clamp(finite(data.health, 100), 0, 100);
    this.hunger = clamp(finite(data.hunger, 100), 0, 100);
    this.oxygen = clamp(finite(data.oxygen, 100), 0, 100);
    this.stamina = clamp(finite(data.stamina, 100), 0, 100);
    if (data.mode === "creative" || data.mode === "survival")
      this.mode = data.mode;
    this.flying = this.creative && data.flying !== false;
    this.dead = this.health <= 0;
    this.velocity.set(0, 0, 0);
    this._fallTop = this.position.y;
    this._syncCamera(0, { fov: this.camera.fov, headBob: false });
  }
}

/** Grid DDA raycast. Hit normal points out of the selected voxel. */
export function raycastVoxel(world, origin, direction, maxDistance = 6) {
  if (
    !origin ||
    !direction ||
    ![
      origin.x,
      origin.y,
      origin.z,
      direction.x,
      direction.y,
      direction.z,
      maxDistance,
    ].every(Number.isFinite) ||
    maxDistance < 0
  )
    return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-12) return null;
  const dx = direction.x / length,
    dy = direction.y / length,
    dz = direction.z / length;
  let x = Math.floor(origin.x),
    y = Math.floor(origin.y),
    z = Math.floor(origin.z);
  const sx = Math.sign(dx),
    sy = Math.sign(dy),
    sz = Math.sign(dz);
  const txDelta = sx ? Math.abs(1 / dx) : Infinity;
  const tyDelta = sy ? Math.abs(1 / dy) : Infinity;
  const tzDelta = sz ? Math.abs(1 / dz) : Infinity;
  let tx =
    sx > 0 ? (x + 1 - origin.x) / dx : sx < 0 ? (x - origin.x) / dx : Infinity;
  let ty =
    sy > 0 ? (y + 1 - origin.y) / dy : sy < 0 ? (y - origin.y) / dy : Infinity;
  let tz =
    sz > 0 ? (z + 1 - origin.z) / dz : sz < 0 ? (z - origin.z) / dz : Infinity;
  let distance = 0;
  let normal = { x: 0, y: 0, z: 0 };
  let previous = { x, y, z };
  // The Manhattan bound prevents accidental unbounded traversal on malformed data.
  const limit = Math.min(100000, Math.ceil(maxDistance * 1.733) + 8);
  for (let i = 0; i < limit && distance <= maxDistance + 1e-8; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && id !== 5) {
      return {
        x,
        y,
        z,
        id,
        normal,
        distance: Math.max(0, distance),
        previous,
        point: new THREE.Vector3(
          origin.x + dx * distance,
          origin.y + dy * distance,
          origin.z + dz * distance,
        ),
      };
    }
    previous = { x, y, z };
    if (tx <= ty && tx <= tz) {
      x += sx;
      distance = tx;
      tx += txDelta;
      normal = { x: -sx, y: 0, z: 0 };
    } else if (ty <= tz) {
      y += sy;
      distance = ty;
      ty += tyDelta;
      normal = { x: 0, y: -sy, z: 0 };
    } else {
      z += sz;
      distance = tz;
      tz += tzDelta;
      normal = { x: 0, y: 0, z: -sz };
    }
  }
  return null;
}
