(function(root){
  "use strict";

  const collator=new Intl.Collator("es",{numeric:true,sensitivity:"base"});
  const ms=value=>{
    const n=Number(value)||0;
    return n>4102444800?n:n*1000;
  };
  const text=value=>String(value==null?"":value).trim();
  const cmpNumber=(a,b)=>a<b?-1:a>b?1:0;
  const cmpText=(a,b)=>collator.compare(text(a),text(b));

  function valueFor(row,key,agentName,missionLast){
    switch(key){
      case "mision":
        return [text(row.mission_display_ref||row.mission_id),text(row.code),text(row.subject||row.title)];
      case "proceso":
        return [row.process_image?1:0,ms(row.process_captured_at)||ms(row.updated_at)];
      case "captura":
        return [row.image?2:row.mission_proof?1:0,ms(row.updated_at)];
      case "informe":
        return [text(row.report)];
      case "agente":
        return [text(agentName(row))];
      // Ordenar por PUNTOS = por lo que PRODUJO el encargo (la diferencia), no por
      // el total del agente, que sólo dice cuánto llevaba acumulado ese día. Un
      // informe sin sellar no vale 0: se va abajo (Number.NEGATIVE_INFINITY) para
      // no fingir que produjo nada (regla 17).
      case "puntos": {
        const a=Number(row.points_start), b=Number(row.points_end);
        if(!Number.isFinite(b)) return [Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY];
        return [Number.isFinite(a)?b-a:Number.NEGATIVE_INFINITY,b];
      }
      case "tiempo": {
        const start=ms(row.mission_created);
        const end=ms(row.mission_resolved)||(missionLast[String(row.mission_id)]||0);
        return [start,end,start&&end>=start?end-start:0];
      }
      default:
        return [ms(row.updated_at)];
    }
  }

  function compareValues(a,b,key){
    for(let i=0;i<Math.max(a.length,b.length);i++){
      const left=a[i],right=b[i];
      const result=typeof left==="number"&&typeof right==="number"
        ?cmpNumber(left,right)
        :cmpText(left,right);
      if(result)return result;
    }
    return 0;
  }

  function sort(rows,key,direction,options={}){
    const agentName=options.agentName||((row)=>row.agent_identity||row.owner||"");
    const missionLast=options.missionLast||{};
    const sign=direction==="desc"?-1:1;
    return rows.map((row,index)=>({row,index,value:valueFor(row,key,agentName,missionLast)}))
      .sort((a,b)=>sign*compareValues(a.value,b.value,key)||(a.index-b.index))
      .map(item=>item.row);
  }

  root.YkInformesSort={sort,valueFor,_test:{compareValues,ms}};
})(typeof window!=="undefined"?window:globalThis);
