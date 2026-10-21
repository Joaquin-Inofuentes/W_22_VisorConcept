// node --test src/rutas.test.mjs
//
// Regla del Portal: el Atras del navegador recorre los pasos internos de la
// app. Entrar a una carpeta por clic apila historial; la carga inicial y
// resolver una ruta que vino del historial NUNCA apilan.
import test from "node:test";
import assert from "node:assert/strict";
import { decidirEscrituraCarpeta, esLaMismaCarpeta, firmaCarpetas } from "./rutas.ts";

const d = (porUsuario, resolviendo, hayDibujo) =>
  decidirEscrituraCarpeta({ porUsuario, resolviendo, hayDibujo });

test("clic en una carpeta sin dibujo abierto apila (el bug: antes reemplazaba)", () => {
  assert.deepEqual(d(true, false, false), { escritura: "apilar", sigueResolviendo: false });
});

test("un clic apaga 'resolviendo' aunque hubiera quedado prendido", () => {
  assert.deepEqual(d(true, true, false), { escritura: "apilar", sigueResolviendo: false });
});

test("con un dibujo abierto la carpeta no toca la URL", () => {
  assert.equal(d(true, false, true).escritura, "nada");
  assert.equal(d(false, false, true).escritura, "nada");
});

test("el aviso que resuelve una ruta del historial no escribe y apaga la bandera", () => {
  assert.deepEqual(d(false, true, false), { escritura: "nada", sigueResolviendo: false });
});

test("sin gesto (carga inicial) solo reemplaza, nunca apila", () => {
  assert.deepEqual(d(false, false, false), { escritura: "reemplazar", sigueResolviendo: false });
  for (const resolviendo of [true, false]) {
    for (const hayDibujo of [true, false]) {
      assert.notEqual(d(false, resolviendo, hayDibujo).escritura, "apilar");
    }
  }
});

test("firmaCarpetas usa los slugs de los nombres", () => {
  assert.equal(firmaCarpetas(["Fede y Franco", "Concepts"]), "fede-y-franco/concepts");
  assert.equal(firmaCarpetas([]), "");
});

test("esLaMismaCarpeta compara slugs de la URL con nombres de la galeria", () => {
  assert.equal(esLaMismaCarpeta(["fede-y-franco", "concepts"], ["Fede y Franco", "Concepts"]), true);
  assert.equal(esLaMismaCarpeta(["fede-y-franco"], ["Fede y Franco", "Concepts"]), false);
  // Atras hasta Inicio: la raiz es una carpeta como cualquier otra.
  assert.equal(esLaMismaCarpeta([], []), true);
  assert.equal(esLaMismaCarpeta([], ["Fede y Franco"]), false);
  // La URL de un dibujo NO es su carpeta: hay que resolverla (reabrirlo).
  assert.equal(esLaMismaCarpeta(["fede-y-franco", "plano-1"], ["Fede y Franco"]), false);
});
