// Original deterministic terrain and chunk meshing. This module is also used in
// a worker: it deliberately has no DOM or renderer dependency.
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const SEA_LEVEL = 32;
const S = CHUNK_SIZE,
  H = WORLD_HEIGHT;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x) => x * x * (3 - 2 * x);
export function seedNumber(seed) {
  const str = String(seed ?? "wildbound");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function hash(x, y, z = 0, seed = 0) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 2147483647) ^
    seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise2(x, z, seed) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  return (
    mix(
      mix(hash(ix, iz, 0, seed), hash(ix + 1, iz, 0, seed), fx),
      mix(hash(ix, iz + 1, 0, seed), hash(ix + 1, iz + 1, 0, seed), fx),
      fz,
    ) *
      2 -
    1
  );
}
function noise3(x, y, z, seed) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  const n = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz, seed);
  return (
    mix(
      mix(mix(n(0, 0, 0), n(1, 0, 0), fx), mix(n(0, 1, 0), n(1, 1, 0), fx), fy),
      mix(mix(n(0, 0, 1), n(1, 0, 1), fx), mix(n(0, 1, 1), n(1, 1, 1), fx), fy),
      fz,
    ) *
      2 -
    1
  );
}
function fbm(x, z, seed, octaves = 4) {
  let n = 0,
    amp = 0.55;
  for (let i = 0; i < octaves; i++) {
    n += noise2(x, z, seed + i * 127) * amp;
    x *= 2.05;
    z *= 2.05;
    amp *= 0.48;
  }
  return n;
}
const colors = {
  1: [0.81, 1, 0.72],
  2: [1, 0.93, 0.85],
  3: [0.91, 0.95, 1],
  4: [1, 0.98, 0.88],
  6: [1, 0.92, 0.79],
  7: [0.73, 1, 0.69],
  14: [0.93, 0.98, 1],
  25: [1, 0.9, 0.66],
  26: [0.92, 1, 1],
  21: [1, 1, 1],
  22: [0.81, 1, 0.66],
};
const transparent = new Set([0, 5, 7, 16, 20, 21, 22, 25, 26, 30, 34, 36]);
const crossed = new Set([21, 22, 34]);
const nonOccluding = new Set([0, 5, 16, 20, 21, 22, 30, 34, 36]);
const blockIndex = (x, y, z) => (y * S + z) * S + x;

export class Terrain {
  constructor(seed) {
    this.seed = seedNumber(seed);
    this.columns = new Map();
    this.treeCache = new Map();
    this.structures = new Map();
  }
  column(x, z) {
    x = Math.floor(x);
    z = Math.floor(z);
    const key = `${x},${z}`;
    let c = this.columns.get(key);
    if (c) return c;
    const s = this.seed;
    const continental = fbm(x / 220, z / 220, s + 1, 3);
    const erosion = noise2(x / 115 + 51, z / 115, s + 17);
    const ridges = 1 - Math.abs(fbm(x / 95, z / 95, s + 89, 3));
    const humidity = fbm(x / 170 - 80, z / 170 + 80, s + 91, 3);
    const temperature = fbm(x / 210 + 400, z / 210, s + 139, 3);
    const peaks =
      Math.pow(clamp((ridges - 0.45) / 0.55, 0, 1), 3) *
      clamp((erosion + 0.12) * 1.7, 0, 1);
    let h =
      34 + continental * 22 + peaks * 32 + fbm(x / 39, z / 39, s + 71, 3) * 5;
    const river = Math.abs(noise2(x / 130 + 200, z / 130, s + 73));
    if (river < 0.045 && h < 54)
      h = mix(28 + river * 40, h, clamp((river - 0.015) / 0.03, 0, 1));
    // The first valley is a welcoming lake basin. Its terrain is still seeded,
    // but every seed offers a safe landing and a meaningful first vista.
    const d = Math.hypot(x - 17, (z + 29) * 0.9);
    const origin = Math.hypot(x, z);
    const lakeH =
      26 + Math.pow(d / 27, 3) * 8 + noise2(x / 17, z / 17, s + 37) * 1.9;
    if (d < 41) h = mix(lakeH, h, smooth(clamp((d - 27) / 14, 0, 1)));
    const spawnD = Math.hypot(x - 0.5, z - 5);
    if (spawnD < 12)
      h = mix(
        36 + noise2(x / 15, z / 15, s + 21) * 1.3,
        h,
        smooth(clamp((spawnD - 5) / 7, 0, 1)),
      );
    // An open mountain skyline frames the basin instead of enclosing spawn.
    if (z < -65 && z > -160 && Math.abs(x) < 160) {
      const band = Math.exp(-Math.pow((z + 112) / 42, 2));
      h +=
        band *
        (17 + 19 * Math.pow(1 - Math.abs(noise2(x / 34, z / 43, s + 821)), 2));
    }
    h = clamp(Math.floor(h), 7, 83);
    let biome =
      h > 62
        ? "Frostpeak"
        : temperature > 0.27 && humidity < 0.05
          ? "Amber Dunes"
          : humidity > 0.08
            ? "Fernwood"
            : humidity < -0.17
              ? "Copperwood"
              : "Meadowlands";
    if (origin < 68 && h < 58)
      biome = z < -35 && x < -10 ? "Copperwood" : "Meadowlands";
    if (h <= 33) biome = "Sunlit Coast";
    c = { h, biome, temperature, humidity, continental, erosion, peaks, river };
    if (this.columns.size > 180000) this.columns.clear();
    this.columns.set(key, c);
    return c;
  }
  treeAt(gx, gz) {
    const key = `${gx},${gz}`;
    if (this.treeCache.has(key)) return this.treeCache.get(key);
    const s = this.seed,
      r = hash(gx, gz, 19, s);
    const x = gx * 7 + 1 + Math.floor(hash(gx, gz, 21, s) * 5),
      z = gz * 7 + 1 + Math.floor(hash(gx, gz, 23, s) * 5);
    const c = this.column(x, z);
    const chance =
      c.biome === "Fernwood"
        ? 0.68
        : c.biome === "Copperwood"
          ? 0.55
          : c.biome === "Meadowlands"
            ? 0.32
            : c.biome === "Frostpeak"
              ? 0.24
              : 0.03;
    const noTree =
      Math.hypot(x, z - 5) < 7 ||
      c.h < 34 ||
      c.h > 75 ||
      Math.hypot(x + 20, z + 24) < 9;
    const tree =
      r < chance && !noTree
        ? {
            x,
            z,
            y: c.h + 1,
            height: 4 + Math.floor(hash(gx, gz, 31, s) * 3),
            leaf:
              c.biome === "Copperwood" ? 25 : c.biome === "Frostpeak" ? 26 : 7,
            pine: c.biome === "Frostpeak",
          }
        : null;
    if (this.treeCache.size > 6000) this.treeCache.clear();
    this.treeCache.set(key, tree);
    return tree;
  }
  structureAt(gx, gz) {
    const key = `${gx},${gz}`;
    if (this.structures.has(key)) return this.structures.get(key);
    const x = gx * 112 + 36 + Math.floor(hash(gx, gz, 79, this.seed) * 35),
      z = gz * 112 + 36 + Math.floor(hash(gx, gz, 81, this.seed) * 35);
    const c = this.column(x, z);
    const st =
      c.h > 34 && c.h < 63 && hash(gx, gz, 83, this.seed) < 0.65
        ? {
            x,
            z,
            y: c.h + 1,
            kind: hash(gx, gz, 87, this.seed) > 0.5 ? "tower" : "well",
          }
        : null;
    this.structures.set(key, st);
    return st;
  }
  structureBlock(x, y, z) {
    const landmark = {
      x: -20,
      z: -24,
      y: this.column(-20, -24).h + 1,
      kind: "gate",
    };
    const gx = Math.floor(x / 112),
      gz = Math.floor(z / 112);
    const s =
      Math.abs(x + 20) < 9 && Math.abs(z + 24) < 9
        ? landmark
        : this.structureAt(gx, gz);
    if (!s) return null;
    const dx = x - s.x,
      dz = z - s.z,
      dy = y - s.y,
      a = Math.abs(dx),
      b = Math.abs(dz);
    if (s.kind === "gate") {
      if (a <= 5 && b <= 4 && dy === -1) return 35;
      if (b === 0 && a <= 3 && dy >= 0 && dy <= 5) {
        if (a === 3 || dy === 5) return (dy + dx) % 3 === 0 ? 32 : 35;
        if (dy === 0) return 35;
        // A natural ruin contains a dormant crystal, never a crafted beacon.
        // Activating the endgame requires players to create their own device.
        if (a <= 2 && dy > 0 && dy < 5) return a === 0 && dy === 1 ? 32 : 0;
      }
      if (dx === -4 && dz === 2 && dy === 0) return 28;
      if (a === 5 && b === 3 && dy >= 0 && dy <= 2) return dy === 2 ? 32 : 35;
    } else if (s.kind === "tower") {
      if (a <= 3 && b <= 3 && dy === -1) return 35;
      if (
        (a === 3 || b === 3) &&
        a <= 3 &&
        b <= 3 &&
        dy >= 0 &&
        dy < 5 &&
        !(dz === 3 && a < 1 && dy < 3)
      )
        return hash(x, y, z, this.seed) > 0.18 ? 35 : 0;
      if (a === 0 && b === 0 && dy === 0) return 28;
      if (a === 3 && b === 3 && dy === 5) return 32;
    } else {
      if (a <= 2 && b <= 2 && dy === -1) return 35;
      if ((a === 2 || b === 2) && a <= 2 && b <= 2 && dy === 0) return 35;
      if (a < 2 && b < 2 && dy === -1) return 5;
      if (dx === 0 && dz === 0 && dy === 0) return 28;
    }
    return null;
  }
  block(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return 23;
    if (y >= H) return 0;
    if (y === 0) return 23;
    const c = this.column(x, z),
      h = c.h,
      s = this.seed;
    // Structure checks only happen close to the surface.
    if (y >= h - 2) {
      const structure = this.structureBlock(x, y, z);
      if (structure !== null) return structure;
    }
    if (y > h) {
      if (y <= SEA_LEVEL) return 5;
      const gx = Math.floor(x / 7),
        gz = Math.floor(z / 7);
      if (y < h + 12) {
        for (let iz = gz - 1; iz <= gz + 1; iz++)
          for (let ix = gx - 1; ix <= gx + 1; ix++) {
            const t = this.treeAt(ix, iz);
            if (!t) continue;
            const dy = y - t.y,
              dx = Math.abs(x - t.x),
              dz = Math.abs(z - t.z);
            if (dx === 0 && dz === 0 && dy >= 0 && dy < t.height) return 6;
            if (t.pine) {
              const radius = Math.max(0, Math.ceil((t.height + 2 - dy) / 2));
              if (
                dy >= 1 &&
                dy <= t.height + 2 &&
                dx <= radius &&
                dz <= radius &&
                dx + dz <= radius * 1.65
              )
                return t.leaf;
            } else if (
              dy >= t.height - 2 &&
              dy <= t.height + 1 &&
              dx <= 2 &&
              dz <= 2 &&
              dx + dz + Math.abs(dy - t.height + 1) < 5
            )
              return t.leaf;
          }
      }
      if (y === h + 1 && h > 33) {
        const r = hash(x, z, 101, s);
        if (c.biome === "Amber Dunes" && r < 0.007) return 27;
        if (c.biome !== "Amber Dunes" && c.biome !== "Frostpeak") {
          if (r < 0.025) return 21;
          if (r < 0.085) return 22;
        }
      }
      if (
        c.biome === "Amber Dunes" &&
        y > h + 1 &&
        y <= h + 3 &&
        hash(x, z, 101, s) < 0.007
      )
        return 27;
      return 0;
    }
    if (y > 4 && y < h - 4) {
      const cave = noise3(x / 24, y / 16, z / 24, s + 507);
      const branch = noise3(x / 41 + 90, y / 23, z / 41, s + 509);
      if (
        (Math.abs(cave) < 0.073 && branch > -0.12) ||
        noise3(x / 19, y / 13 + 95, z / 19, s + 511) > 0.57
      )
        return y < 8 ? (hash(x, y, z, s) < 0.025 ? 32 : 0) : 0;
    }
    // Occasional natural cave mouths in rocky hills.
    if (
      h > 42 &&
      y > h - 7 &&
      y <= h &&
      Math.abs(noise2(x / 18, z / 18, s + 519)) < 0.045 &&
      hash(Math.floor(x / 5), Math.floor(z / 5), 7, s) > 0.55
    )
      return 0;
    if (y === h)
      return h <= 33 || c.biome === "Amber Dunes" ? 4 : h > 62 ? 14 : 1;
    if (y > h - 4)
      return h <= 34 || c.biome === "Amber Dunes"
        ? 4
        : h <= 37 && hash(x, y, z, s) < 0.18
          ? 15
          : 2;
    const ore = hash(x, y, z, s + 701);
    const vein = noise3(x / 5, y / 5, z / 5, s + 703);
    if (vein > 0.18) {
      if (y < 18 && ore < 0.08) return 13;
      if (y < 32 && ore < 0.13) return 12;
      if (y < 45 && ore < 0.2) return 11;
      if (ore < 0.26) return 10;
    }
    return y < 10 ? 24 : 3;
  }
  generate(cx, cz, edits = {}) {
    const data = new Uint8Array(S * S * H);
    const x0 = cx * S,
      z0 = cz * S;
    // Ground uses column lookup and only evaluates above-ground decoration in
    // the small occupied band, rather than marching to the world ceiling.
    for (let z = 0; z < S; z++)
      for (let x = 0; x < S; x++) {
        const wx = x0 + x,
          wz = z0 + z,
          h = this.column(wx, wz).h;
        const maxY = Math.min(H - 1, Math.max(h + 12, SEA_LEVEL));
        for (let y = 0; y <= maxY; y++)
          data[blockIndex(x, y, z)] = this.block(wx, y, wz);
      }
    for (const [key, id] of Object.entries(edits)) {
      const [x, y, z] = key.split(",").map(Number);
      if (x >= x0 && x < x0 + S && z >= z0 && z < z0 + S && y >= 0 && y < H)
        data[blockIndex(x - x0, y, z - z0)] = id;
    }
    return data;
  }
}

const faces = [
  {
    n: [1, 0, 0],
    c: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.8,
  },
  {
    n: [-1, 0, 0],
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.72,
  },
  {
    n: [0, 1, 0],
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1,
  },
  {
    n: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.51,
  },
  {
    n: [0, 0, 1],
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.87,
  },
  {
    n: [0, 0, -1],
    c: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.76,
  },
];
const uvCorners = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const tri = [0, 1, 2, 0, 2, 3];
function meshData() {
  return {
    position: [],
    normal: [],
    uv: [],
    color: [],
    glow: [],
    repeatUv: [],
    atlasTile: [],
  };
}
function arrays(m) {
  return Object.fromEntries(
    Object.entries(m).map(([key, a]) => [key, new Float32Array(a)]),
  );
}
export function meshChunk(terrain, cx, cz, data, edits = {}) {
  const solid = meshData(),
    water = meshData(),
    x0 = cx * S,
    z0 = cz * S;
  const get = (x, y, z) => {
    if (y < 0) return 23;
    if (y >= H) return 0;
    if (x >= 0 && x < S && z >= 0 && z < S) return data[blockIndex(x, y, z)];
    const wx = x0 + x,
      wz = z0 + z,
      key = `${wx},${y},${wz}`;
    return Object.hasOwn(edits, key) ? edits[key] : terrain.block(wx, y, wz);
  };
  const occludes = (x, y, z) => !nonOccluding.has(get(x, y, z));
  const isCross = (id) =>
    crossed.has(id) || id === 16 || id === 30 || id === 36;
  const lighting = (x, y, z, id, f, custom = false) => {
    const surface = terrain.column(x0 + x, z0 + z).h;
    const exposedCliff =
      terrain.column(x0 + x + f.n[0], z0 + z + f.n[2]).h < y + 1;
    const sky = y < surface - 3 && !exposedCliff ? 0.48 : 1;
    const luminous =
      id === 13 || id === 16 || id === 30 || id === 32 || id === 36 ? 1.12 : 1;
    const values = [];
    const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2,
      axes = [0, 1, 2].filter((a) => a !== axis);
    for (let j = 0; j < 4; j++) {
      const c = f.c[j];
      let ao = 0;
      if (!transparent.has(id) && !custom) {
        const p = [x + f.n[0], y + f.n[1], z + f.n[2]],
          a = [...p],
          b = [...p],
          d = [...p];
        a[axes[0]] += c[axes[0]] ? 1 : -1;
        b[axes[1]] += c[axes[1]] ? 1 : -1;
        d[axes[0]] += c[axes[0]] ? 1 : -1;
        d[axes[1]] += c[axes[1]] ? 1 : -1;
        const oa = occludes(...a),
          ob = occludes(...b),
          od = occludes(...d);
        ao = oa && ob ? 3 : +oa + +ob + +od;
      }
      values.push(Math.max(0.26, (f.shade - ao * 0.11) * sky) * luminous);
    }
    values.sky = sky;
    return values;
  };
  const pushFace = (
    out,
    x,
    y,
    z,
    id,
    f,
    customCorners,
    uvOrder,
    values,
    repeatX = 1,
    repeatY = 1,
  ) => {
    let tile = id;
    if (id === 1 && f.n[1] === 0) tile = 37;
    if (id === 1 && f.n[1] === -1) tile = 2;
    if (id === 6 && f.n[1] !== 0) tile = 38;
    if (id === 17 && f.n[1] === 1) tile = 39;
    if (id === 18 && f.n[2] === 1) tile = 40;
    const tx = tile % 8,
      ty = Math.floor(tile / 8),
      pad = 0.04 / 16;
    const tint = colors[id] || [1, 1, 1];
    const cols = values || lighting(x, y, z, id, f, !!customCorners);
    const emission =
      id === 13
        ? 0.15
        : id === 16
          ? 0.85
          : id === 30
            ? 0.75
            : id === 32
              ? 0.5
              : id === 36
                ? 1
                : 0;
    for (const j of tri) {
      const c = (customCorners || f.c)[j];
      out.position.push(
        x + c[0],
        y + c[1] - (id === 5 && c[1] ? 0.12 : 0),
        z + c[2],
      );
      out.normal.push(...f.n);
      const uv = uvCorners[uvOrder ? uvOrder[j] : j];
      // Preserve conventional atlas UVs for inspection and tools. The renderer
      // uses repeatUv to keep an original 16px texture per voxel on merged faces.
      out.uv.push(
        (tx + mix(pad, 1 - pad, uv[0])) / 8,
        1 - (ty + 1 - mix(pad, 1 - pad, uv[1])) / 8,
      );
      out.repeatUv.push(uv[0] * repeatX, uv[1] * repeatY);
      out.atlasTile.push(tx, 7 - ty);
      out.color.push(tint[0] * cols[j], tint[1] * cols[j], tint[2] * cols[j]);
      out.glow.push(emission);
    }
  };
  // Crossed vegetation keeps its own alpha-tested, double-sided quads. Water
  // remains a separate animated transparent batch with no hidden internal faces.
  for (let y = 0; y < H; y++)
    for (let z = 0; z < S; z++)
      for (let x = 0; x < S; x++) {
        const id = data[blockIndex(x, y, z)];
        if (!id) continue;
        if (isCross(id)) {
          const height =
            id === 22 ? 0.65 : id === 21 ? 0.72 : id === 34 ? 0.8 : 1;
          const inset = id === 16 ? 0.38 : id === 30 ? 0.22 : 0.08;
          const c1 = [
            [inset, 0, inset],
            [1 - inset, 0, 1 - inset],
            [1 - inset, height, 1 - inset],
            [inset, height, inset],
          ];
          const c2 = [
            [1 - inset, 0, inset],
            [inset, 0, 1 - inset],
            [inset, height, 1 - inset],
            [1 - inset, height, inset],
          ];
          for (const c of [c1, c2]) {
            pushFace(solid, x, y, z, id, faces[4], c);
            pushFace(
              solid,
              x,
              y,
              z,
              id,
              faces[4],
              [...c].reverse(),
              [3, 2, 1, 0],
            );
          }
        } else if (id === 5)
          for (const f of faces) {
            const neighbor = get(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (neighbor === 0 || crossed.has(neighbor))
              pushFace(water, x, y, z, id, f);
          }
      }
  // Greedy face merging. Only identical blocks with equal sunlight are joined.
  // The four exterior AO samples are kept on the resulting rectangle, so cave
  // darkness and contact silhouettes survive without redundant interior faces.
  const dimensions = [S, H, S];
  for (const f of faces) {
    const axis = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const uAxis = f.c[0].findIndex((n, i) => n !== f.c[1][i]);
    const vAxis = f.c[0].findIndex((n, i) => n !== f.c[3][i]);
    const width = dimensions[uAxis],
      height = dimensions[vAxis];
    const mask = new Array(width * height);
    for (let slice = 0; slice < dimensions[axis]; slice++) {
      mask.fill(null);
      for (let v = 0; v < height; v++)
        for (let u = 0; u < width; u++) {
          const p = [0, 0, 0];
          p[axis] = slice;
          p[uAxis] = u;
          p[vAxis] = v;
          const [x, y, z] = p,
            id = data[blockIndex(x, y, z)];
          if (!id || id === 5 || isCross(id)) continue;
          const neighbor = get(x + f.n[0], y + f.n[1], z + f.n[2]);
          if (
            !nonOccluding.has(neighbor) &&
            !(transparent.has(neighbor) && neighbor !== id)
          )
            continue;
          const values = lighting(x, y, z, id, f);
          const merge = true;
          mask[v * width + u] = { id, p, values, merge };
        }
      for (let v = 0; v < height; v++)
        for (let u = 0; u < width; ) {
          const node = mask[v * width + u];
          if (!node) {
            u++;
            continue;
          }
          const same = (entry) =>
            entry &&
            entry.merge &&
            entry.id === node.id &&
            entry.values.sky === node.values.sky;
          let w = 1,
            h = 1;
          if (node.merge) {
            while (u + w < width && same(mask[v * width + u + w])) w++;
            rows: while (v + h < height) {
              for (let i = 0; i < w; i++)
                if (!same(mask[(v + h) * width + u + i])) break rows;
              h++;
            }
          }
          const corners = f.c.map((c) =>
            c.map((n, a) => n * (a === uAxis ? w : a === vAxis ? h : 1)),
          );
          const outerAO = f.c.map((corner, j) => {
            const cu = u + (corner[uAxis] ? w - 1 : 0),
              cv = v + (corner[vAxis] ? h - 1 : 0);
            return mask[cv * width + cu].values[j];
          });
          pushFace(
            solid,
            ...node.p,
            node.id,
            f,
            corners,
            undefined,
            outerAO,
            w,
            h,
          );
          for (let j = 0; j < h; j++)
            for (let i = 0; i < w; i++) mask[(v + j) * width + u + i] = null;
          u += w;
        }
    }
  }
  return { solid: arrays(solid), water: arrays(water) };
}
