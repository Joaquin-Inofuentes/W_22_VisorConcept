# cf/ — Cloudflare (convive con Vercel)

Este repo se publica en Vercel (como siempre) **y** en Cloudflare Workers. Esta carpeta es sólo de Cloudflare; Vercel la ignora.

- Worker: `w-22-visorconcept` (sin URL pública: se entra por el gateway `babelbimproyectos`).
- Cloudflare → Workers Builds → este repo. **Build command:** `node cf/build.mjs` · **Deploy command:** `npx wrangler deploy -c cf/.dist/wrangler.jsonc`
- `build.mjs` convierte `vercel.json` (headers/redirects/rewrites) y arma el Worker; las funciones de `api/` corren tal cual vía `shim.js`.
- Los secretos NO están acá: viven en el Worker de Cloudflare.
