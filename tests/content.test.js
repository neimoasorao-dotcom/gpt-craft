import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, BLOCKS, RECIPES } from "../src/data.js";
import { Inventory } from "../src/inventory.js";
import { SaveStore, saveSettings, loadSettings } from "../src/save.js";

test("registries contain coherent blocks, items, progression recipes", () => {
  assert.equal(BLOCKS.length, 37);
  assert.ok(RECIPES.length >= 60);
  for (const block of BLOCKS) {
    assert.equal(BLOCKS[block.id], block);
    if (block.drop) assert.ok(ITEMS[block.drop], `Missing drop ${block.drop}`);
  }
  for (const r of RECIPES) {
    assert.ok(ITEMS[r.output.id], r.id);
    for (const ingredient of r.ingredients)
      assert.ok(ITEMS[ingredient.id], ingredient.id);
  }
  assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length);
});
test("stacking, overflow and atomic remove conserve items", () => {
  const i = new Inventory();
  assert.equal(i.add("wood", 100), 0);
  assert.equal(i.slots[0].count, 64);
  assert.equal(i.slots[1].count, 36);
  assert.equal(i.remove("wood", 101), false);
  assert.equal(i.count("wood"), 100);
  assert.equal(i.remove("wood", 70), true);
  assert.equal(i.count("wood"), 30);
  assert.equal(i.add("not_an_item", 1), 1);
});
test("split, swap, merge and quick transfer preserve stacks", () => {
  const i = new Inventory();
  i.add("wood", 21);
  assert.ok(i.move(0, 9, true));
  assert.equal(i.slots[0].count, 10);
  assert.equal(i.slots[9].count, 11);
  i.add("stone", 3);
  assert.ok(i.move(0, 1));
  assert.equal(i.slots[0].id, "stone");
  assert.equal(i.count("wood"), 21);
  assert.ok(i.quickMove(0));
  assert.equal(i.slots[0], null);
  assert.equal(i.count("stone"), 3);
});
test("crafting respects station and ingredients, preserving durability", () => {
  const i = new Inventory();
  i.add("stone", 3);
  i.add("stick", 2);
  assert.equal(i.craft("stone_pickaxe"), false);
  assert.ok(i.craft("stone_pickaxe", "workbench"));
  assert.equal(i.count("stone"), 0);
  assert.equal(i.count("stick"), 0);
  assert.equal(i.count("stone_pickaxe"), 1);
  i.selected = i.slots.findIndex((s) => s?.id === "stone_pickaxe");
  const max = ITEMS.stone_pickaxe.durability;
  assert.equal(i.selectedItem().durability, max);
  i.damageTool(max - 1);
  assert.equal(i.selectedItem().durability, 1);
  assert.ok(i.damageTool());
  assert.equal(i.selectedItem(), null);
});
test("crafting is atomic when output does not fit", () => {
  const i = new Inventory();
  for (let n = 0; n < 36; n++) i.slots[n] = { id: "wood", count: 64 };
  const before = JSON.stringify(i.serialize());
  assert.equal(i.craft("planks"), false);
  assert.equal(JSON.stringify(i.serialize()), before);
  i.slots[0] = { id: "wood", count: 1 };
  assert.ok(i.craft("planks"));
  assert.equal(i.count("planks"), 4);
});
test("duplicate ingredient definitions cannot overdraw a stack", () => {
  const i = new Inventory();
  i.add("wood", 3);
  const r = {
    output: { id: "planks", count: 4 },
    ingredients: [
      { id: "wood", count: 2 },
      { id: "wood", count: 2 },
    ],
  };
  assert.equal(i.craft(r), false);
  assert.equal(i.count("wood"), 3);
});
test("save-load preserves world edits, inventory, equipment and seed", async () => {
  const store = new SaveStore();
  const i = new Inventory();
  i.add("wood", 14);
  i.add("leather_armor");
  i.equip(1);
  const id = await store.put({
    id: "test-world",
    seed: "moss-and-rivers",
    name: "Test valley",
    inventory: i.serialize(),
    edits: { "1,2,3": 8 },
    player: { position: { x: 1, y: 42, z: -9 } },
    time: 180,
  });
  const loaded = await store.get(id);
  assert.equal(loaded.seed, "moss-and-rivers");
  assert.equal(loaded.edits["1,2,3"], 8);
  assert.equal(loaded.inventory.equipment.id, "leather_armor");
  assert.ok((await store.list()).some((w) => w.id === id));
  const exported = await store.export(id);
  const importedId = await store.import(exported);
  assert.notEqual(importedId, id);
  assert.equal((await store.get(importedId)).inventory.slots[0].count, 14);
  await assert.rejects(() => store.import("{broken"), /JSON/);
  await assert.rejects(() => store.put({ name: "Invalid" }), /シード/);
  await assert.rejects(
    () => store.put({ seed: "x", version: 999 }),
    /バージョン/,
  );
  await store.delete(id);
  assert.equal(await store.get(id), null);
  await store.delete(importedId);
});
test("malformed inventory data and settings cannot leak invalid values", () => {
  const i = new Inventory({
    slots: [
      { id: "fake", count: 1 },
      { id: "wood", count: -1 },
      { id: "stone_pickaxe", count: 30, durability: 9000 },
    ],
    selected: 200,
  });
  assert.equal(i.slots[0], null);
  assert.equal(i.slots[1], null);
  assert.equal(i.slots[2].count, 1);
  assert.equal(i.slots[2].durability, ITEMS.stone_pickaxe.durability);
  assert.equal(i.selected, 8);
  const s = saveSettings({
    fov: 200,
    renderDistance: -1,
    volume: 2,
    quality: "unsupported",
  });
  assert.equal(s.fov, 105);
  assert.equal(s.renderDistance, 2);
  assert.equal(s.volume, 1);
  assert.equal(s.quality, "high");
});

test("every crafting branch is reachable from natural resources and actual tool/station gates", () => {
  // Sources model gathering, hunting, foraging and exploration. Ore appears only
  // once a reachable pickaxe has the required tier; a station must first be made.
  const resources = {
    wood: 0,
    dirt: 0,
    sand: 0,
    leaves: 0,
    amber_leaves: 0,
    snow_leaves: 0,
    snow: 0,
    clay: 0,
    cactus: 0,
    flower: 0,
    fiber: 0,
    seed: 0,
    wheat: 0,
    berry: 0,
    mushroom: 0,
    honey: 0,
    raw_meat: 0,
    hide: 0,
    feather: 0,
    bone: 0,
    ember: 0,
    ancient_shard: 1,
    stone: 1,
    coal: 1,
    copper_ore: 1,
    iron_ore: 2,
    dark_stone: 2,
    crystal: 3,
  };
  const discover = (excluded = []) => {
    const known = new Set();
    let last = -1;
    while (last !== known.size) {
      last = known.size;
      const tier = Math.max(
        0,
        ...[...known]
          .filter((id) => ITEMS[id]?.tool === "pickaxe")
          .map((id) => ITEMS[id].tier),
      );
      for (const [id, required] of Object.entries(resources))
        if (required <= tier && !excluded.includes(id)) known.add(id);
      for (const r of RECIPES)
        if (
          (!r.station || known.has(r.station)) &&
          r.ingredients.every((i) => known.has(i.id))
        )
          known.add(r.output.id);
    }
    return known;
  };
  const known = discover();
  assert.ok(known.has("beacon"), "Final beacon must be craftable");
  for (const recipe of RECIPES)
    assert.ok(known.has(recipe.output.id), `Unreachable recipe ${recipe.id}`);
  assert.ok(known.has("crystal_pickaxe"));
  assert.ok(known.has("crystal_armor"));
  assert.ok(known.has("glider"));
  const noRuins = discover(["ancient_shard"]);
  assert.equal(
    noRuins.has("beacon"),
    false,
    "Exploring ruins must remain meaningful",
  );
  const noCrystals = discover(["crystal"]);
  assert.equal(
    noCrystals.has("star_core"),
    false,
    "Deep mining must remain meaningful",
  );
});
test("registry numbers and item/block/recipe properties are valid", () => {
  for (const [id, item] of Object.entries(ITEMS)) {
    assert.equal(item.id, id);
    assert.ok(
      Number.isInteger(item.stack) && item.stack >= 1 && item.stack <= 64,
    );
    if (item.block != null)
      assert.ok(
        BLOCKS[item.block] && item.block > 0,
        `${id} invalid placed block`,
      );
    if (item.tool) {
      assert.ok(item.tier >= 1 && item.tier <= 5);
      assert.ok(item.durability > 0);
      assert.equal(item.stack, 1);
      assert.ok(item.speed > 0);
    }
    if (item.food) {
      assert.ok(item.food.hunger > 0 && item.food.hunger <= 100);
      assert.ok(item.food.health >= 0);
    }
  }
  for (const r of RECIPES) {
    assert.ok(r.output.count > 0 && r.output.count <= ITEMS[r.output.id].stack);
    assert.ok([null, "workbench", "furnace"].includes(r.station));
    for (const i of r.ingredients)
      assert.ok(Number.isInteger(i.count) && i.count > 0);
  }
});
test("import rejects malformed world edits, inventory, entities and nonfinite state", async () => {
  const store = new SaveStore();
  const seed = { id: "unsafe-test", seed: "valid", name: "Validation" };
  const reject = (data) =>
    assert.rejects(() => store.put({ ...seed, ...data }));
  await reject({ edits: { "0,40,0": 999 } });
  await reject({ edits: { "0,40,0": "1" } });
  await reject({ edits: { "0,NaN,0": 1 } });
  await reject({ edits: [] });
  await reject({ player: { position: { x: 0, y: NaN, z: 0 } } });
  await reject({ time: Infinity });
  await reject({ spawn: [0, 0] });
  await reject({ inventory: { slots: [{ id: "wood", count: 100000 }] } });
  await reject({ inventory: { slots: [{ id: "missing", count: 1 }] } });
  await reject({
    entities: {
      mobs: [],
      drops: [{ id: "berry", count: 1, position: { x: NaN, y: 30, z: 0 } }],
    },
  });
  await assert.rejects(() =>
    store.import('{"seed":"valid","edits":{"__proto__":0}}'),
  );
  await reject({ progress: [] });
  const id = await store.put({
    ...seed,
    edits: { "-16,44,32": 0 },
    entities: {
      version: 1,
      randomSeed: 2,
      mobs: [
        {
          type: "hart",
          position: { x: 1, y: 40, z: -2 },
          health: 10,
          yaw: 0,
          age: 40,
        },
      ],
      drops: [
        { id: "berry", count: 2, position: { x: 1, y: 40, z: -2 }, age: 4 },
      ],
    },
  });
  const saved = await store.get(id);
  assert.equal(saved.entities.drops[0].count, 2);
  assert.equal(saved.edits["-16,44,32"], 0);
  await store.delete(id);
});
test("settings persist in the memory fallback and clamp legacy aliases", () => {
  const saved = saveSettings({
    volume: 0.34,
    fov: 85,
    headBob: false,
    quality: "low",
  });
  assert.deepEqual(loadSettings(), saved);
  const legacy = saveSettings({ masterVolume: 0.23, graphics: "medium" });
  assert.equal(legacy.volume, 0.23);
  assert.equal(legacy.quality, "medium");
  assert.deepEqual(loadSettings(), legacy);
  const reset = saveSettings(null);
  assert.equal(reset.volume, 0.65);
});

test("localStorage fallback survives fresh SaveStore instances and reports quota failure", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const entries = new Map();
  const local = {
    get length() {
      return entries.size;
    },
    key: (i) => [...entries.keys()][i] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  try {
    const first = new SaveStore();
    const id = await first.put({
      id: "fallback-test",
      seed: "coast",
      name: "The Coast",
      edits: { "4,44,-2": 8 },
    });
    const second = new SaveStore();
    assert.equal(second.backend, "localStorage");
    assert.equal((await second.get(id)).edits["4,44,-2"], 8);
    assert.equal((await second.list())[0].id, id);
    entries.set("wildbound:world:corrupt", "{broken");
    assert.equal(
      (await second.list()).length,
      1,
      "A damaged entry cannot hide healthy worlds",
    );
    local.setItem = () => {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    };
    await assert.rejects(
      () => second.put({ id: "full", seed: "x" }),
      /保存領域/,
    );
    assert.equal(await second.get("full"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
