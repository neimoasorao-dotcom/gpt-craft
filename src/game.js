import * as THREE from "three";
import { World } from "./world.js";
import { Player, raycastVoxel } from "./player.js";
import { Inventory } from "./inventory.js";
import { EntitySystem } from "./entities.js";
import { AudioSystem } from "./audio.js";
import { UI } from "./ui.js";
import { SaveStore, loadSettings, saveSettings } from "./save.js";
import { B, BLOCKS, ITEMS, RECIPES, PROGRESSION, BIOME_NAMES } from "./data.js";
import { Atmosphere, HandView } from "./scene.js";
import { NavigationMap } from "./map.js";
import { PerformanceGovernor } from "./performance.js";
import { BeaconEffects } from "./beacons.js";

const DAY_LENGTH = 1200;
const emptyProgress = () => ({
  collected: {},
  crafted: {},
  placed: 0,
  mined: 0,
  kills: 0,
  biomes: [],
  completed: [],
  beacon: false,
});
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
const keyFor = (x, y, z) =>
  `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
const jpBiome = {
  Meadowlands: "陽だまりの草原",
  Fernwood: "白樺の森",
  Copperwood: "琥珀の森",
  Frostpeak: "霧氷の峰",
  "Amber Dunes": "さざめく砂丘",
  "Sunlit Coast": "白砂の浜",
};
export class Game {
  constructor(canvas, root) {
    this.canvas = canvas;
    this.root = root;
    this.state = "menu";
    this.settings = loadSettings();
    this.store = new SaveStore();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shadowTimer = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      innerWidth / innerHeight,
      0.07,
      420,
    );
    this.scene.add(this.camera);
    this.atmosphere = new Atmosphere(this.scene, this.renderer, this.camera);
    this.hand = new HandView(this.camera);
    this.keys = new Set();
    this.mouseDown = false;
    this.rightDown = false;
    this.locked = false;
    this.time = 420;
    this.playTime = 0;
    this.autoSave = 0;
    this.progress = emptyProgress();
    this.target = null;
    this.mining = 0;
    this.mineKey = "";
    this.attackCooldown = 0;
    this.placeCooldown = 0;
    this.chests = {};
    this.planted = {};
    this.farmTick = 0;
    this.lights = [];
    this.lightTick = 0;
    this.fps = 60;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.debug = false;
    this.lastInventoryRevision = -1;
    this.audio = new AudioSystem(this.settings);
    this.ui = new UI(root, {
      newWorld: (options) => this.startWorld(options),
      loadWorld: (id) => this.loadWorld(id),
      deleteWorld: (id) => this.deleteWorld(id),
      resume: () => this.resume(),
      close: () => this.resume(),
      saveAndQuit: () => this.saveAndQuit(),
      save: () => this.save(true),
      settings: (patch) => this.updateSettings(patch),
      inventoryClick: (i, e) => this.inventoryClick(i, e),
      craft: (id) => this.craft(id),
      dropSlot: (i) => this.dropSlot(i),
      equip: (i) => this.equip(i),
      sleep: () => this.sleep(),
      respawn: () => this.respawn(),
      exportWorld: (id) => this.exportWorld(id),
      importWorld: (file) => this.importWorld(file),
      journal: () => this.openJournal(),
      selectSlot: (i) => this.selectSlot(i),
      chestClick: (i, e) => this.chestClick(i, e),
      creativeItem: (id) => this.creativeItem(id),
    });
    this.ui.settings = { ...this.settings };
    const edges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
    );
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0xf8e2a4,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.crackTextures = this.createCracks();
    this.cracks = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({
        map: this.crackTextures[0],
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    this.cracks.visible = false;
    this.scene.add(this.cracks);
    this.performance = new PerformanceGovernor(() => this.applySettings());
    this.performance.configure(this.settings);
    this.bindInput();
    this.applySettings();
    this.lastTime = performance.now();
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
  }
  async init() {
    this.ui.showLoading(0, "風景を描いています");
    await nextFrame();
    this.world = new World(this.scene, "wildbound");
    this.world.setQuality?.(this.settings.quality);
    const spawn = this.world.getSpawn();
    this.world.ensureAround(spawn.x, spawn.z, 3);
    this.menuOrigin = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.menuTime = 0;
    this.camera.position.set(spawn.x + 4, spawn.y + 13, spawn.z + 21);
    this.camera.lookAt(spawn.x + 6, spawn.y - 2, spawn.z - 25);
    this.entities = this.createEntities("survival");
    this.entities.update(
      0.016,
      { position: this.menuOrigin, health: 100, dead: false, damage: () => {} },
      0.35,
    );
    await nextFrame();
    this.ui.showMain(await this.store.list());
  }
  createEntities(mode) {
    return new EntitySystem(this.scene, this.world, {
      mode,
      onPickup: (id, count, durability) => {
        if (this.state !== "playing" || !this.inventory) return count;
        const remaining = this.inventory.add(id, count, durability);
        if (remaining < count) {
          this.collect(id, count - remaining);
          this.audio.play("pickup");
          this.ui.toast(`${ITEMS[id]?.name || id} +${count - remaining}`);
        }
        return remaining;
      },
      onDamage: (amount, source) => {
        if (this.state === "playing") this.player?.damage(amount, source);
      },
      onSound: (type, position) =>
        this.audio.play(type, {
          distance: position?.distanceTo(
            this.player?.position || this.camera.position,
          ),
        }),
      onToast: (text) => this.ui.toast(text),
      onKill: (type) => {
        this.progress.kills++;
        this.ui.toast("生き物の記録を旅の手帳に追加");
      },
    });
  }
  async startWorld(options = {}, saved = null) {
    if (this.state === "loading") return;
    this.performance?.reset();
    this.state = "loading";
    this.ui.showLoading(0.05, "世界の輪郭をたどっています");
    this.unlock();
    this.keys.clear();
    try {
      await nextFrame();
      this.map?.dispose();
      this.beaconEffects?.dispose();
      this.world?.dispose();
      this.entities?.dispose();
      this.clearLights();
      this.id = saved?.id || crypto.randomUUID();
      this.name = String(saved?.name || options.name || "名もなき世界").slice(
        0,
        64,
      );
      this.seed =
        String(saved?.seed ?? options.seed ?? "").trim() ||
        Math.random().toString(36).slice(2, 10);
      this.mode = saved?.mode || options.mode || "survival";
      this.createdAt = saved?.createdAt || Date.now();
      this.time = Number.isFinite(saved?.time) ? saved.time : 420;
      this.playTime = saved?.playTime || 0;
      this.progress = { ...emptyProgress(), ...(saved?.progress || {}) };
      this.chests = saved?.chests || {};
      this.planted = saved?.planted || {};
      this.world = new World(this.scene, this.seed, saved?.edits || {});
      this.world.setQuality?.(this.settings.quality);
      this.beaconEffects = new BeaconEffects(this.scene);
      this.ui.showLoading(0.25, "山と森、地下の物語を紡いでいます");
      await nextFrame();
      const spawn = saved?.spawn || this.world.getSpawn();
      this.spawn = new THREE.Vector3(
        spawn.x ?? spawn[0],
        spawn.y ?? spawn[1],
        spawn.z ?? spawn[2],
      );
      this.world.ensureAround(
        saved?.player?.position?.x ??
          saved?.player?.position?.[0] ??
          this.spawn.x,
        saved?.player?.position?.z ??
          saved?.player?.position?.[2] ??
          this.spawn.z,
        3,
      );
      this.ui.showLoading(0.65, "旅の支度をしています");
      await nextFrame();
      this.player = new Player(this.camera, this.world, {
        mode: this.mode,
        onDamage: (amount, source) => this.onDamage(amount, source),
        onDeath: () => this.onDeath(),
        onStep: (material) => this.audio.play("step", { material }),
        onLand: (amount) => this.audio.play("step", { volume: 0.5 }),
      });
      this.player.respawn(this.spawn);
      this.player.yaw = -0.21;
      this.player.pitch = -0.09;
      if (saved?.player) this.player.load(saved.player);
      this.inventory = new Inventory(saved?.inventory);
      if (!saved) {
        if (this.mode === "creative") {
          for (const id of [
            "iron_pickaxe",
            "iron_axe",
            "iron_sword",
            "planks",
            "stone",
            "glass",
            "torch",
            "workbench",
            "berry",
            "furnace",
            "chest",
            "bed",
            "lantern",
            "brick",
            "ruin",
            "glowstone",
            "beacon",
            "copper_ingot",
            "iron_ingot",
            "crystal",
            "seed",
            "crop",
          ])
            this.inventory.add(id, ITEMS[id]?.stack === 1 ? 1 : 64);
        } else {
          this.inventory.add("berry", 6);
          this.inventory.add("torch", 4);
          this.inventory.selected = 8;
        }
      }
      this.entities = this.createEntities(this.mode);
      if (saved?.entities) this.entities.load(saved.entities);
      this.map = new NavigationMap(document.body, this.world, {
        spawn: this.spawn,
        onOpen: () => {
          this.state = "map";
          this.ui.hud.hidden = true;
          this.unlock();
          this.keys.clear();
        },
        onClose: () => this.resume(),
        onWaypoint: (p) =>
          this.ui.toast(
            p ? "地図に次の目的地を記しました" : "目的地を消しました",
          ),
      });
      if (saved?.map) this.map.load(saved.map);
      this.map.update(this.player, { name: this.name, spawn: this.spawn });
      this.mining = 0;
      this.mineKey = "";
      this.attackCooldown = 0;
      this.autoSave = 0;
      this.menuOrigin = null;
      this.state = "playing";
      this.ui.hide();
      this.station = null;
      this.currentChest = null;
      this.audio.init();
      this.ui.toast(
        saved
          ? "旅の続きを、あなたの手で。"
          : "WASDで移動 · 木を長押しして、最初の一歩を。",
      );
      this.lastTime = performance.now();
      if (this.player.dead) {
        this.state = "dead";
        this.ui.showDeath();
      }
      if (this.store.backend === "memory")
        this.ui.toast(
          "このブラウザでは一時保存のみ利用できます。ワールドを書き出して保管してください。",
          "error",
        );
      await this.save();
    } catch (error) {
      console.error("World startup failed", error);
      this.state = "menu";
      this.ui.showMain(await this.store.list());
      this.ui.toast(`世界を開けませんでした: ${error.message}`, "error");
    }
  }
  async loadWorld(id) {
    try {
      const saved = await this.store.get(id);
      if (!saved) throw new Error("セーブが見つかりません");
      await this.startWorld({}, saved);
    } catch (e) {
      this.ui.toast(e.message, "error");
    }
  }
  async deleteWorld(id) {
    try {
      await this.store.delete(id);
      this.ui.showMain(await this.store.list());
      this.ui.toast("ワールドを削除しました");
    } catch (e) {
      this.ui.toast(e.message, "error");
    }
  }
  async exportWorld(id = this.id) {
    try {
      if (id === this.id) await this.save();
      const json = await this.store.export(id);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `wildbound-${id.slice(0, 8)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.ui.toast("ワールドを書き出しました");
    } catch (e) {
      this.ui.toast(e.message, "error");
    }
  }
  async importWorld(file) {
    try {
      if (!file) return;
      const id = await this.store.import(await file.text());
      this.ui.showMain(await this.store.list());
      this.ui.toast("ワールドを復元しました");
      return id;
    } catch (e) {
      this.ui.toast(e.message, "error");
    }
  }
  async save(notify = false) {
    if (!this.player || !this.id || this.state === "loading") return;
    if (this.saving) {
      await this.saving;
      if (notify) this.ui.toast("ワールドを保存しました");
      return this.id;
    }
    const save = {
      id: this.id,
      name: this.name,
      seed: this.seed,
      mode: this.mode,
      createdAt: this.createdAt,
      time: this.time,
      playTime: this.playTime,
      spawn: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      player: this.player.serialize(),
      inventory: this.inventory.serialize(),
      edits: this.world.serializeEdits(),
      entities: this.entities.serialize(),
      progress: this.progress,
      chests: this.chests,
      planted: this.planted,
      map: this.map?.toJSON(),
    };
    this.saving = this.store.put(save);
    try {
      await this.saving;
      if (notify) this.ui.toast("ワールドを保存しました");
      this.lastSaved = Date.now();
      return this.id;
    } catch (e) {
      console.error("Save failed", e);
      this.ui.toast(e.message, "error");
      throw e;
    } finally {
      this.saving = null;
    }
  }
  async saveAndQuit() {
    try {
      await this.save(true);
      this.state = "menu";
      this.unlock();
      this.keys.clear();
      const p = this.world.getSpawn();
      this.menuOrigin = new THREE.Vector3(p.x, p.y, p.z);
      this.menuTime = 0;
      this.ui.showMain(await this.store.list());
    } catch {
      /* Keep the world open if storage is unavailable. */
    }
  }
  bindInput() {
    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.forceRender = true;
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("mousedown", (e) => {
      if (this.state !== "playing") return;
      this.audio.init();
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.attack();
      }
      if (e.button === 2) {
        this.rightDown = true;
        this.use();
      }
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.mining = 0;
      }
      if (e.button === 2) this.rightDown = false;
    });
    addEventListener("mousemove", (e) => {
      if (this.state === "playing" && this.locked)
        this.player?.look(e.movementX, e.movementY, this.settings.sensitivity);
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.state === "playing") {
        this.pause();
      }
      this.mouseDown = false;
      this.rightDown = false;
    });
    addEventListener("keydown", (e) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName,
      );
      if (typing && e.code !== "Escape") return;
      if (
        ["Space", "Tab", "ArrowUp", "ArrowDown"].includes(e.code) &&
        this.state === "playing"
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "KeyM" && this.state === "map") {
        this.map?.toggle(false);
        return;
      }
      if (e.code === "Escape") {
        if (["inventory", "journal", "chest"].includes(this.state)) {
          this.resume();
          return;
        }
        if (this.state === "playing") {
          this.pause();
          return;
        }
        if (this.state === "pause") {
          this.resume();
          return;
        }
      }
      if (e.code === "KeyE" && ["inventory", "chest"].includes(this.state)) {
        this.resume();
        return;
      }
      if (e.code === "KeyJ" && this.state === "journal") {
        this.resume();
        return;
      }
      if (this.state !== "playing") return;
      if (e.code.startsWith("Digit"))
        this.selectSlot(Number(e.code.slice(-1)) - 1);
      if (e.code === "KeyE") this.openInventory();
      if (e.code === "KeyJ") this.openJournal();
      if (e.code === "KeyF") this.interact();
      if (e.code === "KeyM") {
        this.map?.update(this.player, { name: this.name, spawn: this.spawn });
        this.map?.toggle(true);
      }
      if (e.code === "KeyR") this.eat();
      if (e.code === "KeyQ")
        this.dropSlot(this.inventory.selected, e.shiftKey ? 64 : 1);
      if (e.code === "F3") {
        e.preventDefault();
        this.debug = !this.debug;
      }
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.state === "playing") {
          e.preventDefault();
          this.selectSlot(
            (this.inventory.selected + (e.deltaY > 0 ? 1 : 8)) % 9,
          );
        }
      },
      { passive: false },
    );
    addEventListener("blur", () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
      if (this.state === "playing") this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.player) {
        this.save().catch(() => {});
        if (this.state === "playing") this.pause();
      }
    });
    addEventListener("pagehide", () => {
      if (this.player) this.save().catch(() => {});
    });
    addEventListener("beforeunload", () => {
      if (this.player) this.save().catch(() => {});
    });
  }
  lock() {
    try {
      const promise = this.canvas.requestPointerLock?.();
      promise?.catch(() =>
        this.ui.toast("画面をクリックすると視点操作を開始できます"),
      );
    } catch {
      this.ui.toast("画面をクリックすると視点操作を開始できます");
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.mouseDown = false;
    this.rightDown = false;
  }
  pause() {
    if (this.state !== "playing") return;
    this.state = "pause";
    this.unlock();
    this.keys.clear();
    this.ui.showPause();
    this.save().catch(() => {});
  }
  resume() {
    if (!this.player || this.player.dead) {
      if (this.player?.dead) this.ui.showDeath();
      return;
    }
    this.state = "playing";
    this.currentChest = null;
    this.station = null;
    this.selectedInventorySlot = null;
    this.ui.hide();
    this.keys.clear();
    this.lock();
  }
  selectSlot(index) {
    if (index < 0 || index > 8 || !this.inventory) return;
    this.inventory.selected = index;
    this.mining = 0;
    this.lightTick = 2;
    this.audio.play("ui");
  }
  creativeItem(id) {
    if (this.mode !== "creative" || !ITEMS[id]) return;
    const slot = this.inventory.selected;
    this.inventory.slots[slot] = {
      id,
      count: ITEMS[id].stack || 64,
      ...(ITEMS[id].durability ? { durability: ITEMS[id].durability } : {}),
    };
    this.inventory.revision++;
    this.refreshInventory();
    this.ui.toast(`${ITEMS[id].name} をホットバーに追加`);
  }
  openInventory(station = null) {
    if (!this.inventory) return;
    this.station = station || this.nearStations();
    this.state = "inventory";
    this.unlock();
    this.keys.clear();
    this.selectedInventorySlot = null;
    this.ui.showInventory(this.inventory, this.station);
  }
  nearStations() {
    const p = this.player.position;
    const stations = new Set();
    for (let x = -3; x <= 3; x++)
      for (let y = -2; y <= 2; y++)
        for (let z = -3; z <= 3; z++) {
          const id = this.world.getBlock(p.x + x, p.y + y, p.z + z);
          if (id === 17) stations.add("workbench");
          if (id === 18) stations.add("furnace");
        }
    return [...stations];
  }
  inventoryClick(index, event = {}) {
    if (!this.inventory) return;
    if (event.drag || event.shiftKey || event.quickMove || event.altKey)
      this.selectedInventorySlot = null;
    if (event.drag && Number.isInteger(event.from)) {
      this.inventory.move(event.from, event.to ?? index, event.split);
    } else if (this.state === "chest" && event.shiftKey) {
      const slot = this.inventory.slots[index];
      if (slot) {
        const left = this.addToChest(slot);
        if (left !== slot.count) {
          if (left) this.inventory.slots[index].count = left;
          else this.inventory.slots[index] = null;
          this.inventory.revision++;
        }
      }
    } else if (event.shiftKey || event.quickMove)
      this.inventory.quickMove(index);
    else if (event.altKey) this.equip(index);
    else if (this.selectedInventorySlot == null) {
      if (this.inventory.slots[index]) {
        this.selectedInventorySlot = index;
        this.selectedInventorySplit = event.button === 2;
        this.inventory.selected = index < 9 ? index : this.inventory.selected;
      }
    } else {
      this.inventory.move(
        this.selectedInventorySlot,
        index,
        this.selectedInventorySplit || event.button === 2 || event.split,
      );
      this.selectedInventorySlot = null;
      this.selectedInventorySplit = false;
    }
    this.refreshInventory();
    return this.selectedInventorySlot ?? null;
  }
  refreshInventory() {
    if (this.state === "chest" && this.ui.showChest)
      this.ui.showChest(this.inventory, this.chests[this.currentChest]);
    else if (this.state === "inventory")
      this.ui.showInventory(this.inventory, this.station);
  }
  craft(id) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    if (
      this.mode === "creative" ||
      this.inventory.craft(recipe, this.station)
    ) {
      if (this.mode === "creative")
        this.inventory.add(recipe.output.id, recipe.output.count);
      this.progress.crafted[id] = (this.progress.crafted[id] || 0) + 1;
      this.collect(recipe.output.id, recipe.output.count);
      this.audio.play("craft");
      this.ui.toast(`${recipe.name} を作りました`);
      this.refreshInventory();
    } else this.ui.toast("材料・空きスロットと、近くの設備を確認してください");
  }
  equip(index) {
    if (index === -1) this.inventory.unequip();
    else this.inventory.equip(index);
    this.selectedInventorySlot = null;
    this.ui.selectedBagSlot = null;
    this.player.armor = ITEMS[this.inventory.equipment?.id]?.armor || 0;
    this.audio.play("ui");
    this.refreshInventory();
  }
  dropSlot(index, count = 1) {
    const slot = this.inventory?.slots[index];
    if (!slot) return;
    const n = Math.min(count, slot.count);
    const pos = this.player.position
      .clone()
      .add(new THREE.Vector3(0, 1, 0))
      .addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 1.4);
    this.entities.dropItem(slot.id, n, pos, slot.durability);
    slot.count -= n;
    if (!slot.count) this.inventory.slots[index] = null;
    this.inventory.revision++;
    this.refreshInventory();
  }
  addToChest(slot) {
    const chest = this.chests[this.currentChest];
    let count = slot.count;
    const max = ITEMS[slot.id]?.stack || 64;
    for (const s of chest)
      if (s?.id === slot.id && !ITEMS[slot.id]?.durability) {
        const n = Math.min(count, max - s.count);
        s.count += n;
        count -= n;
      }
    for (let i = 0; i < 18 && count; i++)
      if (!chest[i]) {
        const n = Math.min(count, max);
        chest[i] = { ...slot, count: n };
        count -= n;
      }
    return count;
  }
  chestClick(index, event = {}) {
    const chest = this.chests[this.currentChest];
    const slot = chest?.[index];
    if (!slot) return;
    const n = event.button === 2 ? Math.ceil(slot.count / 2) : slot.count;
    const left = this.inventory.add(slot.id, n, slot.durability);
    if (n > left) {
      this.collect(slot.id, n - left);
      this.audio.play("pickup");
    }
    slot.count -= n - left;
    if (!slot.count) chest[index] = null;
    this.refreshInventory();
  }
  openJournal() {
    this.state = "journal";
    this.unlock();
    this.keys.clear();
    this.ui.showJournal(this.journalData());
  }
  journalData() {
    return {
      tasks: PROGRESSION.map((p) => ({
        id: p.id,
        name: p.title,
        title: p.title,
        description: p.description,
        done: this.progress.completed.includes(p.id),
        current: Math.min(p.count, this.progress.collected[p.item] || 0),
        total: p.count,
      })),
      progress: this.progress,
      seed: this.seed,
      day: Math.floor(this.time / DAY_LENGTH) + 1,
      biomes: this.progress.biomes,
      kills: this.progress.kills,
      placed: this.progress.placed,
      mined: this.progress.mined,
      beacon: this.progress.beacon,
    };
  }
  collect(id, count = 1) {
    this.progress.collected[id] = (this.progress.collected[id] || 0) + count;
    for (const p of PROGRESSION)
      if (
        !this.progress.completed.includes(p.id) &&
        (this.progress.collected[p.item] || 0) >= p.count
      ) {
        this.progress.completed.push(p.id);
        this.ui.toast(`旅の記録 · ${p.title}`);
        this.audio.play("craft");
      }
  }
  objective() {
    const p = PROGRESSION.find((p) => !this.progress.completed.includes(p.id));
    return p
      ? {
          title: p.title,
          description: p.description,
          current: Math.min(p.count, this.progress.collected[p.item] || 0),
          total: p.count,
        }
      : {
          title: "あなたの世界を、その先へ",
          description: "未踏の土地へ旅をして、星の標を灯そう。",
          current: 1,
          total: 1,
        };
  }
  attack() {
    if (this.attackCooldown > 0 || !this.player) return false;
    const item = ITEMS[this.inventory.selectedItem()?.id];
    const damage = item?.damage || 3;
    const critical = !this.player.grounded && this.player.velocity.y < -0.5;
    const hit = this.entities.attack(
      this.camera.position,
      this.camera.getWorldDirection(new THREE.Vector3()),
      3.6,
      damage,
      critical,
    );
    if (hit) {
      this.attackCooldown = item?.tool === "sword" ? 0.4 : 0.65;
      this.hand.hit();
      this.audio.play("hit");
      if (item?.durability && this.mode !== "creative")
        this.inventory.damageTool();
      this.mining = 0;
      return true;
    }
    return false;
  }
  mineTarget(dt) {
    const target = this.target;
    if (!target || this.attackCooldown > 0) {
      this.mining = 0;
      return false;
    }
    const block = BLOCKS[target.id];
    if (!block || !Number.isFinite(block.hardness)) return false;
    const key = keyFor(target.x, target.y, target.z);
    if (this.mineKey !== key) {
      this.mineKey = key;
      this.mining = 0;
      this.mineSound = 0;
    }
    const slot = this.inventory.selectedItem(),
      tool = ITEMS[slot?.id];
    const suitable = tool?.tool === block.tool;
    const speed =
      this.mode === "creative" ? 60 : suitable ? tool.speed || 1 : 1;
    this.mining +=
      (dt * speed) /
      Math.max(
        0.18,
        block.hardness * (block.tool === "pickaxe" && !suitable ? 2 : 1),
      );
    this.mineSound = (this.mineSound || 0) + dt;
    if (this.mineSound > 0.24) {
      this.audio.play("mine", { material: block.key });
      this.entities.burst(
        new THREE.Vector3(target.x + 0.5, target.y + 0.7, target.z + 0.5),
        block.color,
        2,
      );
      this.mineSound = 0;
    }
    if (this.mining >= 1) {
      if (target.id === B.CHEST && this.chests[key]?.some(Boolean)) {
        this.ui.toast("箱の中身を取り出してから採掘してください");
        this.mining = 0;
        return false;
      }
      const immature =
        target.id === B.CROP &&
        Object.hasOwn(this.planted, key) &&
        this.time - this.planted[key] < 90;
      this.world.setBlock(target.x, target.y, target.z, 0);
      delete this.planted[key];
      delete this.chests[key];
      this.progress.mined++;
      const canDrop =
        !block.tier || (suitable && (tool.tier || 0) >= block.tier);
      if (canDrop && block.drop) {
        this.entities.dropItem(
          immature ? "seed" : block.drop,
          target.id === B.CROP && !immature ? 3 : 1,
          new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5),
        );
      } else if (block.drop && block.tier)
        this.ui.toast(
          `この鉱石の回収には Tier ${block.tier} 以上のつるはしが必要です`,
        );
      const drop = (id, n = 1) =>
        this.entities.dropItem(
          id,
          n,
          new THREE.Vector3(target.x + 0.5, target.y + 0.6, target.z + 0.5),
        );
      const r = Math.random();
      if ([7, 25, 26].includes(target.id)) {
        if (r < 0.3) drop("berry", 1 + Math.floor(r * 6));
        if (r > 0.6) drop("fiber");
        if (r > 0.93) drop("mushroom");
      }
      if (target.id === 22) {
        if (r < 0.45) drop("seed", 2);
        if (r > 0.65) drop("wheat");
      }
      if (target.id === 21) {
        drop(r < 0.45 ? "mushroom" : r > 0.9 ? "honey" : "fiber");
      }
      if (target.id === 35 && r < 0.5) drop("ancient_shard");
      if (target.id === 34 && !immature) drop("seed", 2);
      if (
        suitable &&
        tool?.durability &&
        this.mode !== "creative" &&
        this.inventory.damageTool()
      )
        this.ui.toast("道具が壊れました");
      this.entities.burst(
        new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5),
        block.color,
        16,
      );
      this.audio.play("break", { material: block.key });
      this.mining = 0;
      this.mineKey = "";
      this.lightTick = 10;
      return true;
    }
    return false;
  }
  placeBlock() {
    if (this.placeCooldown > 0 || !this.target) return false;
    const slot = this.inventory.selectedItem(),
      item = ITEMS[slot?.id];
    if (!item?.block) return false;
    const t = this.target;
    let p = { x: t.x + t.normal.x, y: t.y + t.normal.y, z: t.z + t.normal.z };
    if ([21, 22, 34].includes(t.id)) p = { x: t.x, y: t.y, z: t.z };
    const existing = this.world.getBlock(p.x, p.y, p.z);
    if (![0, 5, 21, 22, 34].includes(existing) || p.y < 1 || p.y >= 95)
      return false;
    if (BLOCKS[item.block]?.solid && this.player.intersectsBlock(p.x, p.y, p.z))
      return false;
    if (item.block === 34 && this.world.getBlock(p.x, p.y - 1, p.z) !== 33) {
      this.ui.toast("苗は耕した土に植えられます");
      return false;
    }
    if (
      [16, 21, 22, 29, 34].includes(item.block) &&
      !BLOCKS[this.world.getBlock(p.x, p.y - 1, p.z)]?.solid
    )
      return false;
    this.world.setBlock(p.x, p.y, p.z, item.block);
    if (this.mode !== "creative") this.inventory.consumeSelected();
    this.progress.placed++;
    this.placeCooldown = 0.17;
    this.audio.play("place");
    this.hand.hit();
    this.lightTick = 10;
    if (item.block === 34) this.planted[keyFor(p.x, p.y, p.z)] = this.time;
    if (item.block === 36) {
      this.beaconEffects.scan = 0;
      [220, 277.18, 329.63, 440, 554.37].forEach((note, i) =>
        this.audio.tone(note, 2, 0.05, "sine", this.audio.music, i * 0.18),
      );
      this.progress.beacon = true;
      this.ui.toast(
        "星の標が灯りました。あなたの旅が、世界の新しい物語になる。",
      );
      this.audio.play("craft");
    }
    return true;
  }
  use() {
    if (this.interact(false)) return;
    const item = ITEMS[this.inventory.selectedItem()?.id];
    if (item?.food) {
      this.eat();
      return;
    }
    if (item?.id === "compass") {
      this.map?.update(this.player, { name: this.name, spawn: this.spawn });
      this.map?.toggle(true);
      return;
    }
    if (
      item?.tool === "hoe" &&
      this.target &&
      [1, 2].includes(this.target.id)
    ) {
      this.world.setBlock(this.target.x, this.target.y, this.target.z, 33);
      if (this.mode !== "creative") this.inventory.damageTool();
      this.audio.play("place");
      return;
    }
    if (item?.id === "seed" && this.target?.id === 33) {
      const t = this.target;
      if (this.world.getBlock(t.x, t.y + 1, t.z) === 0) {
        this.world.setBlock(t.x, t.y + 1, t.z, 34);
        this.inventory.consumeSelected();
        this.planted[keyFor(t.x, t.y + 1, t.z)] = this.time;
        this.audio.play("place");
        return;
      }
    }
    this.placeBlock();
  }
  interact(showHint = true) {
    const t = this.target;
    if (!t) return false;
    if (t.id === 17 || t.id === 18) {
      this.openInventory(this.nearStations());
      return true;
    }
    if (t.id === 28) {
      this.currentChest = keyFor(t.x, t.y, t.z);
      if (!this.chests[this.currentChest]) {
        this.chests[this.currentChest] = Array(18).fill(null);
        // Generated ruins hold a one-time cache; newly placed boxes begin empty.
        const edited = this.world.serializeEdits();
        const playerPlaced = Array.isArray(edited)
          ? edited.some(
              (e) => e.x === t.x && e.y === t.y && e.z === t.z && e.id === 28,
            )
          : edited[this.currentChest] === 28;
        if (!playerPlaced) {
          this.chests[this.currentChest][0] = { id: "ancient_shard", count: 2 };
          this.chests[this.currentChest][1] = { id: "berry", count: 4 };
          this.chests[this.currentChest][2] = { id: "coal", count: 3 };
        }
      }
      this.state = "chest";
      this.unlock();
      if (this.ui.showChest)
        this.ui.showChest(this.inventory, this.chests[this.currentChest]);
      else this.ui.showInventory(this.inventory, this.nearStations());
      return true;
    }
    if (t.id === 29) {
      this.spawn.set(t.x + 0.5, t.y + 1.05, t.z + 0.5);
      this.sleep();
      return true;
    }
    if (t.id === 36) {
      this.progress.beacon = true;
      this.openJournal();
      this.ui.toast("星の残響を取り戻しました。旅は、ここから続いていく。");
      return true;
    }
    if (showHint)
      this.ui.toast("工作台・炉・箱・ベッドに近づいて F で使えます");
    return false;
  }
  eat() {
    const slot = this.inventory.selectedItem();
    const item = ITEMS[slot?.id];
    if (!item?.food) {
      this.ui.toast("食べ物を選んで R を押してください");
      return false;
    }
    if (this.player.hunger >= 99 && this.player.health >= 99) {
      this.ui.toast("今はお腹がいっぱいです");
      return false;
    }
    this.player.hunger = Math.min(100, this.player.hunger + item.food.hunger);
    this.player.heal(item.food.health || 0);
    this.inventory.consumeSelected();
    this.audio.play("pickup");
    this.hand.hit();
    this.ui.toast(`${item.name} を食べました`);
    return true;
  }
  sleep() {
    if (!this.player) return;
    if (
      this.time % DAY_LENGTH < DAY_LENGTH * 0.72 &&
      this.time % DAY_LENGTH > DAY_LENGTH * 0.25
    ) {
      this.ui.toast("ベッドを復帰地点にしました。眠れるのは夕方からです");
      return;
    }
    this.time =
      (Math.floor(this.time / DAY_LENGTH) + 1) * DAY_LENGTH + DAY_LENGTH * 0.29;
    this.player.heal(30);
    this.player.hunger = Math.max(0, this.player.hunger - 10);
    this.ui.toast("おはよう。新しい一日が始まります");
    this.save().catch(() => {});
  }
  onDamage(amount, source) {
    this.audio.play("hurt");
    this.root.classList.add("damage-flash");
    setTimeout(() => this.root.classList.remove("damage-flash"), 250);
    if (this.inventory?.equipment) {
      this.inventory.damageArmor(Math.max(1, Math.ceil(amount * 0.25)));
      this.player.armor = ITEMS[this.inventory.equipment?.id]?.armor || 0;
    }
  }
  onDeath() {
    if (this.state === "dead") return;
    this.state = "dead";
    this.unlock();
    this.audio.play("death");
    this.ui.showDeath();
    this.save().catch(() => {});
  }
  respawn() {
    this.player.respawn(this.spawn);
    this.player.hunger = 75;
    this.state = "playing";
    this.ui.hide();
    this.ui.toast("道具と持ち物を持って、もう一度。");
    this.lock();
  }
  updateSettings(patch) {
    this.settings = saveSettings({ ...this.settings, ...patch });
    this.ui.settings = { ...this.settings };
    this.audio.setSettings(this.settings);
    this.performance.configure(this.settings);
    this.applySettings();
  }
  applySettings() {
    this.root.dataset.quality = this.settings.quality;
    this.forceRender = true;
    this.renderer.setPixelRatio(
      (this.performance?.scale || 1) *
        (this.settings.quality === "low"
          ? 1
          : Math.min(
              devicePixelRatio,
              this.settings.quality === "high" ? 1.5 : 1.25,
            )),
    );
    this.renderer.shadowMap.enabled = this.settings.quality !== "low";
    this.world?.setQuality?.(this.settings.quality);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }
  clearLights() {
    for (const light of this.lights) this.scene.remove(light);
    this.lights = [];
  }
  updateLights() {
    if (!this.player) return;
    this.clearLights();
    const p = this.player.position;
    const found = [];
    for (let x = -9; x <= 9; x++)
      for (let z = -9; z <= 9; z++)
        for (let y = -4; y <= 5; y++) {
          const bx = Math.floor(p.x) + x,
            by = Math.floor(p.y) + y,
            bz = Math.floor(p.z) + z,
            id = this.world.getBlock(bx, by, bz);
          if ([16, 30, 32, 36].includes(id))
            found.push({ x: bx, y: by, z: bz, id, d: x * x + y * y + z * z });
        }
    found.sort((a, b) => a.d - b.d);
    for (const f of found.slice(0, 7)) {
      const light = new THREE.PointLight(
        f.id === 16 ? 0xffb85c : 0x99f2d8,
        f.id === 36 ? 22 : 10,
        f.id === 36 ? 20 : 11,
        1.7,
      );
      light.position.set(f.x + 0.5, f.y + 0.75, f.z + 0.5);
      this.scene.add(light);
      this.lights.push(light);
    }
    const slot = this.inventory.selectedItem();
    if (["torch", "lantern"].includes(slot?.id)) {
      const light = new THREE.PointLight(0xffcc83, 8, 10, 1.8);
      light.userData.held = true;
      light.position.copy(p).add(new THREE.Vector3(0.3, 1.5, 0.2));
      this.scene.add(light);
      this.lights.push(light);
    }
    this.world.setLocalLights?.(this.lights);
  }
  tick(dt) {
    if (this.state === "playing" && this.player) {
      this.time += dt;
      this.playTime += dt;
      this.autoSave += dt;
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.placeCooldown = Math.max(0, this.placeCooldown - dt);
      this.player.armor = ITEMS[this.inventory.equipment?.id]?.armor || 0;
      this.player.glider =
        ITEMS[this.inventory.equipment?.id]?.special === "glider";
      this.player.update(
        dt,
        { keys: this.keys, locked: this.locked },
        this.settings,
      );
      if (this.state === "dead") return;
      const underwater =
        this.world.getBlock(
          this.camera.position.x,
          this.camera.position.y,
          this.camera.position.z,
        ) === 5;
      this.world.update(this.player.position, this.settings.renderDistance);
      this.world.setTime?.((this.time % DAY_LENGTH) / DAY_LENGTH);
      this.target = raycastVoxel(
        this.world,
        this.camera.position,
        this.camera.getWorldDirection(new THREE.Vector3()),
        6,
      );
      if (this.mouseDown) {
        if (this.attackCooldown <= 0 && !this.attack()) this.mineTarget(dt);
      } else this.mining = 0;
      if (this.rightDown && this.placeCooldown <= 0 && this.state === "playing")
        this.placeBlock();
      this.entities.update(
        dt,
        this.player,
        (this.time % DAY_LENGTH) / DAY_LENGTH,
      );
      this.beaconEffects?.update(dt, this.world, this.player.position);
      this.hand.group.visible = true;
      this.hand.update(
        dt,
        ITEMS[this.inventory.selectedItem()?.id],
        this.player.velocity.lengthSq() > 1,
        this.mouseDown && !!this.target,
      );
      this.outline.visible = !!this.target;
      this.cracks.visible = !!this.target && this.mining > 0.02;
      if (this.target) {
        this.outline.position.set(
          this.target.x + 0.5,
          this.target.y + 0.5,
          this.target.z + 0.5,
        );
        this.cracks.position.copy(this.outline.position);
        this.cracks.material.map =
          this.crackTextures[Math.min(5, Math.floor(this.mining * 6))];
      }
      this.lightTick += dt;
      if (this.lightTick > 1.2) {
        this.lightTick = 0;
        this.updateLights();
      }
      for (const light of this.lights) {
        if (light.userData.held)
          light.position
            .copy(this.player.position)
            .add(new THREE.Vector3(0.3, 1.5, 0.2));
        light.intensity *=
          1 + Math.sin(this.time * 12 + light.position.x) * 0.0008;
      }
      this.world.setLocalLights?.(this.lights);
      this.farmTick += dt;
      if (this.farmTick > 5) {
        this.farmTick = 0;
        this.updateFarms();
      }
      this.mapTick = (this.mapTick || 0) + dt;
      if (this.mapTick > 0.5) {
        this.mapTick = 0;
        this.map?.update(this.player, { name: this.name, spawn: this.spawn });
      }
      if (this.player.gliding) {
        this.glideWear = (this.glideWear || 0) + dt;
        if (this.glideWear > 2) {
          this.glideWear = 0;
          this.inventory.damageArmor(1);
        }
      }
      const biome = this.world.getBiome(
        this.player.position.x,
        this.player.position.z,
      );
      if (!this.progress.biomes.includes(biome)) {
        this.progress.biomes.push(biome);
        if (this.progress.biomes.length > 1)
          this.ui.toast(
            `新しい土地 · ${jpBiome[biome] || BIOME_NAMES[biome] || biome}`,
          );
      }
      this.atmosphereState = this.atmosphere.update(
        dt,
        (this.time % DAY_LENGTH) / DAY_LENGTH,
        this.player.position,
        this.settings,
        underwater,
      );
      this.audio.update(dt, {
        time: (this.time % DAY_LENGTH) / DAY_LENGTH,
        biome,
        inWater: underwater,
        moving: this.player.velocity.lengthSq() > 1,
        day: Math.floor(this.time / DAY_LENGTH),
      });
      if (this.autoSave > 30) {
        this.autoSave = 0;
        this.save().catch(() => {});
      }
    } else {
      this.hand.group.visible = false;
      this.outline.visible = false;
      this.cracks.visible = false;
      if (this.state === "menu" && this.world) {
        this.menuTime = (this.menuTime || 0) + dt;
        const p = this.menuOrigin || this.world.getSpawn();
        const cx = p.x + Math.sin(this.menuTime * 0.025) * 7 + 18,
          cz = p.z + 25 + Math.cos(this.menuTime * 0.025) * 2;
        this.camera.position.set(
          cx,
          Math.max(p.y + 20, this.world.getHeight(cx, cz) + 14) +
            Math.sin(this.menuTime * 0.08) * 0.8,
          cz,
        );
        this.camera.lookAt(p.x + 4, p.y - 3, p.z - 27);
        this.world.update(p, this.settings.renderDistance);
        this.atmosphere.update(dt, 0.36, this.camera.position, this.settings);
        this.world.setTime?.(0.36);
        this.entities?.update(
          dt,
          {
            position: new THREE.Vector3(p.x, p.y, p.z),
            health: 100,
            dead: false,
            damage: () => {},
          },
          0.36,
        );
      }
    }
  }
  updateFarms() {
    for (const [key, plantedAt] of Object.entries(this.planted)) {
      if (this.time - plantedAt > 90) {
        const [x, y, z] = key.split(",").map(Number);
        if (this.world.getBlock(x, y, z) === 34) {
          if (
            this.world.getBlock(x + 1, y, z) === 0 &&
            this.world.getBlock(x + 1, y - 1, z) === 33
          ) {
            this.world.setBlock(x + 1, y, z, 34);
            this.planted[keyFor(x + 1, y, z)] = this.time;
          }
          delete this.planted[key];
        }
      }
    }
  }
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const elapsed = Math.max(0.001, (now - this.lastTime) / 1000);
    const simulated = Math.min(0.3, elapsed);
    const steps = Math.ceil(simulated / 0.05),
      dt = simulated / steps;
    this.lastTime = now;
    try {
      for (let step = 0; step < steps; step++) this.tick(dt);
      this.shadowTimer += elapsed;
      const shadowInterval = this.fps > 35 ? 0 : 0.22;
      if (this.shadowTimer > shadowInterval) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowTimer = 0;
      }
      // Paused worlds retain their last image while the HTML menus stay responsive.
      if (
        ["playing", "menu", "loading"].includes(this.state) ||
        this.forceRender ||
        this.lastRenderedState !== this.state
      ) {
        this.renderer.render(this.scene, this.camera);
        this.lastRenderedState = this.state;
        this.forceRender = false;
      }
      this.performance.update(
        elapsed,
        ["playing", "menu"].includes(this.state),
      );
      this.fpsFrames++;
      this.fpsTime += elapsed;
      if (this.fpsTime > 0.5) {
        this.fps = this.fpsFrames / this.fpsTime;
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
      if (this.player && this.state !== "menu" && this.state !== "loading") {
        const pos = this.player.position;
        this.ui.update({
          locked: this.locked,
          settings: this.settings,
          heading: this.player.yaw,
          damageFlash: this.player._shake,
          underwater: this.player.underwater,
          health: this.player.health,
          hunger: this.player.hunger,
          oxygen: this.player.oxygen,
          stamina: this.player.stamina,
          selected: this.inventory.selected,
          slots: this.inventory.slots,
          equipment: this.inventory.equipment,
          biome:
            jpBiome[this.world.getBiome(pos.x, pos.z)] ||
            this.world.getBiome(pos.x, pos.z),
          day: Math.floor(this.time / DAY_LENGTH) + 1,
          time: (this.time % DAY_LENGTH) / DAY_LENGTH,
          position: pos,
          target: this.target
            ? { ...BLOCKS[this.target.id], id: this.target.id }
            : null,
          mining: this.mining,
          objective: this.objective(),
          debug: this.debug
            ? {
                fps: this.fps,
                position: pos,
                chunks: this.world.stats.chunks,
                triangles: this.renderer.info.render.triangles,
                drawCalls: this.renderer.info.render.calls,
                entities: this.entities.count,
                seed: this.seed,
                generationMs: this.world.stats.generationMs,
                meshMs: this.world.stats.meshMs,
                memory: performance.memory?.usedJSHeapSize,
                resolution: `${this.canvas.width}×${this.canvas.height}`,
              }
            : null,
          fps: this.fps,
          weather: this.atmosphereState?.weather,
          seed: this.seed,
          mode: this.mode,
        });
      }
    } catch (error) {
      this.lastError = error;
      console.error("Game frame", error);
      this.running = false;
      this.state = "pause";
      this.unlock();
      this.ui.showPause();
      this.ui.toast(
        `動作を停止しました: ${error.message}。再読み込みで保存した旅を再開できます。`,
        "error",
      );
    }
  }
  createCracks() {
    return Array.from({ length: 6 }, (_, stage) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      ctx.strokeStyle = "rgba(31,28,22,.8)";
      ctx.lineWidth = 1.5;
      for (let branch = 0; branch < stage + 2; branch++) {
        ctx.beginPath();
        ctx.moveTo(32, 32);
        let x = 32,
          y = 32;
        const angle = branch * 2.4;
        for (let step = 0; step < 3 + stage; step++) {
          x += Math.cos(angle + Math.sin(step * 5) * 0.9) * 6;
          y += Math.sin(angle + Math.cos(step * 4) * 0.9) * 6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      return t;
    });
  }
}
