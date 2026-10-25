import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const parserUrl = pathToFileURL("C:/.TBT/Proyectos/W_22_VisorConcept/web-viewer/src/VisorConcept/parser.ts").href;
const { parseConceptsFile } = await import(parserUrl);
const raiz = "C:/ARQ/BIM/Concepts";
const todos = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else if (f.endsWith(".concepts")) todos.push([p, s.size]); } };
walk(raiz);
todos.sort((a, b) => a[1] - b[1]);
let ok = 0, err = 0, trazos = 0, imgs = 0, textos = 0; const t0 = Date.now(); let maxMs = 0, maxF = "";
for (const [p, size] of todos) {
  if (size > 120e6) continue; // los gigantes se prueban aparte (memoria)
  try {
    const t = Date.now();
    const buf = readFileSync(p);
    const doc = await parseConceptsFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const ms = Date.now() - t; if (ms > maxMs) { maxMs = ms; maxF = path.basename(p); }
    ok++; for (const l of doc.layers) { trazos += l.strokes.length; imgs += l.images.length; textos += l.texts.length; }
    doc.close();
  } catch (e) { err++; }
}
console.log(JSON.stringify({ archivos: todos.length, ok, err, trazos, imgs, textos, segs: (Date.now() - t0) / 1000, maxMs, maxF }));
