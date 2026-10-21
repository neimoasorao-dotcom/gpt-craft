import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shared = {
  absWorkingDir: root,
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "inline",
  logLevel: "warning",
};
const worker = await build({
  ...shared,
  entryPoints: ["src/world-worker.js"],
  outfile: "worker.js",
});
const workerCode = worker.outputFiles.find((file) =>
  file.path.endsWith(".js"),
).text;
const inlineWorker = {
  name: "standalone-worker",
  setup(builder) {
    builder.onLoad({ filter: /[/\\]src[/\\]world\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const expression =
        /new Worker\(\s*new URL\(\s*["']\.\/world-worker\.js["']\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*["']module["']\s*,?\s*\}\s*,?\s*\)/g;
      let replacements = 0;
      const contents = source.replace(expression, () => {
        replacements++;
        return "new Worker(globalThis.__WILDBOUND_WORKER_URL__)";
      });
      if (replacements !== 1)
        throw new Error(
          `Expected exactly one terrain worker, found ${replacements}.`,
        );
      return { contents, loader: "js", resolveDir: dirname(args.path) };
    });
  },
};
const app = await build({
  ...shared,
  entryPoints: ["src/main.js"],
  outfile: "standalone.js",
  plugins: [inlineWorker],
});
const js = app.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = app.outputFiles.find((file) => file.path.endsWith(".css")).text;
const favicon = Buffer.from(
  await readFile(resolve(root, "public/favicon.svg")),
).toString("base64");
const workerBootstrap = `globalThis.__WILDBOUND_WORKER_URL__=URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}],{type:'text/javascript'}));\n`;
// Escape raw HTML terminators even inside JS string literals and comments.
const script = (workerBootstrap + js).replace(/<\/script/gi, "<\\/script");
const html = (await readFile(resolve(root, "index.html"), "utf8"))
  .replace(
    /href="\/favicon\.svg"/,
    `href="data:image/svg+xml;base64,${favicon}"`,
  )
  .replace("</head>", () => `<style>${css}</style>\n</head>`)
  .replace(
    /<script\s+type="module"\s+src="\/src\/main\.js"><\/script>/,
    () => `<script>${script}</script>`,
  );
if (
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:\/src\/|\/assets\/|https?:)/i.test(
    html,
  )
)
  throw new Error("Standalone HTML still references an external asset.");
const destination = resolve(root, "release/WILDBOUND.html");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, html);
console.log(
  `Created ${destination} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB); JS, CSS, Three.js, terrain worker and favicon are embedded.`,
);
