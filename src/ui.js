import { ITEMS, RECIPES } from "./data.js";

const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const defaults = {
  renderDistance: 5,
  fov: 75,
  sensitivity: 0.8,
  volume: 0.65,
  musicVolume: 0.3,
  effectsVolume: 0.8,
  quality: "high",
  headBob: true,
  autoResolution: true,
};
const labelCategory = {
  basics: "基本",
  smelting: "精錬",
  farming: "農業",
  exploration: "探検",
  tools: "道具",
  tool: "道具",
  building: "建築",
  blocks: "建築",
  survival: "生活",
  food: "食料",
  materials: "素材",
  material: "素材",
  equipment: "装備",
  armor: "装備",
  decoration: "装飾",
  utility: "設備",
  combat: "戦闘",
};
const stationNames = { workbench: "工作台", furnace: "炉" };
const stationsArray = (station) =>
  station instanceof Set
    ? [...station]
    : Array.isArray(station)
      ? station
      : station
        ? [station]
        : [];
const stationLabel = (station) =>
  stationsArray(station)
    .map((s) => stationNames[s] || s)
    .join(" + ") || "手作り";
const symbol = (name, cls = "") =>
  `<svg class="symbol ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    {
      compass:
        '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
      leaf: '<path d="M19 4C7 3 2 9 7 16s14 1 12-12Z"/><path d="m5 20 11-12"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
      heart:
        '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
      food: '<path d="M5 3v6c0 3 5 3 5 0V3M7.5 3v18M17 3c-5 4-3 10 1 10V3v18"/>',
      book: '<path d="M3 4c3-1 6-1 9 1 3-2 6-2 9-1v16c-3-1-6-1-9 1-3-2-6-2-9-1V4Z"/><path d="M12 5v16m-6-13 3 1m-3 3 3 1m6-4 3-1m-3 5 3-1"/>',
      arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
      plus: '<path d="M12 4v16M4 12h16"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      check: '<path d="m4 12 5 5L20 6"/>',
      gear: '<path d="m10 3-.5 2-2 .8-1.8-.9-2 3.5 1.5 1.5v2.3L3.7 14l2 3.5 1.8-.6 2 1 .5 2.1h4l.5-2.1 2-1 1.8.6 2-3.5-1.5-1.8V10l1.5-1.5-2-3.5-1.8.9-2-.8L14 3h-4Z"/><circle cx="12" cy="11.5" r="3"/>',
      save: '<path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/>',
      water: '<path d="M12 2C9 7 5 10 5 15a7 7 0 0 0 14 0c0-5-4-8-7-13Z"/>',
      mountain:
        '<path d="m2 20 7-13 4 7 3-5 6 11H2Z"/><path d="m7 11 2 2 2-2"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
      trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
      spark:
        '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
      arrowLeft: '<path d="M20 12H4m6-6-6 6 6 6"/>',
      bag: '<path d="M5 8h14l2 13H3L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
      flag: '<path d="M5 22V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
      shield:
        '<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    }[name] || '<circle cx="12" cy="12" r="7"/>'
  }</svg>`;

export function itemIcon(id, size = 40) {
  const item = ITEMS[id];
  if (!item) return "";
  const color =
    typeof item.color === "number"
      ? `#${item.color.toString(16).padStart(6, "0")}`
      : item.color || "#c9b685";
  const common = `width="${size}" height="${size}" viewBox="0 0 48 48" class="item-icon" aria-hidden="true"`;
  let drawing;
  if (/pickaxe/.test(id))
    drawing = `<path d="m14 39 19-26" stroke="#9d7146" stroke-width="6"/><path d="M9 15 20 8l17 1 6 10-14-5-8 4-8 8Z" fill="${color}" stroke="#222c30" stroke-width="1.4"/><path d="m18 12 15-1 5 4" fill="none" stroke="#ffffff" opacity=".3" stroke-width="2"/>`;
  else if (/sword/.test(id))
    drawing = `<path d="m14 36 9-10" stroke="#9d7146" stroke-width="7"/><path d="m21 25 8 5 14-23-8 3Z" fill="${color}" stroke="#253132" stroke-width="1.5"/><path d="m18 24 11 10" stroke="#b79558" stroke-width="5"/><path d="m26 25 11-14" stroke="#fff" opacity=".3" stroke-width="2"/>`;
  else if (/shovel/.test(id))
    drawing = `<path d="m13 39 17-22" stroke="#9d7146" stroke-width="6"/><path d="m24 21 6-13 12 9-10 11Z" fill="${color}" stroke="#253132" stroke-width="1.4"/>`;
  else if (/axe/.test(id))
    drawing = `<path d="m13 40 20-29" stroke="#9d7146" stroke-width="6"/><path d="m25 8 12 3 3 8-10 9-10-8Z" fill="${color}" stroke="#253132" stroke-width="1.4"/><path d="m22 20 10 5 6-6" fill="none" stroke="#fff" opacity=".25" stroke-width="2"/>`;
  else if (/berry|berries/.test(id))
    drawing = `<path d="m23 16 2-9 11-2-5 10Z" fill="#739b62"/><g fill="${color}" stroke="#493349" stroke-width="1.4"><circle cx="16" cy="24" r="8"/><circle cx="29" cy="23" r="9"/><circle cx="24" cy="34" r="9"/></g><path d="m12 20 3-1m13-2 3 1m-10 12 3-1" stroke="#fff" opacity=".4" stroke-width="2"/>`;
  else if (/meat|steak/.test(id))
    drawing = `<path d="m18 31-6 7-5-4 7-7" stroke="#e6d6b7" stroke-width="6"/><path d="M15 15C34-2 49 23 30 34c-12 7-25-9-15-19Z" fill="${color}" stroke="#533d34" stroke-width="2"/><path d="M25 15c8-3 13 7 6 11" fill="none" stroke="#edb68a" stroke-width="3"/>`;
  else if (/apple|fruit/.test(id))
    drawing = `<path d="m25 13 2-8m-2 8 10-6" stroke="#6c8552" stroke-width="4"/><path d="M24 15C3 3 5 38 21 42h7c15-9 16-38-4-27Z" fill="${color}" stroke="#5c4834" stroke-width="1.5"/><path d="M15 20c-3 5-2 10 0 13" stroke="#fff" opacity=".3" stroke-width="3"/>`;
  else if (/bread/.test(id))
    drawing = `<path d="M7 23C0 3 46 3 41 23v15H7V23Z" fill="${color}" stroke="#825e35" stroke-width="2"/><path d="m15 14-3 8m14-10-3 10m13-6-2 8" stroke="#f8dca4" stroke-width="3"/>`;
  else if (/crystal|gem/.test(id) && item.block === undefined && !item.armor)
    drawing = `<path d="m23 3 14 10 2 20-14 12L9 30l3-19Z" fill="${color}" stroke="#345f65" stroke-width="1.5"/><path d="m23 3-3 20 5 22 4-23 8-9M9 30l11-7 9-1 10 11" fill="none" stroke="#fff" opacity=".35" stroke-width="1.5"/>`;
  else if (/ingot/.test(id))
    drawing = `<path d="m9 16 22-6 12 14-4 10-25 7L5 28Z" fill="${color}" stroke="#4b4840" stroke-width="1.4"/><path d="m9 16 9 11 25-3M18 27l-4 14" stroke="#fff" fill="none" opacity=".4" stroke-width="2"/>`;
  else if (/helmet|armor|chestplate|tunic/.test(id))
    drawing = `<path d="m15 9-10 8 6 10 5-3v17h18V24l5 3 6-10-11-8-9 4Z" fill="${color}" stroke="#313b3b" stroke-width="1.5"/><path d="m18 11 7 8 7-8m-7 8v20" fill="none" stroke="#fff" opacity=".25" stroke-width="2"/>`;
  else if (/hoe/.test(id))
    drawing = `<path d="m13 40 19-27" stroke="#9d7146" stroke-width="6"/><path d="m22 9 17 5 2 10-7 6-6-10-10-5Z" fill="${color}" stroke="#253132" stroke-width="1.5"/><path d="m33 16 4 9" stroke="#fff" opacity=".3" stroke-width="2"/>`;
  else if (/compass/.test(id))
    drawing = `<circle cx="24" cy="25" r="18" fill="#6e704f" stroke="${color}" stroke-width="3"/><circle cx="24" cy="25" r="14" fill="#d0d3b7"/><path d="m30 12-2 18-10 8 2-18Z" fill="#b86d65"/><path d="m30 12-6 13-6 13 2-18Z" fill="#f3e6ba"/><circle cx="24" cy="25" r="2" fill="#5d725f"/><path d="M24 4V1" stroke="${color}" stroke-width="5"/>`;
  else if (/glider/.test(id))
    drawing = `<path d="m24 9-18 3-3 25 14-7 7 11 7-11 14 7-3-25Z" fill="${color}" stroke="#667a60" stroke-width="1.4"/><path d="m24 9-7 21m7-21 7 21M6 12l11 18m25-18L31 30" stroke="#fff" opacity=".25" stroke-width="1.5"/>`;
  else if (/feather/.test(id))
    drawing = `<path d="M9 39C-1 16 22-2 40 8c1 20-9 31-31 31Z" fill="${color}" stroke="#8f9b83" stroke-width="1.2"/><path d="M6 44 35 12m-23 25 1-16m4 10 2-17m3 11 3-14m-9 23 14-2m-8-4 14-4" stroke="#8b9a83" fill="none" stroke-width="1.4"/>`;
  else if (/bone/.test(id))
    drawing = `<path d="m15 33 18-18" stroke="${color}" stroke-width="9"/><path d="M14 27c-10-7-15 7-6 8-3 10 11 11 10 2m14-17c10 5 13-7 6-9 2-9-11-12-12-2" fill="${color}" stroke="#918c77" stroke-width="1.2"/>`;
  else if (/wheat|crop|seed/.test(id))
    drawing = `<path d="M24 44V8m0 24-10-9m10 1 10-9m-10 2-9-9" stroke="#aa9252" stroke-width="2.5"/><g fill="${color}" stroke="#8a7b43" stroke-width=".7"><ellipse cx="16" cy="28" rx="3" ry="7" transform="rotate(-45 16 28)"/><ellipse cx="31" cy="22" rx="3" ry="7" transform="rotate(45 31 22)"/><ellipse cx="17" cy="16" rx="3" ry="7" transform="rotate(-45 17 16)"/><ellipse cx="24" cy="10" rx="3" ry="7"/></g>`;
  else if (/fiber/.test(id))
    drawing = `<path d="m21 43-7-27m12 27 1-36m2 35 12-22M17 37 6 27m17 7L12 8m17 24L38 9" stroke="${color}" stroke-width="3"/><path d="m13 30 20 2m-20 2 19 2" stroke="#a8844d" stroke-width="3"/>`;
  else if (/rope/.test(id))
    drawing = `<ellipse cx="24" cy="21" rx="15" ry="13" fill="none" stroke="#7b684a" stroke-width="7"/><ellipse cx="24" cy="21" rx="15" ry="13" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="5 1.5"/><path d="M10 25c-3 12 18 18 21 9l4 6" fill="none" stroke="${color}" stroke-width="5"/>`;
  else if (/mushroom/.test(id))
    drawing = `<path d="m21 25-1 17h12l-4-17Z" fill="#e4d4ad" stroke="#b19b72" stroke-width="1.2"/><path d="M4 26C4 1 42 0 44 26c-13 6-27 6-40 0Z" fill="${color}" stroke="#856c46" stroke-width="1.5"/><path d="m13 16 4-4m11-3 3 3m5 8 2 2" stroke="#f5deaa" stroke-width="4"/>`;
  else if (/stew|trail_mix/.test(id))
    drawing = `<path d="M5 22h38c0 28-38 28-38 0Z" fill="#a27754" stroke="#70543d" stroke-width="1.5"/><ellipse cx="24" cy="22" rx="19" ry="6" fill="${color}" stroke="#d8b991" stroke-width="2"/><path d="m13 21 5 1m6-2 4 3m6-3 2 1" stroke="#6c8c58" stroke-width="3"/><path d="m19 13-2-4 2-4m9 8-2-4 2-4" fill="none" stroke="#e7e1bc" stroke-width="1.5" opacity=".5"/>`;
  else if (/honey/.test(id))
    drawing = `<path d="m16 13-4 5-1 21c8 5 19 5 27 0l-2-21-5-5Z" fill="${color}" stroke="#9d7843" stroke-width="1.6"/><path d="M14 10h19v6H14Z" fill="#bd9a67"/><path d="m16 22 17-2v10l-17 2Z" fill="#efd399" opacity=".5"/><path d="M19 3c-6 8 4 10 0 0Z" fill="#efc96b"/>`;
  else if (/ancient_shard/.test(id))
    drawing = `<path d="m24 4 17 12-6 25-17 3L6 28l6-18Z" fill="${color}" stroke="#728777" stroke-width="1.5"/><path d="m24 13 10 7-6 15-13-8 9-14Zm-4 12 8 1-3 6" fill="none" stroke="#627c71" stroke-width="2"/><path d="m13 10 3 7M8 29l7-2m20 14-7-6" stroke="#edf0cc" opacity=".3" stroke-width="2"/>`;
  else if (/star_core|ember/.test(id))
    drawing = `<path d="m24 4 6 10 11 3-4 12 1 10-14-2-12 6 1-15L6 17l13-3Z" fill="${color}" stroke="#778b78" stroke-width="1.2"/><circle cx="24" cy="24" r="8" fill="#f3ebba"/><path d="M24 11v26M11 24h26m-22-9 18 18m-18 0 18-18" stroke="#fff4bf" stroke-width="1.5" opacity=".5"/>`;
  else if (/stick/.test(id))
    drawing = `<path d="m13 41 22-33 5 4-22 33Z" fill="${color}" stroke="#634d36" stroke-width="1.5"/><path d="m17 34 12-18" stroke="#d3ab73" stroke-width="2"/>`;
  else if (/torch/.test(id))
    drawing = `<path d="m20 43 5-24h6l-4 24Z" fill="#8c6345"/><path d="M26 28C8 22 22 10 23 3c2 8 10 6 11 16 3 5-4 10-8 9Z" fill="#efb85e"/><path d="M26 27c-7-4-1-11 1-14 0 5 5 9-1 14Z" fill="#fff0b0"/>`;
  else if (/hide|leather/.test(id))
    drawing = `<path d="m14 6 10 6 11-6-2 12 10 9-12 3-3 13-9-8-12 1 5-12-7-9 11-1Z" fill="${color}" stroke="#594333" stroke-width="1.4"/><path d="m18 17 9 4-5 10" fill="none" stroke="#e3bc8d" opacity=".5"/>`;
  else if (/flower/.test(id))
    drawing = `<path d="M24 44V20m0 16-11-7m11 2 11-8" stroke="#618658" stroke-width="4"/><g fill="${color}"><circle cx="17" cy="15" r="7"/><circle cx="30" cy="15" r="7"/><circle cx="24" cy="8" r="7"/><circle cx="24" cy="22" r="7"/></g><circle cx="24" cy="15" r="5" fill="#f5cf72"/>`;
  else if (/coal|ore|stone|flint/.test(id) && item.block === undefined)
    drawing = `<path d="m7 15 16-8 17 9 3 18-16 8-22-9Z" fill="${color}" stroke="#424548" stroke-width="1.5"/><path d="m7 15 14 9 19-8m-19 8 6 18M21 24 5 33" stroke="#fff" fill="none" opacity=".15" stroke-width="2"/>`;
  else
    drawing = `<path d="m24 5 19 10v22L24 47 5 37V15Z" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/><path d="m24 5 19 10-19 10L5 15Z" fill="#fff" opacity=".22"/><path d="m24 25 19-10v22L24 47Z" fill="#000" opacity=".2"/><path d="M24 25v22M5 15l19 10 19-10" fill="none" stroke="rgba(0,0,0,.17)"/><path d="m10 24 6 3m-3 6 7 4m10-9 7-4m-7 12 6-3" stroke="rgba(255,255,255,.16)" stroke-width="2"/>`;
  return `<svg ${common}>${drawing}</svg>`;
}

function slotHTML(slot, index, selected = false, cls = "") {
  const item = slot && ITEMS[slot.id];
  const durability =
    item?.durability && slot.durability !== undefined
      ? clamp(slot.durability / item.durability, 0, 1)
      : null;
  return `<button class="slot ${selected ? "selected" : ""} ${slot ? "occupied" : ""} ${cls}" data-slot="${index}" aria-label="${item ? esc(`${item.name} ${slot.count}`) : "空のスロット"}" ${slot ? 'draggable="true"' : ""}>${index < 9 ? `<span class="slot-key">${index + 1}</span>` : ""}${item ? itemIcon(slot.id) : ""}${slot?.count > 1 ? `<span class="slot-count">${slot.count}</span>` : ""}${durability !== null ? `<span class="durability"><i style="width:${durability * 100}%;background:${durability < 0.25 ? "#df8171" : "#a2c59a"}"></i></span>` : ""}</button>`;
}

export class UI {
  constructor(rootElement, actions = {}) {
    this.root =
      typeof rootElement === "string"
        ? document.querySelector(rootElement)
        : rootElement;
    if (!this.root) throw new Error("UI root was not found");
    this.actions = actions;
    this.settings = { ...defaults };
    this.worlds = [];
    this.screen = "main";
    this.lastState = {};
    this.inventory = null;
    this.recipeCategory = "all";
    this.recipeSearch = "";
    this.selectedRecipe = null;
    this.selectedBagSlot = null;
    this.gameActive = false;
    this.root.classList.add("wildbound-ui");
    this.root.innerHTML = `<div class="damage-vignette" aria-hidden="true"></div><div class="underwater-vignette" aria-hidden="true"></div><div class="hud" hidden>
    <div class="hud-location"><span class="brand-mark">W</span><div><span class="eyebrow">THE WILDLANDS</span><strong class="biome-name">緑の原野</strong></div></div>
    <div class="compass"><span>W</span><i></i><span>N</span><i></i><span>E</span><b>◆</b></div>
    <div class="hud-time">${symbol("sun")}<div><strong class="day-label">DAY 01</strong><span class="time-label">朝 · 06:00</span></div></div>
    <div class="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="target-label"><span></span><div class="mining-track"><i></i></div></div>
    <div class="quest-widget"><div class="quest-label">${symbol("flag")}<span>旅の手がかり</span><kbd>J</kbd></div><strong class="quest-title">はじまりの一歩</strong><p class="quest-description">木を集め、最初の道具を作ろう。</p></div>
    <div class="survival"><div class="stat-row health-row">${symbol("heart")}<div class="stat-pips health-pips">${"<i></i>".repeat(10)}</div><span class="health-value">100</span></div><div class="stat-row hunger-row">${symbol("food")}<div class="stat-pips hunger-pips">${"<i></i>".repeat(10)}</div><span class="hunger-value">100</span></div><div class="stamina-row" hidden aria-label="スタミナ"><svg class="symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/></svg><div><i></i></div><span>スタミナ</span></div><div class="oxygen-row" hidden>${symbol("water")}<div><i></i></div><span>酸素</span></div></div>
    <div class="hotbar-area"><div class="selected-item-name"></div><div class="hotbar" role="toolbar" aria-label="ホットバー"></div><div class="hotbar-caption"><span><kbd>E</kbd> 持ちものとクラフト</span><span class="save-indicator">${symbol("save")} 自動保存</span></div></div>
    <div class="control-hints"><span><kbd>LMB</kbd> 採掘 / 攻撃</span><span><kbd>RMB</kbd> 設置 / 食べる</span><span><kbd>F</kbd> 調べる</span><span><kbd>Esc</kbd> メニュー</span></div>
    <div class="play-guide" hidden><span>CLICK TO EXPLORE</span><strong>画面をクリックして、旅をはじめよう。</strong><small>WASD で移動 · マウスで見渡す</small></div><div class="discovery-ribbon" hidden></div><div class="debug-panel" hidden></div><div class="mobile-hint" hidden>マウスとキーボードでプレイしてください</div>
   </div><div class="overlay-layer"></div><div class="toast-stack" aria-live="polite"></div><div class="item-tooltip" hidden></div>`;
    this.hud = this.root.querySelector(".hud");
    this.overlay = this.root.querySelector(".overlay-layer");
    this.tooltip = this.root.querySelector(".item-tooltip");
    this.toastStack = this.root.querySelector(".toast-stack");
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.root.addEventListener("contextmenu", (event) => {
      const chest = event.target.closest("[data-chest-slot]");
      if (chest) {
        event.preventDefault();
        this.call("chestClick", +chest.dataset.chestSlot, event);
        return;
      }
      if (event.target.closest("[data-slot]")) {
        event.preventDefault();
        this.onSlot(event.target.closest("[data-slot]"), event);
      }
    });
    this.root.addEventListener("submit", (event) => this.onSubmit(event));
    this.root.addEventListener("input", (event) => this.onInput(event));
    this.root.addEventListener("change", (event) => this.onChange(event));
    this.root.addEventListener("pointerover", (event) => this.onTooltip(event));
    this.root.addEventListener("pointermove", (event) =>
      this.positionTooltip(event),
    );
    this.root.addEventListener("pointerout", (event) => {
      if (event.target.closest("[data-slot], [data-item], [data-chest-slot]"))
        this.tooltip.hidden = true;
    });
    this.root.addEventListener("dragstart", (event) => {
      const slot = event.target.closest("[data-slot]");
      if (!slot || !this.inventory?.slots[+slot.dataset.slot]) return;
      this.dragFrom = +slot.dataset.slot;
      event.dataTransfer.setData("text/plain", String(this.dragFrom));
      event.dataTransfer.effectAllowed = "move";
      this.tooltip.hidden = true;
    });
    this.root.addEventListener("dragover", (event) => {
      if (event.target.closest("[data-slot]")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    });
    this.root.addEventListener("drop", (event) => {
      const slot = event.target.closest("[data-slot]");
      if (!slot || this.dragFrom == null) return;
      event.preventDefault();
      const to = +slot.dataset.slot,
        from = this.dragFrom;
      this.actions.inventoryClick?.(to, {
        from,
        to,
        drag: true,
        split: event.altKey,
        shiftKey: event.shiftKey,
        button: 0,
        preventDefault() {},
      });
      this.dragFrom = null;
      this.selectedBagSlot = null;
      this.refreshInventory();
    });
    this.root.addEventListener("dragend", () => {
      this.dragFrom = null;
    });
    this._hudSignature = "";
  }

  call(name, ...args) {
    return this.actions[name]?.(...args);
  }
  setWorldList(saves = []) {
    this.worlds = saves;
    if (this.screen === "main" || this.screen === "worlds")
      this.showMain(saves);
  }
  logo(small = false) {
    return `<div class="wordmark ${small ? "small" : ""}"><span class="logo-sigil">${symbol("compass")}</span><span>WILD<span class="wordmark-light">BOUND</span></span></div>`;
  }
  screenHTML(content, className = "") {
    this.root.dataset.screen = this.screen || "playing";
    this.tooltip.hidden = true;
    this.overlay.innerHTML = `<div class="screen ${className}">${content}</div>`;
    this.overlay.hidden = false;
  }
  footer() {
    return `<div class="menu-footer"><span>AN ORIGINAL VOXEL ADVENTURE</span><span>探索する。つくる。ここで、生きる。</span><span>WILDBOUND · 1.0</span></div>`;
  }
  showMain(worldSaves = this.worlds) {
    this.screen = "main";
    this.worlds = worldSaves || [];
    this.gameActive = false;
    this.hud.hidden = true;
    const recent = this.worlds.slice(0, 3);
    this.screenHTML(
      `<div class="menu-grain"></div><header class="menu-header">${this.logo(true)}<span class="menu-header-note">A WORLD WAITING TO BE YOURS</span><button class="icon-button" data-action="settings" title="設定">${symbol("gear")}</button></header>
   <div class="main-composition"><div class="main-copy"><div class="edition-tag"><i></i> THE WILDLANDS ARE CALLING</div><h1>まだ見ぬ世界に、<br><em>あなたの足跡を。</em></h1><p class="main-description">風が渡る森。光をたたえる洞窟。<br>ひとつずつ集めて、つくって、生きていく。<br>この世界の物語は、ここから始まる。</p><div class="main-actions"><button class="button primary large" data-action="new">${symbol("plus")}<span>新しい冒険へ<small>CREATE A WORLD</small></span>${symbol("arrow")}</button>${recent.length ? `<button class="button understated" data-action="continue" data-id="${esc(recent[0].id)}">${symbol("compass")} 前の冒険を続ける</button>` : ""}</div><div class="main-mini-stats"><span>${symbol("mountain")} 果てしない大地</span><span>${symbol("leaf")} あなただけの暮らし</span></div></div>
   <aside class="field-notes"><div class="field-notes-top"><span class="eyebrow">YOUR FIELD JOURNAL</span>${symbol("book")}</div><h2>冒険の記録</h2><p class="muted small-text">大切な世界へ、いつでも帰ろう。</p><div class="world-list">${recent.length ? recent.map((world, index) => this.worldCard(world, index)).join("") : `<div class="empty-worlds">${symbol("compass")}<span>最初の1ページは、まだ白紙。</span><small>新しい世界をつくり、物語を始めましょう。</small></div>`}</div>${this.worlds.length > 3 ? '<button class="text-button world-more" data-action="worlds">すべての世界を見る ' + symbol("arrow") + "</button>" : ""}<div class="journal-import"><label class="text-button">${symbol("download")} ワールドを読み込む<input type="file" accept=".json,application/json" class="import-file" hidden></label></div><div class="field-note-tip"><span>旅のヒント</span><p>昼のうちに木を集め、夜に備えよう。<br>奥深くには、まだ知らない輝きがある。</p></div></aside></div>${this.footer()}`,
      "main-screen",
    );
  }
  worldCard(world, index = 0) {
    const saved = world.updatedAt || world.savedAt || world.createdAt;
    let date = "";
    try {
      if (saved)
        date = new Date(saved).toLocaleDateString("ja-JP", {
          month: "short",
          day: "numeric",
        });
    } catch {}
    return `<div class="world-card"><button class="world-open" data-action="load" data-id="${esc(world.id)}"><div class="world-thumbnail thumbnail-${index % 3}">${symbol(index % 2 ? "leaf" : "mountain")}</div><span><strong>${esc(world.name || "名もなき世界")}</strong><small>${world.mode === "creative" ? "クリエイティブ" : "サバイバル"} ${date ? "· " + date : ""}</small></span>${symbol("arrow")}</button><div class="world-card-tools"><button class="mini-button" data-action="export" data-id="${esc(world.id)}" title="書き出す">${symbol("download")}</button><button class="mini-button" data-action="delete" data-id="${esc(world.id)}" title="削除">${symbol("trash")}</button></div></div>`;
  }
  showWorlds() {
    this.screen = "worlds";
    this.screenHTML(
      `<div class="panel world-panel"><div class="panel-heading"><div><span class="eyebrow">YOUR WORLDS</span><h2>冒険の記録</h2></div><button class="icon-button" data-action="main" title="戻る">${symbol("close")}</button></div><div class="world-grid">${this.worlds.map((w, i) => this.worldCard(w, i)).join("")}</div><button class="button primary" data-action="new">${symbol("plus")} 新しい世界</button></div>`,
      "center-screen",
    );
  }
  showNewWorld() {
    this.screen = "new";
    this.screenHTML(
      `<div class="panel new-world-panel"><div class="panel-heading"><div><span class="eyebrow">EVERY ADVENTURE STARTS HERE</span><h2>あなたの世界を、はじめよう。</h2></div><button class="icon-button" data-action="main" title="戻る">${symbol("close")}</button></div><form id="new-world-form"><label class="form-label">世界の名前<input name="name" maxlength="48" value="はじまりの谷" autocomplete="off" required></label><label class="form-label">ワールドシード<span class="input-wrap"><input name="seed" maxlength="80" value="" autocomplete="off" placeholder="空欄なら、新しい出会いを"><button type="button" class="random-seed" data-action="random-seed" title="ランダムなシード">${symbol("spark")}</button></span><small>同じシードからは、同じ地形が生まれます。</small></label><span class="form-label">冒険のスタイル</span><div class="mode-choices"><label class="mode-card"><input type="radio" name="mode" value="survival" checked><span>${symbol("leaf")}<strong>サバイバル</strong><small>資源を集め、つくり、生き延びる。<br>世界とともに成長する冒険。</small><i>${symbol("check")}</i></span></label><label class="mode-card"><input type="radio" name="mode" value="creative"><span>${symbol("spark")}<strong>クリエイティブ</strong><small>空を飛び、思いのままにつくる。<br>あなたの想像力を、かたちに。</small><i>${symbol("check")}</i></span></label></div><div class="form-bottom"><button type="button" class="button ghost" data-action="main">${symbol("arrowLeft")} 戻る</button><button type="submit" class="button primary" data-testid="create-world">世界をつくる ${symbol("arrow")}</button></div></form></div>`,
      "center-screen",
    );
    setTimeout(
      () => this.overlay.querySelector('input[name="name"]')?.focus(),
      80,
    );
  }
  showPause() {
    this.screen = "pause";
    this.gameActive = true;
    this.hud.hidden = true;
    this.screenHTML(
      `<div class="pause-composition"><div class="pause-intro">${this.logo(true)}<span class="eyebrow">TAKE A BREATH</span><h1>ひと休み。</h1><p>世界は、あなたの帰りを待っています。</p></div><div class="panel pause-panel"><div class="panel-heading"><span class="eyebrow">YOUR ADVENTURE</span>${symbol("compass")}</div><button class="button primary large" data-action="resume">冒険を続ける ${symbol("arrow")}</button><button class="menu-row" data-action="journal">${symbol("book")}<span>フィールドノート</span><kbd>J</kbd></button><button class="menu-row" data-action="save">${symbol("save")}<span>ワールドを保存</span></button><button class="menu-row" data-action="settings">${symbol("gear")}<span>設定</span></button><div class="panel-divider"></div><button class="button ghost" data-action="quit">保存してタイトルへ</button><p class="small-text muted centered">ワールドは一定時間ごとに自動保存されます。</p></div></div>`,
      "pause-screen",
    );
  }
  showSettings(settings = this.settings) {
    if (this.screen !== "settings") this.settingsBack = this.screen;
    this.screen = "settings";
    this.settings = { ...this.settings, ...settings };
    const s = this.settings;
    const slider = (key, label, min, max, step, format) =>
      `<label class="setting-row"><span><strong>${label}</strong><small>${{ renderDistance: "広く見渡すほど、描画の負荷が上がります。", fov: "広角な視界で、景色をもっと。", sensitivity: "視点移動の速さを調整します。", volume: "すべての音の大きさ。", musicVolume: "旅に寄り添う、環境音と旋律。", effectsVolume: "足音・採掘・生き物の音。" }[key]}</small></span><div class="setting-control"><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-setting="${key}" aria-label="${label}"><output data-output="${key}">${format(s[key])}</output></div></label>`;
    this.screenHTML(
      `<div class="panel settings-panel"><div class="panel-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2>設定</h2></div><button class="icon-button" data-action="settings-back" title="閉じる">${symbol("close")}</button></div><div class="settings-scroll"><h3 class="section-title">視界と操作</h3>${slider("renderDistance", "描画距離", 3, 8, 1, (v) => v + " チャンク")}${slider("fov", "視野角", 60, 100, 1, (v) => v + "°")}${slider("sensitivity", "マウス感度", 0.2, 2, 0.05, (v) => Number(v).toFixed(2))}<label class="setting-row"><span><strong>カメラの揺れ</strong><small>歩行時の揺れを抑えたいときはオフに。</small></span><span class="switch"><input type="checkbox" data-setting="headBob" ${s.headBob ? "checked" : ""}><i></i></span></label><label class="setting-row"><span><strong>描画を自動調整</strong><small>動作に合わせて、表示の精細さを調整します。</small></span><span class="switch"><input type="checkbox" data-setting="autoResolution" ${s.autoResolution ? "checked" : ""}><i></i></span></label><label class="setting-row"><span><strong>グラフィック品質</strong><small>お使いの端末に合わせて調整してください。</small></span><select data-setting="quality"><option value="low" ${s.quality === "low" ? "selected" : ""}>低 · 軽さ優先</option><option value="medium" ${s.quality === "medium" ? "selected" : ""}>標準</option><option value="high" ${s.quality === "high" ? "selected" : ""}>高 · 美しさ優先</option></select></label><h3 class="section-title">音</h3>${slider("volume", "マスター音量", 0, 1, 0.01, (v) => Math.round(v * 100) + "%")}${slider("musicVolume", "音楽・環境音", 0, 1, 0.01, (v) => Math.round(v * 100) + "%")}${slider("effectsVolume", "効果音", 0, 1, 0.01, (v) => Math.round(v * 100) + "%")}<h3 class="section-title">操作ガイド</h3><div class="controls-grid"><span><kbd>W A S D</kbd> 移動</span><span><kbd>マウス</kbd> 視点</span><span><kbd>Space</kbd> ジャンプ / 泳ぐ</span><span><kbd>Shift</kbd> ダッシュ</span><span><kbd>Ctrl</kbd> しゃがむ</span><span><kbd>E</kbd> 持ちもの</span><span><kbd>1 – 9</kbd> スロット切替</span><span><kbd>Q</kbd> アイテムを落とす</span><span><kbd>R</kbd> 食べる</span><span><kbd>V</kbd> 飛行 (クリエイティブ)</span><span><kbd>F</kbd> 使う / 調べる</span><span><kbd>J</kbd> フィールドノート</span><span><kbd>M</kbd> 探検地図</span><span><kbd>F3</kbd> デバッグ表示</span><span><kbd>Esc</kbd> ポーズ</span></div></div><div class="form-bottom"><span class="small-text muted">変更は自動で保存されます。</span><button class="button primary" data-action="settings-back">完了 ${symbol("check")}</button></div></div>`,
      "center-screen",
    );
  }
  showInventory(inventory, station = null) {
    this.screen = "inventory";
    this.inventory = inventory;
    this.station = station;
    this.gameActive = true;
    this.hud.hidden = true;
    if (this.lastState.mode === "creative" && !this._creativeInit) {
      this.recipeCategory = "creative";
      this._creativeInit = true;
    }
    if (
      this.lastState.mode !== "creative" &&
      this.recipeCategory === "creative"
    )
      this.recipeCategory = "all";
    this.screenHTML(
      `<div class="panel inventory-panel"><div class="panel-heading"><div><span class="eyebrow">A PLACE FOR EVERY DISCOVERY</span><h2>持ちものとクラフト</h2></div><div class="inventory-heading-actions"><span class="station-indicator ${stationsArray(station).length ? "available" : ""}">${symbol(stationsArray(station).includes("furnace") ? "sun" : "bag")}${stationLabel(station)}</span><button class="icon-button" data-action="close" title="閉じる (E)">${symbol("close")}</button></div></div><div class="inventory-layout"><section class="backpack-section"><div class="section-heading"><h3>バックパック</h3><span class="inventory-capacity"></span></div><div class="backpack-slots"></div><div class="section-heading hotbar-heading"><h3>ホットバー</h3><span>すぐ使う道具を、ここに。</span></div><div class="inventory-hotbar"></div><div class="equipment-row"><div class="equipment-slot"></div><span><strong>身につけるもの</strong><small>防具で、危険な冒険にも備えよう。</small></span></div><div class="bag-actions"><button class="button ghost compact" data-action="equip">${symbol("shield")} 装備する</button><button class="button ghost compact" data-action="drop">${symbol("arrow")} 落とす</button></div><p class="inventory-help"><span>クリックで移動 · ドラッグで整理</span><span>右クリックで半分 · Shift + クリックでクイック移動</span></p></section><section class="craft-section"><div class="section-heading"><h3>つくる</h3><span class="recipe-count"></span></div><label class="recipe-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" name="recipe-search" value="${esc(this.recipeSearch)}" placeholder="レシピを探す…" aria-label="レシピを探す"></label><div class="recipe-tabs"></div><div class="recipe-content"><div class="recipe-list"></div><div class="recipe-detail"></div></div></section></div><div class="inventory-footer"><span>${symbol("leaf")} 集めたものが、次の冒険をひらく。</span><span><kbd>E</kbd> または <kbd>Esc</kbd> で戻る</span></div></div>`,
      "inventory-screen",
    );
    this.refreshInventory();
    this.renderRecipeTabs();
    this.renderRecipes();
  }
  showChest(inventory, chestSlots = []) {
    this.screen = "chest";
    this.inventory = inventory;
    this.chestSlots = chestSlots;
    this.gameActive = true;
    this.hud.hidden = true;
    const chestItems = Array.from({ length: 18 }, (_, i) =>
      slotHTML(chestSlots[i], i, false, "chest-slot")
        .replace(`data-slot="${i}"`, `data-chest-slot="${i}"`)
        .replace('draggable="true"', ""),
    ).join("");
    this.screenHTML(
      `<div class="panel chest-panel"><div class="panel-heading"><div><span class="eyebrow">A SAFE PLACE FOR YOUR TREASURES</span><h2>旅人の箱</h2></div><button class="icon-button" data-action="close" title="閉じる (E)">${symbol("close")}</button></div><div class="chest-layout"><section><div class="section-heading"><h3>箱の中</h3><span>${chestSlots.filter(Boolean).length} / 18</span></div><div class="chest-grid">${chestItems}</div><p class="inventory-help"><span>クリックして持ちものへ · 右クリックで半分取り出す</span></p><div class="chest-illustration">${symbol("bag")}<p>次の旅に備えて、<br>大切なものをしまっておこう。</p></div></section><section class="chest-backpack"><div class="section-heading"><h3>持ちもの</h3><span>${inventory.slots.filter(Boolean).length} / 36</span></div><div class="chest-grid">${inventory.slots
        .slice(9, 36)
        .map((s, i) => slotHTML(s, i + 9, this.selectedBagSlot === i + 9))
        .join(
          "",
        )}</div><div class="section-heading hotbar-heading"><h3>ホットバー</h3><span>Shift + クリックで箱へ</span></div><div class="chest-grid">${inventory.slots
        .slice(0, 9)
        .map((s, i) => slotHTML(s, i, this.selectedBagSlot === i))
        .join(
          "",
        )}</div><p class="inventory-help"><span>Shift + クリックで箱に入れる</span><span>クリック・ドラッグで持ちものを整理</span></p></section></div><div class="inventory-footer"><span>${symbol("save")} 箱の中身もワールドと一緒に保存されます。</span><span><kbd>E</kbd> または <kbd>Esc</kbd> で戻る</span></div></div>`,
      "inventory-screen",
    );
  }
  refreshInventory() {
    if (this.screen === "chest" && this.inventory) {
      this.showChest(this.inventory, this.chestSlots);
      return;
    }
    if (this.screen !== "inventory" || !this.inventory) return;
    const inv = this.inventory;
    this.overlay.querySelector(".backpack-slots").innerHTML = inv.slots
      .slice(9, 36)
      .map((s, i) => slotHTML(s, i + 9, this.selectedBagSlot === i + 9))
      .join("");
    this.overlay.querySelector(".inventory-hotbar").innerHTML = inv.slots
      .slice(0, 9)
      .map((s, i) => slotHTML(s, i, this.selectedBagSlot === i))
      .join("");
    this.overlay.querySelector(".inventory-capacity").textContent =
      `${inv.slots.filter(Boolean).length} / 36`;
    const equipment =
      typeof inv.equipment === "string"
        ? { id: inv.equipment, count: 1 }
        : inv.equipment;
    this.overlay.querySelector(".equipment-slot").innerHTML = equipment
      ? `<button class="slot occupied" data-action="unequip" data-item="${esc(equipment.id)}" title="装備を外す">${itemIcon(equipment.id)}</button>`
      : `<div class="slot empty-equipment">${symbol("shield")}</div>`;
    this.renderRecipes();
  }
  renderRecipeTabs() {
    if (this.screen !== "inventory") return;
    const cats = [...new Set(RECIPES.map((r) => r.category || "materials"))];
    this.overlay.querySelector(".recipe-tabs").innerHTML = [
      ...(this.lastState.mode === "creative"
        ? [["creative", "創造のパレット"]]
        : []),
      ["all", "すべて"],
      ["available", "作れるもの"],
      ...cats.map((c) => [c, labelCategory[c] || c]),
    ]
      .map(
        ([key, label]) =>
          `<button class="recipe-tab ${key === this.recipeCategory ? "active" : ""}" data-category="${esc(key)}">${esc(label)}</button>`,
      )
      .join("");
  }
  canCraft(recipe) {
    if (this.lastState.mode === "creative") return true;
    try {
      return this.inventory?.canCraft(recipe, this.station) ?? false;
    } catch {
      return false;
    }
  }
  renderRecipes() {
    if (this.screen !== "inventory" || !this.inventory) return;
    const search = this.recipeSearch.toLowerCase();
    const searchInput = this.overlay.querySelector(
      'input[name="recipe-search"]',
    );
    if (searchInput)
      searchInput.placeholder =
        this.recipeCategory === "creative"
          ? "アイテムを探す…"
          : "レシピを探す…";
    const content = this.overlay.querySelector(".recipe-content");
    content.classList.toggle(
      "creative-content",
      this.recipeCategory === "creative",
    );
    if (this.recipeCategory === "creative") {
      const items = Object.values(ITEMS).filter(
        (item) =>
          !search || `${item.name} ${item.id}`.toLowerCase().includes(search),
      );
      this.overlay.querySelector(".recipe-count").textContent =
        `${items.length} アイテム`;
      this.overlay.querySelector(".recipe-list").innerHTML = items
        .map(
          (item) =>
            `<button class="creative-item" data-action="creative-item" data-id="${esc(item.id)}" data-item="${esc(item.id)}" title="${esc(item.name)} を追加">${itemIcon(item.id, 38)}<span>${esc(item.name)}</span><small>+${item.stack || 64}</small></button>`,
        )
        .join("");
      this.overlay.querySelector(".recipe-detail").innerHTML = "";
      return;
    }
    const recipes = RECIPES.filter(
      (r) =>
        (this.recipeCategory === "all" ||
          (this.recipeCategory === "available" && this.canCraft(r)) ||
          (r.category || "materials") === this.recipeCategory) &&
        (!search ||
          `${r.name || ""} ${ITEMS[r.output.id]?.name || ""} ${r.output.id}`
            .toLowerCase()
            .includes(search)),
    );
    this.overlay.querySelector(".recipe-count").textContent =
      `${recipes.length} レシピ`;
    if (!recipes.some((r) => r.id === this.selectedRecipe))
      this.selectedRecipe = recipes[0]?.id || null;
    this.overlay.querySelector(".recipe-list").innerHTML = recipes.length
      ? recipes
          .map(
            (r) =>
              `<button class="recipe-row ${this.canCraft(r) ? "craftable" : ""} ${this.selectedRecipe === r.id ? "active" : ""}" data-recipe="${esc(r.id)}"><span class="recipe-icon">${itemIcon(r.output.id, 34)}</span><span><strong>${esc(r.name || ITEMS[r.output.id]?.name || r.output.id)}</strong><small>${r.station ? stationNames[r.station] || r.station : "手作り"}${r.output.count > 1 ? " · ×" + r.output.count : ""}</small></span>${this.canCraft(r) ? symbol("check") : ""}</button>`,
          )
          .join("")
      : `<div class="empty-recipes">${symbol("leaf")}<p>レシピが見つかりません。</p><small>素材を集めると、できることが増えていきます。</small></div>`;
    this.renderRecipeDetail();
  }
  renderRecipeDetail() {
    const el = this.overlay.querySelector(".recipe-detail");
    if (!el) return;
    const recipe = RECIPES.find((r) => r.id === this.selectedRecipe);
    if (!recipe) {
      el.innerHTML = "";
      return;
    }
    const item = ITEMS[recipe.output.id],
      craftable = this.canCraft(recipe),
      needStation =
        recipe.station && !stationsArray(this.station).includes(recipe.station);
    el.innerHTML = `<div class="craft-preview">${itemIcon(recipe.output.id, 80)}<span class="eyebrow">${esc(labelCategory[recipe.category] || "CRAFTING")}</span><h3>${esc(recipe.name || item?.name || recipe.output.id)}</h3><span class="craft-output">作成数 × ${recipe.output.count || 1}</span></div><div class="recipe-ingredients"><span class="eyebrow">必要なもの</span>${recipe.ingredients
      .map((ing) => {
        const have = this.inventory.count(ing.id);
        return `<div class="ingredient ${have >= ing.count ? "enough" : "missing"}" data-item="${esc(ing.id)}">${itemIcon(ing.id, 26)}<span>${esc(ITEMS[ing.id]?.name || ing.id)}</span><b>${have}<i> / ${ing.count}</i></b></div>`;
      })
      .join(
        "",
      )}</div>${recipe.station ? `<div class="station-requirement ${needStation ? "missing" : ""}">${symbol("bag")}${stationNames[recipe.station] || recipe.station}${needStation ? " のそばで作れます" : " · 利用できます"}</div>` : ""}<button class="button primary craft-button" data-action="craft" data-id="${esc(recipe.id)}" ${craftable ? "" : "disabled"}>${symbol("plus")}${craftable ? "つくる" : needStation ? "設備が必要です" : "素材が足りません"}</button>${item?.tool ? `<div class="craft-properties"><span>採掘効率 <b>×${item.speed || 1}</b></span><span>耐久 <b>${item.durability || "—"}</b></span></div>` : item?.food ? `<div class="craft-properties"><span>満腹度を回復</span></div>` : ""}`;
  }
  showJournal(progress = {}) {
    this.screen = "journal";
    this.gameActive = true;
    this.hud.hidden = true;
    this.progress = progress;
    let stages = [
      {
        id: "wood",
        title: "森からの贈りもの",
        text: "木を採り、木材と棒を作る。木の道具が、冒険の第一歩になる。",
        icon: "leaf",
        test: (p) => p.wood || p.mined > 0 || p.minedBlocks > 0,
      },
      {
        id: "workbench",
        title: "小さな工房",
        text: "木材で作業台を作ろう。設置して F キーで開くと、つくれるものが増えていく。",
        icon: "bag",
        test: (p) => p.workbench || p.crafted > 0,
      },
      {
        id: "stone",
        title: "地面の、その下へ",
        text: "つるはしで石と石炭を採る。たいまつを持って、洞窟の奥へ。",
        icon: "mountain",
        test: (p) => p.stone || p.coal || p.depth > 5,
      },
      {
        id: "metal",
        title: "火と金属",
        text: "石で炉を作り、鉱石と石炭から金属を精錬しよう。丈夫な道具と防具が待っている。",
        icon: "sun",
        test: (p) => p.metal || p.copper_ingot || p.iron_ingot,
      },
      {
        id: "explore",
        title: "水平線の向こう",
        text: "森を越え、山を登り、砂の国へ。古い遺跡に、忘れられた輝きを探そう。",
        icon: "compass",
        test: (p) => p.explored || p.biomes?.length >= 3 || p.distance > 500,
      },
      {
        id: "beacon",
        title: "星を灯す者",
        text: "深層の結晶を集め、光の灯台を作ろう。どこからでも帰れる、あなただけの目印に。",
        icon: "spark",
        test: (p) => p.beacon || p.crystal,
      },
    ];
    if (Array.isArray(progress.tasks) && progress.tasks.length)
      stages = progress.tasks.map((task, i) => ({
        id: task.id,
        title: task.title || task.name,
        text: task.description,
        icon: [
          "leaf",
          "bag",
          "mountain",
          "sun",
          "compass",
          "shield",
          "spark",
          "flag",
        ][i % 8],
        test: () => task.done,
        current: task.current,
        total: task.total,
      }));
    const done = stages.filter((s) => s.test(progress)).length;
    this.screenHTML(
      `<div class="panel journal-panel"><div class="panel-heading"><div><span class="eyebrow">THE EXPLORER'S FIELD NOTES</span><h2>フィールドノート</h2></div><button class="icon-button" data-action="close" title="閉じる">${symbol("close")}</button></div><div class="journal-intro"><div>${symbol("book")}<p>この世界のどこかに、<br><em>まだ知らない自分がいる。</em></p></div><span class="journal-progress">${done}<i> / ${stages.length}</i><small>旅の足跡</small></span></div><div class="journal-stages">${stages.map((s, i) => `<article class="journal-stage ${s.test(progress) ? "completed" : ""}"><div class="stage-symbol">${s.test(progress) ? symbol("check") : symbol(s.icon)}</div><div><span class="eyebrow">CHAPTER 0${i + 1}</span><h3>${s.title}</h3><p>${s.text}</p>${s.total ? `<div class="journal-task-progress"><i style="width:${clamp(s.current / s.total, 0, 1) * 100}%"></i><span>${s.current || 0} / ${s.total}</span></div>` : ""}</div></article>`).join("")}</div><div class="journal-tips"><h3>野生で暮らす知恵</h3><p><b>夜に備える</b>　食料とたいまつを用意し、灯りのある拠点を作ろう。ベッドで眠れば朝を迎えられます。</p><p><b>深く掘る</b>　貴重な鉱物は地下に。真下を掘ると、見えない洞窟へ落ちることも。</p><p><b>大切なものを守る</b>　防具を身につけ、道具の耐久に気を配ろう。食べ物は右クリックで食べられます。</p></div><div class="form-bottom"><span class="small-text muted">決まった道はありません。好きな場所を、好きなように。</span><button class="button primary" data-action="close">旅を続ける ${symbol("arrow")}</button></div></div>`,
      "center-screen",
    );
  }
  showDeath() {
    this.screen = "death";
    this.hud.hidden = true;
    this.gameActive = true;
    this.screenHTML(
      `<div class="death-content"><div class="death-symbol">${symbol("leaf")}</div><span class="eyebrow">EVERY END IS A NEW BEGINNING</span><h1>もう一度、<br><em>ここから。</em></h1><p>冒険は、まだ終わらない。<br>出発点から、世界へ戻りましょう。</p><button class="button primary large" data-action="respawn">再び旅立つ ${symbol("arrow")}</button><button class="text-button" data-action="quit">保存してタイトルへ</button></div>`,
      "death-screen",
    );
  }
  showLoading(progress = 0, text = "世界を紡いでいます…") {
    if (this.screen !== "loading") {
      this.screen = "loading";
      this.hud.hidden = true;
      this.screenHTML(
        `<div class="loading-content">${this.logo()}<div class="loading-compass">${symbol("compass")}</div><h2 class="loading-text"></h2><div class="loading-track"><i></i></div><div class="loading-note"><span class="loading-percent"></span><span>種から、大地へ。</span></div><p class="small-text">一つひとつの景色が、あなただけの物語になる。</p></div>`,
        "loading-screen",
      );
    }
    const p = clamp(progress > 1 ? progress / 100 : progress, 0, 1);
    this.overlay.querySelector(".loading-text").textContent = text;
    this.overlay.querySelector(".loading-track i").style.width =
      `${Math.max(2, p * 100)}%`;
    this.overlay.querySelector(".loading-percent").textContent =
      `${Math.round(p * 100)}%`;
  }
  hide() {
    this.screen = null;
    this.root.dataset.screen = "playing";
    this.overlay.hidden = true;
    this.overlay.innerHTML = "";
    this.tooltip.hidden = true;
    this.gameActive = true;
    this.hud.hidden = false;
    this.selectedBagSlot = null;
  }
  toast(text, type = "info") {
    const node = document.createElement("div");
    node.className = `toast toast-${type}`;
    node.innerHTML = `${symbol(type === "error" ? "close" : type === "success" ? "check" : "leaf")}<span>${esc(text)}</span>`;
    this.toastStack.append(node);
    while (this.toastStack.children.length > 4)
      this.toastStack.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 300);
    }, 4000);
  }
  update(state = {}) {
    this.lastState = state;
    this.root.querySelector(".play-guide").hidden =
      state.locked !== false || this.screen !== null;
    if (state.settings) this.settings = { ...this.settings, ...state.settings };
    const maxHealth = state.maxHealth || 100,
      maxHunger = state.maxHunger || 100,
      maxOxygen = state.maxOxygen || 100;
    const health = clamp((state.health ?? maxHealth) / maxHealth, 0, 1),
      hunger = clamp((state.hunger ?? maxHunger) / maxHunger, 0, 1),
      oxygen = clamp((state.oxygen ?? maxOxygen) / maxOxygen, 0, 1);
    this.root.querySelector(".health-value").textContent = Math.ceil(
      state.health ?? maxHealth,
    );
    this.root.querySelector(".hunger-value").textContent = Math.ceil(
      state.hunger ?? maxHunger,
    );
    this.root.querySelectorAll(".health-pips i").forEach((e, i) => {
      e.classList.toggle("filled", health * 10 > i);
      e.style.opacity =
        health * 10 > i ? String(clamp(health * 10 - i, 0.3, 1)) : "";
    });
    this.root
      .querySelectorAll(".hunger-pips i")
      .forEach((e, i) => e.classList.toggle("filled", hunger * 10 > i));
    this.root
      .querySelector(".survival")
      .classList.toggle("low-health", health < 0.25);
    this.root.querySelector(".damage-vignette").style.opacity =
      state.damageFlash
        ? String(clamp(state.damageFlash, 0, 0.7))
        : health < 0.25
          ? String((0.25 - health) * 1.3)
          : "0";
    this.root.querySelector(".underwater-vignette").style.opacity =
      state.underwater ? ".5" : "0";
    this.root.querySelector(".oxygen-row").hidden =
      oxygen > 0.99 && !state.underwater;
    this.root.querySelector(".oxygen-row > div > i").style.width =
      `${oxygen * 100}%`;
    if (Number.isFinite(state.heading)) {
      const deg = ((((-state.heading * 180) / Math.PI) % 360) + 360) % 360;
      const cards = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const index = Math.round(deg / 45) % 8;
      const labels = this.root.querySelectorAll(".compass>span");
      labels[0].textContent = cards[(index + 6) % 8];
      labels[1].textContent = cards[index];
      labels[2].textContent = cards[(index + 2) % 8];
      this.root.querySelector(".compass").title =
        `${cards[index]} · ${Math.round(deg)}°`;
    }
    const stamina = this.root.querySelector(".stamina-row");
    stamina.hidden = (state.stamina ?? 100) > 98;
    stamina.querySelector("i").style.width =
      `${clamp(state.stamina ?? 100, 0, 100)}%`;
    const biomeLabels = {
      plains: "風わたる草原",
      forest: "ささやきの森",
      woodland: "ささやきの森",
      desert: "琥珀の砂丘",
      mountains: "白銀の峰",
      mountain: "白銀の峰",
      snow: "霜の高原",
      tundra: "霜の高原",
      coast: "渚の入り江",
      beach: "渚の入り江",
      ocean: "蒼の海",
      autumn: "こがねの森",
      meadow: "花咲く牧草地",
      swamp: "苔むす湿地",
      cave: "静寂の洞窟",
    };
    const biome =
      typeof state.biome === "object" ? state.biome?.name : state.biome;
    this.root.querySelector(".biome-name").textContent =
      biomeLabels[biome] || biome || "緑の原野";
    const day = state.day ?? Math.floor((state.time || 0) / 1200) + 1;
    this.root.querySelector(".day-label").textContent =
      `DAY ${String(day).padStart(2, "0")}`;
    let clock = "";
    if (typeof state.time === "string") clock = state.time;
    else {
      const t =
        state.timeFraction ??
        (state.time <= 1 ? state.time || 0 : ((state.time || 0) % 1200) / 1200);
      const hours = Math.floor(t * 24) % 24,
        minutes = Math.floor(((t * 24) % 1) * 60);
      clock = `${hours >= 5 && hours < 10 ? "朝" : hours >= 10 && hours < 17 ? "昼" : hours >= 17 && hours < 20 ? "夕" : "夜"} · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    this.root.querySelector(".time-label").textContent = clock;
    const selected = state.selected ?? this.inventory?.selected ?? 0,
      slots = state.slots || this.inventory?.slots || Array(36).fill(null);
    const signature = JSON.stringify([selected, slots.slice(0, 9)]);
    if (signature !== this._hudSignature) {
      this._hudSignature = signature;
      this.root.querySelector(".hotbar").innerHTML = Array.from(
        { length: 9 },
        (_, i) => slotHTML(slots[i], i, i === selected),
      ).join("");
      this.root.querySelector(".selected-item-name").textContent = slots[
        selected
      ]
        ? ITEMS[slots[selected].id]?.name || ""
        : "";
    }
    const target = this.root.querySelector(".target-label");
    target.classList.toggle("visible", !!state.target);
    target.querySelector("span").textContent = state.target?.name || "";
    target.querySelector(".mining-track i").style.width =
      `${clamp(state.mining || 0, 0, 1) * 100}%`;
    target
      .querySelector(".mining-track")
      .classList.toggle("active", (state.mining || 0) > 0);
    if (state.objective) {
      const obj = state.objective;
      this.root.querySelector(".quest-title").textContent =
        typeof obj === "string" ? obj : obj.title || "旅の手がかり";
      this.root.querySelector(".quest-description").textContent =
        typeof obj === "object" ? obj.description || obj.text || "" : "";
    }
    const debug = this.root.querySelector(".debug-panel");
    debug.hidden = !state.debug;
    if (
      state.debug &&
      (!this._debugTime || performance.now() - this._debugTime > 200)
    ) {
      this._debugTime = performance.now();
      const p = state.position || {};
      const stats = typeof state.debug === "object" ? state.debug : {};
      debug.textContent = `WILDBOUND / F3\n${Math.round(state.fps || stats.fps || 0)} FPS · ${(1000 / (state.fps || 60)).toFixed(1)} ms\nXYZ ${Number(p.x || 0).toFixed(1)} / ${Number(p.y || 0).toFixed(1)} / ${Number(p.z || 0).toFixed(1)}\nChunks ${stats.chunks ?? state.chunks ?? 0} · Entities ${stats.entities ?? state.entities ?? 0}\nDraw calls ${stats.drawCalls ?? 0} · Triangles ${Number(stats.triangles || 0).toLocaleString()}\nHeap ${stats.memory ? Number(stats.memory / 1048576).toFixed(1) + " MB" : "—"} · Resolution ${stats.resolution || "—"}\nSeed ${state.seed ?? "—"}\nGeneration ${Number(stats.generationMs || 0).toFixed(1)} ms · Mesh ${Number(stats.meshMs || 0).toFixed(1)} ms`;
    }
  }
  onClick(event) {
    const chestSlot = event.target.closest("[data-chest-slot]");
    if (chestSlot) {
      this.call("chestClick", +chestSlot.dataset.chestSlot, event);
      return;
    }
    const slot = event.target.closest("[data-slot]");
    if (slot) {
      this.onSlot(slot, event);
      return;
    }
    const cat = event.target.closest("[data-category]");
    if (cat) {
      this.recipeCategory = cat.dataset.category;
      this.renderRecipeTabs();
      this.renderRecipes();
      return;
    }
    const recipe = event.target.closest("[data-recipe]");
    if (recipe) {
      this.selectedRecipe = recipe.dataset.recipe;
      this.renderRecipes();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action,
      id = button.dataset.id;
    switch (action) {
      case "new":
        this.showNewWorld();
        break;
      case "main":
        this.showMain(this.worlds);
        break;
      case "worlds":
        this.showWorlds();
        break;
      case "load":
      case "continue":
        this.call("loadWorld", id);
        break;
      case "delete":
        this.confirmDelete(id);
        break;
      case "delete-confirm":
        this.call("deleteWorld", id);
        this.worlds = this.worlds.filter((w) => String(w.id) !== id);
        this.showMain(this.worlds);
        break;
      case "export":
        this.call("exportWorld", id);
        break;
      case "settings":
        this.showSettings(this.settings);
        break;
      case "settings-back":
        if (this.settingsBack === "pause" || this.gameActive) this.showPause();
        else this.showMain(this.worlds);
        break;
      case "resume":
        this.call("resume");
        break;
      case "close":
        this.call("close");
        break;
      case "quit":
        this.call("saveAndQuit");
        break;
      case "save":
        this.call("save");
        break;
      case "journal":
        this.call("journal");
        break;
      case "respawn":
        this.call("respawn");
        break;
      case "random-seed": {
        const input = this.overlay.querySelector('input[name="seed"]');
        if (input) input.value = String(Math.floor(Math.random() * 2147483647));
        break;
      }
      case "craft": {
        this.call("craft", id);
        this.refreshInventory();
        break;
      }
      case "creative-item":
        this.call("creativeItem", id);
        this.refreshInventory();
        break;
      case "drop":
        if (this.selectedBagSlot !== null) {
          this.call("dropSlot", this.selectedBagSlot);
          this.refreshInventory();
        } else this.toast("落とすアイテムを選んでください");
        break;
      case "equip":
        if (this.selectedBagSlot !== null) {
          this.call("equip", this.selectedBagSlot);
          this.selectedBagSlot = null;
          this.refreshInventory();
        } else this.toast("装備するアイテムを選んでください");
        break;
      case "unequip":
        this.call("equip", -1);
        this.selectedBagSlot = null;
        this.refreshInventory();
        break;
      case "sleep":
        this.call("sleep");
        break;
    }
  }
  onSlot(slot, event) {
    const index = +slot.dataset.slot;
    if (this.screen === "inventory" || this.screen === "chest") {
      if (event.type === "click" || event.type === "contextmenu") {
        const wasSelected = this.selectedBagSlot;
        const hadItem = !!this.inventory?.slots[index];
        const nextSelection = this.actions.inventoryClick?.(index, event);
        this.selectedBagSlot =
          nextSelection === null || Number.isInteger(nextSelection)
            ? nextSelection
            : event.shiftKey || event.altKey || wasSelected !== null
              ? null
              : hadItem
                ? index
                : null;
        this.refreshInventory();
      }
    } else this.call("selectSlot", index);
  }
  onSubmit(event) {
    if (event.target.id !== "new-world-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    this.call("newWorld", {
      name: String(form.get("name") || "名もなき世界").trim() || "名もなき世界",
      seed:
        String(form.get("seed") || "").trim() ||
        String(Math.floor(Math.random() * 2147483647)),
      mode: String(form.get("mode") || "survival"),
    });
  }
  onInput(event) {
    const el = event.target;
    if (el.name === "recipe-search") {
      this.recipeSearch = el.value;
      this.renderRecipes();
      return;
    }
    const key = el.dataset.setting;
    if (!key || el.type === "checkbox" || el.tagName === "SELECT") return;
    const value = Number(el.value);
    this.settings[key] = value;
    const output = this.overlay.querySelector(`[data-output="${key}"]`);
    if (output)
      output.textContent =
        key === "renderDistance"
          ? value + " チャンク"
          : key === "fov"
            ? value + "°"
            : key === "sensitivity"
              ? value.toFixed(2)
              : Math.round(value * 100) + "%";
    this.call("settings", { [key]: value });
  }
  onChange(event) {
    const el = event.target,
      key = el.dataset.setting;
    if (key && (el.type === "checkbox" || el.tagName === "SELECT")) {
      const value = el.type === "checkbox" ? el.checked : el.value;
      this.settings[key] = value;
      this.call("settings", { [key]: value });
    }
    if (el.classList.contains("import-file") && el.files?.[0]) {
      this.call("importWorld", el.files[0]);
      el.value = "";
    }
  }
  confirmDelete(id) {
    const world = this.worlds.find((w) => String(w.id) === id);
    this.screenHTML(
      `<div class="panel confirmation-panel"><span class="eyebrow">A WORLD TO REMEMBER</span><h2>この世界を削除しますか？</h2><p>「${esc(world?.name || "この世界")}」の冒険の記録は元に戻せません。<br>必要なら、先にワールドを書き出して保管してください。</p><div class="form-bottom"><button class="button ghost" data-action="main">戻る</button><button class="button danger" data-action="delete-confirm" data-id="${esc(id)}">世界を削除</button></div></div>`,
      "center-screen",
    );
  }
  onTooltip(event) {
    const node = event.target.closest(
      "[data-slot], [data-item], [data-chest-slot]",
    );
    if (!node || !["inventory", "chest"].includes(this.screen)) return;
    const slot =
      node.dataset.chestSlot !== undefined
        ? this.chestSlots?.[+node.dataset.chestSlot]
        : node.dataset.slot !== undefined
          ? this.inventory?.slots[+node.dataset.slot]
          : null;
    const id = node.dataset.item || slot?.id,
      item = ITEMS[id];
    if (!item) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.innerHTML = `<strong>${esc(item.name || id)}</strong><span>${item.tool ? "道具" : item.armor ? "防具" : item.food ? "食料" : item.block !== undefined ? "建築素材" : "素材"}${item.tier ? " · Tier " + item.tier : ""}</span>${item.durability ? `<small>耐久 ${slot?.durability ?? item.durability} / ${item.durability}</small>` : ""}${item.damage ? `<small>攻撃力 ${item.damage}</small>` : ""}${item.food ? `<small>満腹度を回復</small>` : ""}${slot ? `<small>×${slot.count} · 最大 ${item.stack || 64}</small>` : ""}`;
    this.tooltip.hidden = false;
    this.positionTooltip(event);
  }
  positionTooltip(event) {
    if (this.tooltip.hidden) return;
    const r = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = `${clamp(event.clientX + 16, 8, innerWidth - r.width - 8)}px`;
    this.tooltip.style.top = `${clamp(event.clientY + 16, 8, innerHeight - r.height - 8)}px`;
  }
}
