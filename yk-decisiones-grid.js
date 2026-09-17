(function(root){
  "use strict";
  var KEYS=["agent","project","decision","result","state","time"];
  var DEFAULTS={
    agent:{label:"Agente / plataforma",default:150,min:110,max:320},
    project:{label:"Proyecto",default:150,min:110,max:340},
    decision:{label:"Decisión",default:280,min:200,max:640},
    result:{label:"Resultado",default:220,min:150,max:520},
    state:{label:"Estado",default:120,min:96,max:260},
    time:{label:"Tiempo",default:150,min:112,max:300}
  };
  function clamp(value,spec){var n=Number(value);if(!Number.isFinite(n))n=spec.default;return Math.min(spec.max,Math.max(spec.min,Math.round(n)));}
  function read(storage,key,fallback){try{return JSON.parse(storage&&storage.getItem(key)||"")||fallback;}catch(_){return fallback;}}
  function mount(container,options){
    if(!container)return null;
    options=options||{};
    var doc=container.ownerDocument||(typeof document!=="undefined"?document:null);
    var storage=options.storage||(typeof localStorage!=="undefined"?localStorage:null);
    var widthKey=options.widthKey||"yokup.decisiones.columnWidths.v1";
    var sortKey=options.sortKey||"yokup.decisiones.sort.v1";
    var specs=options.specs||DEFAULTS,savedWidths=read(storage,widthKey,{}),widths={};
    KEYS.forEach(function(key){widths[key]=clamp(savedWidths[key],specs[key]);});
    var savedSort=read(storage,sortKey,null);
    var sort=savedSort&&KEYS.indexOf(savedSort.key)>=0&&/^(asc|desc)$/.test(savedSort.dir)?savedSort:null;
    var drag=null,lastFocus=null,rowOrder=new WeakMap(),nextOrder=0,refreshQueued=false;
    var collator=typeof Intl!=="undefined"&&Intl.Collator?new Intl.Collator("es",{numeric:true,sensitivity:"base"}):null;
    function saveWidths(){try{if(storage)storage.setItem(widthKey,JSON.stringify(widths));}catch(_){}}
    function saveSort(){try{if(storage)storage.setItem(sortKey,JSON.stringify(sort));}catch(_){}}
    function injectStyles(){
      if(!doc||!doc.head||doc.getElementById&&doc.getElementById("yk-decisiones-grid-style"))return;
      var style=doc.createElement("style");style.id="yk-decisiones-grid-style";
      style.textContent=".decision-grid-head [data-decision-col]{position:relative;min-width:0}.decision-sort-button{width:100%;min-height:38px;padding:8px 17px 8px 9px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.decision-sort-button:focus-visible{outline:2px solid var(--brand,#78f3ff);outline-offset:-3px}.decision-sort-arrow{margin-left:6px;color:var(--dim,#4d7a88)}[aria-sort=ascending] .decision-sort-arrow,[aria-sort=descending] .decision-sort-arrow{color:var(--brand,#78f3ff)}.decision-col-resize{position:absolute;z-index:4;top:3px;right:-8px;width:16px;height:32px;cursor:col-resize;touch-action:none;outline:none}.decision-col-resize:before{content:'';position:absolute;top:5px;bottom:5px;left:7px;width:1px;background:var(--line2,rgba(120,243,255,.3))}.decision-col-resize:hover:before,.decision-col-resize:focus-visible:before,.decision-col-resize.dragging:before{background:var(--brand,#78f3ff);box-shadow:0 0 6px rgba(120,243,255,.7)}@media(max-width:720px){.decision-col-resize{width:18px;right:-9px}}";
      doc.head.appendChild(style);
    }
    function handleLabel(key){var spec=specs[key];return "Redimensionar columna "+spec.label+". Ancho "+widths[key]+" píxeles. Flechas cambian el ancho; Inicio, Intro o Espacio restauran "+spec.default+" píxeles.";}
    function enhanceHeaders(){
      var head=container.querySelector(".decision-grid-head");if(!head)return;
      head.setAttribute("role","row");
      KEYS.forEach(function(key){
        var cell=head.querySelector('[data-decision-col="'+key+'"]');if(!cell)return;
        cell.setAttribute("role","columnheader");
        var button=cell.querySelector(".decision-sort-button"),handle=cell.querySelector(".decision-col-resize");
        if(!button){
          var label=(cell.textContent||specs[key].label).trim()||specs[key].label;
          cell.textContent="";button=doc.createElement("button");button.type="button";button.className="decision-sort-button";button.dataset.decisionSort=key;
          var text=doc.createElement("span");text.className="decision-sort-label";text.textContent=label;
          var arrow=doc.createElement("span");arrow.className="decision-sort-arrow";arrow.setAttribute("aria-hidden","true");
          button.appendChild(text);button.appendChild(arrow);cell.appendChild(button);
        }
        if(!handle){handle=doc.createElement("span");handle.className="decision-col-resize";handle.dataset.decisionResize=key;handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","vertical");handle.tabIndex=0;cell.appendChild(handle);}
      });
    }
    function applyWidths(){
      KEYS.forEach(function(key){container.style.setProperty("--decision-col-"+key,widths[key]+"px");});
      container.querySelectorAll("[data-decision-resize]").forEach(function(handle){var key=handle.dataset.decisionResize,spec=specs[key];if(!spec)return;handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","vertical");handle.setAttribute("tabindex","0");handle.setAttribute("aria-valuemin",String(spec.min));handle.setAttribute("aria-valuemax",String(spec.max));handle.setAttribute("aria-valuenow",String(widths[key]));handle.setAttribute("aria-valuetext",widths[key]+" píxeles");handle.setAttribute("aria-label",handleLabel(key));handle.title="Arrastrar para cambiar ancho · doble clic para restaurar";});
    }
    function setWidth(key,value,persist){if(!specs[key])return;widths[key]=clamp(value,specs[key]);applyWidths();if(persist!==false)saveWidths();}
    function resetWidth(key){setWidth(key,specs[key].default,true);}
    function value(row,key){return String(row.getAttribute("data-sort-"+key)||"").trim();}
    function compareValue(a,b,key){
      if(!a&&!b)return 0;if(!a)return 1;if(!b)return -1;
      var an=Number(a),bn=Number(b),bothNumeric=Number.isFinite(an)&&Number.isFinite(bn);
      if(bothNumeric)return an-bn;
      if(key==="time"){var ad=Date.parse(a),bd=Date.parse(b);if(Number.isFinite(ad)&&Number.isFinite(bd))return ad-bd;}
      return collator?collator.compare(a,b):a.localeCompare(b);
    }
    function sortRows(){
      if(!sort)return;
      var groups=new Map();container.querySelectorAll(".decision-grid-row").forEach(function(row){if(!rowOrder.has(row))rowOrder.set(row,nextOrder++);var parent=row.parentNode;if(!groups.has(parent))groups.set(parent,[]);groups.get(parent).push(row);});
      groups.forEach(function(rows,parent){
        var sorted=rows.slice().sort(function(a,b){var av=value(a,sort.key),bv=value(b,sort.key);if(!av&&!bv)return rowOrder.get(a)-rowOrder.get(b);if(!av)return 1;if(!bv)return -1;var result=compareValue(av,bv,sort.key);return result?(sort.dir==="asc"?result:-result):rowOrder.get(a)-rowOrder.get(b);});
        if(sorted.some(function(row,index){return row!==rows[index];}))sorted.forEach(function(row){parent.appendChild(row);});
      });
    }
    function applySortA11y(){
      var head=container.querySelector(".decision-grid-head");if(!head)return;
      KEYS.forEach(function(key){var cell=head.querySelector('[data-decision-col="'+key+'"]');if(!cell)return;var active=sort&&sort.key===key,dir=active?sort.dir:null;cell.setAttribute("aria-sort",active?(dir==="asc"?"ascending":"descending"):"none");var button=cell.querySelector(".decision-sort-button"),arrow=cell.querySelector(".decision-sort-arrow");if(button)button.setAttribute("aria-label","Ordenar por "+specs[key].label+(active?(dir==="asc"?", ascendente. Activar para descendente.":", descendente. Activar para ascendente."):", activar para ascendente."));var mark=active?(dir==="asc"?"▲":"▼"):"↕";if(arrow&&arrow.textContent!==mark)arrow.textContent=mark;});
    }
    function restoreFocus(){if(!lastFocus||!doc)return;var selector=lastFocus.type==="resize"?'[data-decision-resize="'+lastFocus.key+'"]':'[data-decision-sort="'+lastFocus.key+'"]';var target=container.querySelector(selector);if(target&&target.focus)target.focus();}
    function apply(restore){enhanceHeaders();applyWidths();sortRows();applySortA11y();if(restore)restoreFocus();}
    function scheduleRefresh(){if(refreshQueued)return;refreshQueued=true;Promise.resolve().then(function(){refreshQueued=false;var active=doc&&doc.activeElement;var restore=!!lastFocus&&(!active||active===doc.body);apply(restore);});}
    function resizeFrom(event){return event.target&&event.target.closest?event.target.closest("[data-decision-resize]"):null;}
    container.addEventListener("focusin",function(event){var resize=resizeFrom(event),button=event.target&&event.target.closest&&event.target.closest("[data-decision-sort]");if(resize)lastFocus={type:"resize",key:resize.dataset.decisionResize};else if(button)lastFocus={type:"sort",key:button.dataset.decisionSort};});
    container.addEventListener("focusout",function(){Promise.resolve().then(function(){var active=doc&&doc.activeElement;if(active&&active!==doc.body&&!container.contains(active))lastFocus=null;});});
    container.addEventListener("click",function(event){
      var handle=resizeFrom(event);if(handle){event.stopPropagation();return;}
      var button=event.target&&event.target.closest&&event.target.closest("[data-decision-sort]");if(!button)return;
      event.preventDefault();event.stopPropagation();var key=button.dataset.decisionSort;
      sort=sort&&sort.key===key?{key:key,dir:sort.dir==="asc"?"desc":"asc"}:{key:key,dir:"asc"};saveSort();apply(false);if(button.focus)button.focus();
    });
    container.addEventListener("pointerdown",function(event){var handle=resizeFrom(event);if(!handle)return;event.preventDefault();event.stopPropagation();var key=handle.dataset.decisionResize;drag={key:key,startX:event.clientX,startWidth:widths[key],handle:handle};handle.classList.add("dragging");if(handle.focus)handle.focus();if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);});
    root.addEventListener("pointermove",function(event){if(!drag)return;event.preventDefault();setWidth(drag.key,drag.startWidth+event.clientX-drag.startX,false);});
    function finishResize(){if(!drag)return;drag.handle.classList.remove("dragging");saveWidths();drag=null;}
    root.addEventListener("pointerup",finishResize);root.addEventListener("pointercancel",finishResize);
    container.addEventListener("dblclick",function(event){var handle=resizeFrom(event);if(!handle)return;event.preventDefault();event.stopPropagation();resetWidth(handle.dataset.decisionResize);});
    container.addEventListener("keydown",function(event){var handle=resizeFrom(event);if(!handle)return;var key=handle.dataset.decisionResize,step=event.shiftKey?24:8;if(event.key==="ArrowLeft")setWidth(key,widths[key]-step,true);else if(event.key==="ArrowRight")setWidth(key,widths[key]+step,true);else if(event.key==="Home"||event.key==="Enter"||event.key===" ")resetWidth(key);else return;event.preventDefault();event.stopPropagation();});
    injectStyles();apply(false);
    var observer=typeof root.MutationObserver==="function"?new root.MutationObserver(scheduleRefresh):null;if(observer)observer.observe(container,{childList:true,subtree:true});
    return {apply:function(){apply(false);},setWidth:setWidth,resetWidth:resetWidth,getSort:function(){return sort;},widths:widths,destroy:function(){if(observer)observer.disconnect();}};
  }
  root.YkDecisionesGrid={mount:mount,_test:{clamp:clamp,keys:KEYS.slice()}};
})(typeof window!=="undefined"?window:globalThis);
