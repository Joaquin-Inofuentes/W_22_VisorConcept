// GENERADO por cf/build.mjs desde cf/worker-plantilla.js -- no editar.
import { correr } from "../shim.js";
import { instalar } from "../servicios.js";
/*IMPORTS*/
const RUTAS = /*RUTAS*/ {};
const MANUALES = /*MANUALES*/ [];
const TODAS = /*TODAS*/ [];
const GRANDES = new Set(/*GRANDES*/ []);
const REWRITES = /*REWRITES*/ [];
const SLUG = /*SLUG*/ "";

function cabeceras(ruta, base) {
  const h = new Headers(base);
  for (const [re, hs] of TODAS) if (new RegExp(re).test(ruta)) for (const k in hs) h.set(k, hs[k]);
  return h;
}

export default {
  async fetch(request, env, ctx) {
    instalar(env);
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";
    const h = RUTAS[ruta];
    if (h) return correr(h, request, ctx);
    if (ruta.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    let sinCodificar = ruta;
    try { sinCodificar = decodeURIComponent(ruta); } catch {}
    if (GRANDES.has(sinCodificar.slice(1)) && env.GRANDES) {
      const o = await env.GRANDES.get(SLUG + sinCodificar);
      if (!o) return new Response("no encontrado", { status: 404 });
      const hd = cabeceras(ruta, {});
      if (o.httpMetadata?.contentType && !hd.has("content-type")) hd.set("content-type", o.httpMetadata.contentType);
      hd.set("etag", o.httpEtag);
      const manual = hd.has("content-encoding");
      return new Response(request.method === "HEAD" ? null : o.body, { headers: hd, ...(manual ? { encodeBody: "manual" } : {}) });
    }
    const man = MANUALES.find(([re]) => new RegExp(re).test(ruta));
    const r = await env.ASSETS.fetch(request);
    if (man && r.status === 200) {
      // Ya viene comprimido (br): que el borde NO lo comprima otra vez.
      return new Response(r.body, { status: 200, headers: cabeceras(ruta, r.headers), encodeBody: "manual" });
    }
    if (r.status === 404 && REWRITES.length) {
      for (const [re, dest] of REWRITES) {
        const m = new RegExp(re).exec(ruta);
        if (!m) continue;
        let d = dest.replace(/\$(\d)/g, (_, i) => m[+i] ?? "");
        d = d.replace(/index\.html$/, "") || "/";
        const u2 = new URL(request.url);
        u2.pathname = d;
        const r2 = await env.ASSETS.fetch(new Request(u2, request));
        if (r2.status !== 404) return r2;
      }
    }
    return r;
  },
};
