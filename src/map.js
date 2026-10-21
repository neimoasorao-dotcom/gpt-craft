/** Original field atlas: discovered terrain is recorded by chunk, never by screenshot. */
const CHUNK = 16,
  SAMPLE = 2,
  TILE = CHUNK / SAMPLE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const coordKey = (x, z) => `${x},${z}`;
export function mapProject(x, z, center, scale, width, height) {
  return {
    x: (x - center.x) * scale + width / 2,
    y: (z - center.z) * scale + height / 2,
  };
}
export function mapUnproject(x, y, center, scale, width, height) {
  return {
    x: (x - width / 2) / scale + center.x,
    z: (y - height / 2) / scale + center.z,
  };
}
export function encodeExploration(cells) {
  return [...cells]
    .map((key) =>
      key
        .split(",")
        .map((n) => Number(n).toString(36))
        .join("."),
    )
    .join("|");
}
export function decodeExploration(encoded) {
  const result = new Set();
  if (typeof encoded !== "string" || encoded.length > 2e6) return result;
  for (const entry of encoded.split("|").slice(0, 100000)) {
    if (!/^-?[\da-z]+\.-?[\da-z]+$/.test(entry)) continue;
    const [x, z] = entry.split(".").map((n) => parseInt(n, 36));
    if (
      Number.isInteger(x) &&
      Number.isInteger(z) &&
      Math.abs(x) < 1e6 &&
      Math.abs(z) < 1e6
    )
      result.add(coordKey(x, z));
  }
  return result;
}
const PALETTE = {
  Meadowlands: [153, 169, 117],
  Fernwood: [112, 143, 107],
  Copperwood: [180, 151, 103],
  Frostpeak: [215, 220, 204],
  "Amber Dunes": [210, 192, 142],
  "Sunlit Coast": [210, 202, 161],
  meadow: [153, 169, 117],
  forest: [112, 143, 107],
  autumn: [180, 151, 103],
  snow: [215, 220, 204],
  desert: [210, 192, 142],
  beach: [210, 202, 161],
};
const LABELS = {
  Meadowlands: "陽だまりの草原",
  Fernwood: "シダの森",
  Copperwood: "琥珀の森",
  Frostpeak: "霧氷の峰",
  "Amber Dunes": "琥珀の砂丘",
  "Sunlit Coast": "白砂の浜",
};
const scopedStyle = `
.wb-atlas{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(12,26,22,.72);backdrop-filter:blur(9px);padding:28px;color:#344438;font-family:Inter,'Noto Sans JP',system-ui,sans-serif;box-sizing:border-box}.wb-atlas[hidden]{display:none}.wb-atlas *{box-sizing:border-box}.wb-atlas button{font:inherit;cursor:pointer;border:1px solid #b7baa8;background:#f5f1e3;color:#374c3d;border-radius:4px;transition:background .15s,transform .15s}.wb-atlas button:hover{background:#e8dfc6;transform:translateY(-1px)}.wb-atlas button:focus-visible{outline:3px solid #ba9557;outline-offset:3px}.wb-atlas-panel{width:min(1120px,100%);height:min(850px,92vh);display:flex;flex-direction:column;background:#eeeadb;border:1px solid #d0c7ae;box-shadow:0 24px 90px #00180f66;position:relative;overflow:hidden}.wb-atlas-header{padding:25px 30px 18px;display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:1px solid #d3cdbb}.wb-atlas-eyebrow{color:#7f856b;letter-spacing:.24em;font-size:10px;font-weight:650;margin-bottom:7px}.wb-atlas h2{font-family:Georgia,'Noto Serif JP',serif;font-size:28px;letter-spacing:.13em;font-weight:400;margin:0}.wb-atlas-close{padding:11px 16px;font-size:12px;white-space:nowrap}.wb-atlas-close kbd{margin-left:12px;font:10px monospace;opacity:.6}.wb-atlas-description{font-size:11px;color:#7a816d;padding:13px 30px;display:flex;justify-content:space-between;gap:10px}.wb-atlas-landscape{position:relative;flex:1;min-height:180px;margin:0 20px;border:1px solid #c8c4b0;overflow:hidden;background:#e7e1cc}.wb-atlas-canvas{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none}.wb-atlas-tools{position:absolute;top:14px;right:14px;display:grid;gap:6px}.wb-atlas-tools button{width:35px;height:35px;font-size:21px;box-shadow:0 2px 6px #263a2e15}.wb-atlas-compass{position:absolute;top:15px;left:18px;color:#46563c;text-align:center;pointer-events:none}.wb-atlas-compass b{font:11px Georgia,serif;letter-spacing:.1em}.wb-atlas-compass i{display:block;margin-top:5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:19px solid #4c6650;position:relative}.wb-atlas-compass i:after{content:'';position:absolute;left:-5px;top:19px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:13px solid #b5b99c}.wb-atlas-scale{position:absolute;bottom:15px;left:18px;color:#66705b;font:10px monospace;background:#eeeadbcc;padding:5px 8px;pointer-events:none}.wb-atlas-scale i{display:block;height:5px;border:1px solid #79806b;border-top:0;margin-bottom:4px}.wb-atlas-footer{padding:15px 30px 19px;display:flex;justify-content:space-between;gap:15px;align-items:center}.wb-atlas-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:#7b806c}.wb-atlas-legend span{display:flex;gap:5px;align-items:center}.wb-atlas-legend i{display:inline-block;width:9px;height:9px;border-radius:2px}.wb-atlas-position{font-size:10px;color:#7b806c;white-space:nowrap;margin-top:10px;font-variant-numeric:tabular-nums;letter-spacing:.04em}.wb-atlas-waypoint{display:flex;align-items:center;gap:9px;text-align:right}.wb-atlas-waypoint-info{font-size:11px;line-height:1.8;color:#4c6350}.wb-atlas-waypoint button{font-size:10px;padding:6px 9px;white-space:nowrap}.wb-atlas-distance{font-family:Georgia,serif;font-size:21px;color:#47634e;margin-right:4px}.wb-atlas-status{position:absolute;bottom:12px;right:16px;font-size:10px;color:#62725c;background:#eeeadbd9;padding:5px 9px;pointer-events:none}.wb-atlas-help{font-size:10px;color:#8c8e7c;white-space:nowrap}.wb-atlas-tooltip{position:absolute;pointer-events:none;padding:5px 8px;background:#2d4339e6;color:#eee8d5;font:10px monospace;white-space:nowrap;display:none;border-radius:3px}.wb-atlas-follow{font-size:13px!important}.wb-atlas-attribution{position:absolute;right:15px;top:50%;font:10px Georgia,serif;letter-spacing:.2em;writing-mode:vertical-rl;color:#9ba087;pointer-events:none}
@media(max-width:650px){.wb-atlas{padding:10px}.wb-atlas-panel{height:94vh}.wb-atlas-header{padding:19px 18px 14px}.wb-atlas h2{font-size:23px}.wb-atlas-description{padding:11px 18px}.wb-atlas-description .wb-atlas-help{display:none}.wb-atlas-landscape{margin:0 10px}.wb-atlas-footer{padding:14px 18px;display:block}.wb-atlas-waypoint{margin-top:12px;text-align:left;justify-content:space-between}.wb-atlas-close{font-size:11px;padding:9px 11px}.wb-atlas-legend{gap:9px}}
`;
export class NavigationMap {
  constructor(root, world, options = {}) {
    this.world = world;
    this.options =
      typeof options === "function" ? { onWaypoint: options } : options;
    this.visible = false;
    this.explored = new Set();
    this.waypoint = null;
    this.tiles = new Map();
    this.queue = [];
    this.queued = new Set();
    this.center = { x: 0, z: 0 };
    this.player = { x: 0, z: 0, yaw: 0 };
    this.scale = 3.2;
    this.follow = true;
    this.spawn = this.options.spawn || world.getSpawn?.() || { x: 0, z: 5 };
    this.markers = [];
    this.frame = 0;
    this.discoveryRevision = 0;
    this.tileRegion = "";
    this.failedTiles = new Set();
    this.needsDraw = false;
    this.disposed = false;
    this.drag = null;
    this.width = 600;
    this.height = 400;
    const style = document.createElement("style");
    style.textContent = scopedStyle;
    this.style = style;
    const el = document.createElement("section");
    el.className = "wb-atlas";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "wb-atlas-title");
    el.innerHTML = `<div class="wb-atlas-panel"><header class="wb-atlas-header"><div><div class="wb-atlas-eyebrow">WILDBOUND · EXPEDITION ATLAS</div><h2 id="wb-atlas-title">旅の地図</h2></div><button class="wb-atlas-close" data-map="close">地図を閉じる<kbd>M / ESC</kbd></button></header><div class="wb-atlas-description"><span data-map="subtitle">歩いた道が、あなたの世界になる。</span><span class="wb-atlas-help">クリック：目的地　ドラッグ：移動　ホイール：拡大</span></div><div class="wb-atlas-landscape"><canvas class="wb-atlas-canvas" aria-label="探索した地形と現在地を表示する地図"></canvas><div class="wb-atlas-compass"><b>N</b><i></i></div><div class="wb-atlas-tools"><button data-map="in" aria-label="地図を拡大">＋</button><button data-map="out" aria-label="地図を縮小">−</button><button data-map="center" class="wb-atlas-follow" aria-label="現在地を中央に表示">◎</button></div><div class="wb-atlas-scale"><i></i><span></span></div><div class="wb-atlas-status"></div><div class="wb-atlas-tooltip"></div><div class="wb-atlas-attribution">TERRA INCOGNITA</div></div><footer class="wb-atlas-footer"><div><div class="wb-atlas-legend"><span><i style="background:#99a975"></i>草原</span><span><i style="background:#708f6b"></i>森</span><span><i style="background:#b49767"></i>琥珀の森</span><span><i style="background:#8ab4b4"></i>水域</span><span><i style="background:#d7dccc"></i>雪山</span><span><i style="background:#e1dac3;border:1px solid #c9c2a9"></i>未踏</span></div><div class="wb-atlas-position"></div></div><div class="wb-atlas-waypoint"><div class="wb-atlas-waypoint-info">地図をクリックして、次の旅先を。</div><button data-map="clear" hidden>目的地を消す</button></div></footer></div>`;
    this.el = el;
    this.canvas = el.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.container = el.querySelector(".wb-atlas-landscape");
    this.positionLabel = el.querySelector(".wb-atlas-position");
    this.waypointLabel = el.querySelector(".wb-atlas-waypoint-info");
    this.clearButton = el.querySelector('[data-map="clear"]');
    this.status = el.querySelector(".wb-atlas-status");
    this.tooltip = el.querySelector(".wb-atlas-tooltip");
    this.subtitle = el.querySelector('[data-map="subtitle"]');
    this.scaleBar = el.querySelector(".wb-atlas-scale");
    root.append(style, el);
    this._click = (e) => {
      const action = e.target.closest("[data-map]")?.dataset.map;
      if (!action) return;
      e.preventDefault();
      if (action === "close") this.toggle(false);
      else if (action === "in") this.zoom(1.4);
      else if (action === "out") this.zoom(1 / 1.4);
      else if (action === "center") {
        this.follow = true;
        this.center = { x: this.player.x, z: this.player.z };
        this.schedule();
      } else if (action === "clear") {
        this.waypoint = null;
        this.options.onWaypoint?.(null);
        this.schedule();
      }
    };
    this._down = (e) => {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        cx: this.center.x,
        cz: this.center.z,
        moved: false,
        id: e.pointerId,
      };
      this.tooltip.style.display = "none";
    };
    this._move = (e) => {
      const rect = this.canvas.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top;
      if (this.drag) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          this.follow = false;
          this.center.x = this.drag.cx - dx / this.scale;
          this.center.z = this.drag.cz - dy / this.scale;
          this.schedule();
        }
      } else {
        const p = mapUnproject(
          x,
          y,
          this.center,
          this.scale,
          this.width,
          this.height,
        );
        this.tooltip.textContent = `X ${Math.floor(p.x)} · Z ${Math.floor(p.z)}`;
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${clamp(x + 12, 5, this.width - 115)}px`;
        this.tooltip.style.top = `${clamp(y + 14, 5, this.height - 30)}px`;
      }
    };
    this._up = (e) => {
      if (!this.drag) return;
      const drag = this.drag;
      this.drag = null;
      if (this.canvas.hasPointerCapture?.(drag.id))
        this.canvas.releasePointerCapture(drag.id);
      if (!drag.moved) {
        const rect = this.canvas.getBoundingClientRect(),
          p = mapUnproject(
            e.clientX - rect.left,
            e.clientY - rect.top,
            this.center,
            this.scale,
            this.width,
            this.height,
          );
        this.waypoint = { x: Math.round(p.x), z: Math.round(p.z) };
        this.options.onWaypoint?.({ ...this.waypoint });
        this.schedule();
      }
    };
    this._cancel = () => {
      this.drag = null;
      this.tooltip.style.display = "none";
    };
    this._leave = () => {
      this.tooltip.style.display = "none";
    };
    this._wheel = (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      });
    };
    this._key = (e) => {
      if (!this.visible) return;
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.toggle(false);
      } else if (e.code === "Equal" || e.code === "NumpadAdd") {
        e.preventDefault();
        this.zoom(1.4);
      } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        this.zoom(1 / 1.4);
      } else if (e.code === "Home") {
        this.follow = true;
        this.center = { x: this.player.x, z: this.player.z };
        this.schedule();
      } else if (e.code === "Tab") {
        const buttons = [...el.querySelectorAll("button:not([hidden])")];
        const index = buttons.indexOf(document.activeElement),
          next = e.shiftKey
            ? index <= 0
              ? buttons.length - 1
              : index - 1
            : (index + 1) % buttons.length;
        e.preventDefault();
        buttons[next]?.focus();
      }
    };
    el.addEventListener("click", this._click);
    this.canvas.addEventListener("pointerdown", this._down);
    this.canvas.addEventListener("pointermove", this._move);
    this.canvas.addEventListener("pointerup", this._up);
    this.canvas.addEventListener("pointercancel", this._cancel);
    this.canvas.addEventListener("pointerleave", this._leave);
    this.canvas.addEventListener("wheel", this._wheel, { passive: false });
    window.addEventListener("keydown", this._key, true);
    this._resize = () => {
      if (this.visible) {
        this.resize();
        this.schedule();
      }
    };
    this.observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(this._resize)
        : null;
    this.observer?.observe(this.container);
    window.addEventListener("resize", this._resize);
  }
  update(player, markersOrOptions = {}) {
    if (this.disposed || !player) return;
    const p = player.position || player;
    if (!finite(p.x) || !finite(p.z)) return;
    this.player = { x: p.x, z: p.z, yaw: finite(player.yaw) ? player.yaw : 0 };
    const options = Array.isArray(markersOrOptions)
      ? { markers: markersOrOptions }
      : markersOrOptions || {};
    if (options.spawn) this.spawn = options.spawn;
    else if (player.spawn) this.spawn = player.spawn;
    if (Array.isArray(options.markers)) this.markers = options.markers;
    if (options.name || options.worldName)
      this.subtitle.textContent = `${options.name || options.worldName} · 歩いた道が、あなたの世界になる。`;
    const cx = Math.floor(p.x / CHUNK),
      cz = Math.floor(p.z / CHUNK),
      r = 2;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dz * dz <= r * r + 1) {
          const key = coordKey(cx + dx, cz + dz);
          if (!this.explored.has(key)) {
            this.explored.add(key);
            this.discoveryRevision++;
          }
        }
    while (this.explored.size > 100000) {
      const first = this.explored.values().next().value;
      this.explored.delete(first);
    }
    if (this.follow) this.center = { x: p.x, z: p.z };
    if (this.visible) this.schedule();
  }
  toggle(force) {
    if (this.disposed) return false;
    const visible = typeof force === "boolean" ? force : !this.visible;
    if (visible === this.visible) return visible;
    this.visible = visible;
    this.el.hidden = !visible;
    if (visible) {
      this.previousFocus = document.activeElement;
      this.follow = true;
      this.center = { x: this.player.x, z: this.player.z };
      this.failedTiles.clear();
      this.tileRegion = "";
      this.resize();
      this.el
        .querySelector('[data-map="close"]')
        .focus({ preventScroll: true });
      this.options.onOpen?.();
      this.schedule();
    } else {
      this.drag = null;
      this.tooltip.style.display = "none";
      if (this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
      this.previousFocus?.isConnected &&
        this.previousFocus.focus?.({ preventScroll: true });
      this.options.onClose?.();
    }
    return this.visible;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }
  zoom(factor, anchor = null) {
    const before = anchor
      ? mapUnproject(
          anchor.x,
          anchor.y,
          this.center,
          this.scale,
          this.width,
          this.height,
        )
      : null;
    this.scale = clamp(this.scale * factor, 0.35, 12);
    if (anchor) {
      const after = mapUnproject(
        anchor.x,
        anchor.y,
        this.center,
        this.scale,
        this.width,
        this.height,
      );
      this.center.x += before.x - after.x;
      this.center.z += before.z - after.z;
      this.follow = false;
    }
    this.schedule();
  }
  schedule() {
    if (!this.visible || this.disposed) return;
    this.needsDraw = true;
    if (!this.frame)
      this.frame = requestAnimationFrame(() => this.paintFrame());
  }
  paintFrame() {
    this.frame = 0;
    if (!this.visible || this.disposed) return;
    this.findVisibleTiles();
    const start = performance.now();
    let processed = 0;
    while (
      this.queue.length &&
      performance.now() - start < 3.5 &&
      processed < 5
    ) {
      const key = this.queue.shift();
      this.queued.delete(key);
      if (this.tiles.has(key) || !this.explored.has(key)) continue;
      this.makeTile(key);
      processed++;
    }
    this.draw();
    this.needsDraw = false;
    if (this.queue.length)
      this.frame = requestAnimationFrame(() => this.paintFrame());
  }
  findVisibleTiles() {
    const rx = this.width / (2 * this.scale),
      rz = this.height / (2 * this.scale),
      minX = Math.floor((this.center.x - rx) / CHUNK),
      maxX = Math.floor((this.center.x + rx) / CHUNK),
      minZ = Math.floor((this.center.z - rz) / CHUNK),
      maxZ = Math.floor((this.center.z + rz) / CHUNK);
    const region = `${minX},${maxX},${minZ},${maxZ}:${this.discoveryRevision}`;
    if (region === this.tileRegion) return;
    this.tileRegion = region;
    this.queue = [];
    this.queued.clear();
    const wanted = [];
    const consider = (key, x, z) => {
      if (
        this.explored.has(key) &&
        !this.tiles.has(key) &&
        !this.failedTiles.has(key)
      )
        wanted.push({
          key,
          d:
            (x * CHUNK - this.center.x) ** 2 + (z * CHUNK - this.center.z) ** 2,
        });
    };
    if (this.explored.size < (maxX - minX + 1) * (maxZ - minZ + 1)) {
      for (const key of this.explored) {
        const [x, z] = key.split(",").map(Number);
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ)
          consider(key, x, z);
      }
    } else
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++) consider(coordKey(x, z), x, z);
    wanted.sort((a, b) => a.d - b.d);
    for (const { key } of wanted) {
      this.queue.push(key);
      this.queued.add(key);
    }
    if (this.tiles.size > 1800) {
      for (const key of this.tiles.keys()) {
        const [x, z] = key.split(",").map(Number);
        if (x < minX - 8 || x > maxX + 8 || z < minZ - 8 || z > maxZ + 8)
          this.tiles.delete(key);
        if (this.tiles.size < 1500) break;
      }
    }
  }
  makeTile(key) {
    const [cx, cz] = key.split(",").map(Number);
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    const context = canvas.getContext("2d"),
      image = context.createImageData(TILE, TILE);
    try {
      for (let z = 0; z < TILE; z++)
        for (let x = 0; x < TILE; x++) {
          const wx = cx * CHUNK + x * SAMPLE + 1,
            wz = cz * CHUNK + z * SAMPLE + 1,
            h = this.world.getHeight(wx, wz),
            biome = this.world.getBiome(wx, wz);
          let color = PALETTE[biome] || PALETTE.Meadowlands;
          const neighbor = this.world.getHeight(wx + SAMPLE, wz + SAMPLE);
          let shade = clamp(1 + (h - neighbor) * 0.045, 0.73, 1.17);
          if (h <= 32) {
            color = [126, 169, 174];
            shade = 0.89 + clamp((h - 22) / 18, 0, 0.17);
          } else {
            if (h % 7 === 0) shade *= 0.89;
            shade *= 0.96 + (Math.sin(wx * 13.7 + wz * 7.3) + 1) * 0.025;
          }
          const i = (z * TILE + x) * 4;
          image.data[i] = clamp(Math.round(color[0] * shade), 0, 255);
          image.data[i + 1] = clamp(Math.round(color[1] * shade), 0, 255);
          image.data[i + 2] = clamp(Math.round(color[2] * shade), 0, 255);
          image.data[i + 3] = 255;
        }
      context.putImageData(image, 0, 0);
      this.tiles.set(key, canvas);
    } catch (error) {
      this.failedTiles.add(key);
      this.status.textContent =
        "地図を読み込めません。地図を開き直してください。";
      console.warn("Field atlas terrain tile unavailable:", error?.message);
    }
  }
  draw() {
    const c = this.ctx,
      w = this.width,
      h = this.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#e5dfca";
    c.fillRect(0, 0, w, h);
    // Stable paper grain is drawn only once per frame, with no texture download.
    c.fillStyle = "#b9b29215";
    for (let i = 0; i < 80; i++) {
      const x = (i * 137.12) % w,
        y = (i * 93.37) % h;
      c.fillRect(x, y, 1, 1);
    }
    const bounds = {
      minX: this.center.x - w / (2 * this.scale),
      maxX: this.center.x + w / (2 * this.scale),
      minZ: this.center.z - h / (2 * this.scale),
      maxZ: this.center.z + h / (2 * this.scale),
    };
    for (const [key, tile] of this.tiles) {
      const [cx, cz] = key.split(",").map(Number);
      const x = cx * CHUNK,
        z = cz * CHUNK;
      if (
        x > bounds.maxX ||
        x + CHUNK < bounds.minX ||
        z > bounds.maxZ ||
        z + CHUNK < bounds.minZ
      )
        continue;
      const p = mapProject(x, z, this.center, this.scale, w, h),
        end = mapProject(x + CHUNK, z + CHUNK, this.center, this.scale, w, h);
      c.drawImage(
        tile,
        Math.floor(p.x),
        Math.floor(p.y),
        Math.ceil(end.x) - Math.floor(p.x),
        Math.ceil(end.y) - Math.floor(p.y),
      );
    }
    const spacing = this.scale < 1 ? 128 : this.scale < 3 ? 64 : 32;
    c.strokeStyle = "#566a4e13";
    c.lineWidth = 1;
    c.beginPath();
    for (
      let x = Math.ceil(bounds.minX / spacing) * spacing;
      x < bounds.maxX;
      x += spacing
    ) {
      const p = mapProject(x, 0, this.center, this.scale, w, h);
      c.moveTo(Math.round(p.x) + 0.5, 0);
      c.lineTo(Math.round(p.x) + 0.5, h);
    }
    for (
      let z = Math.ceil(bounds.minZ / spacing) * spacing;
      z < bounds.maxZ;
      z += spacing
    ) {
      const p = mapProject(0, z, this.center, this.scale, w, h);
      c.moveTo(0, Math.round(p.y) + 0.5);
      c.lineTo(w, Math.round(p.y) + 0.5);
    }
    c.stroke();
    if (this.waypoint) {
      const p = mapProject(
          this.player.x,
          this.player.z,
          this.center,
          this.scale,
          w,
          h,
        ),
        q = mapProject(
          this.waypoint.x,
          this.waypoint.z,
          this.center,
          this.scale,
          w,
          h,
        );
      c.save();
      c.strokeStyle = "#8f79549c";
      c.lineWidth = 1.4;
      c.setLineDash([4, 5]);
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(q.x, q.y);
      c.stroke();
      c.restore();
      this.drawMarker(this.waypoint, "目的地", "◆", "#98724e", true);
    }
    this.drawMarker(this.spawn, "野営地", "⌂", "#52634a", true);
    this.drawMarker({ x: -20, z: -24 }, "古代の遺跡", "✧", "#8b7753", false);
    for (const m of this.markers)
      if (m && finite(m.x) && finite(m.z))
        this.drawMarker(
          m,
          m.label || m.name || "目印",
          m.icon || "◇",
          m.color || "#667b58",
          !!m.alwaysVisible,
        );
    const p = mapProject(
      this.player.x,
      this.player.z,
      this.center,
      this.scale,
      w,
      h,
    );
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-this.player.yaw);
    c.shadowColor = "#233c3255";
    c.shadowBlur = 5;
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(7, 8);
    c.lineTo(0, 4);
    c.lineTo(-7, 8);
    c.closePath();
    c.fillStyle = "#263f33";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "#f6f0dc";
    c.stroke();
    c.restore();
    c.strokeStyle = "#dfd7bf";
    c.lineWidth = 7;
    c.strokeRect(0, 0, w, h);
    c.strokeStyle = "#75846933";
    c.lineWidth = 1;
    c.strokeRect(5, 5, w - 10, h - 10);
    const biome = this.world.getBiome(this.player.x, this.player.z);
    this.positionLabel.textContent = `${LABELS[biome] || biome}　·　X ${Math.floor(this.player.x)}　Z ${Math.floor(this.player.z)}　·　探索 ${this.explored.size.toLocaleString()} 区画`;
    const blocks =
      this.scale > 5 ? 10 : this.scale > 2 ? 25 : this.scale > 0.8 ? 50 : 100;
    this.scaleBar.querySelector("i").style.width = `${blocks * this.scale}px`;
    this.scaleBar.querySelector("span").textContent = `${blocks} ブロック`;
    this.status.textContent = this.queue.length
      ? "地形を描いています…"
      : this.failedTiles.size
        ? "一部の地形を読み込めませんでした。地図を開き直してください"
        : this.follow
          ? "現在地を追跡中"
          : "地図を移動中 · ◎ で現在地へ";
    this.clearButton.hidden = !this.waypoint;
    if (this.waypoint) {
      const distance = Math.round(
        Math.hypot(
          this.waypoint.x - this.player.x,
          this.waypoint.z - this.player.z,
        ),
      );
      this.waypointLabel.replaceChildren();
      const number = document.createElement("span");
      number.className = "wb-atlas-distance";
      number.textContent = distance.toLocaleString();
      this.waypointLabel.append(
        number,
        document.createTextNode(
          `m　目的地 X ${this.waypoint.x} / Z ${this.waypoint.z}`,
        ),
      );
    } else this.waypointLabel.textContent = "地図をクリックして、次の旅先を。";
  }
  drawMarker(position, label, icon, color, alwaysVisible) {
    if (!position || !finite(position.x) || !finite(position.z)) return;
    if (
      !alwaysVisible &&
      !this.explored.has(
        coordKey(
          Math.floor(position.x / CHUNK),
          Math.floor(position.z / CHUNK),
        ),
      )
    )
      return;
    const p = mapProject(
      position.x,
      position.z,
      this.center,
      this.scale,
      this.width,
      this.height,
    );
    if (
      p.x < -100 ||
      p.y < -20 ||
      p.x > this.width + 100 ||
      p.y > this.height + 20
    )
      return;
    const c = this.ctx;
    c.save();
    c.textAlign = "center";
    c.shadowColor = "#eeeadb";
    c.shadowBlur = 5;
    c.font = "23px Georgia,serif";
    c.fillStyle = color;
    c.fillText(icon, p.x, p.y + 7);
    c.font = "10px system-ui,sans-serif";
    c.fillText(String(label).slice(0, 32), p.x, p.y + 23);
    c.restore();
  }
  toJSON() {
    const encoded = encodeExploration(this.explored);
    return {
      version: 1,
      explored: encoded.length > 60000 ? encoded.match(/.{1,60000}/g) : encoded,
      waypoint: this.waypoint ? { ...this.waypoint } : null,
    };
  }
  serialize() {
    return this.toJSON();
  }
  load(data) {
    if (!data || data.version !== 1) return;
    const encoded =
      Array.isArray(data.explored) &&
      data.explored.length <= 40 &&
      data.explored.every((s) => typeof s === "string" && s.length <= 60000)
        ? data.explored.join("")
        : data.explored;
    this.explored = decodeExploration(encoded);
    if (
      data.waypoint &&
      finite(data.waypoint.x) &&
      finite(data.waypoint.z) &&
      Math.abs(data.waypoint.x) < 1e7 &&
      Math.abs(data.waypoint.z) < 1e7
    )
      this.waypoint = {
        x: Math.round(data.waypoint.x),
        z: Math.round(data.waypoint.z),
      };
    else this.waypoint = null;
    this.tiles.clear();
    this.queue = [];
    this.queued.clear();
    this.failedTiles.clear();
    this.tileRegion = "";
    this.discoveryRevision++;
    this.schedule();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("keydown", this._key, true);
    this.el.removeEventListener("click", this._click);
    this.canvas.removeEventListener("pointerdown", this._down);
    this.canvas.removeEventListener("pointermove", this._move);
    this.canvas.removeEventListener("pointerup", this._up);
    this.canvas.removeEventListener("pointercancel", this._cancel);
    this.canvas.removeEventListener("pointerleave", this._leave);
    this.canvas.removeEventListener("wheel", this._wheel);
    this.el.remove();
    this.style.remove();
    this.tiles.clear();
    this.queue = [];
    this.explored.clear();
    this.visible = false;
  }
}
