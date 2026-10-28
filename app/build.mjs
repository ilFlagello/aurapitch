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

for (const f of ["index.html", "manifest.webmanifest", "sw.js", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "accesso.html", "accesso-pagina.js"]) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
// pagine pubbliche di privacy e termini (stesso testo dell'app, da src/legale.js): servono anche a Google per la schermata di accesso
{
  const tmp = path.join((await import("node:os")).tmpdir(), "aurapitch-legale-" + process.pid + ".mjs");
  fs.copyFileSync(path.join(ROOT, "src", "legale.js"), tmp); // .mjs: modulo ES senza avvisi di Node
  const L = await import("file://" + tmp);
  fs.rmSync(tmp, { force: true });
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pagina = (titolo, sez) => `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'"><meta name="referrer" content="no-referrer">
<title>AuraPitch - ${titolo}</title><style>body{margin:0;background:#EFEEF5;color:#17152B;font:16px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}h1{font-size:30px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:18px;margin:28px 0 6px}p{color:#3d3a52;margin:0 0 10px}
.v{color:#5F5B76;font-size:14px}a{color:#5B2EE6}@media(prefers-color-scheme:dark){body{background:#0E0C18;color:#F4F2FF}p{color:#c9c5dd}.v{color:#9A95B3}a{color:#A58BFF}}</style>
<main><p class="v"><a href="./">AuraPitch</a></p><h1>${titolo}</h1><p class="v">Versione ${L.VERSIONE}, aggiornata il ${L.AGGIORNATA}</p>
${sez.map(([t, ps]) => `<h2>${esc(t)}</h2>` + ps.map((x) => `<p>${esc(x)}</p>`).join("")).join("\n")}</main></html>`;
  fs.writeFileSync(path.join(OUT, "privacy.html"), pagina("Privacy", L.privacy()));
  fs.writeFileSync(path.join(OUT, "termini.html"), pagina("Termini d'uso", L.termini()));
}
fs.mkdirSync(path.join(OUT, "avvisi"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "avvisi"))) fs.copyFileSync(path.join(ROOT, "avvisi", f), path.join(OUT, "avvisi", f));
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "fonts"))) fs.copyFileSync(path.join(ROOT, "fonts", f), path.join(OUT, "fonts", f));
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.cpSync(path.join(ROOT, "data"), path.join(OUT, "data"), { recursive: true });
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB";
console.log("Fatto: app.js", kb("app.js"), "- app.css", kb("app.css"), "- dati", fs.existsSync(path.join(OUT, "data/lista.json")) ? kb("data/lista.json") + " (lista)" : kb("data/giornata.json"));
