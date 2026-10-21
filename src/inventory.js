import { ITEMS, RECIPES } from "./data.js";
const copy = (value) => (value == null ? null : { ...value });
const finiteCount = (value) =>
  Number.isFinite(value) && Number.isInteger(value) && value > 0;
const stackLimit = (id) => ITEMS[id]?.stack || 64;
const stationAvailable = (needed, station) =>
  !needed ||
  station === needed ||
  (Array.isArray(station) && station.includes(needed)) ||
  (station instanceof Set && station.has(needed));
const normalizeSlot = (slot) => {
  if (!slot || !ITEMS[slot.id] || !finiteCount(slot.count)) return null;
  const definition = ITEMS[slot.id];
  const result = {
    id: slot.id,
    count: Math.min(stackLimit(slot.id), slot.count),
  };
  if (definition.durability)
    result.durability = Math.max(
      1,
      Math.min(
        definition.durability,
        Number.isFinite(slot.durability)
          ? slot.durability
          : definition.durability,
      ),
    );
  return result;
};
/** Slot operations preserve totals and crafting is atomic even when storage is full. */
export class Inventory {
  constructor(saved) {
    this.slots = Array(36).fill(null);
    this.selected = 0;
    this.equipment = null;
    this.revision = 0;
    if (saved) this.load(saved);
  }
  load(data) {
    const slots = Array.isArray(data) ? data : data?.slots;
    this.slots = Array.from({ length: 36 }, (_, i) =>
      normalizeSlot(slots?.[i]),
    );
    this.selected = Number.isFinite(data?.selected)
      ? Math.max(0, Math.min(8, Math.floor(data.selected)))
      : 0;
    const equipment = normalizeSlot(data?.equipment);
    this.equipment = equipment && ITEMS[equipment.id].armor ? equipment : null;
    this.revision++;
    return this;
  }
  serialize() {
    return {
      slots: this.slots.map(copy),
      selected: this.selected,
      equipment: copy(this.equipment),
    };
  }
  selectedItem() {
    return this.slots[this.selected];
  }
  count(id) {
    return this.slots.reduce(
      (n, slot) => n + (slot?.id === id ? slot.count : 0),
      0,
    );
  }
  add(id, count = 1, durability) {
    if (!ITEMS[id] || !finiteCount(count)) return count;
    let remaining = count;
    const def = ITEMS[id],
      limit = stackLimit(id);
    if (!def.durability) {
      for (const slot of this.slots)
        if (slot?.id === id && slot.count < limit) {
          const n = Math.min(remaining, limit - slot.count);
          slot.count += n;
          remaining -= n;
          if (!remaining) break;
        }
    }
    for (let i = 0; i < 36 && remaining; i++)
      if (!this.slots[i]) {
        const n = Math.min(remaining, limit);
        this.slots[i] = { id, count: n };
        if (def.durability)
          this.slots[i].durability = Number.isFinite(durability)
            ? Math.max(1, Math.min(def.durability, durability))
            : def.durability;
        remaining -= n;
      }
    if (remaining !== count) this.revision++;
    return remaining;
  }
  remove(id, count = 1) {
    if (!finiteCount(count) || this.count(id) < count) return false;
    let remaining = count;
    for (let i = 0; i < 36 && remaining; i++)
      if (this.slots[i]?.id === id) {
        const n = Math.min(remaining, this.slots[i].count);
        this.slots[i].count -= n;
        remaining -= n;
        if (!this.slots[i].count) this.slots[i] = null;
      }
    this.revision++;
    return true;
  }
  consumeSelected(count = 1) {
    const slot = this.selectedItem();
    if (!slot || !finiteCount(count) || slot.count < count) return false;
    slot.count -= count;
    if (!slot.count) this.slots[this.selected] = null;
    this.revision++;
    return true;
  }
  damageTool(amount = 1) {
    const slot = this.selectedItem();
    if (
      !slot ||
      !ITEMS[slot.id]?.durability ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return false;
    slot.durability -= amount;
    const broken = slot.durability <= 0;
    if (broken) this.slots[this.selected] = null;
    this.revision++;
    return broken;
  }
  move(from, to, split = false) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= 36 ||
      to >= 36 ||
      from === to
    )
      return false;
    const source = this.slots[from],
      target = this.slots[to];
    if (!source) return false;
    const amount = split ? Math.ceil(source.count / 2) : source.count;
    if (!target) {
      this.slots[to] = { ...source, count: amount };
      source.count -= amount;
      if (!source.count) this.slots[from] = null;
    } else if (target.id === source.id && !ITEMS[source.id].durability) {
      const n = Math.min(amount, stackLimit(source.id) - target.count);
      if (n <= 0) return false;
      target.count += n;
      source.count -= n;
      if (!source.count) this.slots[from] = null;
    } else {
      if (split) return false;
      this.slots[from] = target;
      this.slots[to] = source;
    }
    this.revision++;
    return true;
  }
  quickMove(from) {
    const source = this.slots[from];
    if (!source) return false;
    const begin = from < 9 ? 9 : 0,
      end = from < 9 ? 36 : 9;
    let changed = false;
    for (let i = begin; i < end && this.slots[from]; i++)
      if (this.slots[i]?.id === source.id)
        changed = this.move(from, i) || changed;
    for (let i = begin; i < end && this.slots[from]; i++)
      if (!this.slots[i]) {
        changed = this.move(from, i) || changed;
        break;
      }
    return changed;
  }
  equip(index = this.selected) {
    const slot = this.slots[index];
    if (!slot || !ITEMS[slot.id]?.armor) return false;
    this.slots[index] = this.equipment;
    this.equipment = slot;
    this.revision++;
    return true;
  }
  unequip() {
    if (!this.equipment) return false;
    const index = this.slots.findIndex((s) => !s);
    if (index < 0) return false;
    this.slots[index] = this.equipment;
    this.equipment = null;
    this.revision++;
    return true;
  }
  damageArmor(amount = 1) {
    if (!this.equipment) return false;
    this.equipment.durability -= Math.max(0, amount);
    if (this.equipment.durability <= 0) this.equipment = null;
    this.revision++;
    return true;
  }
  _recipe(recipe) {
    return typeof recipe === "string"
      ? RECIPES.find((r) => r.id === recipe)
      : recipe;
  }
  _plan(recipe, station) {
    const r = this._recipe(recipe);
    if (
      !r ||
      !stationAvailable(r.station, station) ||
      !r.output ||
      !ITEMS[r.output.id] ||
      !finiteCount(r.output.count) ||
      !Array.isArray(r.ingredients)
    )
      return null;
    const totals = {};
    for (const ingredient of r.ingredients) {
      if (!ITEMS[ingredient.id] || !finiteCount(ingredient.count)) return null;
      totals[ingredient.id] = (totals[ingredient.id] || 0) + ingredient.count;
    }
    for (const [id, count] of Object.entries(totals))
      if (this.count(id) < count) return null;
    const planned = new Inventory(this.serialize());
    for (const [id, count] of Object.entries(totals)) planned.remove(id, count);
    if (planned.add(r.output.id, r.output.count) > 0) return null;
    return planned;
  }
  canCraft(recipe, station = null) {
    return !!this._plan(recipe, station);
  }
  craft(recipe, station = null) {
    const planned = this._plan(recipe, station);
    if (!planned) return false;
    this.slots = planned.slots;
    this.revision++;
    return true;
  }
}
