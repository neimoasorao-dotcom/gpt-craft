import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const samples = [];
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "wildbound:settings:v1",
      JSON.stringify({
        quality: "low",
        renderDistance: 3,
        headBob: false,
        fov: 82,
        autoResolution: false,
      }),
    ),
  );
  await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
  await page.waitForFunction(() => window.__game?.ui?.screen === "main");
  await page.evaluate(() =>
    window.__game.startWorld({ seed: "qa-sunrise-42" }),
  );
  await page.waitForFunction(
    () => window.__game.world.stats.queued === 0,
    null,
    { timeout: 30000 },
  );
  for (const autoResolution of [false, true])
    for (const quality of ["low", "high"]) {
      await page.evaluate(
        (settings) => window.__game.updateSettings(settings),
        { quality, autoResolution },
      );
      await page.waitForTimeout(autoResolution ? 11000 : 1000);
      const sample = await page.evaluate(async () => {
        const g = window.__game,
          times = [];
        let previous = performance.now(),
          end = previous + 3000;
        await new Promise((resolve) => {
          function frame(now) {
            times.push(now - previous);
            previous = now;
            if (now < end) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        times.sort((a, b) => a - b);
        const gl = g.renderer.getContext(),
          extension = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          renderer: extension
            ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
            : "WebGL2",
          fps: (1000 * times.length) / times.reduce((a, b) => a + b, 0),
          frames: times.length,
          medianMs: times[Math.floor(times.length / 2)],
          p95Ms: times[Math.floor(times.length * 0.95)],
          quality: g.settings.quality,
          autoResolution: g.settings.autoResolution,
          scale: g.performance.scale,
          canvas: [g.canvas.width, g.canvas.height],
          chunks: g.world.stats.chunks,
          drawCalls: g.renderer.info.render.calls,
          triangles: g.renderer.info.render.triangles,
          entities: g.entities.count,
          memory: performance.memory?.usedJSHeapSize,
        };
      });
      samples.push(sample);
      console.log(JSON.stringify(sample));
    }
} finally {
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(
    "artifacts/performance-final.json",
    JSON.stringify(samples, null, 2),
  );
  await browser.close();
}
