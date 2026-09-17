(function(root){
  "use strict";

  var DETAIL="detail",GRID="grid",LIST="list";
  // Nueva clave: la recuperacion de la hoja historica debe abrir Detalle incluso
  // si una version intermedia dejo Lista guardada en el navegador.
  var STORAGE_KEY="yokup.informes.view.v3";

  function normalize(value){return value===GRID||value===LIST?value:DETAIL;}
  function read(storage,key){
    try{return normalize(storage&&storage.getItem(key||STORAGE_KEY));}
    catch(_){return DETAIL;}
  }
  function write(storage,key,value){
    try{if(storage)storage.setItem(key||STORAGE_KEY,normalize(value));return true;}
    catch(_){return false;}
  }
  function clean(value){return String(value==null?"":value).trim();}
  function rowKey(row){return clean(row&&row.mission_id)+"\u0000"+clean(row&&row.code);}
  function anomalyKey(row){
    return clean(row&&row.debt_kind)+"\u0000"+
      clean(row&&(row.id||row.mission_id))+"\u0000"+clean(row&&row.code);
  }
  function reportKind(row){
    var explicit=clean(row&&(row.report_scope||row.report_kind)).toLowerCase();
    if(explicit==="mission"||explicit==="mision")return "mission";
    if(explicit==="task"||explicit==="tarea")return "task";
    return /^z\d+$/i.test(clean(row&&row.code))?"mission":"task";
  }
  function detailHref(row){
    var mission=clean(row&&row.mission_id),code=clean(row&&row.code);
    if(!mission)return "";
    if(reportKind(row)==="mission")return "/ticket?id="+encodeURIComponent(mission);
    return "/tareas?mission="+encodeURIComponent(mission)+(code?"#"+encodeURIComponent(code):"");
  }
  // La vista es exclusivamente una proyección visual: recibe el array ya filtrado
  // y ordenado y devuelve una copia superficial con exactamente las mismas filas.
  function rowsForView(rows){return Array.isArray(rows)?rows.slice():[];}
  function missionKey(row,index){
    return clean(row&&(row.mission_id||row.id))||("__row__"+String(index));
  }
  function codeOrder(row){
    var code=clean(row&&row.code).toLowerCase(),mission=reportKind(row)==="mission";
    if(mission)return [0,0,0,code];
    var match=/^([a-z])(\d*)$/.exec(code);
    if(match)return [1,match[1].charCodeAt(0)-96,match[2]?Number(match[2]):0,code];
    return [2,0,0,code];
  }
  function compareCode(a,b){
    var left=codeOrder(a),right=codeOrder(b);
    for(var i=0;i<left.length;i++){
      if(left[i]===right[i])continue;
      if(typeof left[i]==="number"&&typeof right[i]==="number")return left[i]-right[i];
      return String(left[i]).localeCompare(String(right[i]),"es",{numeric:true,sensitivity:"base"});
    }
    return 0;
  }
  // El orden recibido decide el orden de las misiones (fecha, agente, puntos...),
  // pero una mision nunca se fragmenta: z1, A, A1..., B, B1..., C, C1...
  function missionGroups(rows){
    var groups=[],byMission=new Map();
    rowsForView(rows).forEach(function(row,index){
      var key=missionKey(row,index),group=byMission.get(key);
      if(!group){group={key:key,rows:[]};byMission.set(key,group);groups.push(group);}
      group.rows.push({row:row,index:index});
    });
    groups.forEach(function(group){
      group.rows=group.rows.sort(function(a,b){return compareCode(a.row,b.row)||(a.index-b.index);}).map(function(item){return item.row;});
    });
    return groups;
  }
  function canonicalMissionRows(rows){
    return missionGroups(rows).reduce(function(all,group){return all.concat(group.rows);},[]);
  }
  function dataContract(rows,meta){
    var projected=rowsForView(rows),options=meta||{};
    var state=/^(loading|error)$/.test(options.state)?options.state:(projected.length?"ready":"empty");
    return {
      state:state,
      rows:projected,
      keys:projected.map(rowKey),
      visible:Number.isFinite(Number(options.visible))?Number(options.visible):projected.length,
      loaded:Number.isFinite(Number(options.loaded))?Number(options.loaded):projected.length,
      total:Number.isFinite(Number(options.total))?Number(options.total):null,
      hasMore:!!options.hasMore
    };
  }
  // Las anomalías son deuda global/histórica y nunca forman parte de ALL. Se
  // proyectan con la misma preferencia visual, pero no reciben report sintético
  // ni participan en filtros, puntos, conteos o paginación de informes reales.
  function anomalyContract(rows){
    var projected=rowsForView(rows);
    return {rows:projected,keys:projected.map(anomalyKey)};
  }
  function selectorMarkup(view,controls,noun){
    var current=normalize(view),target=clean(controls),subject=clean(noun)||"informes";
    function button(value,label){
      return '<button type="button" class="informes-view-option" data-informes-view-option="'+value+'" aria-pressed="'+(current===value?'true':'false')+'" aria-label="Mostrar '+subject+' en '+label.toLowerCase()+'"'+(target?' aria-controls="'+target.replace(/[<>&\"]/g,"")+'"':'')+'>'+label+'</button>';
    }
    return '<div class="informes-view-switch" role="group" aria-label="Vista de '+subject+'">'+button(DETAIL,"Detalle")+button(GRID,"Cuadrícula")+button(LIST,"Lista")+'</div>';
  }
  function mount(container,options){
    if(!container)return null;
    options=options||{};
    var storage=options.storage||(typeof localStorage!=="undefined"?localStorage:null);
    var key=options.storageKey||STORAGE_KEY;
    var targets=options.targets||[options.target||null];
    targets=Array.prototype.filter.call(targets,function(item){return !!item;});
    var view=read(storage,key);
    var controls=options.controls||targets.map(function(item){return item.id||"";}).filter(Boolean).join(" ");
    var attribute=clean(options.attribute)||"data-informes-view";
    container.innerHTML=selectorMarkup(view,controls,options.noun);
    function paint(){
      targets.forEach(function(target){if(target&&target.setAttribute)target.setAttribute(attribute,view);});
      var buttons=container.querySelectorAll?container.querySelectorAll("[data-informes-view-option]"):[];
      Array.prototype.forEach.call(buttons,function(button){button.setAttribute("aria-pressed",String(button.getAttribute("data-informes-view-option")===view));});
    }
    function setView(next,settings){
      var normalized=normalize(next),changed=normalized!==view;
      view=normalized;paint();
      if(!settings||settings.persist!==false)write(storage,key,view);
      if((changed||settings&&settings.force)&&options.onChange)options.onChange(view);
      return view;
    }
    function click(event){
      var button=event.target&&event.target.closest?event.target.closest("[data-informes-view-option]"):null;
      if(!button)return;
      if(event.preventDefault)event.preventDefault();
      if(event.stopPropagation)event.stopPropagation();
      setView(button.getAttribute("data-informes-view-option"));
    }
    if(container.addEventListener)container.addEventListener("click",click);
    paint();
    return {
      getView:function(){return view;},
      setView:setView,
      destroy:function(){if(container.removeEventListener)container.removeEventListener("click",click);}
    };
  }

  root.YkInformesView={
    DETAIL:DETAIL,GRID:GRID,LIST:LIST,STORAGE_KEY:STORAGE_KEY,
    normalize:normalize,read:read,write:write,rowKey:rowKey,reportKind:reportKind,
    detailHref:detailHref,rowsForView:rowsForView,missionGroups:missionGroups,
    canonicalMissionRows:canonicalMissionRows,dataContract:dataContract,
    anomalyKey:anomalyKey,anomalyContract:anomalyContract,
    selectorMarkup:selectorMarkup,mount:mount
  };
})(typeof window!=="undefined"?window:globalThis);
