// Read-only bridge for Pages previews: api.admira.store restricts browser CORS
// to canonical sites. The heartbeat authority remains signage/screens.
export async function onRequest({request}) {
  const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store'};
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405, headers:{...headers, Allow:'GET'}});
  try {
    const response = await fetch('https://api.admira.store/signage/screens', {
      headers:{Accept:'application/json'}, cache:'no-store', signal:AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error('upstream_unavailable');
    const data = await response.json();
    if (!Array.isArray(data.screens)) throw new Error('invalid_upstream');
    const screens = data.screens.filter(s => s && typeof s.screen === 'string').map(s => ({
      screen:s.screen,
      last_seen:Number.isFinite(s.last_seen) ? s.last_seen : null,
      age_seconds:Number.isFinite(s.age_seconds) ? s.age_seconds : null
    }));
    return new Response(JSON.stringify({screens, source:'https://api.admira.store/signage/screens'}), {headers});
  } catch (_) {
    return new Response(JSON.stringify({error:'heartbeat_unavailable'}), {status:503, headers});
  }
}
