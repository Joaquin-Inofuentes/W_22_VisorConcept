// cf/build.mjs -- arma el Worker de Cloudflare de ESTE repo.
//   node cf/build.mjs            (Workers Builds: "Build command")
//   npx wrangler deploy -c cf/wrangler.jsonc   (Workers Builds: "Deploy command")
// Lee cf/rutas.json y ../api/*.js; escribe cf/.dist/{public,worker.js}. Sólo Node (corre en Linux y en Windows).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CF = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(CF, "config.json"), "utf8")); // { slug, servicios: [...], bucket?, raiz?, instalar?, subirGrandes? }
const REPO = resolve(CF, "..", cfg.raiz || "."); // raiz: subcarpeta de la app
const DIST = join(CF, ".dist");
const PUB = join(DIST, "public");
const vj = existsSync(join(CF, "rutas.json")) ? JSON.parse(readFileSync(join(CF, "rutas.json"), "utf8")) : {}; // { cleanUrls, headers, redirects, rewrites, buildCommand, outputDirectory }
const avisos = [];
const J = (x) => JSON.stringify(x);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(PUB, { recursive: true });

// ---------- 1. sitio estático (build propio del repo si lo tiene) ----------
const EXCLUIR = new Set(["node_modules", ".git", "0_MAPA_IA~", "api", "tests", "tests-e2e", "_WORKTREES", ".next", "test-results", "playwright-report", "cf", ".wrangler", "docs"]);
const EXCLUIR_ARCH = /^(\.env.*|desktop\.ini|\.carpeta\.ico|\.gitignore|package-lock\.json)$/;
const copiar = (de, a, excluir = EXCLUIR) => {
  mkdirSync(a, { recursive: true });
  for (const e of readdirSync(de, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!excluir.has(e.name)) copiar(join(de, e.name), join(a, e.name), excluir); }
    else if (!EXCLUIR_ARCH.test(e.name)) cpSync(join(de, e.name), join(a, e.name));
  }
};
const sub = vj.outputDirectory && vj.outputDirectory !== "." ? vj.outputDirectory : "";
const entorno = { ...process.env };
if (cfg.instalar && !existsSync(join(REPO, "node_modules"))) { const i = spawnSync(cfg.instalar, { cwd: REPO, shell: true, stdio: "inherit" }); if (i.status !== 0) { console.error("instalar fallo"); process.exit(1); } }
if (vj.buildCommand) {
  const bb = spawnSync(vj.buildCommand, { cwd: REPO, shell: true, stdio: "inherit", env: entorno });
  if (bb.status !== 0) { console.error("buildCommand fallo:", vj.buildCommand); process.exit(1); }
}
copiar(join(REPO, sub), PUB, sub ? new Set([...EXCLUIR].filter((x) => x !== "docs")) : EXCLUIR);

// commit.json: sha + fecha ISO del commit desplegado. Lo lee el Portal para el
// título de la barra ("Nombre · dd/mm/aaaa hh:mm"). Sin git (o sin .git) no se escribe.
try {
  const g = (a) => spawnSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).stdout.trim();
  const sha = process.env.WORKERS_CI_COMMIT_SHA || g(["rev-parse", "HEAD"]);
  const fecha = g(["log", "-1", "--format=%cI"]);
  if (sha || fecha) writeFileSync(join(PUB, "commit.json"), JSON.stringify({ sha, fecha }));
} catch {}

// ---------- 2. cf/rutas.json -> _headers / _redirects / reglas del Worker ----------
function expandir(p) {
  p = p.replace(/\\\./g, ".").replace(/\\-/g, "-");
  if (p.includes("(?")) return null;
  p = p.replace(/:([a-zA-Z]+)\*/g, "*").replace(/\(\.\*([^()]*)\)/g, "*$1");
  const alt = p.match(/\(([^()]*)\)(\?)?/);
  if (!alt) return [p];
  const opciones = alt[1].split("|");
  if (alt[2]) opciones.push("");
  const out = [];
  for (const o of opciones) { const v = expandir(p.replace(alt[0], () => o)); if (!v) return null; out.push(...v); }
  return out;
}
const reglas = [], TODAS = [], MANUALES = [];
const aRegex = (p) => "^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
for (const h of vj.headers || []) {
  const ps = expandir(h.source);
  if (!ps) { avisos.push(`header NO convertible (se omite): ${h.source}`); continue; }
  const hs = Object.fromEntries(h.headers.map((x) => [x.key, x.value]));
  const tieneEnc = h.headers.some((x) => x.key.toLowerCase() === "content-encoding");
  for (const p0 of ps) {
    const p = p0.startsWith("/") ? p0 : "/" + p0;
    TODAS.push([aRegex(p), hs]);
    if (tieneEnc) MANUALES.push({ glob: p, regex: aRegex(p), headers: hs });
    reglas.push(`${p}\n` + h.headers.filter((x) => x.key.toLowerCase() !== "content-encoding").map((x) => `  ${x.key}: ${x.value}`).join("\n"));
  }
}
writeFileSync(join(PUB, "_headers"), reglas.join("\n\n") + "\n");
const reds = (vj.redirects || []).map((x) => `${expandir(x.source)?.[0] ?? x.source} ${x.destination} ${x.permanent ? 308 : 307}`);
if (reds.length) writeFileSync(join(PUB, "_redirects"), reds.join("\n") + "\n");
const REWRITES = (vj.rewrites || []).map((x) => [`^${x.source}$`, x.destination]);
if (vj.routes) avisos.push('rutas.json tiene "routes": revisar a mano');

// ---------- 3. archivos que no entran en Static Assets (25 MiB) -> R2 ----------
const LIMITE = 25 * 1024 * 1024 - 1024;
const GRANDES = [];
(function buscar(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) buscar(p);
    else if (statSync(p).size > LIMITE) GRANDES.push(relative(PUB, p).replace(/\\/g, "/"));
  }
})(PUB);
const BUCKET = cfg.bucket || "unx-espejo-grandes";
const TIPOS = { wasm: "application/wasm", js: "application/javascript", json: "application/json", data: "application/octet-stream", mp4: "video/mp4", pdf: "application/pdf", zip: "application/zip", glb: "model/gltf-binary", bin: "application/octet-stream" };
for (const g of GRANDES) {
  if (cfg.subirGrandes === false) { rmSync(join(PUB, g)); avisos.push(`archivo grande (ya esta en R2, no se vuelve a subir): ${g}`); continue; }
  const tipo = TIPOS[g.split(".").pop().toLowerCase()] || "application/octet-stream";
  const u = spawnSync("npx", ["--yes", "wrangler", "r2", "object", "put", `${BUCKET}/${cfg.slug}/${g}`, "--file", join(PUB, g), "--content-type", tipo, "--remote"], { cwd: CF, shell: true, encoding: "utf8" });
  if (u.status !== 0) avisos.push(`R2 fallo para ${g}: ${(u.stdout + u.stderr).slice(-200)}`);
  rmSync(join(PUB, g));
  avisos.push(`archivo grande a R2: ${g}`);
}

// ---------- 4. api/*.js -> Worker (las funciones api/*.js estilo Node (req, res) corren tal cual, vía cf/shim.js) ----------
function recorrer(d, base = d) {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) return recorrer(p, base);
    return /\.(js|mjs|cjs)$/.test(e.name) && !e.name.startsWith("_") ? [relative(base, p).replace(/\\/g, "/")] : [];
  });
}
const apis = recorrer(join(REPO, "api"));
const imports = apis.map((f, i) => `import * as h${i} from "../../api/${f}";`).join("\n");
const tabla = "{\n" + apis.map((f, i) => `  ${J("/api/" + f.replace(/\.(js|mjs|cjs)$/, "").replace(/\/index$/, ""))}: h${i},`).join("\n") + "\n}";
const codigo = readFileSync(join(CF, "worker-plantilla.js"), "utf8")
  .replace("/*IMPORTS*/", () => imports)
  .replace("/*RUTAS*/ {}", () => tabla)
  .replace("/*MANUALES*/ []", () => J(MANUALES.map((m) => [m.regex, m.headers])))
  .replace("/*TODAS*/ []", () => J(TODAS))
  .replace("/*GRANDES*/ []", () => J(GRANDES))
  .replace("/*REWRITES*/ []", () => J(REWRITES))
  .replace('/*SLUG*/ ""', () => J(cfg.slug));
writeFileSync(join(DIST, "worker.js"), codigo);

// ---------- 5. wrangler.jsonc (en .dist, porque depende de lo que se generó) ----------
const glob = [...new Set(["/api/*", ...MANUALES.map((m) => m.glob), ...GRANDES.map((g) => "/" + g)])];
writeFileSync(join(DIST, "wrangler.jsonc"), JSON.stringify({
  name: cfg.slug,
  main: "worker.js",
  compatibility_date: "2026-09-01",
  compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
  workers_dev: false,
  preview_urls: false,
  assets: { directory: "./public", binding: "ASSETS", run_worker_first: glob, html_handling: vj.cleanUrls ? "drop-trailing-slash" : "auto-trailing-slash", not_found_handling: "none" },
  services: (cfg.servicios || []).map((s) => ({ binding: "SVC_" + s.toUpperCase().replace(/-/g, "_"), service: s })),
  observability: { enabled: true },
  ...(GRANDES.length ? { r2_buckets: [{ binding: "GRANDES", bucket_name: BUCKET }] } : {}),
}, null, 2));

let archivos = 0, bytes = 0;
(function cont(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) cont(p); else { archivos++; bytes += statSync(p).size; } } })(PUB);
console.log(J({ slug: cfg.slug, apis: apis.length, archivos, MB: +(bytes / 1048576).toFixed(1), avisos }));
