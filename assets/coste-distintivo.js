/* #5670: presenta solo los tres estados calculados por el servidor. */
(function (root) {
  function html(coste, en) {
    var c = ['pago', 'gratis'].includes(coste) ? coste : 'desconocido';
    var label = en ? { pago: 'PAID', gratis: 'FREE', desconocido: 'UNKNOWN' }[c] : c.toUpperCase();
    return '<b class="mz-ins mz-ins-' + c + '">' + label + '</b>';
  }
  root.CosteDistintivo = { html: html };
})(typeof window !== 'undefined' ? window : globalThis);
