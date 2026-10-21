import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

// Uses an existing dev/preview server and the machine browser; no remote service.
const baseURL = process.env.GAME_URL || "http://127.0.0.1:5173";
const artifacts = new URL("../artifacts/", import.meta.url);
await fs.mkdir(artifacts, { recursive: true });
const results = [],
  errors = [],
  consoleWarnings = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon"))
    errors.push(m.text());
  if (m.type() === "warning") consoleWarnings.push(m.text());
});
async function check(name, fn) {
  const start = performance.now();
  try {
    const detail = await fn();
    results.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - start),
      detail,
    });
    console.log(`PASS ${name}${detail ? ": " + JSON.stringify(detail) : ""}`);
    return detail;
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.message,
      durationMs: Math.round(performance.now() - start),
    });
    console.error(`FAIL ${name}: ${error.stack}`);
    await screenshot("failure-" + results.length).catch(() => {});
    throw error;
  }
}
async function screenshot(name) {
  await page.screenshot({
    path: new URL(name + ".png", artifacts).pathname,
    animations: "disabled",
  });
}
const waitState = (state) =>
  page.waitForFunction((value) => window.__game?.state === value, state, {
    timeout: 45000,
  });
const waitScreen = (screen) =>
  page.waitForFunction((value) => window.__game?.ui?.screen === value, screen, {
    timeout: 45000,
  });
async function rangeSetting(key, value) {
  await page.locator(`[data-setting="${key}"]`).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function resume() {
  await page.evaluate(() => window.__game.resume());
  await waitState("playing");
}
let worldId, savedPosition;
try {
  await check("boot, live main menu and WebGL rendering", async () => {
    await page.goto(baseURL, { waitUntil: "networkidle", timeout: 30000 });
    await waitScreen("main");
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({
      state: window.__game.state,
      canvas: document.querySelector("canvas").width,
      title: document.title,
      chunks: window.__game.world.stats.chunks,
      drawCalls: window.__game.renderer.info.render.calls,
    }));
    assert.match(info.title, /WILDBOUND/);
    assert.ok(info.canvas > 0 && info.chunks > 0 && info.drawCalls > 0);
    await screenshot("menu");
    return info;
  });
  await check("settings controls apply and persist", async () => {
    await page.locator('[data-action="settings"]').click();
    await waitScreen("settings");
    await page.locator('[data-setting="quality"]').selectOption("low");
    await rangeSetting("renderDistance", 3);
    await rangeSetting("fov", 82);
    await rangeSetting("volume", 0.18);
    await page.locator('[data-setting="headBob"]').focus();
    await page.keyboard.press("Space");
    const s = await page.evaluate(() => window.__game.settings);
    assert.equal(s.quality, "low");
    assert.equal(s.fov, 82);
    assert.equal(s.renderDistance, 3);
    assert.equal(s.headBob, false);
    await screenshot("settings");
    await page.locator('.form-bottom [data-action="settings-back"]').click();
    await waitScreen("main");
    return s;
  });
  await check(
    "new world form creates requested seed and survival mode",
    async () => {
      await page.locator('[data-action="new"]').click();
      await waitScreen("new");
      await page.locator('input[name="name"]').fill("QA — Sunrise expedition");
      await page.locator('input[name="seed"]').fill("qa-sunrise-42");
      await page.locator('[data-testid="create-world"]').click();
      await waitState("playing");
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => {
        const g = window.__game;
        return {
          id: g.id,
          name: g.name,
          seed: g.seed,
          mode: g.mode,
          position: g.player.position.toArray(),
          health: g.player.health,
          chunks: g.world.stats.chunks,
          biome: g.world.getBiome(g.player.position.x, g.player.position.z),
        };
      });
      assert.equal(state.seed, "qa-sunrise-42");
      assert.equal(state.mode, "survival");
      assert.equal(state.name, "QA — Sunrise expedition");
      assert.ok(state.position.every(Number.isFinite));
      assert.ok(state.position[1] > 32);
      assert.equal(state.health, 100);
      assert.ok(state.chunks > 0);
      worldId = state.id;
      await screenshot("game");
      return state;
    },
  );
  await check("actual keyboard movement, pointer lock and jump", async () => {
    await page.locator("#game-canvas").click({ position: { x: 640, y: 400 } });
    await page.waitForFunction(() => window.__game.locked, null, {
      timeout: 10000,
    });
    const before = await page.evaluate(() =>
      window.__game.player.position.toArray(),
    );
    await page.keyboard.down("w");
    await page.waitForFunction(
      (p) => {
        const now = window.__game.player.position;
        return Math.hypot(now.x - p[0], now.z - p[2]) > 0.75;
      },
      before,
      { timeout: 15000 },
    );
    await page.keyboard.up("w");
    const after = await page.evaluate(() =>
      window.__game.player.position.toArray(),
    );
    const distance = Math.hypot(after[0] - before[0], after[2] - before[2]);
    assert.ok(distance > 0.25, `W must move player, moved ${distance}`);
    const y = after[1];
    await page.keyboard.down("Space");
    await page.waitForFunction(
      (start) => window.__game.player.position.y > start + 0.3,
      y,
      { timeout: 15000 },
    );
    await page.keyboard.up("Space");
    const jumpY = await page.evaluate(() => window.__game.player.position.y);
    assert.ok(jumpY > y + 0.2, `jump should lift player, ${jumpY - y}`);
    await page.keyboard.press("Escape");
    await waitState("pause");
    return { distance, jumpHeight: jumpY - y };
  });
  await check(
    "mining duration, accurate voxel target, world edit and resource drop",
    async () => {
      const r = await page.evaluate(async () => {
        const g = window.__game;
        g.player.position.set(0.5, 37.0001, 5.5);
        g.player.velocity.set(0, 0, 0);
        g.player.yaw = 0;
        g.player.pitch = -0.04;
        g.player.update(0.016, { keys: new Set(), locked: true }, g.settings);
        for (const z of [3, 4])
          for (const y of [37, 38, 39]) g.world.setBlock(0, y, z, 0);
        g.world.setBlock(0, 38, 2, 6);
        g.inventory.selected = 8;
        g.inventory.slots[8] = null;
        g.attackCooldown = 0;
        g.state = "playing";
        g.tick(0.016);
        g.state = "pause";
        const target = { ...g.target };
        const before = g.progress.mined;
        g.mineTarget(0.05);
        const early = g.world.getBlock(0, 38, 2);
        let calls = 1,
          completed = false;
        while (calls++ < 100) {
          if (g.mineTarget(0.05)) {
            completed = true;
            break;
          }
        }
        return {
          target,
          early,
          completed,
          calls,
          after: g.world.getBlock(0, 38, 2),
          mined: g.progress.mined - before,
          drop: g.entities.drops.some((d) => d.id === "wood"),
        };
      });
      assert.equal(r.target.id, 6);
      assert.equal(r.target.x, 0);
      assert.equal(r.target.z, 2);
      assert.equal(r.early, 6);
      assert.ok(r.calls > 5 && r.completed);
      assert.equal(r.after, 0);
      assert.equal(r.mined, 1);
      assert.ok(r.drop);
      return r;
    },
  );
  await check(
    "placement follows selected face, consumes stack and blocks player overlap",
    async () => {
      const r = await page.evaluate(async () => {
        const g = window.__game;
        g.world.setBlock(0, 37, 2, 3);
        g.player.pitch = -0.4;
        g.player.update(0.016, { keys: new Set(), locked: true }, g.settings);
        g.inventory.slots[8] = { id: "planks", count: 4 };
        g.inventory.selected = 8;
        g.placeCooldown = 0;
        g.state = "playing";
        g.tick(0.016);
        g.state = "pause";
        const t = { ...g.target };
        const p = {
          x: t.x + t.normal.x,
          y: t.y + t.normal.y,
          z: t.z + t.normal.z,
        };
        const placed = g.placeBlock();
        const id = g.world.getBlock(p.x, p.y, p.z),
          count = g.inventory.slots[8].count;
        g.placeCooldown = 0;
        g.target = { x: 0, y: 37, z: 4, id: 3, normal: { x: 0, y: 0, z: 1 } };
        const blocked = g.placeBlock();
        return {
          target: t,
          position: p,
          placed,
          id,
          count,
          blocked,
          remaining: g.inventory.slots[8].count,
        };
      });
      assert.ok(r.placed);
      assert.equal(r.id, 8);
      assert.equal(r.count, 3);
      assert.equal(r.blocked, false);
      assert.equal(r.remaining, 3);
      return r;
    },
  );
  await check("inventory UI crafting and station progression", async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.inventory.add("wood", 4);
      g.inventory.add("stone", 8);
      g.inventory.add("stick", 8);
      g.openInventory();
    });
    await waitState("inventory");
    const before = await page.evaluate(() => ({
      wood: window.__game.inventory.count("wood"),
      planks: window.__game.inventory.count("planks"),
    }));
    await page.locator('[data-recipe="planks"]').click();
    await page.locator('[data-action="craft"]').click();
    const after = await page.evaluate(() => ({
      wood: window.__game.inventory.count("wood"),
      planks: window.__game.inventory.count("planks"),
    }));
    assert.equal(after.wood, before.wood - 1);
    assert.equal(after.planks, before.planks + 4);
    await page.locator('[data-recipe="stone_pickaxe"]').click();
    assert.ok(await page.locator('[data-action="craft"]').isDisabled());
    await page.evaluate(() => {
      const g = window.__game;
      g.world.setBlock(2, 37, 5, 17);
      g.openInventory();
    });
    await page.locator('[data-recipe="stone_pickaxe"]').click();
    assert.ok(await page.locator('[data-action="craft"]').isEnabled());
    await page.locator('[data-action="craft"]').click();
    assert.equal(
      await page.evaluate(() => window.__game.inventory.count("stone_pickaxe")),
      1,
    );
    await screenshot("inventory");
    return { before, after };
  });
  await check("inventory split, quick move, drag and tooltip", async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.inventory.slots[20] = { id: "dirt", count: 10 };
      g.inventory.slots[21] = null;
      g.inventory.slots[22] = null;
      g.inventory.revision++;
      g.refreshInventory();
    });
    const slot = (n) => page.locator(`.overlay-layer [data-slot="${n}"]`);
    await slot(20).hover();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".item-tooltip").isVisible(), true);
    await slot(20).click();
    await slot(21).click({ button: "right" });
    assert.deepEqual(
      await page.evaluate(() => [
        window.__game.inventory.slots[20]?.count,
        window.__game.inventory.slots[21]?.count,
      ]),
      [5, 5],
    );
    await slot(21).dragTo(slot(22));
    assert.equal(
      await page.evaluate(() => window.__game.inventory.slots[22]?.count),
      5,
    );
    await slot(22).click({ modifiers: ["Shift"] });
    assert.equal(
      await page.evaluate(() => window.__game.inventory.slots[22]),
      null,
    );
    assert.equal(
      await page.evaluate(() => window.__game.inventory.count("dirt")),
      10,
    );
    return { dirt: 10 };
  });
  await check("combat produces species loot and hostile spawning", async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      const V3 = g.player.position.constructor;
      const p = g.player.position;
      const mob = g.entities.spawn("hart", { x: p.x - 2, y: p.y, z: p.z });
      const origin = new V3(
        mob.position.x,
        mob.position.y + 0.8,
        mob.position.z + 2,
      );
      const result = g.entities.attack(origin, new V3(0, 0, -1), 4, 100);
      const meat = g.entities.drops.some((d) => d.id === "raw_meat");
      for (let i = 0; i < 30; i++) g.entities.trySpawn(g.player, 0.9);
      return {
        killed: result?.killed,
        meat,
        count: g.entities.count,
        hostile: g.entities.entities.filter((e) => e.definition.hostile).length,
      };
    });
    assert.ok(r.killed && r.meat);
    assert.ok(r.count > 0 && r.hostile > 0);
    return r;
  });
  await check("negative chunk boundary edit and streaming", async () => {
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.world.setBlock(-16, 50, -1, 19);
      g.world.setBlock(-17, 50, -1, 20);
      g.world.ensureAround(-16, -1, 1);
      g.world.update({ x: -16, y: 51, z: -1 }, 3);
      return {
        left: g.world.getBlock(-17, 50, -1),
        right: g.world.getBlock(-16, 50, -1),
        chunks: g.world.stats.chunks,
        queued: g.world.stats.queued,
      };
    });
    assert.equal(r.left, 20);
    assert.equal(r.right, 19);
    assert.ok(r.chunks >= 9);
    return r;
  });
  await check("survival food, armor, journal and map", async () => {
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.player.hunger = 40;
      g.inventory.selected = 0;
      g.inventory.slots[0] = { id: "berry", count: 4 };
      const ate = g.eat();
      g.inventory.add("iron_armor", 1, 281);
      const armor = g.inventory.slots.findIndex((s) => s?.id === "iron_armor");
      g.equip(armor);
      g.openJournal();
      return {
        ate,
        hunger: g.player.hunger,
        armor: g.player.armor,
        equipment: g.inventory.equipment,
        state: g.state,
      };
    });
    assert.ok(r.ate && r.hunger > 40 && r.armor > 0);
    assert.equal(r.state, "journal");
    await screenshot("journal");
    await resume();
    await page.keyboard.press("m");
    await waitState("map");
    assert.equal(await page.locator(".wb-atlas").isVisible(), true);
    await screenshot("map");
    await page.locator('[data-map="close"]').click();
    await waitState("playing");
    await page.evaluate(() => window.__game.pause());
    return r;
  });
  await check(
    "save records world edits, player, equipment and inventory in IndexedDB",
    async () => {
      const saved = await page.evaluate(async () => {
        const g = window.__game;
        g.player.health = 72;
        g.player.hunger = 64;
        g.world.setBlock(-1, 50, -1, 19);
        await g.save();
        const s = await g.store.get(g.id);
        return {
          backend: g.store.backend,
          id: s.id,
          seed: s.seed,
          edits: s.edits,
          position: s.player.position,
          equipment: s.inventory.equipment,
          health: s.player.health,
          hunger: s.player.hunger,
        };
      });
      assert.equal(saved.backend, "indexedDB");
      assert.equal(saved.id, worldId);
      assert.equal(saved.seed, "qa-sunrise-42");
      assert.equal(saved.edits["-1,50,-1"], 19);
      assert.equal(saved.health, 72);
      assert.equal(saved.equipment.id, "iron_armor");
      savedPosition = saved.position;
      return {
        backend: saved.backend,
        id: saved.id,
        editCount: Object.keys(saved.edits).length,
        equipment: saved.equipment,
      };
    },
  );
  await check(
    "reload and menu load restore saved world and settings",
    async () => {
      await page.reload({ waitUntil: "networkidle" });
      await waitScreen("main");
      await page.locator('[data-action="settings"]').click();
      await waitScreen("settings");
      assert.equal(
        await page.locator('[data-setting="quality"]').inputValue(),
        "low",
      );
      assert.equal(
        await page.locator('[data-setting="fov"]').inputValue(),
        "82",
      );
      await page.locator('.form-bottom [data-action="settings-back"]').click();
      await page.locator(`[data-action="load"][data-id="${worldId}"]`).click();
      await waitState("playing");
      const r = await page.evaluate(() => {
        const g = window.__game;
        return {
          id: g.id,
          seed: g.seed,
          block: g.world.getBlock(-1, 50, -1),
          health: g.player.health,
          position: g.player.position.toArray(),
          equipment: g.inventory.equipment,
          settings: g.settings,
        };
      });
      assert.equal(r.id, worldId);
      assert.equal(r.seed, "qa-sunrise-42");
      assert.equal(r.block, 19);
      assert.equal(r.health, 72);
      assert.equal(r.equipment.id, "iron_armor");
      assert.equal(r.equipment.durability, 281);
      assert.equal(r.settings.quality, "low");
      const expected = Array.isArray(savedPosition)
        ? savedPosition
        : [savedPosition.x, savedPosition.y, savedPosition.z];
      assert.ok(
        Math.hypot(...r.position.map((n, i) => n - expected[i])) < 0.15,
      );
      return r;
    },
  );
  await check(
    "death, respawn and save continue without losing inventory",
    async () => {
      const counts = await page.evaluate(() => {
        const g = window.__game;
        g.player._damageCooldown = 0;
        const before = g.inventory.count("stone_pickaxe");
        g.player.damage(1000, "QA");
        return { state: g.state, before };
      });
      assert.equal(counts.state, "dead");
      await waitScreen("death");
      await page.evaluate(() => window.__game.save());
      await page.reload({ waitUntil: "networkidle" });
      await waitScreen("main");
      await page.locator(`[data-action="load"][data-id="${worldId}"]`).click();
      await waitState("dead");
      await waitScreen("death");
      await page.locator('[data-action="respawn"]').click();
      await waitState("playing");
      assert.equal(await page.evaluate(() => window.__game.player.health), 100);
      assert.equal(
        await page.evaluate(() =>
          window.__game.inventory.count("stone_pickaxe"),
        ),
        counts.before,
      );
      return { respawn: true };
    },
  );
  await check(
    "sustained rendered frame statistics at low and high quality",
    async () => {
      const stats = [];
      for (const quality of ["low", "high"]) {
        await page.evaluate((q) => {
          const g = window.__game;
          g.updateSettings({ quality: q, renderDistance: 3 });
          g.state = "playing";
        }, quality);
        await page.waitForTimeout(350);
        const sample = await page.evaluate(async () => {
          const g = window.__game;
          const intervals = [];
          let previous = performance.now();
          const end = previous + 1500;
          await new Promise((resolve) => {
            function sample(now) {
              intervals.push(now - previous);
              previous = now;
              if (now < end) requestAnimationFrame(sample);
              else resolve();
            }
            requestAnimationFrame(sample);
          });
          intervals.sort((a, b) => a - b);
          return {
            fps:
              (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0),
            medianMs: intervals[Math.floor(intervals.length / 2)],
            p95Ms: intervals[Math.floor(intervals.length * 0.95)],
            quality: g.settings.quality,
            chunks: g.world.stats.chunks,
            drawCalls: g.renderer.info.render.calls,
            triangles: g.renderer.info.render.triangles,
            entities: g.entities.count,
            memory: performance.memory?.usedJSHeapSize,
          };
        });
        stats.push(sample);
      }
      assert.ok(
        stats.every((s) => s.fps > 0 && s.drawCalls > 0 && s.chunks > 0),
      );
      await screenshot("game-final");
      return stats;
    },
  );
  await check("creative catalogue, flight and survival immunity", async () => {
    await page.evaluate(() => window.__game.saveAndQuit());
    await waitScreen("main");
    await page.locator('[data-action="new"]').click();
    await page.locator('input[name="name"]').fill("QA — Creative workshop");
    await page.locator('input[name="seed"]').fill("qa-creative-7");
    await page
      .locator(".mode-card")
      .filter({ has: page.locator('input[value="creative"]') })
      .click();
    await page.locator('[data-testid="create-world"]').click();
    await waitState("playing");
    await page.waitForFunction(
      () => window.__game.ui.lastState.mode === "creative",
    );
    await page.evaluate(() => window.__game.openInventory());
    await waitState("inventory");
    await page.locator('[data-category="creative"]').click();
    await page
      .locator('[data-action="creative-item"][data-id="star_core"]')
      .click();
    assert.equal(
      await page.evaluate(() => window.__game.inventory.selectedItem()?.id),
      "star_core",
    );
    await page.locator('[data-action="close"]').click();
    await waitState("playing");
    await page.waitForFunction(() => window.__game.locked, null, {
      timeout: 10000,
    });
    const y = await page.evaluate(() => window.__game.player.position.y);
    await page.keyboard.down("Space");
    await page.waitForFunction(
      (start) => window.__game.player.position.y > start + 0.6,
      y,
      { timeout: 15000 },
    );
    await page.keyboard.up("Space");
    const r = await page.evaluate(() => {
      const g = window.__game;
      g.player.damage(1000, "QA");
      return {
        mode: g.mode,
        flying: g.player.flying,
        health: g.player.health,
        selected: g.inventory.selectedItem().id,
        y: g.player.position.y,
      };
    });
    assert.equal(r.mode, "creative");
    assert.equal(r.flying, true);
    assert.equal(r.health, 100);
    await screenshot("creative");
    return r;
  });
  await check("no fatal browser errors", async () => {
    assert.deepEqual(errors, []);
    return { errors, warningCount: consoleWarnings.length };
  });
} finally {
  await fs.writeFile(
    new URL("browser-results.json", artifacts),
    JSON.stringify({ results, errors, consoleWarnings }, null, 2),
  );
  await browser.close();
}
