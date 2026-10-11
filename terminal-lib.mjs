// Inventario publicado por tmux; independiente de las listas de la cuadratura.
const clean = (v, n = 160) => String(v ?? '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, n);
export function normalizarTerminales(items) {
  if (!Array.isArray(items)) return null; // publicador antiguo: inventario desconocido
  const seen = new Set();
  return items.slice(0, 256).filter(t => t && /^\$\d+$/.test(t.id) && typeof t.sesion === 'string' && t.sesion.length>0 && t.sesion.length<=256 && !/[\x00-\x1f\x7f]/.test(t.sesion) && Number.isSafeInteger(t.creada) && t.creada > 0)
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .map(t => ({ id: t.id, sesion: t.sesion, creada: t.creada, agente: clean(t.agente, 80), runtime: clean(t.runtime, 40),
      estado: ['vivo','idle','pendiente','login'].includes(t.estado) ? t.estado : 'desconocido',
      encargo: clean(t.encargo, 240), encargoId: clean(t.encargoId, 40),
      encargoStatus: ['in_progress','pending','ack','done'].includes(t.encargoStatus) ? t.encargoStatus : 'unknown', mision: clean(t.mision, 240) }));
}
export function inventarioTerminales(docs, ahora = Date.now(), equipos = []) {
  const byHost = new Map((docs || []).filter(Boolean).map(d => [d.maquina, d]));
  const maquinas = [...new Set([...equipos, ...byHost.keys()])].map(maquina => {
    const d = byHost.get(maquina), ultimoLatido = d?.ts || null;
    const fresco = !!ultimoLatido && ahora - ultimoLatido < 120000 && !!d.terminalesTs && ahora - d.terminalesTs < 120000;
    const disponible = fresco && Array.isArray(d.terminales);
    return { maquina, ultimoLatido, disponible, terminales: disponible ? d.terminales : [],
      motivo: !fresco ? 'sin datos' : !Array.isArray(d.terminales) ? 'publicador sin inventario tmux' : '' };
  });
  return { maquinas, ahora };
}
