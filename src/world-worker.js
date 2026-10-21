import { Terrain, meshChunk } from "./worldgen.js";
let terrain,
  edits = {},
  editsByChunk = new Map();
function indexEdit(key, id) {
  const [x, , z] = key.split(",").map(Number),
    chunkKey = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
  let entries = editsByChunk.get(chunkKey);
  if (!entries) {
    entries = {};
    editsByChunk.set(chunkKey, entries);
  }
  entries[key] = id;
}
self.onmessage = ({ data: job }) => {
  if (job.type === "init") {
    terrain = new Terrain(job.seed);
    edits = job.edits || {};
    editsByChunk = new Map();
    for (const [key, id] of Object.entries(edits)) indexEdit(key, id);
    return;
  }
  if (job.type === "edit") {
    edits[job.key] = job.id;
    indexEdit(job.key, job.id);
    return;
  }
  if (job.type !== "chunk" || !terrain) return;
  try {
    const start = performance.now();
    const data = terrain.generate(
      job.cx,
      job.cz,
      editsByChunk.get(`${job.cx},${job.cz}`) || {},
    );
    const mid = performance.now();
    const meshes = meshChunk(terrain, job.cx, job.cz, data, edits);
    const end = performance.now();
    const result = {
      type: "chunk",
      cx: job.cx,
      cz: job.cz,
      token: job.token,
      data,
      ...meshes,
      generationMs: mid - start,
      meshMs: end - mid,
    };
    self.postMessage(result, [
      data.buffer,
      ...Object.values(meshes.solid).map((a) => a.buffer),
      ...Object.values(meshes.water).map((a) => a.buffer),
    ]);
  } catch (error) {
    self.postMessage({
      type: "error",
      cx: job.cx,
      cz: job.cz,
      message: String(error),
      token: job.token,
    });
  }
};
