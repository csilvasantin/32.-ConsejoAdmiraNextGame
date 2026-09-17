/* Contrato seguro de control individual y masivo del Pulso.
 * No contiene fetch ni efectos al cargar: toda ejecución exige un transporte
 * inyectado y `confirmed:true`. Los secretos de proceso viven sólo en `targets`,
 * nunca en los items públicos que la UI puede llevar al DOM. */
(function(root){
  "use strict";

  var FRESH_SECONDS=30,MAX_BATCH=20,MAX_CONCURRENCY=4,
    CONTROL_STATUSES=new Set(["queued","accepted","running","stopping","stopped","done","failed","rejected","already_running","already_stopped","paused"]),
    PUBLIC_ERRORS=new Set(["cli_paused_by_carlos","cli-pause-adapter-unavailable","invalid-action","target-not-found","target-not-eligible","invalid-target","invalid-host","invalid-pid",
      "invalid-machine","invalid-persona","invalid-runtime","invalid-session_id","desktop-session-runtime-mismatch","unsafe-cli-session",
      "agent-offline-or-stale","ambiguous-agent-target","agent-changed-before-stop","presence-unavailable","presence-invalid",
      "start-service-unavailable","stop-service-unavailable","start-command-rejected","stop-command-rejected","agent-control-failed",
      "agent-control-execution-failed","agent-control-watcher-timeout","desktop-stop-failed","machine-watcher-stale","start-target-not-advertised"]);
  function text(value){return String(value==null?"":value).trim();}
  function norm(value){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function seconds(value){var number=Number(value)||0;return number>4102444800?Math.floor(number/1000):Math.floor(number);}
  function surface(value){value=norm(value);return value==="cli"||value==="app"?value:"unknown";}
  // Carlos: CLI remains paused across all machines; process evidence is independent.
  function cliPaused(row){return surface(row&&(row.surface||row.host))==="cli";}
  function hash(value){var result=2166136261;for(var char of String(value||"")){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return(result>>>0).toString(36);}
  function canonical(row,identity,machineOverride){
    row=row&&typeof row==="object"?row:{};
    var machine=text(machineOverride||row.machine),persona=text(row.persona||row.agent),runtime=text(row.runtime),host=surface(row.host);
    var agent=identity&&typeof identity.scoped==="function"?identity.scoped(persona,machine):persona;
    var machineKey=identity&&typeof identity.suffix==="function"?identity.suffix(machine):machine;
    var family=identity&&typeof identity.base==="function"?identity.base(persona):persona;
    var familyKey=identity&&typeof identity.key==="function"?identity.key(family):norm(family);
    return {agent:agent,persona:persona,family:family,family_key:familyKey,machine:machine,machine_key:norm(machineKey||machine),runtime:runtime,surface:host,
      public_key:[norm(agent),norm(machineKey||machine),norm(runtime),host].join("\u001f")};
  }
  function configuredTargets(controlMachines,identity){
    var out=[];
    (Array.isArray(controlMachines)?controlMachines:[]).forEach(function(machine){
      (machine&&Array.isArray(machine.slots)?machine.slots:[]).forEach(function(slot){
        var base=canonical(slot,identity,machine.machine),session=text(slot&&slot.session_id);
        out.push(Object.assign(base,{session_id:session,pid:0,configured:true,watcher_updated:seconds(machine.updated),
          target_key:[base.public_key,session].join("\u001f")}));
      });
    });
    return out;
  }
  function observedTargets(presence,identity,nowSeconds){
    return (Array.isArray(presence)?presence:[]).map(function(row){
      var base=canonical(row,identity),updated=seconds(row&&row.updated),pid=Number(row&&row.pid),session=text(row&&row.session_id);
      var fresh=updated>0&&updated>=nowSeconds-FRESH_SECONDS&&updated<=nowSeconds+5;
      var snapshot=!!(row&&(row.verified===true||row.verified===1)&&row.source==="process_snapshot"),offline=!!(row&&(row.online===false||row.online===0));
      var verified=snapshot&&!offline;
      return Object.assign(base,{session_id:session,pid:pid,updated:updated,fresh:fresh,verified:verified,snapshot:snapshot,offline:offline,activity:norm(row&&(row.status||row.activity)),operational_state:norm(row&&row.operational_state),configured:false,
        target_key:[base.public_key,session,String(Number.isSafeInteger(pid)?pid:0)].join("\u001f")});
    });
  }
  function uniqueTargets(rows){
    var map=new Map();
    (rows||[]).forEach(function(row){var previous=map.get(row.target_key);if(!previous||row.updated>previous.updated)map.set(row.target_key,row);});
    return Array.from(map.values());
  }
  function validStart(target){
    if(!target||target.surface==="unknown"||!target.machine||!target.persona||!target.runtime||!target.session_id)return false;
    if(target.surface==="app")return target.session_id==="desktop:"+target.runtime.toLowerCase();
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(target.session_id);
  }
  function validStop(target){
    return !!(target&&target.surface!=="unknown"&&target.machine&&target.persona&&target.runtime&&target.session_id&&
      target.fresh&&target.verified&&Number.isSafeInteger(target.pid)&&target.pid>1);
  }
  function processObservation(seen,configured,nowSeconds){
    var snapshots=seen.filter(function(row){return row.fresh&&row.snapshot;}).sort(function(a,b){return b.updated-a.updated;}),
      running=snapshots.filter(function(row){return !row.offline&&Number.isSafeInteger(row.pid)&&row.pid>1;});
    if(running.length){
      var row=running[0],waiting=/^(waiting|idle|esperando)$/.test(row.activity);
      return {process_state:waiting?"waiting":"open",observation_reason:"process-snapshot",observed_at:row.updated,operational_state:row.operational_state==="paused"?"paused":"unknown"};
    }
    var off=snapshots.find(function(row){return row.offline;}),watcher=configured.find(function(row){return row.watcher_updated>0&&row.watcher_updated>=nowSeconds-FRESH_SECONDS&&row.watcher_updated<=nowSeconds+5;});
    if(off||watcher&&!seen.some(function(row){return row.fresh&&row.snapshot&&!row.offline;}))return {process_state:"closed",observation_reason:off?"process-stopped":"watcher-no-process",observed_at:off?off.updated:watcher.watcher_updated};
    return {process_state:"unknown",observation_reason:seen.length?"snapshot-unavailable":"watcher-unavailable",observed_at:Math.max(0,...seen.map(function(row){return row.updated||0;}))};
  }
  function inventory(input,options){
    input=input||{};options=options||{};
    var identity=options.identity||root.ykAgentIdentity||null,detailUrl=typeof options.detailUrl==="function"?options.detailUrl:
      root.YkAgentDetail&&typeof root.YkAgentDetail.detailUrl==="function"?root.YkAgentDetail.detailUrl:null;
    var nowSeconds=seconds(options.now||Date.now()),configs=uniqueTargets(configuredTargets(input.controlMachines,identity)),
      observed=uniqueTargets(observedTargets(input.presence,identity,nowSeconds)),keys=new Set();
    configs.forEach(function(row){keys.add(row.public_key);});observed.forEach(function(row){keys.add(row.public_key);});
    var items=[],targets=new Map();
    keys.forEach(function(key){
      var configured=configs.filter(function(row){return row.public_key===key;}),seen=observed.filter(function(row){return row.public_key===key;}),
        live=seen.filter(validStop),identityRow=live[0]||configured[0]||seen[0],ambiguous=live.length>1||configured.length>1,
        unverified=seen.some(function(row){return !validStop(row);}),state,reason,start=false,stop=false,target=null;
      if(identityRow.surface==="unknown"){state="unknown";reason="unknown-surface";}
      else if(ambiguous){state="ambiguous";reason="ambiguous-target";}
      else if(live.length===1){state="active";reason="active-verified";stop=true;target=live[0];}
      else if(unverified){state="unknown";reason="presence-unverified-or-stale";}
      else if(configured.length===1&&validStart(configured[0])){state="stopped";reason="configured-stopped";start=true;target=configured[0];}
      else {state="unknown";reason=configured.length?"invalid-configured-target":"not-configured";}
      var pauseSupported=(input.controlMachines||[]).some(function(machine){var machineKey=canonical({persona:identityRow.persona,host:identityRow.surface},identity,machine.machine).machine_key,updated=seconds(machine.updated);return machineKey===identityRow.machine_key&&updated>=nowSeconds-FRESH_SECONDS&&updated<=nowSeconds+5&&Array.isArray(machine.capabilities)&&machine.capabilities.includes("cli_pause_preserve_session");});
      if(cliPaused(identityRow)){start=false;if(!pauseSupported)stop=false;}
      var controlKey="control:"+hash([key,target&&target.session_id||"",target&&target.pid||0,state].join("\u001f"));
      if(target)targets.set(controlKey,{machine:target.machine,persona:target.persona,runtime:target.runtime,host:target.surface,
        session_id:target.session_id,pid:target.pid});
      var href=detailUrl&&identityRow.surface!=="unknown"?text(detailUrl({persona:identityRow.persona,machine:identityRow.machine,
        runtime:identityRow.runtime,host:identityRow.surface})):"";
      items.push(Object.assign({control_key:controlKey,identity_key:key,agent:identityRow.agent,persona:identityRow.persona,
        family:identityRow.family,family_key:identityRow.family_key,machine:identityRow.machine,machine_key:identityRow.machine_key,
        runtime:identityRow.runtime,surface:identityRow.surface,state:state,reason:reason,
        pause_supported:pauseSupported,policy_paused:cliPaused(identityRow),policy_reason:cliPaused(identityRow)?"cli_paused_by_carlos":null,
        eligible:{start:start,stop:stop},detail_url:href||null},processObservation(seen,configured,nowSeconds)));
    });
    var order={cli:0,app:1,unknown:2};
    items.sort(function(a,b){return order[a.surface]-order[b.surface]||a.family_key.localeCompare(b.family_key,"es")||
      a.machine_key.localeCompare(b.machine_key,"es")||norm(a.runtime).localeCompare(norm(b.runtime),"es")||
      norm(a.agent).localeCompare(norm(b.agent),"es")||norm(a.state).localeCompare(norm(b.state),"es")||
      a.control_key.localeCompare(b.control_key,"es");});
    var counts={total:items.length,active:0,stopped:0,unknown:0,ambiguous:0,startable:0,stoppable:0};
    items.forEach(function(item){counts[item.state]=(counts[item.state]||0)+1;if(item.eligible.start)counts.startable++;if(item.eligible.stop)counts.stoppable++;});
    return {items:items,targets:targets,by_key:new Map(items.map(function(item){return[item.control_key,item];})),counts:counts};
  }
  // Presentation has two real surfaces. Legacy rows with no host remain
  // diagnostic data; matching them never transfers metadata or creates a command.
  function surfaceInventory(model,options){
    model=model||{};options=options||{};
    var identity=options.identity||root.ykAgentIdentity||null,
      rows=Array.isArray(model.items)?model.items:[],known=rows.filter(function(row){return surface(row.surface||row.host)!=="unknown";}),
      legacy=rows.filter(function(row){return surface(row.surface||row.host)==="unknown";}),diagnostics=[];
    function key(row){
      var base=canonical(Object.assign({},row,{host:row.surface||row.host}),identity),
        family=text(row.family_key)||base.family_key,machine=text(row.machine_key)||base.machine_key,runtime=norm(row.runtime);
      return family&&machine&&runtime?[norm(family),norm(machine),runtime].join("\u001f"):"";
    }
    legacy.forEach(function(row){
      var exactKey=key(row),matches=exactKey?known.filter(function(item){return key(item)===exactKey;}):[],
        hosts=Array.from(new Set(matches.map(function(item){return surface(item.surface||item.host);}))).sort();
      diagnostics.push({identity_key:text(row.identity_key),agent:text(row.agent||row.persona),machine:text(row.machine),runtime:text(row.runtime),
        reason:hosts.length===1?"legacy-linked-to-explicit-surface":hosts.length>1?"ambiguous-surface":"surface-unavailable",
        resolved_surface:hosts.length===1?hosts[0]:null,matching_surfaces:hosts});
    });
    var counts={total:known.length,active:0,stopped:0,unknown:0,ambiguous:0,startable:0,stoppable:0};
    known.forEach(function(item){counts[item.state]=(counts[item.state]||0)+1;if(item.eligible&&item.eligible.start)counts.startable++;if(item.eligible&&item.eligible.stop)counts.stoppable++;});
    return Object.assign({},model,{items:known,by_key:new Map(known.map(function(item){return[item.control_key,item];})),counts:counts,
      surface_diagnostics:{items:diagnostics,total:diagnostics.length,linked:diagnostics.filter(function(item){return !!item.resolved_surface;}).length,
        unresolved:diagnostics.filter(function(item){return !item.resolved_surface;}).length}});
  }
  function requestFor(model,controlKey,action){
    action=norm(action);var item=model&&model.by_key&&model.by_key.get(controlKey),target=model&&model.targets&&model.targets.get(controlKey);
    if(action!=="start"&&action!=="stop")throw new Error("invalid-action");
    if(!item||!target)throw new Error("target-not-found");
    if(action==="start"&&cliPaused(item))throw new Error("cli_paused_by_carlos");
    if(action==="stop"&&cliPaused(item)&&item.pause_supported!==true)throw new Error("cli-pause-adapter-unavailable");
    if(!item.eligible[action])throw new Error("target-not-eligible");
    return {endpoint:"/fleet/agent/control",method:"POST",body:Object.assign({action:action},target)};
  }
  // A card is a physical agent on an interface, while a command remains an
  // exact runtime/session target. Aggregation must never manufacture a command.
  function groupCards(items,options){
    options=options||{};
    var identity=options.identity||root.ykAgentIdentity||null,buckets=new Map();
    (Array.isArray(items)?items:[]).forEach(function(item,index){
      var base=canonical(Object.assign({},item,{host:item.surface||item.host}),identity),
        family=text(item.family_key)||base.family_key,machineKey=text(item.machine_key)||base.machine_key,
        key=[family,machineKey,base.surface].join("\u001f"),bucket=buckets.get(key);
      // Missing identity is not evidence that two unrelated rows are one agent.
      if(!family||!machineKey)key+="\u001f"+text(item.identity_key||item.control_key||index);
      bucket=buckets.get(key);if(!bucket){bucket=[];buckets.set(key,bucket);}
      bucket.push(item);
    });
    var cards=[],rank={open:0,waiting:1,closed:2,unknown:3};
    buckets.forEach(function(rows,key){
      var unique=new Map();rows.forEach(function(row){
        var targetKey=text(row.identity_key||row.control_key),previous=unique.get(targetKey);
        if(!previous||Number(row.observed_at||row.updated||0)>Number(previous.observed_at||previous.updated||0))unique.set(targetKey,row);
      });
      var variants=Array.from(unique.values()).sort(function(a,b){
        return (rank[a.process_state]??3)-(rank[b.process_state]??3)||norm(a.runtime).localeCompare(norm(b.runtime))||text(a.identity_key).localeCompare(text(b.identity_key));
      });
      var representative=variants[0],multiple=variants.length>1,process=variants.some(function(row){return row.process_state==="open";})?"open":
        variants.some(function(row){return row.process_state==="waiting";})?"waiting":
        variants.every(function(row){return row.process_state==="closed";})?"closed":"unknown";
      var card=Object.assign({},representative,{card_key:key,runtime_targets:variants,runtime_selection_required:multiple,
        process_state:process,observed_at:Math.max(0,...variants.map(function(row){return Number(row.observed_at)||0;}))});
      if(multiple)Object.assign(card,{runtime:"",model:"",control_key:"",identity_key:"",detail_url:null,
        state:"ambiguous",reason:"runtime-selection-required",eligible:{start:false,stop:false}});
      cards.push(card);
    });
    cards.sort(function(a,b){return (rank[a.process_state]??3)-(rank[b.process_state]??3)||a.card_key.localeCompare(b.card_key,"es");});
    var counts={total:cards.length,open:0,waiting:0,closed:0,unknown:0,runtime_targets:0};
    cards.forEach(function(card){counts[card.process_state]++;counts.runtime_targets+=card.runtime_targets.length;});
    return {items:cards,counts:counts};
  }
  function selectedCardTarget(card,selection,requireSelection){
    var variants=card&&Array.isArray(card.runtime_targets)?card.runtime_targets:[];
    if(variants.length===1&&!card.runtime_selection_required&&!requireSelection)return variants[0];
    return text(selection)?variants.find(function(row){return row.identity_key===selection;})||null:null;
  }
  function batchPlan(model,group,action,options){
    options=options||{};
    group=surface(group);action=norm(action);
    if(group==="unknown"||action!=="start"&&action!=="stop")return {ok:false,error:"invalid-batch-scope",group:group,action:action,targets:[]};
    var selections=options.selections instanceof Map?options.selections:new Map(),required=options.requireSelections instanceof Set?options.requireSelections:new Set(),cards=groupCards(model&&model.items||[],options).items,
      skipped=cards.filter(function(card){return card.surface===group&&(card.runtime_selection_required||required.has(card.card_key))&&!selectedCardTarget(card,selections.get(card.card_key),required.has(card.card_key))&&card.runtime_targets.some(function(row){return row.eligible[action];});}).length,
      candidates=cards.map(function(card){return selectedCardTarget(card,selections.get(card.card_key),required.has(card.card_key));})
        .filter(function(item){return item&&item.surface===group&&item.eligible[action]&&!(action==="start"&&cliPaused(item));}),
      targets=candidates.slice(0,MAX_BATCH).map(function(item){return item.control_key;});
    return {ok:true,group:group,action:action,targets:targets,count:targets.length,skipped_ambiguous:skipped,truncated:candidates.length>MAX_BATCH,
      confirmation:"Confirmar "+action+" de "+targets.length+" agente"+(targets.length===1?"":"s")+" del grupo "+group.toUpperCase()};
  }
  function publicError(error,fallback){
    var code=text(error&&error.code||error&&error.message||error).toLowerCase();
    return PUBLIC_ERRORS.has(code)?code:(fallback||"control-failed");
  }
  function publicCommandId(value){value=text(value);return value&&value.length<=100&&/^[A-Za-z0-9._:-]+$/.test(value)?value:null;}
  async function executeOne(model,controlKey,action,options){
    options=options||{};var ledger=options.ledger instanceof Map?options.ledger:new Map(),ledgerKey=norm(action)+":"+controlKey;
    if(options.confirmed!==true)return {control_key:controlKey,action:norm(action),status:"cancelled",ok:false,error:"confirmation-required"};
    if(typeof options.send!=="function")return {control_key:controlKey,action:norm(action),status:"failed",ok:false,error:"transport-required"};
    if(ledger.has(ledgerKey))return Object.assign({},ledger.get(ledgerKey),{reused:true});
    var request;try{request=requestFor(model,controlKey,action);}catch(error){return {control_key:controlKey,action:norm(action),status:"rejected",ok:false,error:publicError(error,"target-not-eligible")};}
    var pending={control_key:controlKey,action:norm(action),status:"sending",ok:false};ledger.set(ledgerKey,pending);
    try{
      var response=await options.send(request),rawStatus=norm(response&&response.status),status=CONTROL_STATUSES.has(rawStatus)?rawStatus:(response&&response.ok===false?"rejected":"accepted");
      var result={control_key:controlKey,action:norm(action),status:status,ok:response&&response.ok!==false,
        command_id:publicCommandId(response&&response.command_id),error:response&&response.ok===false?publicError(response.error,"control-rejected"):null};
      ledger.set(ledgerKey,result);return result;
    }catch(error){var failed={control_key:controlKey,action:norm(action),status:"failed",ok:false,error:publicError(error,"transport-failed")};ledger.set(ledgerKey,failed);return failed;}
  }
  async function executeBatch(model,plan,options){
    options=options||{};
    if(!plan||plan.ok!==true)return {ok:false,error:"invalid-batch-plan",results:[]};
    if(options.confirmed!==true)return {ok:false,error:"confirmation-required",results:[]};
    var keys=plan.targets.slice(0,MAX_BATCH),cursor=0,results=new Array(keys.length),concurrency=Math.max(1,Math.min(MAX_CONCURRENCY,Number(options.concurrency)||2));
    async function worker(){while(cursor<keys.length){var index=cursor++;results[index]=await executeOne(model,keys[index],plan.action,options);}}
    await Promise.all(Array.from({length:Math.min(concurrency,keys.length)},worker));
    var succeeded=results.filter(function(row){return row&&row.ok;}).length,failed=results.length-succeeded;
    return {ok:failed===0,total:results.length,succeeded:succeeded,failed:failed,partial:succeeded>0&&failed>0,results:results};
  }

  var api={cliPaused:cliPaused,inventory:inventory,surfaceInventory:surfaceInventory,groupCards:groupCards,selectedCardTarget:selectedCardTarget,requestFor:requestFor,batchPlan:batchPlan,executeOne:executeOne,executeBatch:executeBatch,
    limits:{fresh_seconds:FRESH_SECONDS,max_batch:MAX_BATCH,max_concurrency:MAX_CONCURRENCY}};
  root.YkAgentControl=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
