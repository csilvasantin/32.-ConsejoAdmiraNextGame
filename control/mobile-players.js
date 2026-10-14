(function (root) {
  'use strict';
  const FRESH_SECONDS = 300;
  const isMobile = m => !!m && ['ios', 'android'].includes(m.platform);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

  // A matching screen is the only authority. Presence, SSH, profile status and
  // the server's online boolean cannot turn a stale mobile heartbeat green.
  function observe(machine, screens, {now = Date.now(), available = true} = {}) {
    const screen = available && screens.find(s => s.screen === machine.signage.screen);
    const ages = [];
    if (screen && Number.isFinite(screen.age_seconds) && screen.age_seconds >= 0) ages.push(screen.age_seconds);
    if (screen && Number.isFinite(screen.last_seen) && screen.last_seen > 0) {
      const seen = screen.last_seen < 1e12 ? screen.last_seen * 1000 : screen.last_seen;
      if (seen <= now + 60000) ages.push(Math.max(0, (now - seen) / 1000));
    }
    const ageSeconds = ages.length ? Math.ceil(Math.max(...ages)) : null;
    return {...machine, online: ageSeconds !== null && ageSeconds <= FRESH_SECONDS,
      ageSeconds, heartbeatAvailable: available};
  }

  function channelUrl(machine) {
    return 'https://www.admira.tv/canal?screen=' + encodeURIComponent(machine.signage.screen);
  }

  function cardHtml(m) {
    const age = m.ageSeconds == null ? 'sin latido registrado' : 'último latido hace ' + m.ageSeconds + ' s';
    const signal = m.heartbeatAvailable ? age : 'consulta de latidos no disponible';
    const note = m.platform === 'android'
      ? 'Beta nativa Fold: aún no envía latidos. «Offline» indica ausencia de señal, no que el móvil esté apagado.'
      : 'Estado del player por su latido (vigente hasta 5 minutos).';
    return `<div class="card mobile-card" data-card="${escape(m.id)}">
      <div class="top"><span class="mobile-icon" aria-hidden="true">📱</span>
        <div class="cardmeta"><div class="nm">${escape(m.name)}</div><div class="role">Player DS · móvil · ${escape(m.platform)}</div></div>
        <span class="drag-handle" draggable="true" data-drag="${escape(m.id)}" title="Arrastra para reordenar">⠿</span>
      </div>
      <div class="mobile-state ${m.online ? 'online' : 'offline'}">${m.online ? '🟢 online' : '⚪ offline'} · ${escape(signal)}</div>
      <div class="mobile-detail">screen: ${escape(m.signage.screen)}<br>${escape(note)}</div>
      <a class="mobile-open" href="${escape(channelUrl(m))}" target="_blank" rel="noopener" role="button" title="Abrir el canal en este navegador; no arranca ni apaga el móvil">⏻ abrir canal</a>
      <div class="mobile-detail">Abre el canal en este navegador.</div>
    </div>`;
  }
  root.AdmiraMobilePlayers = {FRESH_SECONDS, isMobile, observe, channelUrl, cardHtml};
})(globalThis);
