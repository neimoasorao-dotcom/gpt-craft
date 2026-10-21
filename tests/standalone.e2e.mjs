import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isolated = await fs.mkdtemp(
  path.join(os.tmpdir(), "wildbound-single-file-"),
);
const standalone = path.join(isolated, "WILDBOUND.html");
await fs.copyFile(path.join(root, "release/WILDBOUND.html"), standalone);
assert.deepEqual(await fs.readdir(isolated), ["WILDBOUND.html"]);
const server = createServer(async (req, res) => {
  if (req.url !== "/WILDBOUND.html") {
    res.writeHead(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(await fs.readFile(standalone));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const target =
  process.env.STANDALONE_FILE === "1"
    ? pathToFileURL(standalone).href
    : `${origin}/WILDBOUND.html`;
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
  acceptDownloads: true,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const errors = [],
  network = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  if (/^https?:/.test(r.url()) && r.url() !== target) network.push(r.url());
});
const check = async (name, fn) => {
  const detail = await fn();
  results.push({ name, passed: true, detail });
  console.log("PASS " + name + " " + JSON.stringify(detail));
};
try {
  await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
  await check("isolated HTML boots without any companion files", async () => {
    await page.goto(target, { waitUntil: "load" });
    await page.waitForFunction(
      () => window.__game?.ui.screen === "main",
      null,
      { timeout: 45000 },
    );
    await context.setOffline(true);
    await page.screenshot({
      path: path.join(root, "artifacts/standalone-menu.png"),
    });
    return { url: page.url(), files: await fs.readdir(isolated) };
  });
  await check(
    "embedded Blob workers generate streaming chunks without external scripts",
    async () => {
      await page.waitForFunction(
        () => window.__game.world.stats.queued === 0,
        null,
        { timeout: 45000 },
      );
      const r = await page.evaluate(() => {
        const g = window.__game;
        return {
          workerURL: globalThis.__WILDBOUND_WORKER_URL__.slice(0, 5),
          workers: g.world.workers.length,
          failed: g.world.workers.filter((w) => w.failed).length,
          chunks: g.world.stats.chunks,
        };
      });
      assert.equal(r.workerURL, "blob:");
      assert.ok(r.workers > 0);
      assert.equal(r.failed, 0);
      assert.ok(r.chunks > 49);
      return r;
    },
  );
  await check(
    "new world, pointer lock and keyboard movement work offline",
    async () => {
      await page.locator('[data-action="new"]').click();
      await page.locator('input[name="name"]').fill("単一HTMLテスト");
      await page.locator('input[name="seed"]').fill("standalone-offline-42");
      await page.locator('[data-testid="create-world"]').click();
      await page.waitForFunction(
        () => window.__game.state === "playing",
        null,
        { timeout: 45000 },
      );
      await page
        .locator("#game-canvas")
        .click({ position: { x: 640, y: 400 } });
      await page.waitForFunction(() => window.__game.locked);
      const before = await page.evaluate(() =>
        window.__game.player.position.toArray(),
      );
      await page.keyboard.down("w");
      await page.waitForFunction((p) => {
        const v = window.__game.player.position;
        return Math.hypot(v.x - p[0], v.z - p[2]) > 0.45;
      }, before);
      await page.keyboard.up("w");
      await page.keyboard.press("e");
      await page.waitForFunction(() => window.__game.state === "inventory");
      return {
        seed: await page.evaluate(() => window.__game.seed),
        moved: true,
      };
    },
  );
  await check(
    "crafting UI remains functional in the self-contained bundle",
    async () => {
      await page.evaluate(() => {
        const g = window.__game;
        g.inventory.add("wood", 2);
        g.refreshInventory();
      });
      await page.locator('[data-recipe="planks"]').click();
      await page.locator('[data-action="craft"]').click();
      const r = await page.evaluate(() => ({
        wood: window.__game.inventory.count("wood"),
        planks: window.__game.inventory.count("planks"),
      }));
      assert.equal(r.wood, 1);
      assert.equal(r.planks, 4);
      return r;
    },
  );
  let saved;
  await check(
    "standalone world edits and inventory are saved persistently",
    async () => {
      saved = await page.evaluate(async () => {
        const g = window.__game;
        g.world.setBlock(-16, 60, -1, 19);
        g.player.health = 72;
        g.player.hunger = 64;
        await g.save();
        return { id: g.id, backend: g.store.backend, seed: g.seed };
      });
      assert.notEqual(saved.backend, "memory");
      return saved;
    },
  );
  await check("reload restores the saved standalone world", async () => {
    await context.setOffline(false);
    await page.reload({ waitUntil: "load" });
    await context.setOffline(true);
    await page.waitForFunction(
      () => window.__game?.ui.screen === "main",
      null,
      { timeout: 45000 },
    );
    await page.locator(`[data-action="load"][data-id="${saved.id}"]`).click();
    await page.waitForFunction(() => window.__game.state === "playing", null, {
      timeout: 45000,
    });
    const r = await page.evaluate(() => {
      const g = window.__game;
      return {
        seed: g.seed,
        block: g.world.getBlock(-16, 60, -1),
        planks: g.inventory.count("planks"),
        health: g.player.health,
      };
    });
    assert.equal(r.seed, saved.seed);
    assert.equal(r.block, 19);
    assert.equal(r.planks, 4);
    assert.equal(r.health, 72);
    await page.screenshot({
      path: path.join(root, "artifacts/standalone-game.png"),
    });
    return r;
  });
  await check("JSON backup downloads from the standalone file", async () => {
    await page.evaluate(() => window.__game.saveAndQuit());
    await page.waitForFunction(() => window.__game.ui.screen === "main");
    const downloading = page.waitForEvent("download");
    await page.locator(`[data-action="export"][data-id="${saved.id}"]`).click();
    const download = await downloading;
    const destination = path.join(root, "artifacts/standalone-backup.json");
    await download.saveAs(destination);
    const json = JSON.parse(await fs.readFile(destination, "utf8"));
    assert.equal(json.format, "wildbound");
    assert.equal(json.world.edits["-16,60,-1"], 19);
    return { format: json.format, seed: json.world.seed };
  });
  await check(
    "zero external network requests and zero fatal errors",
    async () => {
      assert.deepEqual(network, []);
      assert.deepEqual(errors, []);
      return { networkRequests: network.length, errors };
    },
  );
} finally {
  await fs.writeFile(
    path.join(root, "artifacts/standalone-results.json"),
    JSON.stringify({ results, errors, network }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(isolated, { recursive: true, force: true });
}
