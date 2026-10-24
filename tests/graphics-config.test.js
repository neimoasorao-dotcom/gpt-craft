import test from "node:test";
import assert from "node:assert/strict";
import { GRAPHICS_PRESETS, getGraphicsPreset } from "../src/graphics-config.js";
import { saveSettings, loadSettings } from "../src/save.js";

test("new quality presets and longer draw distances survive settings persistence", () => {
  for (const quality of ["ultra", "cinematic"]) {
    const saved = saveSettings({ quality, renderDistance: 12 });
    assert.equal(saved.quality, quality);
    assert.equal(saved.renderDistance, 12);
    assert.deepEqual(loadSettings(), saved);
  }
  assert.equal(saveSettings({ graphics: "medium" }).quality, "medium");
  assert.equal(saveSettings({ quality: "__proto__" }).quality, "high");
  assert.equal(saveSettings({ quality: "constructor" }).quality, "high");
  assert.equal(saveSettings({ renderDistance: 1e6 }).renderDistance, 12);
  assert.equal(saveSettings({ renderDistance: -100 }).renderDistance, 2);
  saveSettings(null);
});

test("effect budgets preserve a cheap fallback and bound maximum GPU allocations", () => {
  const low = getGraphicsPreset("low"),
    medium = getGraphicsPreset("medium");
  assert.equal(low.shadows, false);
  assert.equal(low.postProcessing, false);
  assert.equal(low.refractionScale, 0);
  assert.equal(medium.postProcessing, false);
  assert.equal(medium.refractionScale, 0);
  assert.equal(getGraphicsPreset("invalid"), GRAPHICS_PRESETS.high);
  assert.equal(getGraphicsPreset("__proto__"), GRAPHICS_PRESETS.high);
  let previous = 0;
  for (const p of Object.values(GRAPHICS_PRESETS)) {
    assert.ok(p.shadowMapSize <= 4096 && p.maxPixelRatio <= 2);
    assert.ok(p.refractionScale >= previous && p.refractionScale <= 1);
    assert.ok(p.samples >= 0 && p.samples <= 4);
    assert.ok(Object.isFrozen(p));
    previous = p.refractionScale;
  }
});
