/* Desplegable accesible para los velocímetros de /consumos (GrokBotBox, 09-10-2026 · r23).
 * Sustituye a los <select> nativos (en macOS el menú nativo no deja colorear opciones): botón + listbox con punto de
 * estado (verde = activo ahora · amarillo = tokens hoy pero 0 tok/h · rojo = sin datos hoy) y texto rico por fila.
 * Teclado: ↓/↑/Inicio/Fin, Enter/Espacio, Escape (cierra y devuelve el foco), Tab cierra; clic fuera cierra.
 * API: var d = new ConsumosDesplegable(raiz, { etiqueta, alCambiar(valor) }); d.pon(items, valor);
 * item = { valor, html (fila), boton (html del botón cerrado), estado:'verde'|'amarillo'|'rojo'|'' , titulo } */
(function (root) {
  'use strict';
  var n = 0;
  function D(raiz, op) {
    this.raiz = raiz; this.op = op || {}; this.items = []; this.valor = null; this.activo = -1; this.abierto = false;
    var id = 'dd' + (++n);
    raiz.classList.add('dd');
    raiz.innerHTML = '<button type="button" class="dd-boton" aria-haspopup="listbox" aria-expanded="false" id="' + id + '-b" aria-label="' + (this.op.etiqueta || '') + '"></button>' +
      '<ul class="dd-lista" role="listbox" tabindex="-1" id="' + id + '-l" aria-label="' + (this.op.etiqueta || '') + '" hidden></ul>';
    this.id = id; this.b = raiz.firstChild; this.l = raiz.lastChild;
    var self = this;
    this.b.addEventListener('click', function () { self.abierto ? self.cierra(true) : self.abre(); });
    this.b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.abre(); }
    });
    this.l.addEventListener('keydown', function (e) { self.tecla(e); });
    this.l.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li[role="option"]') : null;
      if (li) self.elige(Number(li.getAttribute('data-i')));
    });
    this.l.addEventListener('mousemove', function (e) {
      var li = e.target.closest ? e.target.closest('li[role="option"]') : null;
      if (li) self.marca(Number(li.getAttribute('data-i')), false);
    });
    document.addEventListener('pointerdown', function (e) { if (self.abierto && !raiz.contains(e.target)) self.cierra(false); });
    this.l.addEventListener('focusout', function (e) { if (self.abierto && e.relatedTarget && !raiz.contains(e.relatedTarget)) self.cierra(false); });
  }
  D.prototype.pon = function (items, valor) {
    this.items = items || []; this.valor = valor;
    var sel = this.indice(valor), it = this.items[sel];
    this.b.innerHTML = (it ? (it.boton || it.html) : '…') + '<span class="dd-flecha" aria-hidden="true">▾</span>';
    this.b.setAttribute('data-estado', it && it.estado || '');
    var self = this, act = this.abierto && this.items[this.activo] ? this.items[this.activo].valor : null;
    this.l.innerHTML = this.items.map(function (x, i) {
      return '<li role="option" id="' + self.id + '-o' + i + '" data-i="' + i + '" data-estado="' + (x.estado || '') + '" aria-selected="' + (i === sel) + '"' + (x.titulo ? ' title="' + x.titulo + '"' : '') + '>' + x.html + '</li>';
    }).join('');
    if (this.abierto) this.marca(act != null ? this.indice(act) : sel, false);
  };
  D.prototype.indice = function (v) { for (var i = 0; i < this.items.length; i++) if (this.items[i].valor === v) return i; return -1; };
  D.prototype.marca = function (i, ver) {
    if (!this.items.length) return;
    i = Math.max(0, Math.min(this.items.length - 1, i));
    this.activo = i;
    var lis = this.l.children;
    for (var k = 0; k < lis.length; k++) lis[k].classList.toggle('dd-activo', k === i);
    this.l.setAttribute('aria-activedescendant', this.id + '-o' + i);
    // Desplaza solo la lista (scrollIntoView movería también contenedores con overflow:hidden, como la sección del dial).
    var li = lis[i], L = this.l;
    if (li && ver !== false) {
      if (li.offsetTop < L.scrollTop) L.scrollTop = li.offsetTop - 6;
      else if (li.offsetTop + li.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = li.offsetTop + li.offsetHeight - L.clientHeight + 6;
    }
  };
  D.prototype.abre = function () {
    if (this.abierto) return;
    this.abierto = true; this.raiz.classList.add('dd-abierto');
    this.l.hidden = false; this.b.setAttribute('aria-expanded', 'true');
    this.marca(Math.max(0, this.indice(this.valor)));
    this.l.focus({ preventScroll: true });
  };
  D.prototype.cierra = function (foco) {
    if (!this.abierto) return;
    this.abierto = false; this.raiz.classList.remove('dd-abierto');
    this.l.hidden = true; this.b.setAttribute('aria-expanded', 'false');
    if (foco) this.b.focus();
  };
  D.prototype.elige = function (i) {
    var it = this.items[i];
    this.cierra(true);
    if (!it) return;
    this.valor = it.valor;
    if (this.op.alCambiar) this.op.alCambiar(it.valor);
  };
  D.prototype.tecla = function (e) {
    var k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); this.marca(this.activo + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); this.marca(this.activo - 1); }
    else if (k === 'Home') { e.preventDefault(); this.marca(0); }
    else if (k === 'End') { e.preventDefault(); this.marca(this.items.length - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); this.elige(this.activo); }
    else if (k === 'Escape') { e.preventDefault(); this.cierra(true); }
    else if (k === 'Tab') { this.cierra(false); }
  };
  root.ConsumosDesplegable = D;
})(typeof window !== 'undefined' ? window : globalThis);
