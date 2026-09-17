/* Clasificación canónica del pulso. La superficie la decide exclusivamente
 * presence.host: el runtime describe la herramienta, nunca el tipo de agente. */
(function(root){
  "use strict";

  var GROUPS=[
    {key:"cli",label:"Agentes CLI"},
    {key:"app",label:"Agentes Desktop App"},
    {key:"unknown",label:"Sin superficie identificada"}
  ];

  function text(value){return String(value==null?"":value).trim();}
  function normalized(value){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function groupKey(row){
    var host=normalized(row&&row.host);
    return host==="cli"?"cli":host==="app"?"app":"unknown";
  }
  function exactIdentityKey(row,identity){
    row=row&&typeof row==="object"?row:{};
    var machine=text(row.machine),agent=text(row.agent||row.persona),runtime=text(row.runtime),host=normalized(row.host);
    var canonicalAgent=identity&&typeof identity.scoped==="function"?identity.scoped(agent,machine):agent;
    var machineKey=identity&&typeof identity.suffix==="function"?identity.suffix(machine):machine;
    return [normalized(canonicalAgent),normalized(machineKey||machine),normalized(runtime),host||"unknown"].join("\u001f");
  }
  function updated(row){var value=Number(row&&row.updated)||0;return value>0&&value<4102444800?value*1000:value;}
  function representativeRank(row){
    return [row&&row.verified===true||row&&row.verified===1?"1":"0",row&&row.online===true?"1":"0",
      String(updated(row)).padStart(16,"0"),normalized(row&&row.session_id),String(Number(row&&row.pid)||0).padStart(12,"0")].join("\u001f");
  }
  function stableLabel(row){
    return [normalized(row&&row.machine),normalized(row&&(row.agent||row.persona)),normalized(row&&row.runtime),
      normalized(row&&row.host),exactIdentityKey(row)].join("\u001f");
  }
  function classify(rows,options){
    options=options||{};
    var identity=options.identity||root.ykAgentIdentity||null;
    var detailUrl=typeof options.detailUrl==="function"?options.detailUrl:
      root.YkAgentDetail&&typeof root.YkAgentDetail.detailUrl==="function"?root.YkAgentDetail.detailUrl:null;
    var source=Array.isArray(rows)?rows:[],unique=new Map();
    source.forEach(function(raw){
      var row=raw&&typeof raw==="object"?raw:{},key=exactIdentityKey(row,identity),previous=unique.get(key);
      if(!previous||representativeRank(row)>representativeRank(previous))unique.set(key,row);
    });
    var buckets={cli:[],app:[],unknown:[]};
    unique.forEach(function(row,key){
      var group=groupKey(row),item=Object.assign({},row,{surface_group:group,identity_key:key});
      var href=detailUrl?text(detailUrl(row)):"";
      if(href)item.detail_url=href;
      buckets[group].push(item);
    });
    GROUPS.forEach(function(group){buckets[group.key].sort(function(a,b){return stableLabel(a).localeCompare(stableLabel(b),"es");});});
    var groups=GROUPS.map(function(group){return {key:group.key,label:group.label,count:buckets[group.key].length,items:buckets[group.key]};});
    var counts={cli:buckets.cli.length,app:buckets.app.length,unknown:buckets.unknown.length};
    counts.primary=counts.cli+counts.app;
    counts.total=counts.primary+counts.unknown;
    counts.source_total=source.length;
    counts.duplicates_removed=Math.max(0,source.length-counts.total);
    return {groups:groups,by_key:{cli:groups[0],app:groups[1],unknown:groups[2]},counts:counts};
  }

  var api={groupKey:groupKey,exactIdentityKey:exactIdentityKey,classify:classify,groups:GROUPS.map(function(group){return Object.assign({},group);})};
  root.YkPresenceGroups=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
