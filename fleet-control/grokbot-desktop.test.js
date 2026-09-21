'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createGrokBotDesktop, createDesktopStore, createNativeRunner} = require('./grokbot-desktop');

const user = {email:'carlos@example.test', jti:'verified'};
const alias = {email:'carlos-work@example.test', jti:'verified-alias'};
const outsider = {email:'other@example.test', jti:'verified-other'};
const clock = 1789700000000;
const card = (sender, text, key, time='12:00') => ({sender, text, key, time, label:sender === 'assistant' ? 'Steve Jobs' : 'Carlos'});
const snapshot = (patch={}) => ({ok:true, selectedPersona:'Steve Jobs', composerHasDraft:false, busy:false,
  messages:[], observedAt:new Date(clock).toISOString(), ...patch});
const body = (patch={}) => ({message_id:'desktop-test-0001', persona:'Steve Jobs', prompt:'Prepara la propuesta.', ...patch});
const errorCode = code => error => error.code === code;
function setup(t, runNative, options={}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'admira-desktop-test-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  const file = path.join(folder,'desktop-state.json');
  const environment = {GROKBOT_AX_BINARY:path.join(folder,'fake-ax'),
    GROKBOT_DESKTOP_STATE_FILE:file,
    GROKBOT_DESKTOP_OWNER_EMAILS:'carlos@example.test, carlos-work@example.test'};
  const config = {environment, runNative, now:() => clock, ...options};
  return {desktop:createGrokBotDesktop(config), config, file, folder};
}

test('every public operation checks the explicit desktop owner before AX or reading history', async t => {
  let calls = 0;
  const {desktop} = setup(t, async () => { calls++; return snapshot(); });
  for (const invoke of [s=>desktop.capabilities(s), s=>desktop.list(s,'Jobs'), s=>desktop.select(s,'Jobs'), s=>desktop.send(s,body()), s=>desktop.get(s,'gb_'+'a'.repeat(48))]) {
    await assert.rejects(invoke(outsider), errorCode('desktop_owner_required'));
    await assert.rejects(invoke({email:user.email}), errorCode('authenticated_session_required'));
  }
  assert.equal(calls,0);
  const noOwners = createGrokBotDesktop({environment:{GROKBOT_AX_BINARY:'/tmp/fake'}, runNative:async()=>{calls++;}});
  await assert.rejects(noOwners.capabilities(user), errorCode('desktop_owner_required'));
  assert.equal(calls,0);
});

test('capabilities require working AX and report the real limitations and draft state', async t => {
  let native = snapshot({composerHasDraft:true});
  const {desktop,config} = setup(t,async()=>native);
  const cap = await desktop.capabilities(user);
  assert.equal(cap.mode,'desktop'); assert.equal(cap.bidirectional,true);
  assert.equal(cap.status,'draft'); assert.equal(cap.reason,'desktop_draft_present');
  assert.equal(cap.selectedPersona,'Jobs'); assert.equal(cap.partialVisibleHistory,true);
  assert.equal(cap.lastObservedAt,new Date(clock).toISOString());
  for (const key of ['desktop','attachments','routines','interrupt']) assert.equal(cap[key],false);
  native = snapshot({ok:false,error:'private UI and secret failure details'});
  const failed = await desktop.capabilities(user);
  assert.equal(failed.bidirectional,false); assert.equal(failed.status,'disconnected');
  assert.equal(failed.reason,'desktop_unavailable');
  assert.doesNotMatch(JSON.stringify(failed),/private UI|secret failure/);
  const missing = createGrokBotDesktop({...config,environment:{...config.environment,GROKBOT_AX_BINARY:'relative'}});
  assert.equal((await missing.capabilities(user)).reason,'desktop_not_configured');
});

test('native user and assistant cards are grouped; tool events are never answers', async t => {
  const {desktop,file} = setup(t,async()=>snapshot({messages:[
    card('assistant','Hola, Carlos.','spontaneous'),
    card('user','Pregunta uno','user-1'), card('event','Using tool','tool-1'),
    card('assistant','Respuesta uno','answer-1'), card('assistant','Segundo párrafo','answer-2'),
    card('user','Pregunta dos','user-2'), card('event','Thinking','tool-2'),
  ]}));
  const rows = await desktop.list(user,'Steve Jobs');
  assert.equal(rows.length,3);
  assert.equal(rows[0].prompt,''); assert.equal(rows[0].text,'Hola, Carlos.');
  assert.equal(rows[1].prompt,'Pregunta uno'); assert.equal(rows[1].text,'Respuesta uno\n\nSegundo párrafo');
  assert.equal(rows[1].status,'done');
  assert.equal(rows[2].text,''); assert.equal(rows[2].status,'pending');
  assert.ok(rows.every(row=>row.source==='desktop' && row.native===true));
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  assert.deepEqual(await desktop.list(alias,'Jobs'),rows,'both explicitly approved owner identities see the same native conversation');
});

test('list and get capture the selected native bot without switching it', async t => {
  let native = snapshot({messages:[card('user','Jobs question','j-user'),card('assistant','Jobs answer','j-answer')]});
  const calls=[];
  const {desktop} = setup(t,async request=>{calls.push(request);return native;});
  const [jobs] = await desktop.list(user,'Jobs');
  native = snapshot({selectedPersona:'George Lucas',messages:[card('assistant','Lucas spontaneous','l-answer')]});
  assert.equal((await desktop.list(user,'Jobs'))[0].id,jobs.id);
  assert.equal((await desktop.get(user,jobs.id)).text,'Jobs answer');
  assert.equal((await desktop.list(user,'Lucas'))[0].text,'Lucas spontaneous');
  assert.ok(calls.every(request=>request.action==='snapshot'));
});

test('selection and sends preserve an existing draft and reject unknown identity', async t => {
  const calls=[];
  let native=snapshot({composerHasDraft:true});
  const {desktop} = setup(t,async request=>{calls.push(request);return native;});
  await assert.rejects(desktop.select(user,'Lucas'),errorCode('desktop_draft_present'));
  await assert.rejects(desktop.send(user,body()),errorCode('desktop_draft_present'));
  assert.ok(calls.every(request=>request.action==='snapshot'));
  assert.equal((await desktop.select(user,'Jobs')).status,'draft','same selected chat does not touch draft');
  native=snapshot();
  await assert.rejects(desktop.select(user,'Lucas'),errorCode('desktop_selection_mismatch'));
  assert.equal(calls.at(-1).action,'select');
  assert.equal(calls.at(-1).persona,'George Lucas');
  await assert.rejects(desktop.select(user,'Tim Cook'),errorCode('unsupported_persona'));
});

test('successful explicit selection uses a canonical target', async t => {
  let selectedPersona='Steve Jobs'; const calls=[];
  const {desktop} = setup(t,async request=>{
    calls.push(request);
    if (request.action==='select') selectedPersona=request.persona;
    return snapshot({selectedPersona});
  });
  assert.equal((await desktop.select(user,'Wozniak')).selectedPersona,'Wozniak');
  assert.deepEqual(calls.map(item=>item.action),['snapshot','select']);
  assert.equal(calls[1].persona,'Steve Wozniak');
});

test('send reserves durably before typing; a new user card acknowledges delivery, not a fake answer', async t => {
  const calls=[]; let native=snapshot(); let stateFile;
  const {desktop,file,config} = setup(t,async request=>{
    calls.push(request);
    if (request.action==='send') {
      const rows=JSON.parse(fs.readFileSync(stateFile,'utf8')).messages;
      assert.equal(rows.length,1); assert.equal(rows[0].status,'unknown');
      assert.equal(rows[0].prompt,request.prompt);
      native=snapshot({messages:[card('user',request.prompt,'new-user')]});
    }
    return native;
  });
  stateFile=file;
  const first=await desktop.send(user,body());
  assert.equal(first.status,'pending'); assert.equal(first.text,'');
  assert.equal((await desktop.send(user,body())).id,first.id);
  assert.equal((await createGrokBotDesktop(config).send(user,body())).id,first.id);
  assert.equal(calls.filter(item=>item.action==='send').length,1);
  await assert.rejects(desktop.send(user,body({prompt:'Different content'})),errorCode('message_id_conflict'));
  native=snapshot({messages:[card('user',body().prompt,'new-user'),card('assistant','Respuesta real','answer')]});
  const completed=await desktop.get(user,first.id);
  assert.equal(completed.status,'done'); assert.equal(completed.text,'Respuesta real');
  assert.equal((await desktop.list(user,'Jobs')).length,1,'native acknowledgement binds to the original web row');
});

test('ok:true without a new matching native user card stays unknown and cannot resend on restart', async t => {
  const native=snapshot({messages:[card('user',body().prompt,'old-user'),card('assistant','Old answer','old-answer')]});
  let sends=0;
  const {desktop,config} = setup(t,async request=>{if(request.action==='send')sends++;return native;});
  const sent=await desktop.send(user,body());
  assert.equal(sent.status,'unknown'); assert.equal(sent.text,'');
  assert.equal((await createGrokBotDesktop(config).send(user,body())).status,'unknown');
  assert.equal(sends,1);
});

test('native send timeout never retries and a later read may confirm its real delivery', async t => {
  let native=snapshot(), sends=0;
  const {desktop,config} = setup(t,async request=>{
    if(request.action==='send'){sends++;throw new Error('secret process failure');}
    return native;
  });
  const sent=await desktop.send(user,body());
  assert.equal(sent.status,'unknown');
  await createGrokBotDesktop(config).send(user,body());
  assert.equal(sends,1);
  native=snapshot({messages:[card('user',body().prompt,'late-user'),card('assistant','Late real response','late-response')]});
  const received=await desktop.get(user,sent.id);
  assert.equal(received.text,'Late real response'); assert.equal(received.status,'done');
});

test('streaming updates replace the anchored turn and keep its public id', async t => {
  let native=snapshot({busy:true,messages:[card('user','Pregunta','u'),card('assistant','Parcial','partial')]});
  const {desktop} = setup(t,async()=>native);
  const [first]=await desktop.list(user,'Jobs'); assert.equal(first.status,'in_progress');
  native=snapshot({busy:true,messages:[card('user','Pregunta','u'),card('assistant','Respuesta revisada','changed-key')]});
  const [second]=await desktop.list(user,'Jobs');
  assert.equal(second.id,first.id); assert.equal(second.text,'Respuesta revisada');
  native=snapshot({messages:[card('user','Pregunta','u'),card('assistant','Respuesta final','final-key')]});
  const [third]=await desktop.list(user,'Jobs');
  assert.equal(third.id,first.id); assert.equal(third.text,'Respuesta final'); assert.equal(third.status,'done');
  native=snapshot({messages:[card('assistant','Respuesta final','final-key')]});
  const [partial]=await desktop.list(user,'Jobs');
  assert.equal(partial.id,first.id); assert.equal(partial.prompt,'Pregunta');
  native=snapshot({messages:[]});
  assert.deepEqual(await desktop.list(user,'Jobs'),[partial],'empty viewport is not a deletion');
});

test('all native calls including concurrent sends, reads and selection are serialized', async t => {
  let active=0, maximum=0, selected='Steve Jobs'; const calls=[];
  const {desktop} = setup(t,async request=>{
    maximum=Math.max(maximum,++active); calls.push(request);
    await new Promise(resolve=>setTimeout(resolve,2));
    if(request.action==='select')selected=request.persona;
    active--;
    return snapshot({selectedPersona:selected});
  });
  const results=await Promise.all([desktop.send(user,body()),desktop.send(user,body()),desktop.list(user,'Jobs'),desktop.select(user,'Lucas'),desktop.capabilities(user)]);
  assert.equal(maximum,1);
  assert.equal(calls.filter(item=>item.action==='send').length,1);
  assert.equal(results[0].id,results[1].id);
});

test('payload cannot select arbitrary processes, arguments, identity or unsupported targets', async t => {
  let calls=0;
  const {desktop} = setup(t,async()=>{calls++;return snapshot();});
  for (const patch of [{persona:'../../other-app'},{action:'anything'},{owner:outsider.email},{binary:'/bin/sh'},{message_id:'bad'},{prompt:'\0'}]) {
    await assert.rejects(desktop.send(user,body(patch)));
  }
  assert.equal(calls,0);
});

test('busy snapshot refuses sending; a native draft race is explicit and cannot be resent', async t => {
  let busy=true, sends=0;
  const {desktop} = setup(t,async request=>{
    if(request.action==='send'){sends++;return snapshot({ok:false,composerHasDraft:true,error:'draft'});}
    return snapshot({busy});
  });
  await assert.rejects(desktop.send(user,body()),errorCode('desktop_busy')); assert.equal(sends,0);
  busy=false;
  await assert.rejects(desktop.send(user,body()),errorCode('desktop_draft_present'));
  assert.equal((await desktop.send(user,body())).status,'blocked'); assert.equal(sends,1);
});

test('private store rejects unsafe modes, symbolic links and a competing reservation lock', t => {
  const {file,folder} = setup(t,async()=>snapshot());
  const store=createDesktopStore(file);
  store.transact(()=>{}); assert.equal(fs.statSync(file).mode & 0o777,0o600);
  fs.chmodSync(file,0o644); assert.throws(()=>store.read(),errorCode('desktop_state_unavailable'));
  fs.chmodSync(file,0o600);
  const link=path.join(folder,'link.json'); fs.symlinkSync(file,link);
  assert.throws(()=>createDesktopStore(link).read(),errorCode('desktop_state_unavailable'));
  fs.writeFileSync(file+'.lock','',{mode:0o600});
  assert.throws(()=>store.transact(()=>{}),errorCode('desktop_state_unavailable'));
  assert.ok(fs.existsSync(file+'.lock'),'a competing process lock is never removed');
});

test('native runner uses a fixed executable and JSON stdin without a shell or inherited secrets', async t => {
  const {folder} = setup(t,async()=>snapshot());
  const binary=path.join(folder,'helper'); fs.writeFileSync(binary,'fake',{mode:0o700});
  let command, argumentsSeen, optionsSeen, input;
  const runner=createNativeRunner({environment:{GROKBOT_AX_BINARY:binary,PRIVATE_TEST_SECRET:'never-forward'},execFileImpl:(file,args,options,callback)=>{
    command=file; argumentsSeen=args; optionsSeen=options;
    return {stdin:{on(){},end(value){input=value;callback(null,JSON.stringify(snapshot()));}}};
  }});
  const request={action:'send',persona:'Steve Jobs',prompt:'$(touch /tmp/never) `echo no`; <tag> "quoted"\nline'};
  assert.equal((await runner(request)).ok,true);
  assert.equal(command,binary); assert.deepEqual(argumentsSeen,[]); assert.equal(optionsSeen.shell,false);
  assert.deepEqual(JSON.parse(input),request); assert.equal(optionsSeen.env.PRIVATE_TEST_SECRET,undefined);
});

test('background polling reads only the actual selected chat and stops scheduling', async t => {
  const timers=[]; const cancelled=[]; const calls=[];
  const {desktop} = setup(t,async request=>{calls.push(request);return snapshot({selectedPersona:'George Lucas'});},
    {setTimer:(fn,delay)=>{const handle={fn,delay,unref(){}};timers.push(handle);return handle;},clearTimer:handle=>cancelled.push(handle)});
  desktop.start(); desktop.start(); assert.equal(timers.length,1);
  await timers[0].fn(); assert.equal(timers.length,2); assert.equal(timers[1].delay,2500);
  assert.deepEqual(calls,[{action:'snapshot'}]);
  desktop.stop(); assert.equal(cancelled[0],timers[1]);
  await timers[1].fn(); assert.equal(calls.length,1); assert.equal(timers.length,2);
});

test('first-snapshot native turns have strict order preserved when replies arrive', async t => {
  let native=snapshot({messages:[card('user','First','first'),card('assistant','One','one'),card('user','Second','second')]});
  const {desktop} = setup(t,async()=>native);
  const rows=await desktop.list(user,'Jobs');
  assert.ok(rows[0].createdAt < rows[1].createdAt);
  native=snapshot({messages:[...native.messages,card('assistant','Two','two')]});
  const later=await desktop.list(user,'Jobs');
  assert.equal(later[0].id,rows[0].id); assert.equal(later[1].id,rows[1].id);
  assert.equal(later[1].createdAt,rows[1].createdAt);
});

test('an uncertain identical prompt cannot be resent using another UUID or owner alias after restart', async t => {
  let sends=0;
  const {desktop,config} = setup(t,async request=>{if(request.action==='send')sends++;return snapshot();});
  await desktop.send(user,body());
  await assert.rejects(desktop.send(user,body({message_id:'desktop-test-0002'})),errorCode('desktop_previous_send_unconfirmed'));
  await assert.rejects(createGrokBotDesktop(config).send(alias,body({message_id:'desktop-test-0003'})),errorCode('desktop_previous_send_unconfirmed'));
  assert.equal(sends,1);
});

test('missing Accessibility permission is explicit without leaking helper diagnostics', async t => {
  const {desktop} = setup(t,async()=>snapshot({ok:false,error:'accessibility_required'}));
  const cap=await desktop.capabilities(user);
  assert.equal(cap.available,false); assert.equal(cap.bidirectional,false);
  assert.equal(cap.reason,'desktop_accessibility_required');
});

test('a narrower viewport with the user anchor retains unobserved assistant cards', async t => {
  const u=card('user','Pregunta','u'), a1=card('assistant','A1','a1'), a2=card('assistant','A2','a2');
  let native=snapshot({messages:[u,a1,a2]});
  const {desktop} = setup(t,async()=>native);
  const [before]=await desktop.list(user,'Jobs');
  native=snapshot({messages:[u,a1]});
  const [after]=await desktop.list(user,'Jobs');
  assert.equal(after.id,before.id); assert.equal(after.text,'A1\n\nA2');
});

test('assistant-only streaming with fallback changing keys retains one spontaneous row', async t => {
  let native=snapshot({busy:true,messages:[card('assistant','Parcial','a')]});
  const {desktop} = setup(t,async()=>native);
  const [before]=await desktop.list(user,'Jobs');
  native=snapshot({messages:[card('assistant','Parcial completo','b')]});
  const after=await desktop.list(user,'Jobs');
  assert.equal(after.length,1); assert.equal(after[0].id,before.id);
  assert.equal(after[0].prompt,''); assert.equal(after[0].text,'Parcial completo');
});

test('current helper refusal codes remain explicit', async t => {
  for (const [error,code] of [['draft_exists','desktop_draft_present'],['conversation_busy','desktop_busy'],['bridge_busy','desktop_busy'],['persona_not_selected','desktop_selection_mismatch'],['application_not_running','desktop_application_not_running']]) {
    const {desktop}=setup(t,async()=>snapshot({ok:false,error}));
    assert.equal((await desktop.capabilities(user)).reason,code);
  }
});

test('verified native ISO dates sort older history correctly even when first observed later', async t => {
  let native=snapshot({messages:[card('user','Recent','recent','2026-09-17T10:00:00Z')]});
  const {desktop} = setup(t,async()=>native);
  await desktop.list(user,'Jobs');
  native=snapshot({messages:[card('user','Older','older','2026-09-16T10:00:00Z')]});
  const rows=await desktop.list(user,'Jobs');
  assert.equal(rows[0].prompt,'Older'); assert.equal(rows[0].createdAt,'2026-09-16T10:00:00.000Z');
  assert.equal(rows[1].prompt,'Recent');
});


test('runner preserves structured exit-1 refusal but rejects killed and false success output', async t => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'grokbot-runner-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const binary=path.join(folder,'helper');fs.writeFileSync(binary,'fixture',{mode:0o700});
  let error={code:1}, output=snapshot({ok:false,error:'accessibility_required'});
  const runner=createNativeRunner({environment:{GROKBOT_AX_BINARY:binary},execFileImpl:(file,args,opts,callback)=>{
    queueMicrotask(()=>callback(error,JSON.stringify(output)));return {stdin:{on(){},end(){}}};
  }});
  assert.equal((await runner({action:'snapshot'})).error,'accessibility_required');
  output=snapshot();await assert.rejects(runner({action:'snapshot'}),errorCode('desktop_unavailable'));
  error={code:1,killed:true};output=snapshot({ok:false,error:'accessibility_required'});
  await assert.rejects(runner({action:'snapshot'}),errorCode('desktop_timeout'));
});

test('native controls require owner, updated helper and the currently selected adviser',async t=>{
  const calls=[];let current=snapshot({protocolVersion:2,runKey:'turn-1'});
  const {desktop}=setup(t,async request=>{calls.push(request);return current;});
  await assert.rejects(desktop.controls(outsider,{persona:'Jobs',action:'routines'}),errorCode('desktop_owner_required'));
  assert.equal(calls.length,0);
  await assert.rejects(desktop.controls(user,{persona:'Jobs',action:'send',prompt:'injection'}),errorCode('invalid_control'));
  await assert.rejects(desktop.controls(user,{persona:'Jobs',action:'routine_set',routine_id:'a'.repeat(64),paused:true}),errorCode('invalid_routine'));
  await assert.rejects(desktop.controls(user,{persona:'Lucas',action:'routines'}),errorCode('desktop_selection_mismatch'));
  assert.ok(calls.every(x=>x.action==='snapshot'));
  current=snapshot();
  await assert.rejects(desktop.controls(user,{persona:'Jobs',action:'routines'}),errorCode('desktop_controls_unavailable'));
});

test('routine commands preserve desired state and revision, and surface refusal without retry',async t=>{
  const calls=[],id='a'.repeat(64),revision='b'.repeat(64);
  const {desktop}=setup(t,async request=>{
    calls.push(request);
    if(request.action==='routine_set')return snapshot({protocolVersion:2,ok:false,error:'routine_changed'});
    return snapshot({protocolVersion:2,routines:[{id,name:'Prueba',schedule:'Cada día'}]});
  });
  const result=await desktop.controls(user,{persona:'Jobs',action:'routines'});
  assert.deepEqual(result.routines,[{id,name:'Prueba',schedule:'Cada día'}]);
  await assert.rejects(desktop.controls(user,{persona:'Jobs',action:'routine_set',routine_id:id,revision,paused:true}),errorCode('routine_changed'));
  assert.equal(calls.filter(x=>x.action==='routine_set').length,1);
  assert.deepEqual(calls.at(-1),{action:'routine_set',persona:'Steve Jobs',routineID:id,revision,paused:true,runKey:undefined});
});

test('interruption passes an exact observed turn and never retries a changed execution',async t=>{
  const calls=[];
  const {desktop}=setup(t,async request=>{
    calls.push(request);return snapshot({protocolVersion:2,runKey:'turn-current',busy:true,...(request.action==='interrupt'?{ok:false,error:'run_changed'}:{})});
  });
  await assert.rejects(desktop.controls(user,{persona:'Jobs',action:'interrupt',run_key:'turn-old'}),errorCode('desktop_run_changed'));
  assert.equal(calls.filter(x=>x.action==='interrupt').length,1);
});

test('attachment IDs are owner-bound, participate in idempotence and reach only the native send',async t=>{
 let latest=snapshot({protocolVersion:3}),calls=[];
 const {desktop}=setup(t,async request=>{
   calls.push(request);
   if(request.action==='send')latest=snapshot({protocolVersion:3,messages:[{sender:'user',text:request.prompt,key:'native-file-turn',label:'Tú',time:new Date(clock).toISOString()}]});
   return latest;
 });
 const attachment=await desktop.upload(user,{name:'prueba.txt',type:'text/plain',data:Buffer.from('test').toString('base64')});
 const payload=body({attachments:[attachment.id]});
 const sent=await desktop.send(user,payload);
 assert.equal(sent.attachments[0].name,'prueba.txt');
 assert.match(calls.find(x=>x.action==='send').attachmentPaths[0],/grokbot-uploads/);
 await desktop.send(user,payload);assert.equal(calls.filter(x=>x.action==='send').length,1);
 await assert.rejects(desktop.send(user,body()),errorCode('message_id_conflict'));
});

test('native entry ids migrate old receipts without merging distinct same-minute messages',async t=>{
 const legacy='ax_'+ 'c'.repeat(64);
 let messages=[card('user','Primero',legacy)];
 const {desktop}=setup(t,async()=>snapshot({messages}));
 const first=await desktop.list(user,'Jobs');
 messages=[{...card('user','Primero','native-one'),legacyKey:legacy},{...card('user','Segundo','native-two'),legacyKey:legacy}];
 const migrated=await desktop.list(user,'Jobs');
 assert.equal(migrated.length,2);assert.equal(migrated.find(m=>m.prompt==='Primero').id,first[0].id);
 assert.equal((await desktop.list(user,'Jobs')).length,2);
});

test('native ids migrate an assistant-only viewport without duplicating its retained turn',async t=>{
 const legacy='ax_'+'d'.repeat(64);let messages=[card('assistant','Respuesta retenida',legacy)];
 const {desktop}=setup(t,async()=>snapshot({messages}));const before=await desktop.list(user,'Jobs');
 messages=[{...card('assistant','Respuesta retenida','native-answer'),legacyKey:legacy}];
 const after=await desktop.list(user,'Jobs');assert.equal(after.length,1);assert.equal(after[0].id,before[0].id);
});
