import * as THREE from "three";
import { hash, noise2 } from "./worldgen.js";

const palette = [
  "#000000",
  "#81a956",
  "#92705a",
  "#8b9298",
  "#dbca92",
  "#64b9b5",
  "#846143",
  "#708f59",
  "#b99462",
  "#848b86",
  "#687477",
  "#9b9c8e",
  "#9ba2a4",
  "#5d8798",
  "#e4e9df",
  "#ad795f",
  "#e9ad55",
  "#ae8957",
  "#7e8586",
  "#ab7359",
  "#b4ded9",
  "#c2a9cd",
  "#76a85b",
  "#454c54",
  "#505b66",
  "#c79b50",
  "#a5bab0",
  "#6d915a",
  "#b88e5b",
  "#ac7770",
  "#e5bd70",
  "#403e55",
  "#7edbd4",
  "#795d48",
  "#9db95e",
  "#8b9b88",
  "#90e1d6",
  "#8b7954",
  "#9b7850",
  "#bc9a67",
  "#777e7c",
];
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
export function atlasTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    image = ctx.createImageData(256, 256);
  for (let id = 1; id < 64; id++) {
    const base = rgb(palette[id] || "#b0aaa0");
    for (let py = 0; py < 32; py++)
      for (let px = 0; px < 32; px++) {
        const x = Math.floor(px / 2),
          y = Math.floor(py / 2);
        const r = hash(px, py, id, 98123),
          r2 = hash(x >> 1, y >> 1, id, 715);
        let shade = 0.91 + r * 0.16 + (r2 - 0.5) * 0.12,
          color = base,
          alpha = 255;
        // Independent grain families retain voxel readability without the same
        // white noise stamped onto every surface.
        if ([3, 23, 24, 31].includes(id)) {
          const strata = Math.sin(py * 0.44 + Math.sin(px * 0.19) * 1.7);
          const vein = Math.abs(
            Math.sin(px * 0.19 + py * 0.07 + Math.sin(py * 0.3) * 0.5),
          );
          shade *=
            0.96 +
            strata * 0.065 +
            noise2(px * 0.15, py * 0.15, id * 323) * 0.1;
          if (vein < 0.055) shade *= 0.74;
          if (r > 0.98) shade *= 1.17;
        }
        if (id === 4)
          shade *= 1.0 + Math.sin(py * 0.65 + Math.sin(px * 0.25)) * 0.035;
        if (id === 2 || id === 33) {
          shade *= 0.93 + noise2(px * 0.25, py * 0.25, 294) * 0.11;
          if (r > 0.96) {
            color = rgb("#bfa280");
            shade *= 0.9;
          }
        }
        if (id === 1) {
          shade *= 1.0 + noise2(px * 0.2, py * 0.2, 512) * 0.12;
          if (r > 0.975) {
            color = rgb("#b6b679");
            shade *= 0.95;
          }
        }
        if (id === 14) shade *= 1.04 + Math.sin(px * 0.3 + py * 0.16) * 0.045;
        if (id === 6 || id === 27) {
          const grain = Math.sin(px * 1.18 + Math.sin(py * 0.22) * 0.65);
          shade *= 0.98 + grain * 0.1;
        }
        if (id === 0) alpha = 0;
        if ([6, 27].includes(id)) shade *= x % 4 === 0 ? 0.72 : 1.05;
        if (id === 38)
          shade *=
            Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) % 3 < 1 ? 0.72 : 1;
        if ([8, 17, 28, 39].includes(id)) {
          if (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0)
            shade *= 0.68;
          if (y % 4 === 1) shade *= 1.12;
        }
        if ([9, 19, 35].includes(id)) {
          const row = Math.floor(y / 5);
          if (y % 5 === 0 || (x + row * 5) % 9 === 0) shade *= 0.71;
        }
        if (id === 37) {
          const grassEdge = 4 + Math.floor(hash(x >> 1, 0, 0, 12) * 4);
          color = y < grassEdge ? rgb("#739d53") : rgb("#92705a");
        }
        if ([7, 25, 26].includes(id)) {
          const row = Math.floor(py / 8);
          const lx = (((px + (row % 2) * 4) % 8) - 3.5) / 4;
          const ly = ((py % 8) - 3.5) / 4;
          const leaf = Math.abs(lx) * 0.55 + Math.abs(ly) * 0.45;
          if (leaf > 0.76 && r < 0.8) alpha = 0;
          shade *= 0.91 + (1 - Math.abs(lx)) * 0.15 + (ly < 0 ? 0.035 : -0.02);
          if (Math.abs(lx) < 0.2) shade *= 1.055;
        }
        if ([10, 11, 12, 13].includes(id)) {
          const ore =
            id === 10
              ? "#3f484b"
              : id === 11
                ? "#d6a070"
                : id === 12
                  ? "#d7cec0"
                  : "#8edfd5";
          if (r2 > 0.62 && r > 0.25) {
            color = rgb(ore);
            shade = 0.88 + r * 0.2;
          }
        }
        if (id === 20) {
          alpha =
            x < 1 || x > 14 || y < 1 || y > 14 || (x + y > 12 && x + y < 15)
              ? 210
              : 0;
        }
        if (id === 5) {
          if ((x + y * 2) % 11 === 0) shade *= 1.16;
        }
        if ([21, 22, 34, 16, 30, 36].includes(id)) {
          alpha = 0;
          if (id === 22) {
            if (
              ((x === 7 || x === 8) && y > 5) ||
              ((x === 5 || x === 10) && y > 2) ||
              ((x === 3 || x === 12) && y > 8) ||
              (y > 11 && Math.abs(x - 7.5) < 4)
            )
              alpha = 255;
          } else if (id === 21 || id === 34) {
            if (
              (y > 7 && x >= 7 && x <= 8) ||
              (y > 10 && (x === 5 || x === 10))
            ) {
              alpha = 255;
              color = rgb("#668d43");
            }
            if (
              Math.abs(x - 7.5) + Math.abs(y - 5.5) < 4 ||
              (y > 3 && y < 8 && x > 4 && x < 11)
            ) {
              alpha = 255;
              color = rgb(id === 34 ? "#e3ca75" : "#dfbfdf");
            }
            if (Math.abs(x - 7.5) < 1.5 && Math.abs(y - 5.5) < 1.5)
              color = rgb("#efce7e");
          } else if (id === 16) {
            if (x > 6 && x < 10 && y > 6) {
              alpha = 255;
              color = rgb("#946b44");
            }
            if (
              x > 5 &&
              x < 11 &&
              y > 1 &&
              y < 9 &&
              Math.abs(x - 8) < (y < 4 ? 1.5 : 3)
            ) {
              alpha = 255;
              color = rgb(y < 6 ? "#ffeab2" : "#efad60");
            }
          } else if (id === 30) {
            if (x >= 4 && x <= 11 && y >= 4 && y <= 13) {
              alpha = 255;
              color = rgb(
                x === 4 || x === 11 || y === 4 || y === 13
                  ? "#585750"
                  : "#f8d78c",
              );
            }
            if (x >= 6 && x <= 9 && y > 0 && y < 5) {
              alpha = 255;
              color = rgb("#585750");
            }
          } else {
            if (
              (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 6 &&
                Math.abs(x - 7.5) + Math.abs(y - 7.5) > 3) ||
              (Math.abs(x - 7.5) < 1 && Math.abs(y - 7.5) < 1)
            ) {
              alpha = 255;
              color = rgb("#b8fff1");
            }
          }
        }
        if (id === 18 || id === 40) {
          if (y % 5 === 0 || x % 7 === 0) shade *= 0.8;
          if (id === 40 && x > 3 && x < 12 && y > 5 && y < 13) {
            color = rgb(y > 9 ? "#e2a86b" : "#454b4d");
            shade = 1;
          }
        }
        if (id === 28 && (y === 7 || x === 1 || x === 14)) {
          color = rgb("#65634e");
          shade = 1;
        }
        if (id === 28 && x > 6 && x < 10 && y > 6 && y < 10) {
          color = rgb("#e7ca81");
          shade = 1;
        }
        if (id === 32) {
          color = rgb(r2 > 0.45 ? "#8cdace" : "#6fae9c");
          if ((x + y) % 7 === 0) shade = 1.35;
        }
        const pixel =
          ((Math.floor(id / 8) * 32 + py) * 256 + (id % 8) * 32 + px) * 4;
        for (let ch = 0; ch < 3; ch++)
          image.data[pixel + ch] = Math.min(255, color[ch] * shade);
        image.data[pixel + 3] = alpha;
      }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
