// Mapeo puro de un error de apertura/lectura de un .concepts remoto a un
// codigo del catalogo del centinela (`_Otros_Escuchas/codigos-fallo.json`).
//
// Separado de `VisorConcept/zip.ts` (que arma los mensajes de error y no
// sabe nada del centinela) para que esto sea una funcion pura, sin DOM ni
// red, testeable con node:test tal cual se publica.

/** Detalle util cuando el fallo fue un rango HTTP contra concepts-drive. */
export interface DetalleRangoFallido {
  range: string;
  status: number;
}

// El mismo formato que arma `RemoteSource.fetchRawUnaVez` en zip.ts:
// `Rango bytes=-131072 fallo (502)` o `Rango bytes=1024-2047 fallo (502)`.
const RE_RANGO_FALLIDO = /^Rango (\S+) fallo \((\d+)\)$/;

/** Si el mensaje es el de un rango que le fallo al proxy, separa el rango
 * pedido y el status HTTP que devolvio. Si no, `null`. */
export function parseRangoFallido(mensaje: string): DetalleRangoFallido | null {
  const m = RE_RANGO_FALLIDO.exec(mensaje);
  if (!m) return null;
  return { range: m[1], status: Number(m[2]) };
}

/** El cuerpo de error que devuelve `concepts-drive` desde R3-01. `zip.ts` lo
 * adjunta al Error (clase `ErrorProxyConcepts`); aca se lee de forma
 * estructural para no acoplar este modulo puro con el del zip. */
export interface DetalleProxy {
  status: number;
  range: string | null;
  codigo: string | null;
  causa: string | null;
  idFallo: string | null;
}

/** Si el error viene del proxy con el contrato de R3-01, devuelve sus campos.
 * `null` si es cualquier otro error. */
export function detalleProxy(err: unknown): DetalleProxy | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (e.name !== "ErrorProxyConcepts" || typeof e.status !== "number") return null;
  return {
    status: e.status,
    range: typeof e.range === "string" ? e.range : null,
    codigo: typeof e.codigo === "string" ? e.codigo : null,
    causa: typeof e.causa === "string" ? e.causa : null,
    idFallo: typeof e.idFallo === "string" ? e.idFallo : null,
  };
}

/**
 * Codigo del catalogo que corresponde a un error de `openConceptsRemote` /
 * `parseConceptsRemote` (ver `VisorConcept/parser.ts` y `zip.ts`).
 *
 * Desde R3-01 la Edge Function manda su propio `codigo` en el cuerpo del
 * error, y ese manda: es la funcion la que sabe si fue un rango (UNX-F4005)
 * o cualquier otro fallo suyo (UNX-F7001, "la Edge Function contesto un
 * error" — el caso real es un fileId que ya no existe en Drive).
 *
 * Sin ese cuerpo se sigue deduciendo del mensaje, como antes: UNX-F4005 para
 * un rango fallido; archivo demasiado grande para materializar entero (F4001,
 * "descarga incompleta/invalida" en el sentido del catalogo: hubo que bajarlo
 * entero y no entro en el presupuesto); indice/encabezado que no se pudo leer
 * (F4002). Cualquier otra cosa (el parser de tree.pack, un msgpack corrupto)
 * cae en F4003.
 */
export function codigoDeErrorDescarga(err: unknown): string {
  const delProxy = detalleProxy(err);
  if (delProxy?.codigo) return delProxy.codigo;
  const mensaje = err instanceof Error ? err.message : String(err);
  if (parseRangoFallido(mensaje)) return "UNX-F4005";
  if (/da[ñn]ado, incompleto, o el servidor no soporta descarga parcial/i.test(mensaje)) {
    return "UNX-F4001";
  }
  if (/Encabezado da[ñn]ado|no parece un archivo \.concepts v[aá]lido/i.test(mensaje)) {
    return "UNX-F4002";
  }
  return "UNX-F4003";
}

// --- Lo que se le dice a la persona (WP-Cn) ------------------------------
//
// Hasta ahora la tarjeta de la galeria y la pantalla del visor mostraban el
// mensaje crudo del lector de zip: `Rango bytes=-131072 fallo (502)
// (referencia 179cd899)`. Nada que una persona pueda leer, y encima escondia
// que el dibujo "prueba w" mide 0 bytes en Drive (Drive contesta 416 a
// cualquier rango sobre un archivo vacio; el proxy lo cuenta como `drive-html`
// + 502). Esto separa el texto para la persona del codigo para el log.

export interface ExplicacionFallo {
  /** Texto para mostrar. Dice que paso y que hacer. */
  mensaje: string;
  /** Reintentar no lo arregla (archivo vacio, id muerto, pedido invalido). */
  definitivo: boolean;
  /** El archivo existe en Drive pero mide 0 bytes. */
  vacio: boolean;
}

export const MENSAJE_ARCHIVO_VACIO =
  "Este archivo está vacío en Drive (0 bytes): no hay nada para mostrar. Volvé a guardarlo desde Concepts.";

/** Causas del proxy que justifican gastar un pedido en comprobar si el
 * archivo esta vacio. `archivo-vacio` es la que mandaria el Worker el dia que
 * lo distinga solo. */
export function sospechaArchivoVacio(err: unknown): boolean {
  const causa = detalleProxy(err)?.causa;
  return causa === "drive-html" || causa === "archivo-vacio";
}

/** Texto honesto para un error de apertura/lectura. `vacio` lo decide quien
 * llama (despues de comprobarlo contra el proxy); aca no hay red. */
export function explicarFalloDescarga(err: unknown, vacio = false): ExplicacionFallo {
  const delProxy = detalleProxy(err);
  if (vacio || delProxy?.causa === "archivo-vacio") {
    return { mensaje: MENSAJE_ARCHIVO_VACIO, definitivo: true, vacio: true };
  }
  const original = err instanceof Error ? err.message : String(err);
  if (delProxy) {
    const ref = delProxy.idFallo ? ` (referencia ${delProxy.idFallo})` : "";
    switch (delProxy.causa) {
      case "drive-404":
      case "pedido-invalido":
        // Ya traen su propio texto, escrito para la persona (zip.ts).
        return { mensaje: original, definitivo: true, vacio: false };
      case "drive-sin-rangos":
      case "timeout":
        return { mensaje: original, definitivo: false, vacio: false };
      case "drive-html":
        return {
          mensaje: `Drive no entregó el archivo: contestó una página en vez de los datos${ref}. Probá de nuevo en un momento.`,
          definitivo: false,
          vacio: false,
        };
      default:
        return {
          mensaje: `No se pudo leer el archivo desde Drive (HTTP ${delProxy.status})${ref}. Probá de nuevo en un momento.`,
          definitivo: delProxy.status >= 400 && delProxy.status < 500 && delProxy.status !== 408 && delProxy.status !== 429,
          vacio: false,
        };
    }
  }
  const rango = parseRangoFallido(original);
  if (rango) {
    return {
      mensaje: `No se pudo leer el archivo desde Drive (HTTP ${rango.status}). Probá de nuevo en un momento.`,
      definitivo: false,
      vacio: false,
    };
  }
  return { mensaje: original, definitivo: false, vacio: false };
}

/** Extensiones que Drive lista en la carpeta pero que no son dibujos de
 * Concepts. `prueba w` (sin extension) SI es un dibujo: no se filtra por la
 * ausencia de `.concepts`, sino por la presencia de una de estas. */
const RE_NO_CONCEPTS = /\.(pdf|png|jpe?g|gif|webp|heic|docx?|xlsx?|pptx?|dwg|dxf|rvt|ifc|zip|rar|txt|csv|mp4|mov)$/i;

/** `null` si el nombre es (o puede ser) un dibujo de Concepts; si no, la
 * extension en mayusculas para rotular la tarjeta ("PDF"). */
export function extensionNoConcepts(nombre: string): string | null {
  const m = RE_NO_CONCEPTS.exec(nombre.trim());
  return m ? m[1].toUpperCase() : null;
}
