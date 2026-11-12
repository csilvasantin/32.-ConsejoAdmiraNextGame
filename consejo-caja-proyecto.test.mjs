import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { plantillaInicial, proyectoPrincipalDe } from './consejo-objetivos-abc-lib.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, 'council-globo.js'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');

test('la caja pone el título arriba, el recuento debajo y flechas ◀ ▶ a los lados', () => {
  assert.match(src, /\.ranking-proy/);
  assert.match(src, /\.ranking-fila/);
  assert.match(src, /\.ranking-nav/);
  assert.match(src, /prev\.textContent = '◀'/);
  assert.match(src, /next\.textContent = '▶'/);
  // Título se añade antes que la fila del número.
  const iProy = src.indexOf("nom.className = 'ranking-proy'");
  const iFila = src.indexOf("fila.className = 'ranking-fila'");
  const iCifra = src.indexOf("cifra.className = 'ranking-n'");
  assert.ok(iProy > 0 && iFila > iProy, 'el título se construye antes que la fila del recuento');
  assert.ok(iCifra > iProy, 'el número queda debajo del título');
  // Mismo estilo que el carrusel de Carlos: fondo, color y borde dorados.
  assert.match(src, /#papel-halos \.consejero-ranking \.ranking-nav\{[^}]*background:#1a140a/);
  assert.match(src, /#papel-halos \.consejero-ranking \.ranking-nav\{[^}]*color:#ffd75e/);
  assert.match(src, /#papel-halos \.consejero-ranking \.ranking-nav\{[^}]*border:1px solid #c9a227/);
});

test('clicar la flecha de proyecto no enciende el Mac; el resto de la caja sí', () => {
  assert.match(src, /ranking-nav[\s\S]{0,400}stopPropagation/);
  assert.match(src, /mostrarListaMac\(persona\)/);
  assert.match(src, /e\.target\.closest\('\.ranking-nav'\)/);
  // El paso del carrusel no llama a mostrarListaMac.
  const paso = src.match(/function pasoProyecto\([\s\S]*?\n  \}/);
  assert.ok(paso, 'existe pasoProyecto');
  assert.doesNotMatch(paso[0], /mostrarListaMac/);
});

test('el puesto dentro de la flecha es más pequeño y cabe en el triángulo, sin «/6»', () => {
  const m = src.match(/#papel-halos \.consejero-flecha \.puesto\{[^}]*font:800 (\d+)px/);
  assert.ok(m, 'hay font-size del puesto');
  assert.ok(Number(m[1]) <= 15, 'el puesto debe ser más pequeño que 20px (ahora ' + m[1] + 'px)');
  const mob = src.match(/@media \(max-width:500px\)\{[\s\S]*?\.consejero-flecha \.puesto\{[^}]*font-size:(\d+)px/);
  assert.ok(mob, 'hay tamaño móvil del puesto');
  assert.ok(Number(mob[1]) <= 12, 'en móvil también más pequeño (ahora ' + mob[1] + 'px)');
  const top = src.match(/#papel-halos \.consejero-flecha \.puesto\{[^}]*top:(\d+)%/);
  const height = src.match(/#papel-halos \.consejero-flecha \.puesto\{[^}]*height:(\d+)%/);
  assert.ok(top && height, 'el puesto tiene top y height porcentuales');
  const bottom = Number(top[1]) + Number(height[1]);
  assert.ok(bottom <= 88, 'el bloque del puesto no llega a la punta (bottom=' + bottom + '%)');
  assert.doesNotMatch(src, /puesto[^\n]{0,80}\/6/);
});

test('el mapa de la caja coincide con el reparto de titulares y el script se cachea como r157', () => {
  for (const [persona, nombre] of [
    ['Steve Wozniak', 'Alsea'],
    ['Walt Disney', 'PortAventuraNeXT'],
    ['George Lucas', 'AdmiraNeXT'],
    ['Steve Jobs', 'Día a día'],
  ]) {
    const p = proyectoPrincipalDe(persona);
    assert.equal(p.nombre, nombre);
    assert.match(src, new RegExp("'" + persona + "': '" + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'"));
  }
  assert.match(index, /council-globo\.js\?v=20261112-r157-caja-fija/);
  const plantilla = plantillaInicial();
  assert.deepEqual(plantilla.map((x) => x.titular + ':' + x.nombre), [
    'Walt:PortAventuraNeXT', 'Lucas:AdmiraNeXT', 'Woz:Alsea', 'Jobs:Día a día',
  ]);
});

test('el globo de estado no repite Libre/Ocupado ni el duplicado «hoy» / «encargos»', () => {
  assert.match(src, /gp-mision/);
  assert.match(src, /gp-horas/);
  assert.match(src, /gp-misiones/);
  assert.match(src, /G\.misiones/);
  assert.doesNotMatch(src, /etiqueta \+ ' hoy'/);
  assert.doesNotMatch(src, /s\.hoy\.desglose\)/);
});

test('la caja de Carlos tiene tamaño fijo y el listado a/b/c hace scroll interno', () => {
  assert.match(src, /\.consejo-globo\.globo-proyectos\{[^}]*width:280px/);
  assert.match(src, /\.consejo-globo\.globo-proyectos\{[^}]*height:220px/);
  assert.match(src, /\.consejo-globo\.globo-proyectos\{[^}]*display:flex/);
  assert.match(src, /\.consejo-globo\.globo-proyectos\{[^}]*overflow:hidden/);
  assert.match(src, /\.consejo-globo\.globo-proyectos ol\.gp-abc[^}]*overflow:auto/);
  // colocarGlobo no vuelca la caja de Carlos debajo de la cabeza.
  const colocar = src.match(/function colocarGlobo\([\s\S]*?\n  \}/);
  assert.ok(colocar, 'existe colocarGlobo');
  assert.match(colocar[0], /globo-proyectos/);
  assert.match(colocar[0], /ANCHO = 280/);
  const carlosBranch = colocar[0].split("globo-proyectos")[1];
  assert.ok(carlosBranch, 'hay rama para globo-proyectos');
  assert.doesNotMatch(carlosBranch.split('return')[0], /r\.bottom/);
});

test('la firma no aparenta una aportación del titular si el texto lo puso otro', () => {
  assert.match(src, /FIRMAS_PROVISIONALES_WOZ/);
  assert.match(src, /'portaventura-next': 1794434955422/);
  assert.match(src, /'admiranext': 1794434955817/);
  assert.match(src, /provisional · /);
  assert.match(src, /escrito_por/);
  assert.match(src, /function esFirmaProvisional/);
  // Alsea y Día a día no están en la excepción: esas firmas sí son reales.
  assert.doesNotMatch(src, /FIRMAS_PROVISIONALES_WOZ = \{[\s\S]*alsea/);
  assert.doesNotMatch(src, /FIRMAS_PROVISIONALES_WOZ = \{[\s\S]*dia-a-dia/);
});
