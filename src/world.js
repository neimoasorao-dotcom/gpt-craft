import * as THREE from "three";
import { atlasTexture } from "./terrain-textures.js";
import { createTerrainMaterials } from "./terrain-materials.js";
import { createWaterMaterial } from "./water.js";
import {
  Terrain,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  SEA_LEVEL,
  meshChunk,
} from "./worldgen.js";

export { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from "./worldgen.js";
const S = CHUNK_SIZE,
  H = WORLD_HEIGHT;
const index = (x, y, z) => (y * S + z) * S + x;
const keyOf = (x, z) => `${x},${z}`;
function geometryFrom(attrs) {
  if (!attrs.position.length) return null;
  const g = new THREE.BufferGeometry(),
    quads = attrs.position.length / 18;
  // The mesher emits independent quads. Index their four unique vertices instead
  // of transforming the two shared corners twice for every triangle pair.
  for (const [name, data] of Object.entries(attrs)) {
    const size =
      name === "uv" || name === "repeatUv" || name === "atlasTile"
        ? 2
        : name === "glow"
          ? 1
          : 3;
    const compact = new Float32Array(quads * 4 * size);
    for (let q = 0; q < quads; q++)
      for (let v = 0; v < 4; v++) {
        const source = (q * 6 + [0, 1, 2, 5][v]) * size,
          target = (q * 4 + v) * size;
        for (let c = 0; c < size; c++) compact[target + c] = data[source + c];
      }
    g.setAttribute(name, new THREE.BufferAttribute(compact, size));
  }
  const indices =
    quads * 4 > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
  for (let q = 0; q < quads; q++)
    for (let v = 0; v < 6; v++)
      indices[q * 6 + v] = q * 4 + [0, 1, 2, 0, 2, 3][v];
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeBoundingSphere();
  return g;
}
function createFastTerrainMaterial(texture) {
  const atlas = texture.clone();
  atlas.anisotropy = 1;
  atlas.minFilter = THREE.NearestMipmapNearestFilter;
  atlas.needsUpdate = true;
  const uniforms = {
    map: { value: atlas },
    daylight: { value: 1 },
    fogColor: { value: new THREE.Color(0xaac5bf) },
    fogDensity: { value: 0.007 },
    lightCount: { value: 0 },
    localLights: {
      value: Array.from({ length: 8 }, () => new THREE.Vector4()),
    },
    localColors: {
      value: Array.from({ length: 8 }, () => new THREE.Vector3()),
    },
  };
  const material = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms,
    transparent: false,
    vertexShader: `
attribute vec2 repeatUv; attribute vec2 atlasTile; attribute float glow;
uniform float daylight,fogDensity;uniform int lightCount;uniform vec4 localLights[8];uniform vec3 localColors[8];
varying vec2 vRepeatUv,vAtlasTile;varying vec3 vColor;varying float vFog;
void main(){
 vec4 world=modelMatrix*vec4(position,1.0);vec4 view=modelViewMatrix*vec4(position,1.0);
 vec3 illumination=mix(vec3(.12,.17,.27),vec3(1.25,1.25,1.15),daylight)+vec3(glow*.8);
 for(int i=0;i<8;i++){if(i>=lightCount)break;vec3 delta=localLights[i].xyz-world.xyz;float attenuation=max(0.,1.-dot(delta,delta)/(localLights[i].w*localLights[i].w));illumination+=localColors[i]*attenuation*attenuation;}
 vColor=color*illumination;vRepeatUv=repeatUv;vAtlasTile=atlasTile;
 vFog=1.-exp(-fogDensity*fogDensity*view.z*view.z);gl_Position=projectionMatrix*view;
}`,
    fragmentShader: `
uniform sampler2D map;uniform vec3 fogColor;varying vec2 vRepeatUv,vAtlasTile;varying vec3 vColor;varying float vFog;
void main(){vec2 uv=(vAtlasTile+vec2(.0025)+fract(vRepeatUv)*.995)/8.;vec2 gx=dFdx(vRepeatUv)*.124375,gy=dFdy(vRepeatUv)*.124375;gx/=max(1.,length(gx)*16.);gy/=max(1.,length(gy)*16.);vec4 texel=textureGrad(map,uv,gx,gy);if(texel.a<.35)discard;vec3 col=mix(texel.rgb*vColor,fogColor,clamp(vFog,0.,1.));gl_FragColor=vec4(sqrt(max(col,vec3(0.))),1.);}
`,
  });
  material.userData.atlas = atlas;
  return material;
}

export class World {
  constructor(scene, seed, edits = {}) {
    this.scene = scene;
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.edits = { ...edits };
    this.chunks = new Map();
    this.pending = new Map();
    this.queue = [];
    this.tokens = 0;
    this.editsByChunk = new Map();
    for (const [key, id] of Object.entries(this.edits)) this.indexEdit(key, id);
    this.time = 0;
    this.disposed = false;
    this.lastCenter = "";
    this.workers = [];
    this.stats = {
      chunks: 0,
      triangles: 0,
      generationMs: 0,
      meshMs: 0,
      queued: 0,
    };
    this.texture = atlasTexture();
    this.fastMaterial = createFastTerrainMaterial(this.texture);
    this.quality = "high";
    this.localLights = [];
    this._lightColor = new THREE.Color();
    const terrainMaterials = createTerrainMaterials(this.texture);
    this.material = terrainMaterials.solid;
    this.depthMaterial = terrainMaterials.depth;
    this.terrainUniforms = terrainMaterials.uniforms;
    this.waterMaterial = createWaterMaterial();
    this.waterUniform = this.waterMaterial.uniforms.waterTime;
    this.materials = { solid: this.material, water: this.waterMaterial };
    if (typeof Worker !== "undefined") {
      const count = Math.min(
        2,
        Math.max(1, (navigator.hardwareConcurrency || 4) - 2),
      );
      for (let i = 0; i < count; i++) {
        const worker = new Worker(
          new URL("./world-worker.js", import.meta.url),
          { type: "module" },
        );
        const slot = { worker, busy: false };
        worker.postMessage({ type: "init", seed, edits: this.edits });
        worker.onmessage = ({ data }) => {
          slot.busy = false;
          slot.currentJob = null;
          if (!this.disposed) this.acceptChunk(data);
        };
        worker.onerror = (event) => {
          console.warn(
            "Terrain worker failed; using available workers or frame-budgeted generation.",
            event.message,
          );
          slot.busy = false;
          slot.failed = true;
          worker.terminate();
          const job = slot.currentJob;
          if (job && this.pending.get(job.key) === job.token)
            this.queue.unshift(job);
          slot.currentJob = null;
        };
        this.workers.push(slot);
      }
    }
  }
  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return 23;
    if (y >= H) return 0;
    const edit = `${x},${y},${z}`;
    if (Object.hasOwn(this.edits, edit)) return this.edits[edit];
    const cx = Math.floor(x / S),
      cz = Math.floor(z / S),
      c = this.chunks.get(keyOf(cx, cz));
    if (c?.data) return c.data[index(x - cx * S, y, z - cz * S)];
    return this.terrain.block(x, y, z);
  }
  getHeight(x, z) {
    return this.terrain.column(Math.floor(x), Math.floor(z)).h;
  }
  getBiome(x, z) {
    return this.terrain.column(Math.floor(x), Math.floor(z)).biome;
  }
  getSpawn() {
    return { x: 0.5, y: this.getHeight(0, 5) + 1.05, z: 5.5 };
  }
  serializeEdits() {
    return { ...this.edits };
  }
  indexEdit(key, id) {
    const [x, , z] = key.split(",").map(Number),
      chunkKey = keyOf(Math.floor(x / S), Math.floor(z / S));
    let entries = this.editsByChunk.get(chunkKey);
    if (!entries) {
      entries = {};
      this.editsByChunk.set(chunkKey, entries);
    }
    entries[key] = id;
  }
  setTime(dayFraction) {
    this.dayFraction = dayFraction;
    this.fastMaterial.uniforms.daylight.value = THREE.MathUtils.smoothstep(
      Math.sin(dayFraction * Math.PI * 2 - Math.PI / 2),
      -0.15,
      0.4,
    );
  }
  setQuality(quality) {
    this.quality = quality;
    const material = quality === "low" ? this.fastMaterial : this.material;
    this.waterMaterial.uniforms.waterDetail.value =
      { low: 0, medium: 1, high: 2, ultra: 3, cinematic: 3 }[quality] ?? 2;
    const anisotropy = quality === "cinematic" ? 16 : quality === "low" ? 1 : 8;
    if (this.texture.anisotropy !== anisotropy) {
      this.texture.anisotropy = anisotropy;
      this.texture.needsUpdate = true;
    }
    this.materials.solid = material;
    for (const chunk of this.chunks.values())
      if (chunk.solid) chunk.solid.material = material;
  }
  setRenderContext(context = {}) {
    const u = this.waterMaterial.uniforms;
    u.hasScene.value =
      !!context.enabled && !!context.depthTexture && !!context.colorTexture;
    if (!u.hasScene.value) {
      u.sceneColor.value = null;
      u.sceneDepth.value = null;
    }
    if (context.colorTexture) u.sceneColor.value = context.colorTexture;
    if (context.depthTexture) u.sceneDepth.value = context.depthTexture;
    if (context.resolution) u.sceneResolution.value.copy(context.resolution);
    if (context.cameraNear) u.cameraNear.value = context.cameraNear;
    if (context.cameraFar) u.cameraFar.value = context.cameraFar;
  }
  setWaterVisible(visible) {
    for (const chunk of this.chunks.values())
      if (chunk.water) chunk.water.visible = visible;
  }
  updateEnvironment() {
    if (!this.waterMaterial) return;
    const a = this.scene.userData.atmosphere;
    const u = this.waterMaterial.uniforms;
    const t = this.terrainUniforms;
    const elapsed = a?.elapsed ?? this.time;
    u.waterTime.value = elapsed;
    t.terrainTime.value = elapsed;
    if (a) {
      if (a.sunDirection) {
        u.sunDirection.value.copy(a.sunDirection);
        t.terrainSunDirection.value.copy(a.sunDirection);
      }
      if (a.sunColor) {
        u.sunColor.value.copy(a.sunColor);
        t.terrainSunColor.value.copy(a.sunColor);
      }
      if (a.skyTop) u.skyTop.value.copy(a.skyTop);
      if (a.skyHorizon) u.skyHorizon.value.copy(a.skyHorizon);
      u.daylight.value = t.terrainDaylight.value = a.daylight ?? 1;
      u.wetness.value = t.terrainWetness.value = a.wetness ?? 0;
    }
    if (this.scene.fog) {
      u.fogColor.value.copy(this.scene.fog.color);
      u.fogDensity.value = this.scene.fog.density ?? 0.007;
    }
  }
  setLocalLights(lights = []) {
    this.localLights = Array.isArray(lights) ? lights : [];
    this.updateFastUniforms();
  }
  updateFastUniforms() {
    const uniforms = this.fastMaterial.uniforms;
    if (this.scene.fog) {
      uniforms.fogColor.value.copy(this.scene.fog.color);
      uniforms.fogDensity.value = this.scene.fog.density ?? 0.007;
    }
    let count = 0;
    for (const light of this.localLights) {
      if (!light) continue;
      const p = light.position || light;
      if (![p.x, p.y, p.z].every(Number.isFinite)) continue;
      uniforms.localLights.value[count].set(
        p.x,
        p.y,
        p.z,
        Math.max(3, Number(light.distance) || 11),
      );
      if (light.color?.isColor) this._lightColor.copy(light.color);
      else this._lightColor.set(light.color ?? 0xffcc83);
      uniforms.localColors.value[count]
        .set(this._lightColor.r, this._lightColor.g, this._lightColor.b)
        .multiplyScalar(
          Math.min(
            2,
            (Number.isFinite(light.intensity)
              ? Math.max(0, light.intensity)
              : 8) * 0.16,
          ),
        );
      if (++count === 8) break;
    }
    uniforms.lightCount.value = count;
  }
  setBlock(x, y, z, id) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y <= 0 || y >= H || id < 0 || id > 63) return false;
    const key = `${x},${y},${z}`;
    if (this.getBlock(x, y, z) === id) return false;
    this.edits[key] = id;
    this.indexEdit(key, id);
    for (const slot of this.workers)
      slot.worker.postMessage({ type: "edit", key, id });
    const cx = Math.floor(x / S),
      cz = Math.floor(z / S),
      lx = x - cx * S,
      lz = z - cz * S;
    const c = this.chunks.get(keyOf(cx, cz));
    if (c) c.data[index(lx, y, lz)] = id;
    this.request(cx, cz, true);
    if (lx === 0) this.request(cx - 1, cz, true);
    if (lx === 15) this.request(cx + 1, cz, true);
    if (lz === 0) this.request(cx, cz - 1, true);
    if (lz === 15) this.request(cx, cz + 1, true);
    return true;
  }
  request(cx, cz, force = false) {
    const key = keyOf(cx, cz);
    if (!force && (this.chunks.has(key) || this.pending.has(key))) return;
    const token = ++this.tokens;
    this.pending.set(key, token);
    this.queue = this.queue.filter((job) => job.key !== key);
    const job = { key, cx, cz, token };
    if (force) this.queue.unshift(job);
    else this.queue.push(job);
  }
  buildSync(cx, cz) {
    const begin = performance.now(),
      data = this.terrain.generate(
        cx,
        cz,
        this.editsByChunk.get(keyOf(cx, cz)) || {},
      ),
      mid = performance.now();
    const meshes = meshChunk(this.terrain, cx, cz, data, this.edits);
    this.pending.delete(keyOf(cx, cz));
    this.acceptChunk({
      cx,
      cz,
      data,
      ...meshes,
      generationMs: mid - begin,
      meshMs: performance.now() - mid,
    });
  }
  ensureAround(x, z, radius = 1) {
    const cx = Math.floor(x / S),
      cz = Math.floor(z / S);
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        const key = keyOf(cx + dx, cz + dz);
        if (!this.chunks.has(key)) this.buildSync(cx + dx, cz + dz);
      }
    this.recount();
  }
  acceptChunk(result) {
    const key = keyOf(result.cx, result.cz);
    if (result.token && this.pending.get(key) !== result.token) return;
    this.pending.delete(key);
    if (result.type === "error") {
      console.warn("Could not build chunk:", result.message);
      return;
    }
    // Results can finish after the player has moved far away.
    if (
      this.center &&
      Math.hypot(result.cx - this.center.x, result.cz - this.center.z) >
        this.renderDistance + 2
    )
      return;
    const old = this.chunks.get(key);
    if (old) this.removeMeshes(old);
    const c = { cx: result.cx, cz: result.cz, data: result.data };
    for (const kind of ["solid", "water"]) {
      const g = geometryFrom(result[kind]);
      if (!g) continue;
      const mesh = new THREE.Mesh(
        g,
        kind === "solid" ? this.materials.solid : this.waterMaterial,
      );
      mesh.position.set(result.cx * S, 0, result.cz * S);
      mesh.castShadow = kind === "solid";
      mesh.receiveShadow = true;
      if (kind === "solid") mesh.customDepthMaterial = this.depthMaterial;
      mesh.userData.chunk = key;
      if (kind === "water") mesh.renderOrder = 1;
      this.scene.add(mesh);
      c[kind] = mesh;
    }
    this.chunks.set(key, c);
    this.stats.generationMs = result.generationMs;
    this.stats.meshMs = result.meshMs;
    this.recount();
  }
  removeMeshes(chunk) {
    for (const kind of ["solid", "water"])
      if (chunk[kind]) {
        this.scene.remove(chunk[kind]);
        chunk[kind].geometry.dispose();
      }
  }
  recount() {
    this.stats.chunks = this.chunks.size;
    let triangles = 0;
    for (const c of this.chunks.values())
      for (const k of ["solid", "water"])
        triangles +=
          (c[k]?.geometry.index?.count ||
            c[k]?.geometry.attributes.position.count ||
            0) / 3;
    this.stats.triangles = triangles;
  }
  update(position, renderDistance = 5) {
    if (this.disposed) return;
    this.updateFastUniforms();
    this.time = performance.now() / 1000;
    this.waterUniform.value = this.time;
    this.updateEnvironment();
    const cx = Math.floor(position.x / S),
      cz = Math.floor(position.z / S);
    const r = Math.max(2, Math.min(12, Math.round(renderDistance)));
    this.center = { x: cx, z: cz };
    this.renderDistance = r;
    const center = `${cx},${cz},${r}`;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      const want = [];
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dz);
          if (d <= r + 0.3) want.push({ cx: cx + dx, cz: cz + dz, d });
        }
      want.sort((a, b) => a.d - b.d);
      for (const job of want) this.request(job.cx, job.cz);
      this.queue = this.queue.filter((job) => {
        const keep = Math.hypot(job.cx - cx, job.cz - cz) <= r + 1;
        if (!keep) this.pending.delete(job.key);
        return keep;
      });
      this.queue.sort(
        (a, b) =>
          Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz),
      );
      for (const [key, chunk] of this.chunks)
        if (Math.hypot(chunk.cx - cx, chunk.cz - cz) > r + 1.7) {
          this.removeMeshes(chunk);
          this.chunks.delete(key);
        }
      this.recount();
    }
    const liveWorkers = this.workers.filter((w) => !w.failed);
    if (liveWorkers.length) {
      for (const slot of liveWorkers)
        if (!slot.busy && this.queue.length) {
          const job = this.queue.shift();
          if (this.pending.get(job.key) !== job.token) continue;
          slot.busy = true;
          slot.currentJob = job;
          slot.worker.postMessage({ type: "chunk", ...job });
        }
    } else if (this.queue.length) {
      const job = this.queue.shift();
      this.buildSync(job.cx, job.cz);
    }
    this.stats.queued = this.pending.size;
  }
  dispose() {
    this.disposed = true;
    for (const slot of this.workers) slot.worker.terminate();
    for (const chunk of this.chunks.values()) this.removeMeshes(chunk);
    this.chunks.clear();
    this.pending.clear();
    this.queue.length = 0;
    this.editsByChunk.clear();
    this.terrain.columns.clear();
    this.terrain.treeCache.clear();
    this.terrain.structures.clear();
    this.fastMaterial.userData.atlas.dispose();
    this.fastMaterial.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
    this.waterMaterial.dispose();
    this.texture.dispose();
  }
}
