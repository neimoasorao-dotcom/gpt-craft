/** WILDBOUND's original, data-driven content catalogue. No external game assets. */
export const B = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  PLANKS: 8,
  COBBLE: 9,
  COAL_ORE: 10,
  COPPER_ORE: 11,
  IRON_ORE: 12,
  CRYSTAL_ORE: 13,
  SNOW: 14,
  CLAY: 15,
  TORCH: 16,
  WORKBENCH: 17,
  FURNACE: 18,
  BRICK: 19,
  GLASS: 20,
  FLOWER: 21,
  TALL_GRASS: 22,
  BEDROCK: 23,
  DARK_STONE: 24,
  AMBER_LEAVES: 25,
  SNOW_LEAVES: 26,
  CACTUS: 27,
  CHEST: 28,
  BED: 29,
  LANTERN: 30,
  OBSIDIAN: 31,
  GLOWSTONE: 32,
  FARMLAND: 33,
  CROP: 34,
  RUIN: 35,
  BEACON: 36,
});
const block = (
  id,
  key,
  name,
  color,
  hardness = 1,
  tool = null,
  drop = key,
  extra = {},
) => ({
  id,
  key,
  name,
  color,
  hardness,
  tool,
  drop,
  solid: true,
  transparent: false,
  emission: 0,
  category: "natural",
  ...extra,
});
export const BLOCKS = Object.freeze([
  block(0, "air", "空気", "#c6e9ed", 0, null, null, {
    solid: false,
    transparent: true,
  }),
  block(1, "grass", "草の大地", "#81a652", 0.7, "shovel", "dirt"),
  block(2, "dirt", "土", "#89634a", 0.65, "shovel"),
  block(3, "stone", "石", "#879194", 2, "pickaxe", "stone"),
  block(4, "sand", "砂", "#dfcd9d", 0.6, "shovel"),
  block(5, "water", "水", "#55b8c8", 0, null, null, {
    solid: false,
    transparent: true,
  }),
  block(6, "wood", "白樺の丸太", "#a7865d", 1.8, "axe", "wood"),
  block(7, "leaves", "若葉", "#6d945a", 0.35, "axe", "leaves", {
    transparent: true,
  }),
  block(8, "planks", "木の板", "#cba46c", 1.2, "axe", "planks", {
    category: "building",
  }),
  block(9, "cobble", "石積み", "#8a8c83", 1.8, "pickaxe", "cobble", {
    category: "building",
  }),
  block(10, "coal_ore", "石炭の鉱脈", "#646967", 2.3, "pickaxe", "coal"),
  block(11, "copper_ore", "銅の鉱脈", "#a37857", 2.6, "pickaxe", "copper_ore", {
    tier: 1,
  }),
  block(12, "iron_ore", "鉄の鉱脈", "#b1b1a3", 3.4, "pickaxe", "iron_ore", {
    tier: 2,
  }),
  block(13, "crystal_ore", "星晶の鉱脈", "#81cbd1", 5, "pickaxe", "crystal", {
    tier: 3,
    emission: 0.4,
  }),
  block(14, "snow", "雪", "#e5ece5", 0.5, "shovel", "snow"),
  block(15, "clay", "粘土", "#ac947a", 0.9, "shovel", "clay"),
  block(16, "torch", "松明", "#f9c563", 0.2, null, "torch", {
    solid: false,
    transparent: true,
    emission: 1,
    category: "utility",
  }),
  block(17, "workbench", "工作台", "#b78c57", 2, "axe", "workbench", {
    station: "workbench",
    category: "utility",
  }),
  block(18, "furnace", "石の炉", "#6c777c", 3, "pickaxe", "furnace", {
    station: "furnace",
    category: "utility",
  }),
  block(19, "brick", "煉瓦", "#b77e66", 2.1, "pickaxe", "brick", {
    category: "building",
  }),
  block(20, "glass", "ガラス", "#b9dce0", 0.5, null, "glass", {
    transparent: true,
    category: "building",
  }),
  block(21, "flower", "陽だまりの花", "#edd078", 0.1, null, "flower", {
    solid: false,
    transparent: true,
  }),
  block(22, "tall_grass", "野草", "#8eab63", 0.1, null, "fiber", {
    solid: false,
    transparent: true,
  }),
  block(23, "bedrock", "世界の基盤", "#393f49", Infinity, "pickaxe", null),
  block(24, "dark_stone", "深層石", "#58616c", 3.8, "pickaxe", "dark_stone", {
    tier: 2,
  }),
  block(
    25,
    "amber_leaves",
    "琥珀の葉",
    "#c2954e",
    0.35,
    "axe",
    "amber_leaves",
    { transparent: true },
  ),
  block(26, "snow_leaves", "霧氷の葉", "#91b3a3", 0.35, "axe", "snow_leaves", {
    transparent: true,
  }),
  block(27, "cactus", "砂漠サボテン", "#809365", 0.9, "axe", "cactus", {
    damage: 2,
  }),
  block(28, "chest", "旅人の箱", "#a37647", 1.8, "axe", "chest", {
    category: "utility",
  }),
  block(29, "bed", "野営用ベッド", "#db9277", 1.4, "axe", "bed", {
    category: "utility",
  }),
  block(30, "lantern", "星灯りのランタン", "#eed694", 0.6, null, "lantern", {
    emission: 1,
    category: "utility",
  }),
  block(31, "obsidian", "黒曜石", "#4d435c", 6, "pickaxe", "obsidian", {
    tier: 4,
  }),
  block(32, "glowstone", "星灯石", "#b9e3ca", 2.5, "pickaxe", "glowstone", {
    emission: 1,
  }),
  block(33, "farmland", "耕した土", "#705542", 0.65, "shovel", "dirt"),
  block(34, "crop", "黄金麦", "#d9be6a", 0.2, null, "wheat", {
    solid: false,
    transparent: true,
  }),
  block(35, "ruin", "古代の石柱", "#a4a68f", 3, "pickaxe", "ruin", {
    category: "building",
  }),
  block(36, "beacon", "星の標", "#b4ece0", 5, "pickaxe", "beacon", {
    emission: 1,
    category: "utility",
  }),
]);

const catalog = {};
const item = (id, name, color, extra = {}) =>
  (catalog[id] = {
    id,
    name,
    color,
    stack: 64,
    category: "material",
    ...extra,
  });
for (const b of BLOCKS) {
  if (
    b.id === 0 ||
    b.id === 5 ||
    b.id === 23 ||
    b.id === 22 ||
    b.id === 34 ||
    b.id === 10 ||
    b.id === 13
  )
    continue;
  item(b.key, b.name, b.color, {
    block: b.id,
    category: b.category === "natural" ? "blocks" : b.category,
  });
}
item("stone", "石", "#9ba1a0", { block: 3, category: "blocks" });
item("coal", "石炭", "#454c56");
item("crystal", "星晶のかけら", "#86ded7", { rarity: "rare" });
item("copper_ingot", "銅のインゴット", "#d49267");
item("iron_ingot", "鉄のインゴット", "#cad5d1");
item("star_ingot", "星鋼のインゴット", "#9edfd5", { rarity: "epic" });
item("stick", "木の枝", "#b18c5f");
item("fiber", "植物の繊維", "#b5bc85");
item("rope", "より縄", "#d2b780");
item("hide", "獣の革", "#c39370");
item("feather", "風鳥の羽", "#e8dfc7");
item("bone", "古びた骨", "#d8d1b7");
item("ember", "残響の火種", "#e9aa6d", { rarity: "uncommon" });
item("ancient_shard", "古代の紋章片", "#b8c7a6", { rarity: "rare" });
item("compass", "方位のコンパス", "#c9a774", {
  stack: 1,
  category: "exploration",
});
item("star_core", "星の心臓", "#9de6db", {
  stack: 1,
  rarity: "legendary",
  category: "exploration",
});
item("seed", "黄金麦の種", "#beb66b", { category: "farming" });
item("crop", "黄金麦の苗", "#d9be6a", { category: "farming", block: 34 });
item("wheat", "黄金麦", "#d8bd68", { category: "farming" });
const food = (id, name, color, hunger, health = 0) =>
  item(id, name, color, {
    category: "food",
    food: { hunger, health },
    stack: 32,
  });
food("berry", "森のベリー", "#c87f85", 16, 1);
food("raw_meat", "生の肉", "#c88578", 12, 0);
food("cooked_meat", "香草焼き", "#bd8558", 42, 5);
food("bread", "焼きたてのパン", "#dab574", 30, 3);
food("berry_bread", "ベリーのパン", "#d7a093", 45, 8);
food("mushroom", "琥珀キノコ", "#c7a367", 12, 1);
food("stew", "森のシチュー", "#d3a678", 65, 12);
food("cactus_fruit", "サボテンの果実", "#d5a17f", 22, 2);
food("honey", "黄金の蜜", "#e4b963", 24, 6);
food("trail_mix", "旅人の行動食", "#c6b17d", 52, 8);
const tiers = [
  ["wood", "木", 1, "#bd9769", 65, 1.8, 3],
  ["stone", "石", 2, "#a4afa9", 135, 3.0, 5],
  ["copper", "銅", 3, "#d69a70", 240, 4.5, 7],
  ["iron", "鉄", 4, "#d0ddd8", 420, 6.5, 10],
  ["crystal", "星晶", 5, "#91dfd9", 850, 10, 15],
];
const toolNames = {
  pickaxe: "つるはし",
  axe: "斧",
  shovel: "シャベル",
  sword: "剣",
  hoe: "くわ",
};
for (const [prefix, name, tier, color, durability, speed, damage] of tiers) {
  for (const [tool, label] of Object.entries(toolNames)) {
    item(`${prefix}_${tool}`, `${name}の${label}`, color, {
      stack: 1,
      category: "tools",
      tool,
      tier,
      durability,
      speed: tool === "sword" ? 1 : speed,
      damage:
        tool === "sword" ? damage : tool === "axe" ? damage * 0.8 : 2 + tier,
      icon: tool,
    });
  }
}
item("leather_armor", "森人の革鎧", "#b7956f", {
  stack: 1,
  category: "equipment",
  armor: 0.18,
  durability: 150,
});
item("copper_armor", "銅の胸当て", "#d19b77", {
  stack: 1,
  category: "equipment",
  armor: 0.3,
  durability: 280,
});
item("iron_armor", "鉄の旅装", "#c4d3cb", {
  stack: 1,
  category: "equipment",
  armor: 0.45,
  durability: 500,
});
item("crystal_armor", "星詠みの鎧", "#a1e5dd", {
  stack: 1,
  category: "equipment",
  armor: 0.6,
  durability: 900,
  rarity: "epic",
});
item("glider", "風鳥の翼衣", "#d7dfb2", {
  stack: 1,
  category: "equipment",
  armor: 0.12,
  durability: 350,
  special: "glider",
  rarity: "rare",
});
export const ITEMS = Object.freeze(catalog);
export const RECIPES = [];
const recipe = (id, out, n, ingredients, station = null, category = "basics") =>
  RECIPES.push({
    id,
    name: ITEMS[out].name,
    output: { id: out, count: n },
    ingredients: Object.entries(ingredients).map(([id, count]) => ({
      id,
      count,
    })),
    station,
    category,
  });
recipe("planks", "planks", 4, { wood: 1 });
recipe("sticks", "stick", 4, { planks: 2 });
recipe("rope", "rope", 2, { fiber: 4 });
recipe("workbench", "workbench", 1, { planks: 6 });
recipe("torch", "torch", 4, { stick: 1, coal: 1 });
recipe("grass_torch", "torch", 2, { stick: 2, fiber: 4 });
recipe("cobble", "cobble", 4, { stone: 4 }, null, "building");
recipe("furnace", "furnace", 1, { stone: 12 }, "workbench", "utility");
recipe("chest", "chest", 1, { planks: 8 }, "workbench", "utility");
recipe(
  "bed",
  "bed",
  1,
  { planks: 4, hide: 3, fiber: 6 },
  "workbench",
  "utility",
);
recipe(
  "lantern",
  "lantern",
  2,
  { copper_ingot: 2, torch: 2 },
  "workbench",
  "utility",
);
recipe(
  "lantern_crystal",
  "lantern",
  2,
  { iron_ingot: 1, crystal: 1 },
  "workbench",
  "utility",
);
recipe("clay_brick", "brick", 4, { clay: 4, coal: 1 }, "furnace", "building");
recipe("sand_glass", "glass", 4, { sand: 4, coal: 1 }, "furnace", "building");
recipe(
  "smelt_copper",
  "copper_ingot",
  1,
  { copper_ore: 1, coal: 1 },
  "furnace",
  "smelting",
);
recipe(
  "smelt_iron",
  "iron_ingot",
  1,
  { iron_ore: 1, coal: 1 },
  "furnace",
  "smelting",
);
recipe(
  "smelt_star",
  "star_ingot",
  1,
  { iron_ingot: 2, crystal: 2, coal: 1 },
  "furnace",
  "smelting",
);
recipe("charcoal", "coal", 3, { wood: 2 }, "furnace", "smelting");
recipe(
  "smooth_stone",
  "stone",
  4,
  { cobble: 4, coal: 1 },
  "furnace",
  "building",
);
recipe(
  "obsidian",
  "obsidian",
  2,
  { dark_stone: 4, crystal: 1, coal: 1 },
  "furnace",
  "building",
);
recipe(
  "glowstone",
  "glowstone",
  2,
  { stone: 2, crystal: 1 },
  "workbench",
  "building",
);
recipe("ruin", "ruin", 4, { stone: 4, clay: 1 }, "workbench", "building");
recipe("farmland", "farmland", 4, { dirt: 4, fiber: 1 }, null, "farming");
recipe("grass", "grass", 4, { dirt: 4, fiber: 2 }, null, "building");
recipe("seed", "seed", 3, { wheat: 1 }, null, "farming");
recipe("crop", "crop", 1, { seed: 2 }, null, "farming");
recipe("leaves", "leaves", 2, { fiber: 4 }, null, "building");
recipe("snow", "snow", 4, { glass: 1, clay: 2 }, "workbench", "building");
recipe(
  "cook_meat",
  "cooked_meat",
  1,
  { raw_meat: 1, coal: 1 },
  "furnace",
  "food",
);
recipe("bread", "bread", 1, { wheat: 3, coal: 1 }, "furnace", "food");
recipe("berry_bread", "berry_bread", 1, { bread: 1, berry: 3 }, null, "food");
recipe(
  "stew",
  "stew",
  1,
  { mushroom: 2, cooked_meat: 1, berry: 2 },
  "furnace",
  "food",
);
recipe(
  "trail_mix",
  "trail_mix",
  2,
  { berry: 4, wheat: 2, mushroom: 1 },
  null,
  "food",
);
recipe("cactus_fruit", "cactus_fruit", 2, { cactus: 1 }, null, "food");
for (const [prefix] of tiers) {
  const material =
    prefix === "wood"
      ? "planks"
      : prefix === "stone"
        ? "stone"
        : prefix === "crystal"
          ? "star_ingot"
          : `${prefix}_ingot`;
  for (const [tool, amount] of Object.entries({
    pickaxe: 3,
    axe: 3,
    shovel: 1,
    sword: 2,
    hoe: 2,
  })) {
    recipe(
      `${prefix}_${tool}`,
      `${prefix}_${tool}`,
      1,
      { [material]: amount, stick: tool === "sword" ? 1 : 2 },
      prefix === "wood" ? null : "workbench",
      "tools",
    );
  }
}
recipe(
  "leather_armor",
  "leather_armor",
  1,
  { hide: 8, rope: 2 },
  "workbench",
  "equipment",
);
recipe(
  "copper_armor",
  "copper_armor",
  1,
  { copper_ingot: 8, hide: 3 },
  "workbench",
  "equipment",
);
recipe(
  "iron_armor",
  "iron_armor",
  1,
  { iron_ingot: 8, hide: 4 },
  "workbench",
  "equipment",
);
recipe(
  "crystal_armor",
  "crystal_armor",
  1,
  { star_ingot: 8, hide: 4, ancient_shard: 2 },
  "workbench",
  "equipment",
);
recipe(
  "glider",
  "glider",
  1,
  { feather: 12, rope: 4, hide: 4 },
  "workbench",
  "equipment",
);
recipe(
  "compass",
  "compass",
  1,
  { copper_ingot: 3, crystal: 1 },
  "workbench",
  "exploration",
);
recipe(
  "star_core",
  "star_core",
  1,
  { star_ingot: 6, ancient_shard: 4, ember: 4 },
  "furnace",
  "exploration",
);
recipe(
  "beacon",
  "beacon",
  1,
  { star_core: 1, glowstone: 4, obsidian: 4 },
  "workbench",
  "exploration",
);
Object.freeze(RECIPES);
export const PROGRESSION = Object.freeze([
  {
    id: "wood",
    title: "森からの贈り物",
    description: "丸太を6個集めよう。木の幹を長押しで採掘。",
    item: "wood",
    count: 6,
  },
  {
    id: "workbench",
    title: "小さな工房",
    description: "丸太から板を作り、工作台を設置しよう。",
    item: "workbench",
    count: 1,
  },
  {
    id: "stone_pickaxe",
    title: "大地の下へ",
    description: "石を採掘し、石のつるはしを作ろう。",
    item: "stone_pickaxe",
    count: 1,
  },
  {
    id: "furnace",
    title: "炎を灯す",
    description: "石の炉を設置して、鉱石を製錬しよう。",
    item: "furnace",
    count: 1,
  },
  {
    id: "copper_pickaxe",
    title: "銅の時代",
    description: "銅を製錬して、銅のつるはしを作ろう。",
    item: "copper_pickaxe",
    count: 1,
  },
  {
    id: "iron_pickaxe",
    title: "深層の探求者",
    description: "地下の鉄を探し、鉄の道具を手に入れよう。",
    item: "iron_pickaxe",
    count: 1,
  },
  {
    id: "crystal",
    title: "星の残響",
    description: "深い洞窟に眠る星晶を集めよう。",
    item: "crystal",
    count: 6,
  },
  {
    id: "beacon",
    title: "星に帰る道",
    description: "古代遺跡の紋章を集め、星の標を建てよう。",
    item: "beacon",
    count: 1,
  },
]);
export const BIOME_NAMES = Object.freeze({
  meadow: "陽だまりの草原",
  plains: "陽だまりの草原",
  forest: "白樺の森",
  autumn: "琥珀の森",
  mountains: "雲渡りの山脈",
  mountain: "雲渡りの山脈",
  snow: "霧氷の峰",
  desert: "さざめく砂丘",
  beach: "白砂の浜",
  ocean: "静かな海",
  river: "青のせせらぎ",
  taiga: "霧氷の森",
});
