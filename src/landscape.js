import * as THREE from "three";
import { CHUNK_SIZE, SEA_LEVEL, hash } from "./worldgen.js";

const COLORS = {
  grass: new THREE.Color(0x607455),
  forest: new THREE.Color(0x566c51),
  amber: new THREE.Color(0x756f50),
  stone: new THREE.Color(0x738183),
  soil: new THREE.Color(0x726c59),
  snow: new THREE.Color(0xb7c8c7),
  sand: new THREE.Color(0xa7a189),
  water: new THREE.Color(0x4f9294),
};

/** A display-only, seeded horizon. It never participates in collision or saving. */
export class DistantLandscape {
  constructor(scene) {
    this.scene = scene;
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = "Distant seeded landscape";
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this.elapsed = 0;
    this.lastSignature = "";
    this.world = null;
    this.rebuilds = 0;
    this.sampleCache = new Map();
  }

  update(world, camera, settings = {}, dt = 0.016) {
    const quality = settings.quality || "high";
    const enabled = !["low", "medium"].includes(quality);
    this.mesh.visible = enabled && !!world;
    if (!enabled || !world) return;
    this.elapsed += Math.min(1, Math.max(0, dt));
    const p = camera.position || camera;
    const cx = Math.floor(p.x / CHUNK_SIZE);
    const cz = Math.floor(p.z / CHUNK_SIZE);
    const radius = Math.max(
      2,
      Math.round(world.renderDistance || settings.renderDistance || 5),
    );
    const far = quality === "cinematic" ? 22 : quality === "ultra" ? 20 : 18;
    const signature = `${cx},${cz},${radius},${far},${world.chunks.size}`;
    if (world !== this.world) {
      this.world = world;
      this.sampleCache.clear();
      this.lastSignature = "";
      this.elapsed = 1;
    }
    if (signature === this.lastSignature || this.elapsed < 0.65) return;
    this.elapsed = 0;
    this.lastSignature = signature;
    this.rebuild(world, cx, cz, radius, far);
  }

  sample(world, x, z) {
    const key = `${x},${z}`;
    let sample = this.sampleCache.get(key);
    if (sample) return sample;
    const column = world.terrain.column(x, z);
    const h = column.h;
    let color;
    if (h < SEA_LEVEL) color = COLORS.water;
    else if (h < SEA_LEVEL + 2 || column.biome === "Amber Dunes")
      color = COLORS.sand;
    else if (h > 62) color = COLORS.snow;
    else if (column.biome === "Copperwood") color = COLORS.amber;
    else if (column.biome === "Fernwood") color = COLORS.forest;
    else color = COLORS.grass;
    const variation =
      0.975 + hash(x >> 3, z >> 3, 0, world.terrain.seed) * 0.05;
    const side =
      h > 59 ? COLORS.stone : h <= SEA_LEVEL ? COLORS.water : COLORS.soil;
    sample = {
      // Integer column heights retain the silhouette of the real voxel world.
      y: Math.max(h + 1, SEA_LEVEL + 1.01),
      top: [color.r * variation, color.g * variation, color.b * variation],
      side: [side.r * variation, side.g * variation, side.b * variation],
    };
    this.sampleCache.set(key, sample);
    return sample;
  }

  rebuild(world, cx, cz, near, far) {
    const position = [],
      color = [],
      indices = [];
    const cells = new Map();
    const tileStep = (tx, tz) => (Math.hypot(tx - cx, tz - cz) < 10 ? 4 : 8);
    const cellAt = (x, z) => {
      const tx = Math.floor(x / CHUNK_SIZE),
        tz = Math.floor(z / CHUNK_SIZE);
      const step = tileStep(tx, tz);
      const x0 = Math.floor(x / step) * step,
        z0 = Math.floor(z / step) * step;
      const key = `${x0},${z0}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = {
          x: x0,
          z: z0,
          step,
          ...this.sample(world, x0 + step / 2, z0 + step / 2),
        };
        cells.set(key, cell);
      }
      return cell;
    };
    const quad = (vertices, tint) => {
      const start = position.length / 3;
      for (const vertex of vertices) {
        position.push(...vertex);
        color.push(...tint);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };
    for (let dz = -far; dz <= far; dz++) {
      for (let dx = -far; dx <= far; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > far || d < near - 0.3) continue;
        const tx = cx + dx,
          tz = cz + dz;
        // The proxy is only the distant horizon. Installed gameplay chunks
        // always take precedence and are never covered by approximation.
        if (world.chunks.has(`${tx},${tz}`)) continue;
        const step = tileStep(tx, tz);
        for (let iz = 0; iz < CHUNK_SIZE; iz += step) {
          for (let ix = 0; ix < CHUNK_SIZE; ix += step) {
            const cell = cellAt(
              tx * CHUNK_SIZE + ix + 0.5,
              tz * CHUNK_SIZE + iz + 0.5,
            );
            const { x, z, y, top, side } = cell;
            quad(
              [
                [x, y, z],
                [x, y, z + step],
                [x + step, y, z + step],
                [x + step, y, z],
              ],
              top,
            );
            // Split only the four boundary strips: neighboring cells may use
            // a different LOD. Every shared edge still closes vertically.
            const wall = (axis, edge, start, direction) => {
              for (let offset = 0; offset < step; ) {
                const along = start + offset;
                const nx =
                  axis === "x" ? edge + direction * 0.01 : along + 0.01;
                const nz =
                  axis === "z" ? edge + direction * 0.01 : along + 0.01;
                const ntx = Math.floor(nx / CHUNK_SIZE),
                  ntz = Math.floor(nz / CHUNK_SIZE);
                const installed = world.chunks.has(`${ntx},${ntz}`);
                const segment = Math.min(
                  step - offset,
                  installed ? 1 : tileStep(ntx, ntz),
                );
                const middle = along + segment / 2;
                const sx = axis === "x" ? edge + direction * 0.01 : middle;
                const sz = axis === "z" ? edge + direction * 0.01 : middle;
                const otherY = installed
                  ? Math.max(
                      SEA_LEVEL + 1.01,
                      world.terrain.column(sx, sz).h + 1,
                    )
                  : cellAt(sx, sz).y;
                if (otherY < y - 0.01) {
                  const end = along + segment;
                  if (axis === "x" && direction > 0)
                    quad(
                      [
                        [edge, y, along],
                        [edge, y, end],
                        [edge, otherY, end],
                        [edge, otherY, along],
                      ],
                      side,
                    );
                  else if (axis === "x")
                    quad(
                      [
                        [edge, y, end],
                        [edge, y, along],
                        [edge, otherY, along],
                        [edge, otherY, end],
                      ],
                      side,
                    );
                  else if (direction > 0)
                    quad(
                      [
                        [end, y, edge],
                        [along, y, edge],
                        [along, otherY, edge],
                        [end, otherY, edge],
                      ],
                      side,
                    );
                  else
                    quad(
                      [
                        [along, y, edge],
                        [end, y, edge],
                        [end, otherY, edge],
                        [along, otherY, edge],
                      ],
                      side,
                    );
                }
                offset += segment;
              }
            };
            wall("x", x, z, -1);
            wall("x", x + step, z, 1);
            wall("z", z, x, -1);
            wall("z", z + step, x, 1);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(position, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.rebuilds++;
    if (this.sampleCache.size > 50000) this.sampleCache.clear();
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.sampleCache.clear();
  }
}
