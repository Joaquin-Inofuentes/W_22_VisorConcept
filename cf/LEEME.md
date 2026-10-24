# cf/ — Cloudflare

Esta carpeta arma el Worker de Cloudflare de este repo.

- Worker: `w-22-visorconcept` (sin URL pública: se entra por el gateway `babelbimproyectos`).
- Cloudflare → Workers Builds → este repo. **Build command:** `node cf/build.mjs` · **Deploy command:** `npx wrangler deploy -c cf/.dist/wrangler.jsonc`
- `build.mjs` lee `rutas.json` (headers, redirects, rewrites y buildCommand) y arma el Worker; las funciones de `api/` (estilo Node `(req, res)`) corren tal cual vía `shim.js`.
- Los secretos NO están acá: viven en el Worker de Cloudflare.
