// Read-only public sources. Missions and inbox receipts are different entities:
// the daily scoreboard counts Yokup missions by creation day, never inbox rows.
export const REFRESH_MS = 60_000;
export const BOT_URL = 'https://bot.yokup.com';
export const MISSION_URL = 'https://api.yokup.com/fleet/missions';
export const AGENTS = Object.freeze([
  {key:'neo', name:'Neo', engine:'Claude'},
  {key:'trinity', name:'Trinity', engine:'Codex'},
  {key:'oraculo', name:'Oráculo', engine:'Codex'},
  {key:'morfeo', name:'Morfeo', engine:'Claude'},
  {key:'smith', name:'Smith', engine:'Grok'},
  {key:'cypher', name:'Cypher', engine:'Grok', optional:true},
  {key:'niobe', name:'Niobe', engine:'Codex', optional:true},
  {key:'merovingio', name:'Merovingio', engine:'Grok', optional:true}
]);
const OPEN = new Set(['pending','ack','in_progress','blocked']);
const STATUSES = ['open','in_progress','unconcluded','resolved','cancelled'];
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function agentKey(value) {
  const name = key(value).replace(/^(?:(?:infra|sub))+/,'').replace(/^agente/,'');
  return AGENTS.find(agent => name === agent.key || new RegExp('^'+agent.key+'(?:mbp|mba|mac|mini|grokbot|dgx|zenbook|pgx)').test(name))?.key || null;
}
export function timestamp(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number < 10_000_000_000 ? number * 1000 : number;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function madridDay(value = Date.now()) {
  const parts = Object.fromEntries(DAY_FORMAT.formatToParts(new Date(value)).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function recentStartDay(now) {
  const date = new Date(madridDay(now)+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()-2);
  return date.toISOString().slice(0,10);
}
export function machineName(value) {
  const name = key(value);
  if (!name) return 'Sin máquina publicada';
  if (name.includes('macbookpro16') || name.includes('mbp16')) return 'MacBook Pro 16';
  if (name.includes('macbookpro') && name.includes('14') || name.includes('mbp14')) return 'MacBook Pro 14';
  if (name.includes('macmini')) return 'Mac Mini';
  if (name.includes('grokbotbox')) return 'GrokBotBox';
  if (name.includes('grokbot')) return 'GrokBot';
  if (name.includes('macbookair')) {
    const suffix = name.includes('azul') ? ' Azul' : name.includes('rosa') ? ' Rosa' : name.includes('crema') ? ' Crema' : name.includes('plata') ? ' Plata' : '';
    return 'MacBook Air'+(name.includes('16') ? ' 16' : '')+suffix;
  }
  return String(value).slice(0,80);
}
export function humanTitle(text) {
  const cleaned = String(text || '').replace(/\s+/g,' ').replace(/^(?:\[[^\]]{1,120}\]\s*)+/,'')
    .replace(/^RE-TARGET MBP16\s*\([^)]*\)\.\s*/i,'')
    .replace(/^Sustituye a #\d+\.\s*/i,'')
    .replace(/^desk:[a-f0-9]+\s*/i,'').trim();
  return cleaned || 'Encargo sin descripción publicada';
}
export function normalizeTask(row) {
  const machine = machineName(row.target_machine);
  const alarm = String(row.text || '').match(/^\[ALARMA[^\]]*(?:origen|avanzar en|sigue con)\s*#(\d+)/i);
  return {
    id:Number(row.id), title:humanTitle(row.text),
    status:row.status === 'in_progress' ? 'in_progress' : row.status === 'blocked' ? 'blocked' : 'pending',
    createdAt:timestamp(row.ts), requester:String(row.from_name || 'Sin solicitante publicado'), machine,
    remote:machine !== 'MacBook Pro 16' && machine !== 'Sin máquina publicada',
    deadline:timestamp(row.deadline || row.due_at), duplicateIds:[], repeatOf:alarm ? Number(alarm[1]) : null,
    url:`https://www.admira.live/admira-live?persona=${encodeURIComponent(row.target_persona || '')}`
  };
}
export function markDuplicates(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    // A matching public excerpt is evidence of a possible repeat, not proof of
    // semantic equivalence. Keep dates, machines and all meaningful words.
    const signature = task.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/#\d+/g,'#').replace(/[^a-z0-9#]+/g,' ').trim();
    if (signature.length < 50 || signature.split(' ').length < 7) continue;
    const group = groups.get(signature) || []; group.push(task); groups.set(signature,group);
  }
  for (const group of groups.values()) if (group.length > 1) {
    for (const task of group) task.duplicateIds = group.filter(other => other.id !== task.id).map(other => other.id);
  }
  for (const task of tasks) {
    const original = task.repeatOf && tasks.find(other => other.id === task.repeatOf);
    if (original && original !== task) {
      task.duplicateIds = [...new Set([...task.duplicateIds,original.id])];
      original.duplicateIds = [...new Set([...original.duplicateIds,task.id])];
    }
  }
  return tasks;
}
export function missionScore(missions, day, owner = null, partial = false) {
  const selected = missions.filter(m => timestamp(m.created_at) && madridDay(timestamp(m.created_at)) === day && (!owner || agentKey(m.persona || m.assignee) === owner));
  const score = {total:selected.length,done:0,open:0,cancelled:0,percent:0,partial};
  for (const mission of selected) {
    if (mission.status === 'resolved' || mission.status === 'done') score.done++;
    else if (mission.status === 'cancelled') score.cancelled++;
    else score.open++;
  }
  // Cancelled missions stay in the total; they do not count as completed work.
  score.percent = score.total ? Math.round(score.done / score.total * 100) : 0;
  return score;
}
const unknownScore = () => ({total:null,done:null,open:null,cancelled:null,percent:null,partial:true});
async function json(fetchImpl,url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),15_000);
  try {
    const response = await fetchImpl(url,{cache:'no-store',signal:controller.signal,headers:{accept:'application/json'}});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.ok === false) throw new Error('Respuesta no válida');
    return data;
  } finally { clearTimeout(timeout); }
}
export async function readTodayMissions(fetchImpl,now) {
  const day = madridDay(now), limit = 200;
  const results = await Promise.allSettled(STATUSES.map(async status => {
    const found = [];
    // The API sorts newest creation first WITHIN each status. A mixed-status
    // page is not chronological and cannot safely stop at yesterday's row.
    for (let page=0;page<25;page++) {
      const data = await json(fetchImpl,`${MISSION_URL}?${new URLSearchParams({status,limit:String(limit),offset:String(page*limit)})}`);
      if (!Array.isArray(data.missions) || data.filters?.status !== status) throw new Error('Filtro de misiones no confirmado');
      const rows = data.missions;
      if (rows.some(row => row.status !== status)) throw new Error('Estado de misión incompatible con el filtro');
      for (const row of rows) if (timestamp(row.created_at) && madridDay(timestamp(row.created_at)) === day) found.push(row);
      if (rows.length < limit || rows.some(row => timestamp(row.created_at) && madridDay(timestamp(row.created_at)) < day) || (Number.isFinite(data.total) && (page+1)*limit >= data.total)) return found;
    }
    throw new Error('Límite de páginas de misiones alcanzado');
  }));
  const failed = results.filter(r => r.status === 'rejected').length;
  const missions = [...new Map(results.flatMap(r => r.status === 'fulfilled' ? r.value : []).map(m => [m.id,m])).values()];
  return {missions,partial:failed>0,unavailable:failed===STATUSES.length,failed};
}
export async function loadDashboard({fetchImpl=fetch,now=Date.now(),proxy=false}={}) {
  // Pages previews have a different origin from www. The bot only grants CORS
  // to www.admira.live, so browsers use our read-only, same-origin aggregator.
  if (proxy) return json(fetchImpl,'/api/pendiente');
  const day = madridDay(now), warnings = [];
  const [daily,presence,...inboxes] = await Promise.all([
    readTodayMissions(fetchImpl,now),
    json(fetchImpl,`${BOT_URL}/api/presence`).then(data => Array.isArray(data.presence) ? data.presence : []).catch(() => []),
    ...AGENTS.map(agent => json(fetchImpl,`${BOT_URL}/api/public/inbox?${new URLSearchParams({persona:agent.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')})}`)
      .then(data => {if (!Array.isArray(data.items)) throw new Error('Bandeja no válida');return {data,error:null};})
      .catch(error => ({data:null,error:String(error.message || error)})))
  ]);
  if (daily.partial) warnings.push(`Marcador de misiones ${daily.unavailable ? 'sin datos' : 'parcial'}: no respondieron ${daily.failed} de 5 estados. Se reintentará en 60 s.`);
  const allTasks = [];
  const agents = AGENTS.map((agent,index) => {
    const {data,error} = inboxes[index];
    const rows = data?.items || [];
    // The source is limited to 80 receipts per persona, regardless of query.
    const partial = !!error || rows.length >= 80;
    const tasks = rows.filter(row => agentKey(row.target_persona) === agent.key && OPEN.has(row.status)).map(normalizeTask);
    allTasks.push(...tasks);
    if (error) warnings.push(`${agent.name}: bandeja sin datos (${error}).`);
    else if (partial) warnings.push(`${agent.name}: se alcanzó el límite público de 80 encargos; carga y antiguos pueden estar incompletos.`);
    const counts = error ? {in_progress:null,pending:null,blocked:null,total:null} : {in_progress:0,pending:0,blocked:0,total:tasks.length};
    if (!error) tasks.forEach(task => counts[task.status]++);
    const recent = [], old = [];
    tasks.sort((a,b) => ({blocked:0,in_progress:1,pending:2}[a.status]-{blocked:0,in_progress:1,pending:2}[b.status]) || (b.createdAt||0)-(a.createdAt||0));
    for (const task of tasks) (task.createdAt && madridDay(task.createdAt) >= recentStartDay(now) ? recent : old).push(task);
    const declared = presence.filter(row => agentKey(row.persona) === agent.key && timestamp(row.updated) >= now-15*60_000);
    const engines = [...new Set(declared.map(row => String(row.runtime || '').trim()).filter(Boolean))];
    const machines = [...new Set([...declared.map(row => machineName(row.machine)),...tasks.map(task => task.machine),...daily.missions.filter(m => agentKey(m.persona || m.assignee) === agent.key).map(m => machineName(m.machine || m.loc))])];
    return {...agent,engine:engines.length ? engines.join(' · ') : `${agent.engine} (asignado)`,machines:machines.length ? machines : ['Sin máquina publicada'],score:daily.unavailable ? unknownScore() : missionScore(daily.missions,day,agent.key,daily.partial),counts,recent,old,partial,error};
  }).filter(agent => !agent.optional || agent.counts.total > 0 || agent.error);
  markDuplicates(allTasks);
  return {day,updatedAt:now,score:daily.unavailable ? unknownScore() : missionScore(daily.missions,day,null,daily.partial),agents,warnings,
    duplicateCount:allTasks.filter(task => task.duplicateIds.length).length,
    remoteCount:allTasks.filter(task => task.remote).length};
}
