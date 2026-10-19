// Un Worker NO puede llamar a otro por su URL *.workers.dev (error 1042): hay que usar service bindings.
// Este parche hace que todo fetch() a https://<worker>.datafiles.workers.dev pase por env.SVC_<WORKER>.
// `precargar()` se puede llamar al cargar el módulo (antes de que un framework capture fetch); `instalar(env)` entrega el env.
let nativo = null;
let ENV = null;
export function precargar() {
  if (nativo) return;
  nativo = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (entrada, init) => {
    const req = entrada instanceof Request && init === undefined ? entrada : new Request(entrada, init);
    const host = new URL(req.url).hostname;
    if (ENV && host.endsWith(".datafiles.workers.dev")) {
      const b = ENV["SVC_" + host.split(".")[0].toUpperCase().replace(/-/g, "_")];
      if (b) return b.fetch(req);
    }
    return nativo(req);
  };
}
export function instalar(env) {
  ENV = env;
  precargar();
}
