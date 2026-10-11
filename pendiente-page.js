import { loadDashboard, REFRESH_MS } from './pendiente-lib.mjs';

const elements = Object.fromEntries(['refresh', 'day-score', 'score-context', 'day-date', 'score-metrics', 'day-progress', 'reading-status', 'notices', 'agents'].map(id => [id, document.getElementById(id)]));
const number = new Intl.NumberFormat('es-ES');
const dateTime = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' });
const deadlineFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusNames = { in_progress: 'En curso', pending: 'Pendiente', blocked: 'Bloqueado' };
const openSections = new Map();
let lastDashboard = null;
let fetching = false;
let refreshTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function count(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? number.format(Math.max(0, Number(value))) : '—';
}

function timeLabel(value, formatter = dateTime) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? formatter.format(new Date(time)) : 'sin fecha publicada';
}

function safeTaskUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

function progress(score, agent = false) {
  const known = score?.total !== null && score?.total !== undefined && score?.percent !== null && score?.percent !== undefined;
  const total = Math.max(0, Number(score?.total) || 0);
  const done = Math.max(0, Number(score?.done) || 0);
  const percent = Math.min(100, Math.max(0, Number(score?.percent) || 0));
  const fragment = document.createDocumentFragment();
  const track = el('div', 'progress-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Misiones de hoy realizadas');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  if (known) track.setAttribute('aria-valuenow', String(Math.round(percent)));
  track.setAttribute('aria-valuetext', !known ? 'Marcador pendiente de confirmar' : total ? `${count(done)} de ${count(total)} misiones realizadas${score?.partial ? ', lectura parcial' : ''}` : 'No hay misiones de hoy en esta lectura');
  const fill = el('div', 'progress-fill');
  fill.style.width = `${percent}%`;
  track.append(fill);
  fragment.append(track);
  if (!agent) {
    const caption = el('p', 'progress-caption');
    caption.append(el('strong', '', known ? `${count(Math.round(percent))}% realizadas` : 'Marcador por confirmar'), el('span', '', !known ? 'Sin lectura suficiente' : total ? `${count(done)} de ${count(total)} misiones de hoy` : 'Sin misiones de hoy en esta lectura'));
    fragment.append(caption);
  }
  if (score?.retained) fragment.append(el('p', 'partial-note', `Último marcador disponible: ${timeLabel(score.readingAt)} · Madrid. No se ha podido actualizar.`));
  else if (score?.partial) fragment.append(el('p', 'partial-note', 'Lectura parcial: las cifras pueden estar incompletas.'));
  return fragment;
}

function scoreMetrics(score, agent = false) {
  const fragment = document.createDocumentFragment();
  const metrics = agent
    ? [['total', 'Total'], ['done', 'Realizadas'], ['open', 'Pendientes'], ['cancelled', 'Anuladas']]
    : [['total', 'Total de misiones'], ['done', 'Realizadas'], ['open', 'Pendientes · abiertas'], ['cancelled', 'Anuladas']];
  for (const [key, label] of metrics) {
    const metric = el('div', agent ? key : `metric metric-${key}`);
    metric.append(el('strong', '', count(score?.[key])), el('span', '', label));
    fragment.append(metric);
  }
  return fragment;
}

function taskRow(task) {
  const item = el('li', 'task');
  const header = el('div', 'task-header');
  const title = el('p', 'task-title');
  const url = safeTaskUrl(task.url);
  const titleContent = url ? el('a') : el('span');
  if (url) titleContent.href = url;
  titleContent.append(el('span', 'task-id', `#${task.id}`), document.createTextNode(` ${task.title || 'Encargo sin descripción publicada'}`));
  title.append(titleContent);
  const status = statusNames[task.status] ? task.status : 'pending';
  header.append(title, el('span', `status status-${status}`, statusNames[status]));
  item.append(header);

  const metadata = el('div', 'task-meta');
  const requester = el('span');
  requester.append(el('b', '', 'Pide: '), document.createTextNode(task.requester || 'sin solicitante publicado'));
  const created = el('span');
  created.append(el('b', '', 'Creado: '), document.createTextNode(timeLabel(task.createdAt)));
  const deadline = el('span', task.deadline && Number(task.deadline) < Date.now() ? 'deadline-overdue' : '');
  deadline.append(el('b', '', 'Plazo: '), document.createTextNode(task.deadline ? timeLabel(task.deadline, deadlineFormat) : 'sin plazo publicado'));
  if (task.deadline && Number(task.deadline) < Date.now()) deadline.append(document.createTextNode(' · vencido'));
  metadata.append(requester, deadline, created);
  item.append(metadata);

  const flags = el('div', 'task-flags');
  if (Array.isArray(task.duplicateIds) && task.duplicateIds.length) {
    const duplicateText = task.duplicateIds.map(id => `#${id}`).join(', ');
    flags.append(el('span', 'task-flag task-duplicate', `Posible repetido · texto similar a ${duplicateText}`));
  }
  if (task.remote) flags.append(el('span', 'task-flag task-remote', `Otra máquina · ${task.machine || 'destino distinto del MBP16'}`));
  if (flags.childElementCount) item.append(flags);
  return item;
}

function taskSection(agentKey, tasks, old = false, unavailable = false) {
  const sectionKey = `${agentKey}:${old ? 'old' : 'recent'}`;
  const section = el('details', `task-section${old ? ' old-tasks' : ''}`);
  section.dataset.sectionKey = sectionKey;
  section.open = openSections.has(sectionKey) ? openSections.get(sectionKey) : !old;
  const summary = el('summary');
  const taskCount = unavailable ? '—' : count(tasks.length);
  summary.append(el('span', '', old ? `Antiguos sin coger (${taskCount})` : `Hoy y recientes (${taskCount})`));
  summary.append(el('span', '', old ? 'Antes de 3 días' : 'Últimos 3 días'));
  section.append(summary);
  if (tasks.length) {
    const list = el('ul', 'task-list');
    list.append(...tasks.map(taskRow));
    section.append(list);
  } else {
    section.append(el('p', 'empty-state', unavailable ? 'No se ha podido leer esta parte de la carga.' : old ? 'No hay encargos antiguos abiertos.' : 'Sin encargos abiertos en los últimos 3 días.'));
  }
  section.addEventListener('toggle', () => openSections.set(sectionKey, section.open));
  return section;
}

function agentCard(agent) {
  const card = el('article', 'agent-card');
  card.dataset.agent = agent.key;
  card.setAttribute('aria-labelledby', `agent-${agent.key}`);
  const header = el('header', 'agent-head');
  const identity = el('div', 'agent-identity');
  const nameRow = el('div', 'agent-name-row');
  const name = el('h3', '', agent.name);
  name.id = `agent-${agent.key}`;
  nameRow.append(name, el('span', 'engine', agent.engine || 'Motor sin publicar'));
  identity.append(nameRow, el('p', 'agent-machines', Array.isArray(agent.machines) && agent.machines.length ? `Máquinas / destinos: ${agent.machines.join(' · ')}` : 'Máquina sin publicar'));
  const total = el('div', 'agent-total');
  total.append(el('strong', '', count(agent.counts?.total)), document.createTextNode('abiertos en total'));
  header.append(identity, total);
  card.append(header);

  const counters = el('div', 'agent-counts');
  for (const [key, label] of [['in_progress', 'en curso'], ['pending', 'pendientes'], ['blocked', 'bloqueados']]) {
    const counter = el('div', `load-count ${key}`);
    counter.append(el('strong', '', count(agent.counts?.[key])), document.createTextNode(label));
    counters.append(counter);
  }
  card.append(counters);

  const day = el('div', 'agent-day');
  const dayTop = el('div', 'agent-day-top');
  dayTop.append(el('strong', '', 'Misiones de hoy'), el('span', '', agent.score?.percent === null || agent.score?.percent === undefined ? 'Por confirmar' : `${count(Math.round(Number(agent.score.percent)))}% realizadas`));
  const metrics = el('div', 'agent-score-metrics');
  metrics.append(scoreMetrics(agent.score, true));
  day.append(dayTop, metrics, progress(agent.score, true));
  card.append(day);
  if (agent.error) card.append(el('p', 'agent-error', `${agent.retained ? `Carga de ${timeLabel(agent.readingAt)} · Madrid. No se ha podido actualizar. ` : ''}${agent.error}`));
  else if (agent.partial && !agent.score?.partial) card.append(el('p', 'agent-error', 'Lectura parcial de los encargos de este agente.'));
  const unavailable = agent.counts?.total === null || agent.counts?.total === undefined;
  card.append(taskSection(agent.key, agent.recent || [], false, unavailable), taskSection(agent.key, agent.old || [], true, unavailable));
  return card;
}

function rememberOpenSections() {
  for (const section of elements.agents.querySelectorAll('details[data-section-key]')) openSections.set(section.dataset.sectionKey, section.open);
}

function renderNotices(dashboard, fetchError = null) {
  elements.notices.replaceChildren();
  if (fetchError) elements.notices.append(el('p', 'notice notice-error', fetchError));
  const duplicateCount = Number(dashboard?.duplicateCount) || 0;
  const remoteCount = Number(dashboard?.remoteCount) || 0;
  if (duplicateCount || remoteCount) {
    const notice = el('div', 'notice');
    const parts = [];
    if (duplicateCount) parts.push(`${count(duplicateCount)} ${duplicateCount === 1 ? 'encargo marcado como posible repetido' : 'encargos marcados como posibles repetidos'}`);
    if (remoteCount) parts.push(`${count(remoteCount)} ${remoteCount === 1 ? 'encargo destinado a otra máquina' : 'encargos destinados a otra máquina'}`);
    notice.append(el('strong', '', 'Revisar: '), document.createTextNode(`${parts.join(' · ')}. Mira las etiquetas de cada encargo.`));
    elements.notices.append(notice);
  }
  if (Array.isArray(dashboard?.warnings) && dashboard.warnings.length) {
    const notice = el('div', 'notice');
    const list = el('ul', 'notice-list');
    for (const warning of dashboard.warnings) list.append(el('li', '', warning));
    notice.append(list);
    elements.notices.append(notice);
  }
}

function render(dashboard, { stale = false, error = null } = {}) {
  rememberOpenSections();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dashboard.day || '') ? new Date(`${dashboard.day}T12:00:00+02:00`) : new Date(dashboard.updatedAt || Date.now());
  elements['day-date'].textContent = dayFormat.format(date);
  elements['score-context'].textContent = `Misiones creadas hoy · toda la flota · Madrid${dashboard.score?.partial ? ' · lectura parcial' : ''}`;
  elements['score-metrics'].replaceChildren(scoreMetrics(dashboard.score));
  elements['day-progress'].replaceChildren(progress(dashboard.score));
  elements['day-score'].setAttribute('aria-busy', 'false');
  elements.agents.replaceChildren(...dashboard.agents.map(agentCard));
  elements.agents.setAttribute('aria-busy', 'false');
  const partial = dashboard.score?.partial || dashboard.agents.some(agent => agent.partial || agent.error);
  const reading = elements['reading-status'];
  reading.className = `reading-status ${stale || partial ? 'is-stale' : 'is-live'}`;
  reading.textContent = `${stale ? 'Última lectura disponible' : partial ? 'Lectura parcial' : 'En vivo'} · ${timeLabel(dashboard.updatedAt)} · Madrid`;
  renderNotices(dashboard, error);
}

function retainFailedAgents(dashboard) {
  const sameDay = dashboard.day === lastDashboard?.day;
  const retainScore = (score, previous) => {
    if (score?.total === null && previous?.total !== null && previous?.total !== undefined && sameDay) {
      return { ...previous, partial: true, retained: true, readingAt: previous.readingAt || lastDashboard.updatedAt };
    }
    return score;
  };
  return {
    ...dashboard,
    score: retainScore(dashboard.score, lastDashboard?.score),
    agents: dashboard.agents.map(agent => {
      const previous = lastDashboard?.agents.find(item => item.key === agent.key);
      const score = retainScore(agent.score, previous?.score);
      if (agent.error && previous?.counts?.total !== null && previous?.counts?.total !== undefined && !(agent.recent?.length || agent.old?.length)) {
        return { ...previous, error: agent.error, partial: true, retained: true, readingAt: previous.readingAt || lastDashboard.updatedAt, score };
      }
      return { ...agent, score, readingAt: agent.error ? null : dashboard.updatedAt };
    })
  };
}

async function refresh() {
  if (fetching) return;
  fetching = true;
  elements.refresh.disabled = true;
  elements.refresh.textContent = 'Leyendo…';
  if (!lastDashboard) elements['reading-status'].textContent = 'Consultando el bot-inbox…';
  try {
    const result = await loadDashboard({ proxy: true });
    if (!result || !Array.isArray(result.agents) || !result.score) throw new Error('La fuente no devolvió una lectura válida.');
    const dashboard = retainFailedAgents(result);
    lastDashboard = dashboard;
    render(dashboard);
  } catch (error) {
    const message = 'No se ha podido actualizar el bot-inbox. Se volverá a intentar automáticamente en 60 s.';
    if (lastDashboard) render(lastDashboard, { stale: true, error: message });
    else {
      elements['reading-status'].className = 'reading-status is-stale';
      elements['reading-status'].textContent = 'Sin lectura disponible';
      elements['day-score'].setAttribute('aria-busy', 'false');
      elements.agents.setAttribute('aria-busy', 'false');
      elements.agents.replaceChildren(el('p', 'empty-state initial-loading', 'La carga del equipo aparecerá cuando se recupere la fuente.'));
      elements['day-progress'].replaceChildren(el('p', 'loading-copy', 'Todavía no se puede confirmar el marcador de hoy.'));
      renderNotices(null, message);
    }
  } finally {
    fetching = false;
    elements.refresh.disabled = false;
    elements.refresh.textContent = 'Actualizar';
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, REFRESH_MS);
  }
}

elements.refresh.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!lastDashboard || Date.now() - Number(lastDashboard.updatedAt) >= REFRESH_MS)) refresh();
});
refresh();
