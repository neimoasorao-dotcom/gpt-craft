import { ITEMS, BLOCKS } from "./data.js";
import { GRAPHICS_PRESETS } from "./graphics-config.js";
/** Versioned local worlds. IndexedDB is primary; localStorage is a safe fallback. */
export const SAVE_VERSION = 1;
const DB_NAME = "wildbound-worlds";
const WORLD_PREFIX = "wildbound:world:";
const SETTINGS_KEY = "wildbound:settings:v1";
const memory = new Map();
export const DEFAULT_SETTINGS = Object.freeze({
  renderDistance: 5,
  fov: 76,
  sensitivity: 1,
  volume: 0.65,
  musicVolume: 0.22,
  effectsVolume: 0.7,
  quality: "high",
  autoResolution: true,
  headBob: true,
  showHints: true,
});
function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}
function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
function cleanSettings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const s = { ...DEFAULT_SETTINGS };
  if (value.volume == null && value.masterVolume != null)
    value = { ...value, volume: value.masterVolume };
  const bounds = {
    renderDistance: [2, 12],
    fov: [55, 105],
    sensitivity: [0.1, 3],
    volume: [0, 1],
    musicVolume: [0, 1],
    effectsVolume: [0, 1],
  };
  for (const [key, [min, max]] of Object.entries(bounds))
    if (Number.isFinite(Number(value[key])))
      s[key] = Math.max(min, Math.min(max, Number(value[key])));
  s.renderDistance = Math.round(s.renderDistance);
  if (Object.hasOwn(GRAPHICS_PRESETS, value.quality || value.graphics))
    s.quality = value.quality || value.graphics;
  if (typeof value.autoResolution === "boolean")
    s.autoResolution = value.autoResolution;
  if (typeof value.headBob === "boolean") s.headBob = value.headBob;
  if (typeof value.showHints === "boolean") s.showHints = value.showHints;
  return s;
}
export function loadSettings() {
  try {
    const target = storage();
    return cleanSettings(
      target
        ? JSON.parse(target.getItem(SETTINGS_KEY) || "{}")
        : memory.get(SETTINGS_KEY) || {},
    );
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings) {
  const clean = cleanSettings(settings);
  const target = storage();
  if (target) target.setItem(SETTINGS_KEY, JSON.stringify(clean));
  else memory.set(SETTINGS_KEY, clean);
  return clean;
}
function id() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function checkPosition(position, label = "座標") {
  const values = Array.isArray(position)
    ? position
    : [position?.x, position?.y, position?.z];
  if (
    values.length !== 3 ||
    values.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7)
  )
    throw new Error(`${label}が不正です。`);
}
function checkSlot(slot) {
  if (slot === null) return;
  if (
    !isRecord(slot) ||
    !ITEMS[slot.id] ||
    !Number.isInteger(slot.count) ||
    slot.count < 1 ||
    slot.count > ITEMS[slot.id].stack
  )
    throw new Error("持ち物のアイテムが不正です。");
  if (
    slot.durability != null &&
    (!Number.isFinite(slot.durability) ||
      slot.durability <= 0 ||
      slot.durability > (ITEMS[slot.id].durability || 0))
  )
    throw new Error("道具の耐久値が不正です。");
}
function checkInventory(inventory) {
  const slots = Array.isArray(inventory) ? inventory : inventory?.slots;
  if (!Array.isArray(slots) || slots.length > 36)
    throw new Error("持ち物の形式が不正です。");
  slots.forEach(checkSlot);
  if (!Array.isArray(inventory)) {
    if (
      inventory.selected != null &&
      (!Number.isInteger(inventory.selected) ||
        inventory.selected < 0 ||
        inventory.selected > 8)
    )
      throw new Error("選択スロットが不正です。");
    if (inventory.equipment != null) {
      checkSlot(inventory.equipment);
      if (!ITEMS[inventory.equipment.id].armor)
        throw new Error("装備アイテムが不正です。");
    }
  }
}
function checkTree(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 2e6 || depth > 24)
    throw new Error("ワールドデータが複雑すぎます。");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("ワールドに不正な数値が含まれています。");
  if (typeof value === "string" && value.length > 65536)
    throw new Error("ワールドの文字列が長すぎます。");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("ワールドに不正なキーが含まれています。");
      checkTree(child, depth + 1, budget);
    }
}
function validate(save, { importing = false, touch = true } = {}) {
  if (!save || typeof save !== "object" || Array.isArray(save))
    throw new Error("ワールドの形式を読み取れません。");
  if (save.version != null && save.version !== SAVE_VERSION)
    throw new Error("このワールドは対応していないバージョンです。");
  if (typeof save.seed !== "string" && !Number.isFinite(save.seed))
    throw new Error("ワールドのシードがありません。");
  if (String(save.seed).length > 512) throw new Error("シードが長すぎます。");
  checkTree(save);
  const name =
    typeof save.name === "string"
      ? save.name.trim().slice(0, 64)
      : "名もなき世界";
  const result = clone(save);
  result.version = SAVE_VERSION;
  result.name = name || "名もなき世界";
  result.id = importing
    ? id()
    : typeof save.id === "string" && /^[\w-]{1,100}$/.test(save.id)
      ? save.id
      : id();
  result.seed = String(save.seed);
  result.createdAt = Number.isFinite(save.createdAt)
    ? save.createdAt
    : Date.now();
  result.updatedAt = touch
    ? Date.now()
    : Number.isFinite(save.updatedAt)
      ? save.updatedAt
      : result.createdAt;
  if (
    result.mode != null &&
    !["survival", "creative", "peaceful"].includes(result.mode)
  )
    throw new Error("ゲームモードが不正です。");
  for (const key of ["time", "playTime"])
    if (
      result[key] != null &&
      (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 1e12)
    )
      throw new Error("ワールドの時刻が不正です。");
  if (result.spawn != null) checkPosition(result.spawn, "リスポーン地点");
  if (result.player != null) {
    if (!isRecord(result.player))
      throw new Error("プレイヤーの形式が不正です。");
    if (result.player.position != null)
      checkPosition(result.player.position, "プレイヤーの座標");
    if (result.player.spawn != null)
      checkPosition(result.player.spawn, "プレイヤーのリスポーン地点");
    for (const key of ["health", "hunger", "oxygen", "stamina", "yaw", "pitch"])
      if (result.player[key] != null && !Number.isFinite(result.player[key]))
        throw new Error("プレイヤーの状態が不正です。");
  }
  if (result.inventory != null) checkInventory(result.inventory);
  if (result.edits != null) {
    if (!isRecord(result.edits)) throw new Error("地形の変更履歴が不正です。");
    const entries = Object.entries(result.edits);
    if (entries.length > 500000)
      throw new Error("地形の変更履歴が大きすぎます。");
    for (const [key, block] of entries) {
      const coordinates = key.split(",").map(Number);
      const [x, y, z] = coordinates;
      if (
        coordinates.length !== 3 ||
        coordinates.some((n) => !Number.isInteger(n)) ||
        Math.abs(x) > 1e7 ||
        Math.abs(z) > 1e7 ||
        y < 0 ||
        y > 255 ||
        key !== `${x},${y},${z}` ||
        !Number.isInteger(block) ||
        !BLOCKS[block]
      )
        throw new Error("地形の変更履歴に不正なブロックがあります。");
    }
  }
  if (result.entities != null) {
    const e = result.entities;
    if (
      !isRecord(e) ||
      !Array.isArray(e.mobs) ||
      !Array.isArray(e.drops) ||
      e.mobs.length > 500 ||
      e.drops.length > 1000
    )
      throw new Error("生物データの形式が不正です。");
    for (const mob of e.mobs) {
      if (
        !isRecord(mob) ||
        typeof mob.type !== "string" ||
        mob.type.length > 64
      )
        throw new Error("生物の種類が不正です。");
      checkPosition(mob.position, "生物の座標");
      for (const key of ["health", "yaw", "age"])
        if (mob[key] != null && !Number.isFinite(mob[key]))
          throw new Error("生物の状態が不正です。");
    }
    for (const drop of e.drops) {
      checkSlot(drop);
      checkPosition(drop.position, "アイテムの座標");
      if (drop.age != null && (!Number.isFinite(drop.age) || drop.age < 0))
        throw new Error("アイテムの状態が不正です。");
    }
  }
  if (result.progress != null && !isRecord(result.progress))
    throw new Error("進行状況の形式が不正です。");
  if (result.chests != null) {
    if (!isRecord(result.chests) || Object.keys(result.chests).length > 10000)
      throw new Error("収納データの形式が不正です。");
    for (const chest of Object.values(result.chests))
      if (
        Array.isArray(chest) ||
        (isRecord(chest) && Array.isArray(chest.slots))
      )
        checkInventory(chest);
      else if (chest !== true && chest !== false)
        throw new Error("収納アイテムの形式が不正です。");
  }
  return result;
}
const summary = (world) => ({
  id: world.id,
  name: world.name,
  seed: world.seed,
  mode: world.mode || "survival",
  createdAt: world.createdAt,
  updatedAt: world.updatedAt,
  playTime: world.playTime || 0,
  day: Math.floor((world.time || 0) / 1200) + 1,
  version: world.version,
});
export class SaveStore {
  constructor() {
    this.database = null;
    this.backend = "pending";
    this._ready = this._open();
  }
  async _open() {
    if (!globalThis.indexedDB) {
      this.backend = storage() ? "localStorage" : "memory";
      return null;
    }
    try {
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, SAVE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("worlds"))
            request.result.createObjectStore("worlds", { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error("他のタブがワールドの更新を待っています。"));
      });
      this.database.onversionchange = () => {
        this.database?.close();
        this.database = null;
        this.backend = storage() ? "localStorage" : "memory";
      };
      this.backend = "indexedDB";
      return this.database;
    } catch {
      this.backend = storage() ? "localStorage" : "memory";
      return null;
    }
  }
  async _transaction(mode, operation) {
    await this._ready;
    if (!this.database) return null;
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction("worlds", mode),
        store = tx.objectStore("worlds");
      let result;
      try {
        const req = operation(store);
        req.onsuccess = () => {
          result = req.result;
        };
        req.onerror = () => reject(req.error);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () =>
        reject(tx.error || new Error("ワールドの保存に失敗しました。"));
      tx.onabort = () =>
        reject(tx.error || new Error("ワールドの保存を中断しました。"));
    });
  }
  async list() {
    await this._ready;
    let worlds;
    if (this.database)
      worlds = await this._transaction("readonly", (s) => s.getAll());
    else {
      worlds = [];
      const target = storage();
      if (target) {
        for (let i = 0; i < target.length; i++) {
          const key = target.key(i);
          if (!key?.startsWith(WORLD_PREFIX)) continue;
          try {
            const w = JSON.parse(target.getItem(key));
            if (w?.id && w?.version === SAVE_VERSION) worlds.push(w);
          } catch {
            /* A damaged local entry does not hide other worlds. */
          }
        }
      } else
        for (const [key, w] of memory)
          if (key.startsWith(WORLD_PREFIX)) worlds.push(w);
    }
    return worlds
      .filter((w) => w && w.id)
      .map(summary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async get(worldId) {
    await this._ready;
    let value;
    if (this.database)
      value = await this._transaction("readonly", (s) => s.get(worldId));
    else {
      const target = storage();
      const raw = target?.getItem(WORLD_PREFIX + worldId);
      if (raw) {
        try {
          value = JSON.parse(raw);
        } catch {
          throw new Error(
            "セーブデータが破損しています。バックアップから復元してください。",
          );
        }
      } else value = memory.get(WORLD_PREFIX + worldId);
    }
    if (!value) return null;
    if (value.version !== SAVE_VERSION)
      throw new Error("このセーブバージョンには対応していません。");
    return validate(value, { touch: false });
  }
  async put(save) {
    const value = validate(save);
    await this._ready;
    if (this.database)
      await this._transaction("readwrite", (s) => s.put(value));
    else {
      const target = storage();
      if (target) {
        try {
          target.setItem(WORLD_PREFIX + value.id, JSON.stringify(value));
        } catch (error) {
          throw new Error(
            error?.name === "QuotaExceededError"
              ? "保存領域がいっぱいです。不要なワールドをバックアップして削除してください。"
              : "ワールドを保存できません。ブラウザのストレージ権限を確認してください。",
          );
        }
      } else memory.set(WORLD_PREFIX + value.id, clone(value));
    }
    return value.id;
  }
  async delete(worldId) {
    await this._ready;
    if (this.database)
      await this._transaction("readwrite", (s) => s.delete(worldId));
    else {
      storage()?.removeItem(WORLD_PREFIX + worldId);
      memory.delete(WORLD_PREFIX + worldId);
    }
    return true;
  }
  async export(worldId) {
    const world = await this.get(worldId);
    if (!world) throw new Error("ワールドが見つかりません。");
    return JSON.stringify(
      { format: "wildbound", version: SAVE_VERSION, world },
      null,
      2,
    );
  }
  async import(json) {
    if (typeof json !== "string" || json.length > 32 * 1024 * 1024)
      throw new Error("バックアップは32 MB以下のJSONを選んでください。");
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("JSON形式のワールドファイルを選んでください。");
    }
    if (parsed.format && parsed.format !== "wildbound")
      throw new Error("WILDBOUNDのワールドファイルではありません。");
    const world = validate(parsed.world || parsed, { importing: true });
    world.name = `${world.name.slice(0, 58)} (復元)`;
    return this.put(world);
  }
}
