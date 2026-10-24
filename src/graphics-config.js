/** Shared effect budgets. Draw distance remains an independent player setting. */
const preset = (label, description, values) =>
  Object.freeze({ label, description, ...values });

export const GRAPHICS_PRESETS = Object.freeze({
  low: preset("低 · 軽さ優先", "影と画面効果を省き、軽快な描画を優先します。", {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowDistance: 28,
    postProcessing: false,
    bloomStrength: 0,
    bloomRadius: 0,
    aoStrength: 0,
    refractionScale: 0,
    samples: 0,
    particles: 32,
    cloudSteps: 2,
    waterQuality: 0,
  }),
  medium: preset("標準", "画面効果を抑え、自然な光と影を楽しめます。", {
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 34,
    postProcessing: false,
    bloomStrength: 0,
    bloomRadius: 0,
    aoStrength: 0,
    refractionScale: 0,
    samples: 0,
    particles: 64,
    cloudSteps: 3,
    waterQuality: 1,
  }),
  high: preset("高 · 美しさ優先", "柔らかな影、水の屈折、繊細な光の広がり。", {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 44,
    postProcessing: true,
    bloomStrength: 0.12,
    bloomRadius: 0.6,
    aoStrength: 0.35,
    refractionScale: 0.5,
    samples: 0,
    particles: 120,
    cloudSteps: 4,
    waterQuality: 2,
  }),
  ultra: preset("Ultra", "高精細な影と水面、滑らかな輪郭。高性能PC向け。", {
    maxPixelRatio: 1.75,
    shadows: true,
    shadowMapSize: 3072,
    shadowDistance: 60,
    postProcessing: true,
    bloomStrength: 0.16,
    bloomRadius: 0.75,
    aoStrength: 0.5,
    refractionScale: 0.75,
    samples: 2,
    particles: 200,
    cloudSteps: 5,
    waterQuality: 3,
  }),
  cinematic: preset(
    "Cinematic · 最高画質",
    "映像品質を最優先。高性能PCでの撮影向け。",
    {
      maxPixelRatio: 2,
      shadows: true,
      shadowMapSize: 4096,
      shadowDistance: 76,
      postProcessing: true,
      bloomStrength: 0.19,
      bloomRadius: 0.85,
      aoStrength: 0.6,
      refractionScale: 1,
      samples: 4,
      particles: 320,
      cloudSteps: 6,
      waterQuality: 3,
    },
  ),
});

export function getGraphicsPreset(quality = "high") {
  return Object.hasOwn(GRAPHICS_PRESETS, quality)
    ? GRAPHICS_PRESETS[quality]
    : GRAPHICS_PRESETS.high;
}
