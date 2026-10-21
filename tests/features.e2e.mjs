import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const check = async (name, fn) => {
  const detail = await fn();
  results.push({ name, passed: true, detail });
  console.log("PASS " + name + " " + JSON.stringify(detail));
};
try {
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.__game?.ui.screen === "main");
  await page.evaluate(async () => {
    const g = window.__game;
    g.updateSettings({
      quality: "low",
      renderDistance: 3,
      autoResolution: false,
      volume: 0,
    });
    await g.startWorld({
      name: "Feature expedition",
      seed: "feature-check-17",
      mode: "creative",
    });
    g.state = "pause";
  });
  await check(
    "placed chest starts empty, deposit and split retrieval conserve contents",
    async () => {
      const r = await page.evaluate(() => {
        const g = window.__game;
        g.world.setBlock(3, 37, 5, 28);
        g.target = { x: 3, y: 37, z: 5, id: 28, normal: { x: -1, y: 0, z: 0 } };
        g.interact();
        const key = g.currentChest,
          empty = g.chests[key].every((s) => s === null);
        g.inventory.slots[20] = { id: "wood", count: 7 };
        const before = g.inventory.count("wood");
        g.inventoryClick(20, { shiftKey: true });
        const stored = g.chests[key][0]?.count;
        g.chestClick(0, { button: 2 });
        return {
          key,
          empty,
          before,
          stored,
          remaining: g.chests[key][0]?.count,
          after: g.inventory.count("wood"),
          state: g.state,
        };
      });
      assert.ok(r.empty);
      assert.equal(r.stored, 7);
      assert.equal(r.remaining, 3);
      assert.equal(r.after, r.before - 3);
      assert.equal(r.state, "chest");
      return r;
    },
  );
  await check(
    "young crops return a seed, mature crops yield wheat and seed",
    async () => {
      const r = await page.evaluate(() => {
        const g = window.__game;
        const harvest = (age) => {
          g.time = 1000;
          g.world.setBlock(4, 37, 5, 34);
          g.planted["4,37,5"] = g.time - age;
          g.target = {
            x: 4,
            y: 37,
            z: 5,
            id: 34,
            normal: { x: 0, y: 1, z: 0 },
          };
          g.mining = 0;
          g.mineKey = "";
          g.attackCooldown = 0;
          g.inventory.selected = 8;
          g.inventory.slots[8] = null;
          const start = g.entities.drops.length;
          const ok = g.mineTarget(0.4);
          return {
            ok,
            drops: g.entities.drops
              .slice(start)
              .map((d) => ({ id: d.id, count: d.count })),
          };
        };
        return { young: harvest(20), mature: harvest(100) };
      });
      assert.ok(r.young.ok && r.mature.ok);
      assert.ok(r.young.drops.some((d) => d.id === "seed"));
      assert.ok(!r.young.drops.some((d) => d.id === "wheat"));
      assert.ok(r.mature.drops.some((d) => d.id === "wheat" && d.count === 3));
      return r;
    },
  );
  await check(
    "night bed sets spawn and advances to morning while preserving world",
    async () => {
      const r = await page.evaluate(() => {
        const g = window.__game;
        g.world.setBlock(6, 37, 5, 29);
        g.time = 1100;
        g.target = { x: 6, y: 37, z: 5, id: 29, normal: { x: 0, y: 1, z: 0 } };
        g.interact();
        return {
          spawn: g.spawn.toArray(),
          time: g.time,
          phase: (g.time % 1200) / 1200,
          bed: g.world.getBlock(6, 37, 5),
        };
      });
      assert.deepEqual(r.spawn, [6.5, 38.05, 5.5]);
      assert.equal(r.phase, 0.29);
      assert.ok(r.time > 1200);
      assert.equal(r.bed, 29);
      return r;
    },
  );
  await check(
    "seed planting records growth, mature crops spread only over farmland",
    async () => {
      const r = await page.evaluate(() => {
        const g = window.__game;
        g.inventory.slots[8] = { id: "seed", count: 3 };
        g.inventory.selected = 8;
        g.world.setBlock(8, 36, 5, 33);
        g.world.setBlock(9, 36, 5, 33);
        g.world.setBlock(8, 37, 5, 0);
        g.world.setBlock(9, 37, 5, 0);
        g.target = { x: 8, y: 36, z: 5, id: 33, normal: { x: 0, y: 1, z: 0 } };
        g.use();
        const planted = g.world.getBlock(8, 37, 5),
          seed = g.inventory.slots[8].count;
        g.time += 95;
        g.updateFarms();
        return {
          planted,
          seed,
          spread: g.world.getBlock(9, 37, 5),
          newGrowth: Number.isFinite(g.planted["9,37,5"]),
        };
      });
      assert.equal(r.planted, 34);
      assert.equal(r.seed, 2);
      assert.equal(r.spread, 34);
      assert.ok(r.newGrowth);
      return r;
    },
  );
  await check(
    "built beacon creates rendered landmark and persists with chest, crop and spawn",
    async () => {
      const r = await page.evaluate(async () => {
        const g = window.__game;
        g.world.setBlock(10, 36, 5, 3);
        g.world.setBlock(10, 37, 5, 0);
        g.target = { x: 10, y: 36, z: 5, id: 3, normal: { x: 0, y: 1, z: 0 } };
        g.inventory.slots[8] = { id: "beacon", count: 1 };
        g.inventory.selected = 8;
        g.placeCooldown = 0;
        const placed = g.placeBlock();
        g.beaconEffects.update(0.02, g.world, g.player.position);
        g.state = "pause";
        await g.save();
        const saved = await g.store.get(g.id);
        return {
          placed,
          beams: g.beaconEffects.active.size,
          block: saved.edits["10,37,5"],
          chest: saved.chests["3,37,5"][0],
          spawn: saved.spawn,
          planted: saved.planted["9,37,5"],
          id: saved.id,
        };
      });
      assert.ok(r.placed);
      assert.equal(r.beams, 1);
      assert.equal(r.block, 36);
      assert.equal(r.chest.count, 3);
      assert.equal(r.spawn.x, 6.5);
      assert.ok(Number.isFinite(r.planted));
      await page.evaluate(async (id) => {
        const g = window.__game;
        await g.loadWorld(id);
        g.state = "pause";
        g.beaconEffects.update(0.02, g.world, g.player.position);
      }, r.id);
      const restored = await page.evaluate(() => {
        const g = window.__game;
        return {
          beams: g.beaconEffects.active.size,
          chest: g.chests["3,37,5"][0],
          crop: g.world.getBlock(9, 37, 5),
          spawn: g.spawn.toArray(),
          block: g.world.getBlock(10, 37, 5),
        };
      });
      assert.equal(restored.beams, 1);
      assert.equal(restored.chest.count, 3);
      assert.equal(restored.crop, 34);
      assert.equal(restored.block, 36);
      return restored;
    },
  );
  await check(
    "JSON export and import restore a separate complete world",
    async () => {
      const r = await page.evaluate(async () => {
        const g = window.__game;
        await g.save();
        const original = g.id;
        const json = await g.store.export(original);
        const restoredId = await g.store.import(json);
        const restored = await g.store.get(restoredId);
        return {
          original,
          id: restoredId,
          seed: restored.seed,
          chest: restored.chests["3,37,5"][0].count,
          beacon: restored.edits["10,37,5"],
          name: restored.name,
        };
      });
      assert.notEqual(r.original, r.id);
      assert.equal(r.seed, "feature-check-17");
      assert.equal(r.chest, 3);
      assert.equal(r.beacon, 36);
      return r;
    },
  );
  await check(
    "beacon night scene renders without shader or page errors",
    async () => {
      await page.evaluate(() => {
        const g = window.__game;
        g.ui.hide();
        g.ui.hud.hidden = true;
        g.state = "pause";
        g.camera.position.set(1, 42, 16);
        g.camera.lookAt(10, 44, 5);
        g.atmosphere.update(0.1, 0.9, g.player.position, g.settings);
        g.beaconEffects.update(0.1, g.world, g.player.position);
        g.renderer.shadowMap.needsUpdate = true;
        g.renderer.render(g.scene, g.camera);
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: "artifacts/beacon-night.png" });
      assert.deepEqual(errors, []);
      return { errors };
    },
  );
  await check(
    "title transition clears injury and underwater overlays",
    async () => {
      const result = await page.evaluate(() => {
        const g = window.__game;
        g.ui.update({ health: 5, underwater: true, oxygen: 20 });
        const before = {
          injury: g.ui.root.querySelector(".damage-vignette").style.opacity,
          water: g.ui.root.querySelector(".underwater-vignette").style.opacity,
        };
        g.ui.showMain([]);
        return {
          before,
          injury: g.ui.root.querySelector(".damage-vignette").style.opacity,
          water: g.ui.root.querySelector(".underwater-vignette").style.opacity,
        };
      });
      assert.ok(
        Number(result.before.injury) > 0 && Number(result.before.water) > 0,
      );
      assert.equal(result.injury, "0");
      assert.equal(result.water, "0");
      return result;
    },
  );
} finally {
  await fs.writeFile(
    "artifacts/features-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}
