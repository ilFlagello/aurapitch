// AuraPitch beta - compilazione: node build.mjs
// 1) esbuild unisce React, htm, icone Lucide e il codice dell'app in dist/app.js
// 2) Tailwind v4 genera solo le classi usate in dist/app.css
// 3) copia pagina, manifest, service worker, icone e dati in dist/
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const MODS = process.env.AP_NODE_MODULES || path.join(ROOT, "node_modules");
const require = createRequire(path.join(MODS, "noop.js"));
const esbuild = require("esbuild");
const OUT = path.join(ROOT, "dist");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(ROOT, "src/app.js")],
  bundle: true, minify: true, format: "iife", target: ["es2020"],
  outfile: path.join(OUT, "app.js"), nodePaths: [MODS], define: { "process.env.NODE_ENV": '"production"' },
  alias: { htm: path.join(ROOT, "vendor/htm/index.mjs") }, legalComments: "none", logLevel: "warning", charset: "ascii",
});

const twDir = path.dirname(require.resolve("tailwindcss/package.json"));
const { compile } = await import(path.join(twDir, "dist/lib.mjs"));
const input = `@import "tailwindcss";\n@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));\n`;
const compiler = await compile(input, {
  base: ROOT,
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? path.join(twDir, "index.css") : path.resolve(base, id.endsWith(".css") ? id : id + ".css");
    const real = id.startsWith("tailwindcss/") ? path.join(twDir, id.slice("tailwindcss/".length)) : p;
    return { path: real, base: path.dirname(real), content: fs.readFileSync(real, "utf8") };
  },
  loadModule: async () => { throw new Error("nessun plugin"); },
});
// le classi Tailwind si cercano in tutti i file dell'app (src/*.js)
const src = fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
const candidates = [...new Set(src.split(/[\s"'`{}()<>;,=+]+/).filter((t) => t && t.length < 120))];
const css = compiler.build(candidates);
const min = await esbuild.transform(css, { loader: "css", minify: true });
fs.writeFileSync(path.join(OUT, "app.css"), min.code);

for (const f of ["index.html", "manifest.webmanifest", "sw.js", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"]) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "fonts"))) fs.copyFileSync(path.join(ROOT, "fonts", f), path.join(OUT, "fonts", f));
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.cpSync(path.join(ROOT, "data"), path.join(OUT, "data"), { recursive: true });
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB";
console.log("Fatto: app.js", kb("app.js"), "- app.css", kb("app.css"), "- dati", fs.existsSync(path.join(OUT, "data/lista.json")) ? kb("data/lista.json") + " (lista)" : kb("data/giornata.json"));
