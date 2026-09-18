'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createGrokBotBridge, createPrivateStore, canonicalPersona, loadProviderToken} = require('./grokbot-bridge');
const {sessionMutationError} = require('./session-csrf');

const user = {email:'carlos@example.test', jti:'verified-session', csrf:'csrf-value'};
const other = {email:'other@example.test', jti:'other-session'};
const token = 'test-provider-token-not-a-real-secret-123';
const reply = (body, status=200) => ({ok:status >= 200 && status < 300, text:async () => JSON.stringify(body)});
const request = (overrides={}) => ({message_id:'test-message-001', persona:'Steve Jobs', prompt:'Prepara una propuesta para el Consejo.', ...overrides});
function setup(t, fetchImpl, options={}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admira-grokbot-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const stateFile = path.join(dir,'state.json');
  const config = {environment:{GROKBOT_BRIDGE_STATE_FILE:stateFile}, tokenProvider:() => token, now:() => 1789700000000, fetchImpl,...options};
  return {bridge:createGrokBotBridge(config), config, stateFile};
}
function rejection(code) { return error => error.code === code; }

test('only four verified council aliases are supported; no arbitrary target or role', () => {
  assert.equal(canonicalPersona(' Steve Wozniak '),'Wozniak');
  assert.equal(canonicalPersona('Disney'),'Disney');
  assert.equal(canonicalPersona('George Lucas'),'Lucas');
  assert.equal(canonicalPersona('CEO'),null);
  assert.equal(canonicalPersona('JobsMacMini'),null);
});

test('capabilities expose true provider limits and no token', t => {
  const {bridge} = setup(t,async () => {throw new Error('must not call upstream');});
  const capabilities = bridge.capabilities();
  assert.equal(capabilities.provider,'webhook');
  assert.equal(capabilities.available,true);
  for (const key of ['historyFromDesktop','desktop','attachments','routines','interrupt']) assert.equal(capabilities[key],false);
  assert.equal(capabilities.personas.length,4);
  assert.doesNotMatch(JSON.stringify(capabilities),new RegExp(token));
  assert.equal(createGrokBotBridge({environment:{},store:{read:() => new Map()}}).capabilities().reason,'provider_not_configured');
});

test('send uses verified session author, existing GrokBot inbox, and no mission', async t => {
  const seen=[];
  const {bridge,stateFile} = setup(t,async (url,init) => {seen.push({url,init});return reply({ok:true,id:42});});
  const message = await bridge.send(user,request());
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'https://bot.yokup.com/api/bot-inbox');
  assert.equal(seen[0].init.headers.authorization,'Bearer '+token);
  assert.equal(seen[0].init.redirect,'error');
  assert.deepEqual(JSON.parse(seen[0].init.body),{text:request().prompt,target_persona:'Jobs',target_machine:'grokbot',from:'Admira.live · carlos@example.test',materialize_mission:false});
  assert.equal(message.status,'pending');
  assert.match(message.id,/^gb_[a-f0-9]{48}$/);
  assert.deepEqual(Object.keys(message).sort(),['createdAt','id','persona','prompt','status','text','updatedAt'].sort());
  assert.equal(fs.statSync(stateFile).mode & 0o777,0o600);
  assert.doesNotMatch(fs.readFileSync(stateFile,'utf8'),new RegExp(token));
});

test('unauthenticated requests and injected routing/identity fields cannot send', async t => {
  let count=0;
  const {bridge} = setup(t,async () => {count++;return reply({ok:true,id:1});});
  await assert.rejects(bridge.send({email:user.email},request()),rejection('authenticated_session_required'));
  for (const patch of [{from:'another-person'},{target_persona:'Wozniak'},{attachments:['file']},{persona:'Tim Cook'},{prompt:'hi'},{message_id:'x'}]) {
    await assert.rejects(bridge.send(user,request(patch)));
  }
  assert.equal(count,0);
});

test('concurrent duplicate sends and restart replay submit exactly once', async t => {
  let count=0, release;
  const latch = new Promise(resolve => {release=resolve;});
  const {bridge,config,stateFile} = setup(t,async () => {count++;await latch;return reply({ok:true,id:57});});
  const first=bridge.send(user,request()), second=bridge.send(user,request());
  assert.equal(count,1);
  assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).messages[0].status,'unknown','reservation is durable before provider acknowledgement');
  release();
  const [a,b]=await Promise.all([first,second]);
  assert.deepEqual(a,b);
  assert.deepEqual(await createGrokBotBridge(config).send(user,request()),a);
  assert.equal(count,1);
  await assert.rejects(bridge.send(user,request({prompt:'Contenido distinto con el mismo id.'})),rejection('message_id_conflict'));
  assert.equal(count,1);
});

test('timeout is unknown, durable, and never retried automatically or by same id', async t => {
  let count=0;
  const {bridge,config} = setup(t,async (_url,init) => {
    count++;
    return new Promise((_resolve,reject) => init.signal.addEventListener('abort',() => reject(new Error('secret and private upstream error')),{once:true}));
  },{timeoutMs:5});
  const message = await bridge.send(user,request());
  assert.equal(message.status,'unknown');
  assert.equal(message.text,'');
  assert.deepEqual(await createGrokBotBridge(config).send(user,request()),message);
  assert.deepEqual(await bridge.get(user,message.id),message);
  assert.equal(count,1);
});

test('non-JSON, rejection, and missing upstream receipt fail without leaking provider details', async t => {
  for (const fetchImpl of [async () => ({ok:false,text:async () => token}), async () => reply({ok:false,error:token},403), async () => reply({ok:true})]) {
    const {bridge}=setup(t,fetchImpl);
    const message=await bridge.send(user,request());
    assert.equal(message.status,'unknown');
    assert.doesNotMatch(JSON.stringify(message),new RegExp(token));
  }
});

test('ownership checked before any provider read; raw inbox ids cannot be enumerated', async t => {
  let count=0;
  const {bridge}=setup(t,async () => {count++;return reply({ok:true,id:12});});
  const sent=await bridge.send(user,request());
  await assert.rejects(bridge.get(other,sent.id),rejection('message_not_found'));
  await assert.rejects(bridge.get(user,'12'),rejection('message_not_found'));
  assert.equal(count,1);
  assert.deepEqual(bridge.list(other,'Jobs'),[]);
});

test('progress preserves full response and author association; done is cached', async t => {
  let count=0;
  const answer='Respuesta extensa. '.repeat(100);
  const {bridge}=setup(t,async (_url,init) => {
    count++;
    return init.method==='POST' ? reply({ok:true,id:13}) : reply({ok:true,item:{id:13,target_persona:'Jobs',target_machine:'grokbot',status:'done',note:answer,done_at:1789700001}});
  });
  const sent=await bridge.send(user,request());
  const message=await bridge.get({...user,jti:'new-verified-session'},sent.id);
  assert.equal(message.status,'done');assert.equal(message.text,answer);
  assert.equal(message.updatedAt,'2026-09-18T02:53:21.000Z');
  assert.deepEqual(await bridge.get(user,sent.id),message);
  assert.equal(count,2);
});

test('provider receipt mismatch is not attributed to the selected counsellor', async t => {
  const {bridge}=setup(t,async (_url,init) => init.method==='POST' ? reply({ok:true,id:13}) : reply({ok:true,item:{id:13,target_persona:'Lucas',target_machine:'grokbot',status:'done',note:'another bot'}}));
  const sent=await bridge.send(user,request());
  await assert.rejects(bridge.get(user,sent.id),rejection('provider_receipt_mismatch'));
  assert.equal(bridge.list(user,'Jobs')[0].text,'');
});

test('history is filtered by verified email and counsellor with stable public fields', async t => {
  let sequence=0;
  const {bridge}=setup(t,async () => reply({ok:true,id:++sequence}));
  const own=await bridge.send(user,request());
  await bridge.send(other,request());
  await bridge.send(user,request({persona:'Lucas',message_id:'test-message-002'}));
  assert.deepEqual(bridge.list(user,'Steve Jobs'),[own]);
  assert.equal(bridge.list(other,'Jobs').length,1);
  assert.throws(() => bridge.list(user,'Tim Cook'),rejection('unsupported_persona'));
});

test('private state refuses unsafe modes, symlinks and corrupted data before send', async t => {
  for (const kind of ['mode','symlink','corrupt']) {
    let count=0;
    const {bridge,stateFile}=setup(t,async () => {count++;return reply({ok:true,id:4});});
    if(kind==='symlink')fs.symlinkSync('/dev/null',stateFile);
    else fs.writeFileSync(stateFile,kind==='corrupt'?'broken':JSON.stringify({version:1,messages:[]}),{mode:kind==='mode'?0o644:0o600});
    await assert.rejects(bridge.send(user,request()),rejection('bridge_state_unavailable'));
    assert.equal(count,0);
  }
});

test('provider token uses only explicit env/file and enforces private secret files', t => {
  const {stateFile}=setup(t,async () => {});
  assert.throws(() => loadProviderToken({}),rejection('provider_not_configured'));
  assert.equal(loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY:token}),token);
  fs.writeFileSync(stateFile,token,{mode:0o600});
  assert.equal(loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),token);
  fs.chmodSync(stateFile,0o644);
  assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
  assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY:'',ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
});

test('opaque short provider credentials are accepted without weakening format or file checks', t => {
  const {stateFile}=setup(t,async () => {});
  const shortFixture='demo-key9'; // Synthetic fixture, never an account credential.
  assert.equal(loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY:shortFixture}),shortFixture);
  fs.writeFileSync(stateFile,shortFixture,{mode:0o600});
  assert.equal(loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),shortFixture);
  assert.equal(loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY:'x'.repeat(4096)}).length,4096);
  for(const invalid of ['', ' ', 'x'.repeat(4097), 'a\nb', 'a\r', 'a\tb', 'a\x00b', 'a\x7fb', 'a\x85b']) {
    assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY:invalid,ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
  }
  fs.writeFileSync(stateFile,'a\nb');
  assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
  fs.writeFileSync(stateFile,'x'.repeat(4097));
  assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
  fs.unlinkSync(stateFile);fs.symlinkSync('/dev/null',stateFile);
  assert.throws(() => loadProviderToken({ADMIRA_TELEGRAM_PANEL_KEY_FILE:stateFile}),rejection('provider_not_configured'));
});

test('browser send requires existing session CSRF and trusted origin; reads remain read-only', () => {
  const allow=['https://www.admira.live'];
  assert.equal(sessionMutationError({method:'POST',headers:{origin:allow[0],'x-fleet-csrf':user.csrf}},user,allow),'');
  assert.equal(sessionMutationError({method:'POST',headers:{origin:allow[0]}},user,allow),'csrf inválido');
  assert.equal(sessionMutationError({method:'POST',headers:{origin:'https://evil.example','x-fleet-csrf':user.csrf}},user,allow),'origin no permitido');
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  assert.match(server,/if \(url === '\/api\/grokbot' \|\| url\.startsWith\('\/api\/grokbot\/'\)\) \{\s*if \(!\(await gate\(req, res, ip\)\)\) return;/);
  assert.match(server,/req\.fleetSession = auth\.session/);
});
