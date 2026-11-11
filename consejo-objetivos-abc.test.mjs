import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXTO_SIN_DEFINIR, plantillaInicial, normalizarDocumento, textoObjetivo,
  proyectosActivos, indiceCircular, aplicarCambio, aplicarEscrituraTitular,
  estaDefinido, autorDe, titularDe,
} from './consejo-objetivos-abc-lib.mjs';

test('plantilla inicial: 4 paneles con titular y sin objetivos inventados', () => {
  const p = plantillaInicial();
  assert.deepEqual(p.map((x) => x.nombre), ['PortAventuraNeXT', 'AdmiraNeXT', 'Alsea', 'Día a día']);
  assert.deepEqual(p.map((x) => x.id), ['portaventura-next', 'admiranext', 'alsea', 'dia-a-dia']);
  assert.deepEqual(p.map((x) => x.titular), ['Jobs', 'Lucas', 'Walt', 'Woz']);
  for (const x of p) {
    assert.equal(x.objetivos.a, '');
    assert.equal(textoObjetivo(x.objetivos.a), TEXTO_SIN_DEFINIR);
    assert.equal(estaDefinido(x.objetivos.a), false);
  }
  assert.equal(titularDe('portaventura-next'), 'Jobs');
  assert.equal(autorDe('steve wozniak'), 'Woz');
  assert.equal(autorDe('Walt Disney'), 'Walt');
});

test('sin documento se usa la plantilla de 4; un KV viejo de 3 gana el panel de Woz', () => {
  const d = normalizarDocumento(null);
  assert.equal(d.fuente, 'plantilla');
  assert.equal(proyectosActivos(d).length, 4);
  const viejo = normalizarDocumento({
    fuente: 'kv',
    proyectos: [{ id: 'portaventura-next', nombre: 'PortAventuraNeXT', objetivos: { a: 'Una', b: '', c: '' } }],
  });
  assert.equal(viejo.fuente, 'kv');
  assert.deepEqual(viejo.proyectos.map((p) => p.id), ['portaventura-next', 'admiranext', 'alsea', 'dia-a-dia']);
  assert.equal(viejo.proyectos[0].objetivos.a, 'Una');
  assert.equal(textoObjetivo(viejo.proyectos[1].objetivos.a), TEXTO_SIN_DEFINIR);
});

test('indice circular con 4 paneles', () => {
  assert.equal(indiceCircular(0, 1, 4), 1);
  assert.equal(indiceCircular(3, 1, 4), 0);
  assert.equal(indiceCircular(0, -1, 4), 3);
});

test('Jobs escribe solo en PortAventuraNeXT y firma autor y hora', () => {
  const ahora = 1_794_000_000_000;
  const r = aplicarEscrituraTitular(null, {
    autor: 'jobs',
    objetivos: { a: 'Mejora park', b: 'Segunda', c: 'Tercera' },
  }, ahora);
  assert.equal(r.rechazados.length, 0);
  const pan = r.doc.proyectos.find((p) => p.id === 'portaventura-next');
  assert.equal(pan.objetivos.a, 'Mejora park');
  assert.equal(pan.firmas.a.autor, 'Jobs');
  assert.equal(pan.firmas.a.actualizado, ahora);
  const alsea = r.doc.proyectos.find((p) => p.id === 'alsea');
  assert.equal(alsea.objetivos.a, '');
});

test('un titular no escribe en el proyecto de otro', () => {
  const r = aplicarEscrituraTitular(null, {
    autor: 'lucas',
    id: 'alsea',
    objetivos: { a: 'no debe entrar' },
  }, 10);
  assert.ok(r.rechazados.length >= 1);
  const alsea = r.doc.proyectos.find((p) => p.id === 'alsea');
  assert.equal(alsea.objetivos.a, '');
});

test('una edición de Carlos no se pisa si Jobs escribe después; Jobs sí puede actualizar lo suyo', () => {
  let d = aplicarCambio(null, {
    autor: 'carlos',
    proyectos: [
      { id: 'portaventura-next', nombre: 'PortAventuraNeXT', objetivos: { a: 'Criterio de Carlos', b: '', c: '' } },
    ],
  }, 100);
  const jobs1 = aplicarEscrituraTitular(d, {
    autor: 'Jobs',
    id: 'portaventura-next',
    objetivos: { a: 'intento nocturno', b: 'nueva de Jobs', c: '' },
  }, 200);
  const pan = jobs1.doc.proyectos.find((p) => p.id === 'portaventura-next');
  assert.equal(pan.objetivos.a, 'Criterio de Carlos', 'la de Carlos se conserva');
  assert.equal(pan.firmas.a.autor, 'Carlos');
  assert.equal(pan.objetivos.b, 'nueva de Jobs');
  assert.equal(pan.firmas.b.autor, 'Jobs');
  assert.equal(jobs1.conflictos.length, 1);
  const jobs2 = aplicarEscrituraTitular(jobs1.doc, {
    autor: 'jobs',
    id: 'portaventura-next',
    objetivos: { a: 'sigue sin pisar', b: 'Jobs actualiza la suya', c: '' },
  }, 300);
  const pan2 = jobs2.doc.proyectos.find((p) => p.id === 'portaventura-next');
  assert.equal(pan2.objetivos.a, 'Criterio de Carlos');
  assert.equal(pan2.objetivos.b, 'Jobs actualiza la suya');
  assert.equal(pan2.firmas.b.actualizado, 300);
});

test('forzar:true sí permite al titular pisar a Carlos (escape documentado)', () => {
  const d = aplicarCambio(null, {
    autor: 'carlos',
    proyectos: [{ id: 'dia-a-dia', nombre: 'Día a día', objetivos: { a: 'Nota de Carlos', b: '', c: '' } }],
  }, 1);
  const r = aplicarEscrituraTitular(d, {
    autor: 'woz',
    id: 'dia-a-dia',
    objetivos: { a: 'Woz con forzar', b: '', c: '' },
    forzar: true,
  }, 2);
  const pan = r.doc.proyectos.find((p) => p.id === 'dia-a-dia');
  assert.equal(pan.objetivos.a, 'Woz con forzar');
  assert.equal(pan.firmas.a.autor, 'Woz');
});
