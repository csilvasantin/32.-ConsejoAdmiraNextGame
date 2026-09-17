(function(root){
  'use strict';
  function number(value){if(value===null||value===undefined||value===''||typeof value==='boolean'||typeof value==='object')return null;var n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
  function epochMs(value){var n=number(value);if(n===null||n===0)return null;var ms=n>=1e9&&n<1e11?n*1000:n;return ms<=8640000000000000?ms:null;}
  function field(row,snake,camel){return row[snake]!==undefined?row[snake]:row[camel];}
  function label(value){var ms=number(value);if(ms===null)return '—';var total=Math.floor(ms/1000);return String(Math.floor(total/3600)).padStart(2,'0')+':'+String(Math.floor(total%3600/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
  // Epochs may arrive in seconds or milliseconds. Durations are always explicitly
  // milliseconds. No Date.now fallback: only the server sample advances a live row.
  function clock(row,serverAt,clientElapsedMs){
    row=row||{};var state=String(row.state||''),start=epochMs(field(row,'work_started_at','startedAt')),end=epochMs(field(row,'ended_at','endedAt'));
    var anchor=epochMs(serverAt),elapsed=number(clientElapsedMs)||0,measured=number(field(row,'elapsed_ms','elapsedMs'));
    var closed=['last_work','completed','resolved','done','closed'].includes(state),running=state==='running'&&!end;
    var invalid=!!(start&&anchor&&start>anchor+5000)||!!(end&&anchor&&end>anchor+5000)||!!(start&&end&&end<start)||state==='running'&&!!end,at=closed?end:anchor;
    var duration=null;
    if(!invalid){
      if(closed)duration=start&&end?end-start:measured;
      else if(running){if(start&&anchor&&anchor>=start)duration=anchor-start+elapsed;else if(measured!==null&&anchor)duration=measured+elapsed;if(at)at+=elapsed;}
      else duration=measured!==null?measured:start&&anchor&&anchor>=start?anchor-start:null;
    }
    return {at:at,start:start,end:end,missionDurationMs:duration,durationMs:duration,label:label(duration),running:running&&!invalid,closed:closed,basis:closed?'final':running?'elapsed':'sampled',invalid:invalid};
  }
  var api={epochMs:epochMs,durationMs:number,label:label,clock:clock};root.YkWorkClock=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
