// node --test src/VisorConcept/progreso.test.mjs
// El reloj del seguidor y los textos de "no estas trabado" (WP-Cn, pedido 2ee3a077).
import test from "node:test";
import assert from "node:assert/strict";
import { SeguidorProgreso, TOTAL_PASOS, SEGUNDOS_PARA_AVISO, medioSegundo, formatearTranscurrido } from "./progreso.ts";

/** performance.now() controlable: la clase lo lee tanto en el reloj como al calcular. */
function conReloj(fn) {
  const real = performance.now.bind(performance);
  let t = 1000;
  performance.now = () => t;
  try {
    return fn((ms) => { t += ms; });
  } finally {
    performance.now = real;
  }
}

test("transcurridoS cuenta segundos reales y paso avanza con cada fase", () => {
  conReloj((avanzar) => {
    const s = new SeguidorProgreso(() => {});
    try {
      s.cambiarFase("abriendo");
      assert.equal(s.estado().paso, 1);
      avanzar(3200);
      assert.equal(s.estado().transcurridoS, 3);
      s.cambiarFase("descargando", "vista previa y documento");
      assert.equal(s.estado().paso, 2);
      s.cambiarFase("procesando");
      s.cambiarFase("dibujando");
      assert.equal(s.estado().paso, 4);
      s.cambiarFase("listo");
      assert.equal(s.estado().paso, TOTAL_PASOS);
    } finally {
      s.detener();
    }
  });
});

test("el contador va en medios segundos y se formatea con coma", () => {
  assert.equal(medioSegundo(0), 0);
  assert.equal(medioSegundo(499), 0);
  assert.equal(medioSegundo(500), 0.5);
  assert.equal(medioSegundo(7600), 7.5);
  assert.equal(formatearTranscurrido(7), "7 s");
  assert.equal(formatearTranscurrido(7.5), "7,5 s");
});

test("misma fase repetida no cuenta como paso nuevo", () => {
  conReloj(() => {
    const s = new SeguidorProgreso(() => {});
    try {
      s.cambiarFase("descargando");
      const p = s.estado().paso;
      s.cambiarFase("descargando", "otro detalle");
      assert.equal(s.estado().paso, p);
    } finally {
      s.detener();
    }
  });
});

test("avisa que tarda recien pasados SEGUNDOS_PARA_AVISO en la misma etapa", () => {
  conReloj((avanzar) => {
    const s = new SeguidorProgreso(() => {});
    try {
      s.cambiarFase("abriendo");
      avanzar((SEGUNDOS_PARA_AVISO - 1) * 1000);
      assert.equal(s.estado().aviso, null);
      avanzar(1500);
      assert.match(s.estado().aviso, /Drive est/);
      // al cambiar de etapa el contador de la etapa arranca de nuevo
      s.cambiarFase("procesando");
      assert.equal(s.estado().aviso, null);
    } finally {
      s.detener();
    }
  });
});

test("con los bytes al 100% y sin imagenes dibujadas se dice que se esta dibujando", () => {
  conReloj(() => {
    const s = new SeguidorProgreso(() => {});
    try {
      s.cambiarFase("descargando", "0 de 2 imágenes");
      s.sumarBytes(1000);
      s.fijarEsperados(1000);
      const e = s.estado();
      assert.equal(e.fase, "dibujando");
      assert.match(e.detalle, /preparando planos/);
    } finally {
      s.detener();
    }
  });
});

test("el reloj avisa al pasar el segundo aunque no llegue ningun byte", async () => {
  const avisos = [];
  const s = new SeguidorProgreso((e) => avisos.push(e.transcurridoS));
  try {
    s.cambiarFase("abriendo");
    const antes = avisos.length;
    await new Promise((r) => setTimeout(r, 1300));
    assert.ok(avisos.length - antes >= 2, "debio avisar al menos 2 veces (medios segundos) en 1,3 s");
    assert.ok(avisos.at(-1) >= 1);
  } finally {
    s.detener();
  }
});
