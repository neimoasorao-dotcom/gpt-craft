import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { ITEMS } from "../src/data.js";
const prefix = process.env.GRAPHICS_PREFIX || "after";
const quality = process.env.GRAPHICS_QUALITY || "high";
await fs.mkdir("artifacts", { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.__game?.ui.screen === "main", null, {
    timeout: 60000,
  });
  await page.evaluate(async (quality) => {
    const g = window.__game;
    g.updateSettings({
      quality,
      renderDistance: 5,
      autoResolution: false,
      volume: 0,
    });
    await g.startWorld({
      name: "Graphics audit",
      seed: "wildbound",
      mode: "creative",
    });
    g.state = "pause";
    g.running = false;
    g.ui.hide();
    g.ui.hud.hidden = true;
    g.hand.group.visible = false;
    g.outline.visible = false;
    g.cracks.visible = false;
    g.ui.toastStack.replaceChildren();
  }, quality);
  const scenarios = [
    { name: "day", pos: [4, 62, 25], look: [18, 32, -35], time: 0.48 },
    { name: "sunset", pos: [4, 62, 25], look: [36, 35, -40], time: 0.73 },
    { name: "golden", pos: [35, 36, -15], look: [-40, 34, -55], time: 0.745 },
    { name: "water", pos: [8, 34.3, -5], look: [20, 31.8, -36], time: 0.43 },
    { name: "forest", pos: [-30, 65, -20], look: [-45, 50, -55], time: 0.4 },
    { name: "mountain", pos: [-12, 65, -62], look: [12, 63, -110], time: 0.42 },
    {
      name: "rain",
      pos: [8, 34.3, -5],
      look: [20, 31.8, -36],
      time: 0.43,
      rain: 1,
    },
    { name: "night", pos: [4, 62, 25], look: [18, 32, -35], time: 0.93 },
    {
      name: "underwater",
      pos: [17, 29, -25],
      look: [22, 29, -40],
      time: 0.43,
      underwater: true,
    },
  ];
  const cave = await page.evaluate(() => {
    const w = window.__game.world;
    for (let y = 24; y > 8; y -= 3)
      for (let z = -40; z < 40; z += 3)
        for (let x = -40; x < 40; x += 3) {
          let air = 0;
          for (let dz = -2; dz <= 2; dz++)
            for (let dx = -2; dx <= 2; dx++)
              if (
                w.getBlock(x + dx, y, z + dz) === 0 &&
                w.getBlock(x + dx, y + 1, z + dz) === 0
              )
                air++;
          if (air > 23) {
            for (const [dx, dz] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
              [0.707, 0.707],
              [-0.707, 0.707],
              [0.707, -0.707],
              [-0.707, -0.707],
            ]) {
              let reach = 0;
              for (let d = 1; d <= 12; d++) {
                if (w.getBlock(x + dx * d, y + 1, z + dz * d) !== 0) break;
                reach = d;
              }
              if (reach >= 9)
                return {
                  name: "cave",
                  pos: [x + 0.5, y + 1.4, z + 0.5],
                  look: [x + dx * 9, y + 1.2, z + dz * 9],
                  time: 0.43,
                };
            }
          }
        }
    return null;
  });
  if (cave) scenarios.push({ ...cave, lit: true });
  scenarios.push({
    name: "structure",
    pos: [7, 42, 12],
    look: [0, 39, 0],
    time: 0.71,
    structure: true,
  });
  for (const scene of scenarios.filter(
    (s) =>
      !process.env.GRAPHICS_SCENES ||
      process.env.GRAPHICS_SCENES.split(",").includes(s.name),
  )) {
    const info = await page.evaluate(async (s) => {
      const g = window.__game;
      g.world.ensureAround(s.pos[0], s.pos[2], 5);
      g.camera.position.set(...s.pos);
      if (!s.underwater && s.name !== "cave")
        g.camera.position.y = Math.max(
          g.camera.position.y,
          g.world.getHeight(s.pos[0], s.pos[2]) + 3,
        );
      g.player.position.copy(g.camera.position);
      g.camera.lookAt(...s.look);
      g.player.underwater = !!s.underwater;
      if (s.lit) {
        const [x, y, z] = s.pos.map(Math.floor),
          dx = s.look[0] - s.pos[0],
          dz = s.look[2] - s.pos[2],
          len = Math.hypot(dx, dz);
        const tx = Math.floor(x + (dx / len) * 3 - dz / len),
          tz = Math.floor(z + (dz / len) * 3 + dx / len);
        const cx = Math.floor(x + (dx / len) * 8 + dz / len),
          cz = Math.floor(z + (dz / len) * 8 - dx / len);
        g.world.setBlock(tx, y, tz, 16);
        g.world.setBlock(tx, y - 1, tz, 3);
        g.world.setBlock(cx, y - 1, cz, 30);
        for (const [bx, bz] of [
          [tx, tz],
          [cx, cz],
        ])
          g.world.buildSync(Math.floor(bx / 16), Math.floor(bz / 16));
      }
      if (s.structure) {
        const changed = new Set();
        for (let x = -3; x <= 3; x++)
          for (let z = -3; z <= 3; z++)
            for (let y = 36; y <= 42; y++) {
              let id = 0;
              if (y === 36) id = 3;
              else if (y === 42) id = 8;
              else if (x === -3 || x === 3 || z === -3 || z === 3)
                id = y === 39 && (Math.abs(x) === 3 || z === -3) ? 20 : 8;
              if (z === 3 && Math.abs(x) <= 0 && y < 40) id = 0;
              g.world.setBlock(x, y, z, id);
              changed.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
            }
        g.world.setBlock(1, 39, 2, 16);
        for (const key of changed)
          g.world.buildSync(...key.split(",").map(Number));
      }
      g.updateLights();
      g.atmosphere.weatherOverride = s.rain || 0;
      g.atmosphere.rainAmount = s.rain || 0;
      g.atmosphere.wetness = s.rain || 0;
      g.time = s.time * 1200;
      g.world.setTime(s.time);
      for (let i = 0; i < 20; i++)
        g.atmosphere.update(
          0.5,
          s.time,
          g.camera.position,
          g.settings,
          !!s.underwater,
          {
            world: g.world,
            cave: s.name === "cave" ? 1 : 0,
            biome: g.world.getBiome(s.pos[0], s.pos[2]),
          },
        );
      g.world.updateLighting?.(g.camera.position, []);
      g.renderer.shadowMap.needsUpdate = true;
      g.forceRender = true;
      const start = performance.now();
      if (g.renderScene) g.renderScene(0.016);
      else g.renderer.render(g.scene, g.camera);
      return {
        scenario: s,
        quality: g.settings.quality,
        renderMs: performance.now() - start,
        chunks: g.world.stats.chunks,
        triangles: g.renderer.info.render.triangles,
        calls: g.renderer.info.render.calls,
      };
    }, scene);
    await page.screenshot({ path: `artifacts/${prefix}-${scene.name}.png` });
    results.push(info);
    console.log("CAPTURE " + scene.name + " " + JSON.stringify(info));
  }
  await page.evaluate(() => window.__game.openInventory());
  await page.screenshot({ path: `artifacts/${prefix}-inventory.png` });
  if (process.env.GRAPHICS_SMOKE !== "0") {
    await page.setViewportSize({ width: 640, height: 400 });
    await page.evaluate(() => {
      const g = window.__game;
      g.ui.hide();
      g.ui.hud.hidden = true;
      g.camera.position.set(8, 34.3, -5);
      g.player.position.copy(g.camera.position);
      g.player.underwater = false;
      g.camera.lookAt(20, 31.8, -36);
      g.atmosphere.weatherOverride = 0;
      g.atmosphere.rainAmount = 0;
      g.atmosphere.wetness = 0;
      g.atmosphere.update(1, 0.43, g.camera.position, g.settings, false, {
        world: g.world,
        cave: 0,
      });
    });
    for (const quality of ["low", "medium", "high", "ultra", "cinematic"]) {
      const timing = await page.evaluate((quality) => {
        const g = window.__game;
        g.updateSettings({ quality, autoResolution: false });
        g.camera.aspect = 640 / 400;
        g.camera.updateProjectionMatrix();
        g.renderer.setSize(640, 400);
        const gl = g.renderer.getContext(),
          ext = gl.getExtension("WEBGL_debug_renderer_info");
        g.renderScene(0.016);
        gl.finish();
        const pixel = new Uint8Array(4);
        gl.readPixels(320, 200, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const samples = [];
        for (let i = 0; i < 3; i++) {
          g.camera.position.x += 0.01;
          const start = performance.now();
          g.renderScene(0.016);
          gl.finish();
          gl.readPixels(320, 200, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          samples.push(performance.now() - start);
        }
        return {
          quality,
          width: g.canvas.width,
          height: g.canvas.height,
          renderer: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          frameMs: samples,
          medianMs: [...samples].sort((a, b) => a - b)[1],
          centerPixel: [...pixel],
          post: !!g.sceneRenderer.color,
          targetType: g.sceneRenderer.type,
        };
      }, quality);
      assert.equal(
        timing.centerPixel[3],
        255,
        quality + " outputs an opaque frame",
      );
      assert.ok(
        timing.centerPixel.slice(0, 3).some((v) => v > 0),
        quality + " output is not black",
      );
      results.push({ presetSmoke: timing });
      console.log("PRESET " + JSON.stringify(timing));
      await page.screenshot({
        path: `artifacts/${prefix}-quality-${quality}.png`,
      });
    }
  }
  if (process.env.GRAPHICS_SMOKE !== "0") {
    const fallback = await page.evaluate(() => {
      const g = window.__game,
        s = g.sceneRenderer;
      g.updateSettings({ quality: "high", autoResolution: false });
      g.renderScene(0.016);
      const initial = !!s.color;
      g.updateSettings({ quality: "low" });
      g.renderScene(0.016);
      const released = !s.color && !s.opaque && !s.bloomA && !s.bloomB;
      g.updateSettings({ quality: "high" });
      g.renderScene(0.016);
      const rebuilt = !!s.color;
      const originalType = s.type;
      s.disposeTargets();
      s.signature = null;
      s.type = 1009;
      s.disabled = false;
      g.renderScene(0.016);
      const rgba8 = s.color?.texture.type === 1009 && !s.disabled;
      s.disabled = true;
      g.renderScene(0.016);
      const direct = !s.color && !s.opaque && !s.bloomA && !s.bloomB;
      s.disabled = false;
      s.type = originalType;
      s.signature = null;
      g.renderScene(0.016);
      return { initial, released, rebuilt, rgba8, direct, restored: !!s.color };
    });
    for (const [name, value] of Object.entries(fallback))
      assert.equal(value, true, name + " graphics fallback");
    results.push({ fallback });
    console.log("PASS fallback " + JSON.stringify(fallback));
    // rAF wall-clock intervals include actual browser composition; software driver only.
    for (const quality of ["low", "high"]) {
      const raf = await page.evaluate(async (quality) => {
        const g = window.__game;
        g.updateSettings({ quality, autoResolution: false });
        let last = performance.now();
        const samples = [];
        for (let i = 0; i < 5; i++) {
          await new Promise(requestAnimationFrame);
          g.camera.position.x += 0.02;
          g.renderScene(0.016);
          const now = performance.now();
          samples.push(now - last);
          last = now;
        }
        return {
          quality,
          rafMs: samples,
          averageMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        };
      }, quality);
      results.push({ compositionTiming: raf });
      console.log("RAF " + JSON.stringify(raf));
    }
    for (const id of [
      "iron_pickaxe",
      "iron_axe",
      "iron_shovel",
      "iron_sword",
      "iron_hoe",
      "planks",
      null,
    ]) {
      await page.evaluate(
        (item) => {
          const g = window.__game;
          g.hand.group.visible = true;
          g.hand.update(0.1, item, false);
          g.renderScene(0.016);
        },
        id ? ITEMS[id] : null,
      );
      await page.screenshot({
        path: `artifacts/${prefix}-hand-${id || "empty"}.png`,
      });
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS graphics shaders and scenarios " + results.length);
} finally {
  await fs.writeFile(
    `artifacts/${prefix}-graphics-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
}
