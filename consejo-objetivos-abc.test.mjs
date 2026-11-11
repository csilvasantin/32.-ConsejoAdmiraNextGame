import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXTO_SIN_DEFINIR, plantillaInicial, normalizarDocumento, textoObjetivo,
  proyectosActivos, indiceCircular, aplicarCambio, estaDefinido,
} from './consejo-objetivos-abc-lib.mjs';

test('plantilla inicial trae los 3 nombres y ningún objetivo inventado', () => {
  const p = plantillaInicial();
  assert.deepEqual(p.map((x) => x.nombre), ['PortAventuraNeXT', 'AdmiraNeXT', 'Alsea']);
  for (const x of p) {
    assert.equal(x.objetivos.a, '');
    assert.equal(x.objetivos.b, '');
    assert.equal(x.objetivos.c, '');
    assert.equal(textoObjetivo(x.objetivos.a), TEXTO_SIN_DEFINIR);
    assert.equal(estaDefinido(x.objetivos.a), false);
  }
});

test('sin documento o lista vacía se usa la plantilla; no se inventa texto', () => {
  const d = normalizarDocumento(null);
  assert.equal(d.fuente, 'plantilla');
  assert.equal(proyectosActivos(d).length, 3);
  const vacio = normalizarDocumento({ proyectos: [] });
  assert.equal(vacio.fuente, 'plantilla');
  const conDatos = normalizarDocumento({
    proyectos: [{ nombre: 'AdmiraNeXT', objetivos: { a: 'Publicar la mesa', b: '', c: '  ' } }],
    fuente: 'kv',
  });
  assert.equal(conDatos.fuente, 'kv');
  assert.equal(conDatos.proyectos.length, 1);
  assert.equal(textoObjetivo(conDatos.proyectos[0].objetivos.a), 'Publicar la mesa');
  assert.equal(textoObjetivo(conDatos.proyectos[0].objetivos.b), TEXTO_SIN_DEFINIR);
  assert.equal(textoObjetivo(conDatos.proyectos[0].objetivos.c), TEXTO_SIN_DEFINIR);
});

test('indice circular y solo proyectos activos salen en el hover', () => {
  assert.equal(indiceCircular(0, 1, 3), 1);
  assert.equal(indiceCircular(2, 1, 3), 0);
  assert.equal(indiceCircular(0, -1, 3), 2);
  const d = normalizarDocumento({
    proyectos: [
      { nombre: 'A', activo: true, orden: 1, objetivos: { a: 'uno' } },
      { nombre: 'B', activo: false, orden: 2, objetivos: { a: 'oculto' } },
      { nombre: 'C', activo: true, orden: 3 },
    ],
  });
  const act = proyectosActivos(d);
  assert.deepEqual(act.map((p) => p.nombre), ['A', 'C']);
  assert.equal(textoObjetivo(act[1].objetivos.a), TEXTO_SIN_DEFINIR);
});

test('aplicarCambio sustituye la lista y no rellena huecos', () => {
  const d = aplicarCambio(null, { proyectos: [
    { nombre: 'Alsea', objetivos: { a: 'Retail media', b: '', c: '' } },
  ] });
  assert.equal(d.fuente, 'kv');
  assert.equal(d.proyectos.length, 1);
  assert.equal(d.proyectos[0].nombre, 'Alsea');
  assert.equal(d.proyectos[0].objetivos.b, '');
  assert.equal(textoObjetivo(d.proyectos[0].objetivos.c), TEXTO_SIN_DEFINIR);
});
