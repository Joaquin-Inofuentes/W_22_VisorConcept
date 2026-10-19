// ¿Cuantos dibujos de la carpeta se estan viendo cabeza abajo?
//   TOP=8 node scripts/sentido-texto.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
const BASE = (process.env.BASE_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const TOP = Number(process.env.TOP || 6);
const K = "bbw_pub_23ac1e410efd14afd380458d3e78959c2bf22b0b87b1172d";
const FN = "https://babelbim-worker.datafiles.workers.dev/v1/bim/functions/v1/concepts-drive";
const manifest = JSON.parse(await readFile(path.resolve(".cache/concepts/manifest.json"), "utf8"));
const objetivos = manifest.files.filter((f) => f.size).sort((a, b) => b.size - a.size).slice(0, TOP);
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"], protocolTimeout: 900000 });
let alReves = 0, derechos = 0;
for (const f of objetivos) {
  const p = await b.newPage();
  p.setDefaultTimeout(600000);
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  try {
    const r = await p.evaluate(async (url, headers) => {
      const mod = await import("/scripts/browser/sentido-texto-payload.ts");
      return mod.sentidoTexto(url, headers, 5);
    }, `${FN}?action=download&fileId=${f.id}`, { apikey: K, Authorization: `Bearer ${K}` });
    const d = r.derechos, t = r.total;
    alReves += t - d; derechos += d;
    console.log(`${(f.size/1048576).toFixed(0).padStart(4)} MB  ${String(d).padStart(2)}/${t} planos derechos  ${f.name.slice(0,34)}`);
    r.filas.forEach((x) => console.log(`         ${x.id} /Rotate=${x.rotatePdf} elem=${x.rotacionElemento} sentidoX=${x.sentidoX} ${x.derecho ? "derecho" : "AL REVES"}`));
  } catch (e) { console.log(`  fallo: ${String(e).slice(0,160)}`); }
  await p.close();
}
console.log(`\nTOTAL: ${derechos} planos derechos, ${alReves} al reves`);
await b.close();
