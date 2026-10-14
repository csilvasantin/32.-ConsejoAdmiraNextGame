import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcamRequest} from '../src/webcam.js';
import {applyCors} from '../src/index.js';
const createFleetProxy = ({fetchImpl, relays}) => ({fetch: (request, env) => webcamRequest(request, env, {fetchImpl, relays, cors:applyCors})});
import {validMove} from '../src/webcam.js';

const csrf = 'a'.repeat(32), key = 'test-secret-webcam-key-do-not-ship';
const env = {WEBCAM_BASE: 'https://camera.example/webcam/', WEBCAM_KEY: key};
const state = {pan: 3600, tilt: -3600, zoom: 100, presets: ['sala']};
function setup({sessionStatus = 200, upstreamStatus = 200, failure, cameraValue = state} = {}) {
  const calls = [];
  const proxy = createFleetProxy({relays: [{base: 'https://auth.example/fleet'}], fetchImpl: async (url, options) => {
    calls.push({url, options});
    if (url.endsWith('/api/auth/session')) return Response.json({ok: true, email: 'user@example.com', csrf}, {status: sessionStatus});
    if (failure) throw new Error('network error at ' + url);
    if (url.endsWith('foto.jpg')) return new Response(new Uint8Array([255, 216, 255, 217]), {status: upstreamStatus, headers: {'Content-Type': 'image/jpeg', 'Location': 'https://camera.example/' + key, 'Set-Cookie': key}});
    return Response.json(cameraValue, {status: upstreamStatus});
  }});
  return {calls, request: (endpoint, {method = 'GET', headers = {}, body, config = env} = {}) => proxy.fetch(new Request('https://fleet.admira.live/api/webcam/' + endpoint, {method, headers: {Origin: 'https://www.admira.live', Cookie: '__Host-fleet_session=valid', ...headers}, body}), config)};
}
test('photo requires an authenticated cookie and rejects client keys/tokens', async () => {
  for (const headers of [{Cookie: ''}, {Cookie: '', Authorization: 'Bearer test', 'X-Fleet-Token': 'machine'}]) {
    const s = setup(); assert.equal((await s.request('foto.jpg', {headers})).status, 401); assert.equal(s.calls.length, 0);
  }
  const s = setup({sessionStatus: 401}); assert.equal((await s.request('foto.jpg')).status, 401); assert.equal(s.calls.length, 1);
});
test('closed authentication failures and rejected origins never contact camera', async () => {
  for (const sessionStatus of [403, 503, 302]) { const s = setup({sessionStatus}); assert.equal((await s.request('estado')).status, sessionStatus === 403 ? 401 : 503); assert.equal(s.calls.length, 1); }
  for (const Origin of ['', 'null', 'https://evil.example']) { const s = setup(); assert.equal((await s.request('estado', {headers: {Origin}})).status, 403); assert.equal(s.calls.length, 0); }
});
test('secret stays only in camera request; cookies never reach camera; photo uncached', async () => {
  const s = setup(); const r = await s.request('foto.jpg');
  assert.equal(r.status, 200); assert.equal(r.headers.get('Cache-Control'), 'no-store, private'); assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://www.admira.live');
  assert.equal(r.headers.get('Location'), null); assert.equal(r.headers.get('Set-Cookie'), null);
  assert.equal(s.calls[0].options.headers.Cookie, '__Host-fleet_session=valid');
  assert.equal(s.calls[1].url, env.WEBCAM_BASE + key + '/foto.jpg');
  assert.equal(new Headers(s.calls[1].options.headers).get('Cookie'), null); assert.equal(s.calls[1].options.redirect, 'manual');
  assert.ok(![...r.headers].flat().join().includes(key)); assert.ok(!(await r.text()).includes(key));
});
test('movement validates exact CSRF and input before calling camera', async () => {
  for (const token of ['', 'b'.repeat(32)]) { const s = setup(); const r = await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': token, 'Content-Type': 'application/json'}, body: '{"preset":"sala"}'}); assert.equal(r.status, 403); assert.equal(s.calls.length, 1); }
  for (const body of ['bad', '{}', '{"pan":522001}', '{"zoom":99}', '{"preset":"custom"}', '{"pan":0,"dpan":1}', '{"dpan":1.5}', '{"url":"https://evil.example"}', '{"__proto__":1}']) {
    const s = setup(); assert.equal((await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body})).status, 400); assert.equal(s.calls.length, 1);
  }
  const s = setup(); assert.equal((await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body: ' '.repeat(513)})).status, 413);
});
test('absolute, relative and six preset movements; no automatic replay', async () => {
  for (const value of [{pan: -522000, tilt: 360000, zoom: 400}, {dpan: 18000}, {dtilt: -18000}, {dzoom: 25}, ...['sala', 'pantallas-izquierda', 'pantallas-centro', 'pantallas-derecha', 'puerta', 'recreativa'].map(preset => ({preset}))]) {
    assert.ok(validMove(value)); const s = setup(); const r = await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body: JSON.stringify(value)}); assert.equal(r.status, 200); assert.deepEqual(JSON.parse(s.calls[1].options.body), value);
  }
  const s = setup({failure: true}); const r = await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body: '{"preset":"sala"}'}); assert.equal(r.status, 502); assert.equal(s.calls.length, 2); assert.ok(!(await r.text()).includes(key));
});
test('upstream error and arbitrary metadata cannot leak secret', async () => {
  for (const settings of [{failure: true}, {upstreamStatus: 404}, {upstreamStatus: 302}, {cameraValue: {pan: key}}]) { const s = setup(settings); const r = await s.request('estado'); assert.equal(r.status, 502); assert.ok(!(await r.text()).includes(key)); }
  const s = setup({cameraValue: {...state, debug: key}}); assert.deepEqual(await (await s.request('estado')).json(), {...state, presets: ['sala', 'pantallas-izquierda', 'pantallas-centro', 'pantallas-derecha', 'puerta', 'recreativa']});
  assert.equal((await s.request('mover', {method: 'POST', headers: {'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body: '{"preset":"sala"}'})).status, 200);
});
test('allowlisted endpoints, methods and HTTPS server configuration only', async () => {
  const s = setup(); await s.request('secret'); assert.ok(s.calls.every(call => !call.url.includes(key))); // normalized generic path, never a webcam URL
  assert.equal((await s.request('anything')).status, 404); assert.equal((await s.request('foto.jpg', {method: 'POST'})).status, 405);
  for (const config of [{}, {...env, WEBCAM_BASE: 'http://camera.example/'}, {...env, WEBCAM_KEY: '../bad'}]) assert.equal((await s.request('estado', {config})).status, 503);
});

test('successful empty move acknowledgment does not turn a physical move into an error', async () => {
  const calls = [];
  const proxy = createFleetProxy({relays: [{base: 'https://auth.example/fleet'}], fetchImpl: async url => {
    calls.push(url);
    return url.endsWith('/api/auth/session') ? Response.json({ok: true, email: 'user@example.com', csrf}) : new Response(null, {status: 204});
  }});
  const response = await proxy.fetch(new Request('https://fleet.admira.live/api/webcam/mover', {method: 'POST', headers: {Origin: 'https://www.admira.live', Cookie: '__Host-fleet_session=valid', 'X-Fleet-CSRF': csrf, 'Content-Type': 'application/json'}, body: '{"preset":"sala"}'}), env);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {ok: true}); assert.equal(calls.length, 2);
});

test('editable presets preserve only six validated server names and coordinates',async()=>{
 const ids=['sala','pantallas-izquierda','pantallas-centro','pantallas-derecha','puerta','recreativa'];
 const lista=ids.map((id,i)=>({id,nombre:'Vista '+i,pan:0,tilt:0,zoom:100,debug:key}));
 const s=setup({cameraValue:{...state,lista}});const r=await s.request('estado');
 assert.equal(r.status,200);const output=await r.json();assert.equal(output.lista.length,6);assert.equal(output.lista[5].nombre,'Vista 5');assert.ok(!JSON.stringify(output).includes(key));
 for(const bad of [lista.slice(1),lista.map(x=>({...x,nombre:'x'.repeat(25)})),lista.map(x=>({...x,zoom:900})),lista.map(x=>({...x,id:'sala'}))]){
  const t=setup({cameraValue:{...state,lista:bad}});assert.equal((await t.request('estado')).status,502);
 }
});
test('save and rename require CSRF, fixed id and a bounded name; never replay',async()=>{
 for(const endpoint of ['presets/guardar','presets/renombrar']){
  const valid={id:'recreativa',nombre:'Mesa <2>'};const s=setup();const options={method:'POST',headers:{'Content-Type':'application/json','X-Fleet-CSRF':csrf},body:JSON.stringify(valid)};
  assert.equal((await s.request(endpoint,options)).status,200);assert.deepEqual(JSON.parse(s.calls[1].options.body),valid);assert.ok(s.calls[1].url.endsWith('/'+endpoint));
  for(const body of [{id:'unknown',nombre:'A'},{id:'sala',nombre:''},{id:'sala',nombre:'x'.repeat(25)},{id:'sala',nombre:'a\nb'},{id:'sala',nombre:'A',url:'evil'}])assert.equal((await s.request(endpoint,{...options,body:JSON.stringify(body)})).status,400);
  assert.equal((await s.request(endpoint,{...options,headers:{'Content-Type':'application/json'}})).status,403);
 }
 const s=setup();assert.equal((await s.request('presets/guardar',{method:'POST',headers:{'Content-Type':'application/json','X-Fleet-CSRF':csrf},body:'{"id":"sala"}'})).status,200);
 assert.equal((await s.request('presets/renombrar',{method:'POST',headers:{'Content-Type':'application/json','X-Fleet-CSRF':csrf},body:'{"id":"sala"}'})).status,400);
});
test('player modules are authenticated and strip upstream credentials and headers',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.endsWith('/api/auth/session')?Response.json({ok:true,email:'user@example.com',csrf}):new Response("export const example = 'safe';",{headers:{'Content-Type':'application/javascript','Set-Cookie':key,'Location':key}});};
 for(const module of ['video-stream.js','video-rtc.js']){
  const r=await webcamRequest(new Request('https://fleet.admira.live/api/webcam/'+module,{headers:{Origin:'https://www.admira.live',Cookie:'__Host-fleet_session=valid'}}),env,{fetchImpl,relays:[{base:'https://auth.example'}],cors:applyCors});
  assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/javascript/);assert.equal(r.headers.get('Location'),null);assert.ok(!(await r.text()).includes(key));assert.equal(new Headers(calls.at(-1).options.headers).get('Cookie'),null);
 }
 const s=setup();assert.equal((await s.request('video-stream.js',{headers:{Cookie:''}})).status,401);
});
test('WebSocket upgrade requires origin and session; passes socket without secret headers',async()=>{
 const NativeResponse=globalThis.Response,socket={fixture:true},calls=[];
 // Node Fetch cannot construct status 101. Model only the Cloudflare extension.
 globalThis.Response=class extends NativeResponse{constructor(body,options){if(options?.status===101){super(null,{headers:options.headers});Object.defineProperty(this,'status',{value:101});this.webSocket=options.webSocket;}else super(body,options);}};
 try {
  const fetchImpl=async(url,options)=>{calls.push({url,options});return url.endsWith('/api/auth/session')?NativeResponse.json({ok:true,email:'user@example.com',csrf}):{status:101,webSocket:socket};};
  const request=headers=>new Request('https://fleet.admira.live/api/webcam/ws',{headers:{Origin:'https://www.admira.live',Cookie:'__Host-fleet_session=valid',Upgrade:'websocket',...headers}});
  const context={fetchImpl,relays:[{base:'https://auth.example'}],cors:applyCors};
  assert.equal((await webcamRequest(request({Cookie:''}),env,context)).status,401);
  assert.equal((await webcamRequest(request({Origin:'https://evil.example'}),env,context)).status,403);
  assert.equal((await webcamRequest(request({Upgrade:''}),env,context)).status,426);
  const r=await webcamRequest(request(),env,context);assert.equal(r.status,101);assert.equal(r.webSocket,socket);assert.equal(calls.at(-1).url,env.WEBCAM_BASE+key+'/ws');assert.equal(calls.at(-1).options.headers.Upgrade,'websocket');assert.equal(new Headers(calls.at(-1).options.headers).get('Cookie'),null);assert.ok(![...r.headers].flat().join().includes(key));
 }finally{globalThis.Response=NativeResponse;}
});
