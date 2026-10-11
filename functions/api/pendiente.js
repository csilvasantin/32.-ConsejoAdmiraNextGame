import { loadDashboard } from '../../pendiente-lib.mjs';

// Public reads only. No credentials, caller-selected upstream, mutation or
// forwarding of cookies/authorization. The returned model omits account data.
export async function onRequest(context) {
  const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ok:false,error:'Solo lectura'}),{status:405,headers:{...headers,allow:'GET'}});
  }
  try {
    return new Response(JSON.stringify(await loadDashboard()),{headers});
  } catch {
    return new Response(JSON.stringify({ok:false,error:'No se ha podido consultar la carga'}),{status:502,headers});
  }
}
