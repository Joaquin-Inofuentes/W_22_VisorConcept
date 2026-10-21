/**
 * Rutas compartibles: la URL refleja donde estas.
 *
 *   /                                       -> galeria, carpeta raiz
 *   /Guada-y-Flor-Re/Concepts               -> galeria, dentro de esa carpeta
 *   /Guada-y-Flor-Re/Concepts/RO-3er-y-4to  -> ese dibujo abierto
 *
 * El slug se arma con el NOMBRE de cada carpeta/archivo, no con los ids de
 * Drive: un link tiene que decir a que plano apunta con solo mirarlo. La
 * contra es que hay que resolver el nombre contra el arbol de Drive al
 * entrar, pero ese arbol ya esta cacheado en Supabase y se trae entero en una
 * sola consulta, asi que resolver es instantaneo.
 *
 * Se usan segmentos separados por "/" (no un solo segmento con guiones) para
 * que los nombres que YA tienen guiones —abundan: "RO- 4to Piso"— no rompan
 * la ruta al volver a partirla.
 */

/**
 * El prefijo bajo el que se sirve la app. Tiene que coincidir con el `base` de
 * vite.config.ts y con el slug del gateway.
 *
 * Sin esto la app escribia "/" y "/carpeta/archivo" en la barra de
 * direcciones de babelbim.com, donde "/" es SIEMPRE el Portal: recargar
 * adentro de Concept --o mandarle el link a alguien-- te sacaba a la pantalla
 * de iconos. Y "/guada-y-flor-re" choca con el prefijo de cualquier otro
 * modulo que se llame parecido.
 */
export const BASE = "/concept";

/** Convierte un nombre a un segmento de URL legible y estable. */
export function aSlug(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      // Marcas de acento que deja NFD (ñ -> n, á -> a). Escapadas a proposito:
      // escritas literalmente son invisibles y cualquier editor las come.
      .replace(/[̀-ͯ]/g, "")
      .replace(/\.concepts$/i, "")
      .trim()
      .replace(/[^\w\s-]/g, "") // simbolos raros
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "sin-nombre"
  );
}

export function construirRuta(carpetas: string[], archivo?: string | null): string {
  const partes = carpetas.map(aSlug).filter(Boolean);
  if (archivo) partes.push(aSlug(archivo));
  return partes.length ? `${BASE}/${partes.join("/")}` : `${BASE}/`;
}

export interface RutaLeida {
  /** Slugs de las carpetas, sin contar la raiz. */
  carpetas: string[];
  /** Slug del archivo, si la ruta apunta a un dibujo. */
  archivo: string | null;
}

/** Lee la ruta actual. `archivo` se decide despues, comparando contra el
 * arbol: aca solo se parte en segmentos. */
export function leerRuta(pathname = window.location.pathname): string[] {
  const partes = pathname.split("/").map((s) => decodeURIComponent(s)).filter(Boolean);
  // Se saca el prefijo si esta. Se tolera que no este para que la app siga
  // andando servida desde la raiz de su propio dominio.
  if (partes[0] === BASE.slice(1)) partes.shift();
  return partes;
}

/** Cambia la URL sin recargar. `reemplazar` evita ensuciar el historial
 * cuando el cambio no es una navegacion del usuario. */
export function irA(ruta: string, reemplazar = false) {
  const actual = window.location.pathname + window.location.search;
  const destino = ruta + window.location.search;
  if (actual === destino) return;
  if (reemplazar) window.history.replaceState({}, "", destino);
  else window.history.pushState({}, "", destino);
}

/** Firma de una pila de carpetas (por nombre) o de una ruta (por slug): los
 * slugs unidos con "/". Sirve para comparar "lo que dice la URL" con "lo que
 * muestra la galeria" sin importar si vino de nombres o de slugs. */
export function firmaCarpetas(nombres: string[]): string {
  return nombres.map(aSlug).join("/");
}

/** La ruta leida de la URL (`partes`, slugs) es exactamente la carpeta que ya
 * se muestra (`carpetas`, nombres)? Entonces la galeria no tiene nada que
 * resolver y NO va a avisar su ruta. */
export function esLaMismaCarpeta(partes: string[], carpetas: string[]): boolean {
  return partes.join("/") === firmaCarpetas(carpetas);
}

export type EscrituraUrl = "apilar" | "reemplazar" | "nada";

/**
 * Que hacer con la URL cuando la galeria avisa que cambio de carpeta.
 *
 * Regla del Portal: el boton Atras del navegador recorre los pasos internos de
 * la app, asi que entrar a una carpeta POR UN GESTO del usuario apila una
 * entrada (pushState). Todo lo demas (la carga inicial, resolver una ruta que
 * vino de un link) solo reemplaza: apilar sin gesto deja entradas fantasma y
 * el primer Atras no hace nada visible.
 *
 * - `porUsuario`: el cambio salio de un clic (entrar, migas, "volver").
 * - `resolviendo`: se esta mostrando una ruta que vino del HISTORIAL
 *   (atras/adelante); la URL ya es la correcta, no hay que tocarla.
 * - `hayDibujo`: con un dibujo abierto manda la URL del dibujo.
 *
 * `sigueResolviendo` es el nuevo valor de la bandera `resolviendo`: el aviso
 * de la galeria siempre la consume.
 */
export function decidirEscrituraCarpeta(o: {
  porUsuario: boolean;
  resolviendo: boolean;
  hayDibujo: boolean;
}): { escritura: EscrituraUrl; sigueResolviendo: boolean } {
  if (o.porUsuario) return { escritura: o.hayDibujo ? "nada" : "apilar", sigueResolviendo: false };
  if (o.resolviendo) return { escritura: "nada", sigueResolviendo: false };
  return { escritura: o.hayDibujo ? "nada" : "reemplazar", sigueResolviendo: false };
}
