/* Contrato de navegación y lectura para la ficha operativa de un agente.
 * La misma función construye el enlace del Dashboard y la petición al worker:
 * así no se pierden máquina, runtime ni superficie al abrir una tarjeta CLI. */
(function(root){
  "use strict";

  function text(value){return String(value==null?"":value).trim();}
  function surface(value){value=text(value).toLowerCase();return value==="app"||value==="cli"?value:"";}
  function integer(value,fallback,min,max){if(value==null||text(value)==="")return fallback;var number=Number(value);return Number.isInteger(number)?Math.max(min,Math.min(max,number)):fallback;}

  function queryState(search){
    var params=new URLSearchParams(String(search||"").replace(/^\?/,""));
    return {agent:text(params.get("agent")),machine:text(params.get("machine")),runtime:text(params.get("runtime")),
      surface:surface(params.get("surface")),
      limit:integer(params.get("limit"),25,1,100),offset:integer(params.get("offset"),0,0,1000000)};
  }
  function validState(state){return !!(state&&text(state.agent)&&text(state.machine)&&text(state.runtime)&&surface(state.surface));}
  function paramsFor(state,includePage){
    var params=new URLSearchParams();
    params.set("agent",text(state.agent));params.set("machine",text(state.machine));params.set("runtime",text(state.runtime));
    params.set("surface",surface(state.surface||state.host));
    if(includePage){params.set("limit",String(integer(state.limit,25,1,100)));params.set("offset",String(integer(state.offset,0,0,1000000)));}
    return params;
  }
  function detailUrl(row){
    var state={agent:text(row&&row.agent||row&&row.persona),machine:text(row&&row.machine),runtime:text(row&&row.runtime),
      surface:surface(row&&row.surface||row&&row.host)};
    return validState(state)?"/agentDetail?"+paramsFor(state,false).toString():"";
  }
  function endpoint(base,state){return String(base||"").replace(/\/$/,"")+"/fleet/agent-detail?"+paramsFor(state,true).toString();}
  function safeDetailUrl(value){
    value=text(value);if(!value)return "";
    try{var url=new URL(value,"https://www.yokup.com");return url.origin==="https://www.yokup.com"&&url.pathname.charAt(0)==="/"?url.pathname+url.search+url.hash:"";}catch(_){return "";}
  }
  function item(value){
    value=value&&typeof value==="object"?value:{};
    return {id:text(value.id),kind:text(value.kind),title:text(value.title),state:text(value.state),missionId:text(value.mission_id),
      missionRef:text(value.mission_display_ref),missionTitle:text(value.mission_title),taskCode:text(value.task_code),taskTitle:text(value.task_title),
      projectId:text(value.project_id),projectName:text(value.project_name),startedAt:Number(value.started_at)||0,endedAt:Number(value.ended_at)||0,
      activityAt:Number(value.activity_at||value.work_progress_at||value.live_at)||0,detailUrl:safeDetailUrl(value.detail_url),
      reachable:value.reachable===true};
  }
  function normalize(payload){
    if(!payload||payload.ok!==true||!payload.identity||!payload.history||!Array.isArray(payload.history.items))return null;
    var identity=payload.identity,presence=payload.presence||{},history=payload.history,current=payload.current&&typeof payload.current==="object"?item(payload.current):null;
    return {identity:{agent:text(identity.agent),family:text(identity.family),familyKey:text(identity.family_key),role:text(identity.role),
      machine:text(identity.machine),machineKey:text(identity.machine_key),runtime:text(identity.runtime),surface:surface(identity.surface),surfaceKey:text(identity.surface_key)},
      presence:{available:presence.available===true,matched:presence.matched===true,fresh:presence.fresh===true,
        ambiguous:presence.ambiguous===true,liveAt:Number(presence.live_at)||0},
      current:current,history:{items:history.items.map(item),limit:integer(history.limit,25,1,100),offset:integer(history.offset,0,0,1000000),
        total:Math.max(0,Number(history.total)||0),hasMore:history.has_more===true}};
  }
  function when(value,options){
    var number=Number(value)||0;if(!number)return "fecha no disponible";if(number<1e11)number*=1000;
    return new Intl.DateTimeFormat("es-ES",options||{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Madrid"}).format(new Date(number));
  }

  var api={queryState:queryState,validState:validState,detailUrl:detailUrl,endpoint:endpoint,safeDetailUrl:safeDetailUrl,normalize:normalize,when:when};
  root.YkAgentDetail=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
