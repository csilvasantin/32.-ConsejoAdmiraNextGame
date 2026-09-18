/* Registro global de admira.live: paginación completa, sin recortes silenciosos. */
(function(root){
  'use strict';
  function dayKey(value){
    const n=Number(value), ms=n<4102444800?n*1000:n;
    if(!Number.isFinite(ms)||ms<=0)return '';
    const p={};
    new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'})
      .formatToParts(new Date(ms)).forEach(x=>{if(x.type!=='literal')p[x.type]=x.value;});
    return `${p.year}-${p.month}-${p.day}`;
  }
  function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
  function shiftDay(day,delta){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
  async function fetchAll(fetcher,{scope='fleet',day='',projectId=null,isCurrent=()=>true}={}){
    // La API ordena por estado. Si cambia durante la paginación, una fila puede
    // repetirse: repetir la lectura completa y comprobar total evita perderla.
    for(let attempt=0;attempt<3;attempt++){
      const rows=[],seen=new Set();let first=null,total=null,offset=0,changed=false,complete=false;
      for(let page=0;page<1000;page++){
        if(!isCurrent())throw new Error('Carga sustituida');
        const q=new URLSearchParams({scope,limit:'1000',offset:String(offset)});
        if(day)q.set('day',day);if(projectId)q.set('project_id',projectId);
        const response=await fetcher('/tickets?'+q,{cache:'no-store'});
        if(!response.ok)throw new Error('tickets '+response.status);
        const data=await response.json(), batch=data&&(data.rows||data.tickets),u=data&&data.universe;
        if(!Array.isArray(batch)||data.error)throw new Error('Respuesta de misiones no válida');
        if(!first)first=data;
        if(u&&Number.isFinite(u.total)){
          if(total!==null&&total!==u.total)changed=true;total=u.total;
        }
        let added=0;
        for(const row of batch){
          if(!row||!row.id)throw new Error('Misión sin referencia');
          const id=String(row.id);if(seen.has(id)){changed=true;continue;}
          seen.add(id);rows.push(row);added++;
        }
        const more=u&&typeof u.has_more==='boolean'?u.has_more:batch.length===1000;
        if(!more){complete=true;break;}
        if(!added)break;
        offset+=batch.length;
      }
      if(complete&&!changed&&(total===null||rows.length===total)){
        return Object.assign({},first,{rows,tickets:rows,visible_counts:null,
          universe:Object.assign({},first.universe,{returned:rows.length,total:rows.length,has_more:false})});
      }
    }
    throw new Error('El listado cambió durante la carga o está incompleto. Reintenta.');
  }
  const api={dayKey,validDay,shiftDay,fetchAll};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MissionLedger=api;
})(typeof window==='undefined'?globalThis:window);
