// Compatibilidad Vercel (req, res estilo Node) -> Cloudflare Worker (fetch).
// Permite correr SIN reescribir los api/*.js del repo original.
function consulta(url) {
  const q = {};
  for (const [k, v] of url.searchParams) {
    if (k in q) q[k] = [].concat(q[k], v); else q[k] = v;
  }
  return q;
}

async function armarReq(request, url) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const ip = headers["cf-connecting-ip"] || "";
  if (!headers["x-forwarded-for"]) headers["x-forwarded-for"] = ip;
  if (!headers["x-real-ip"]) headers["x-real-ip"] = ip;
  const cf = request.cf || {};
  if (cf.country) headers["x-vercel-ip-country"] = cf.country;
  if (cf.city) headers["x-vercel-ip-city"] = cf.city;
  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const ct = headers["content-type"] || "";
    const crudo = await request.arrayBuffer();
    if (crudo.byteLength === 0) body = undefined;
    else if (ct.includes("application/json")) {
      const t = new TextDecoder().decode(crudo);
      try { body = JSON.parse(t); } catch { body = t; }
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(new TextDecoder().decode(crudo)));
    } else if (ct.startsWith("text/")) body = new TextDecoder().decode(crudo);
    else body = new Uint8Array(crudo);
  }
  return {
    method: request.method, url: url.pathname + url.search, headers, body,
    query: consulta(url), socket: { remoteAddress: ip },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
  };
}

function armarRes() {
  const h = new Headers();
  const e = { status: 200, partes: [], fin: null };
  const hecho = new Promise((r) => { e.fin = r; });
  const res = {
    get statusCode() { return e.status; }, set statusCode(v) { e.status = v; },
    status(n) { e.status = n; return res; },
    setHeader(k, v) { if (Array.isArray(v)) { h.delete(k); v.forEach((x) => h.append(k, x)); } else h.set(k, String(v)); return res; },
    getHeader(k) { return h.get(k) ?? undefined; },
    removeHeader(k) { h.delete(k); },
    writeHead(n, hs) { e.status = n; if (hs) for (const k in hs) res.setHeader(k, hs[k]); return res; },
    write(c) { e.partes.push(c); return true; },
    json(o) { if (!h.has("content-type")) h.set("content-type", "application/json; charset=utf-8"); return res.end(JSON.stringify(o)); },
    send(x) {
      if (x !== null && typeof x === "object" && !(x instanceof Uint8Array)) return res.json(x);
      return res.end(x);
    },
    redirect(a, b) { const [s, u] = typeof a === "number" ? [a, b] : [307, a]; e.status = s; h.set("location", u); return res.end(); },
    end(x) { if (x !== undefined && x !== null) e.partes.push(x); e.terminado = true; e.fin(); return res; },
  };
  const construir = () => {
    const enc = new TextEncoder();
    const trozos = e.partes.map((p) => (typeof p === "string" ? enc.encode(p) : p));
    const largo = trozos.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(largo);
    let o = 0; for (const t of trozos) { out.set(t, o); o += t.length; }
    const sinCuerpo = e.status === 204 || e.status === 304;
    return new Response(sinCuerpo ? null : out, { status: e.status, headers: h });
  };
  return { res, hecho, construir };
}

export async function correr(handler, request, ctx) {
  const url = new URL(request.url);
  const m = handler && handler.default ? handler.default : handler;
  if (typeof m !== "function") return new Response("handler invalido", { status: 500 });
  if (m.length < 2) return m(request, ctx); // handler estilo Web (Request -> Response)
  const req = await armarReq(request, url);
  const { res, hecho, construir } = armarRes();
  const trabajo = Promise.resolve(m(req, res)).catch((err) => {
    console.error("handler fallo:", err && err.stack || err);
    if (!res.getHeader("content-type")) res.status(500).json({ error: "error interno" }); else res.end();
  });
  ctx.waitUntil(trabajo);
  await Promise.race([hecho, trabajo]);
  return construir();
}
