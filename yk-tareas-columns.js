(function(root){
  "use strict";
  function clamp(value,spec){
    var numeric=Number(value);
    if(!Number.isFinite(numeric))numeric=spec.default;
    return Math.min(spec.max,Math.max(spec.min,Math.round(numeric)));
  }
  function load(storage,key,specs){
    var saved={};
    try{saved=JSON.parse(storage&&storage.getItem(key)||"{}")||{};}catch(_){saved={};}
    return Object.keys(specs).reduce(function(out,name){out[name]=clamp(saved[name],specs[name]);return out;},{});
  }
  function mount(container,specs,options){
    options=options||{};
    var storage=options.storage||(typeof localStorage!=="undefined"?localStorage:null);
    var storageKey=options.storageKey||"yokup.tareas.columnWidths.v1";
    var widths=load(storage,storageKey,specs),drag=null;
    function persist(){try{if(storage)storage.setItem(storageKey,JSON.stringify(widths));}catch(_){}}
    function description(name){
      var spec=specs[name],width=widths[name];
      return "Redimensionar columna "+spec.label+". Ancho "+width+" píxeles. Flechas cambian el ancho; Inicio, Intro o Espacio restauran "+spec.default+" píxeles.";
    }
    function apply(){
      Object.keys(specs).forEach(function(name){container.style.setProperty("--c-"+name,widths[name]+"px");});
      container.querySelectorAll("[data-task-resize]").forEach(function(handle){
        var name=handle.dataset.taskResize,spec=specs[name];if(!spec)return;
        handle.setAttribute("aria-valuemin",String(spec.min));
        handle.setAttribute("aria-valuemax",String(spec.max));
        handle.setAttribute("aria-valuenow",String(widths[name]));
        handle.setAttribute("aria-valuetext",widths[name]+" píxeles");
        handle.setAttribute("aria-label",description(name));
        handle.title="Arrastrar para cambiar ancho · doble clic para restaurar";
      });
    }
    function set(name,value,save){if(!specs[name])return;widths[name]=clamp(value,specs[name]);apply();if(save!==false)persist();}
    function reset(name){set(name,specs[name].default,true);}
    function fromEvent(event){return event.target&&event.target.closest?event.target.closest("[data-task-resize]"):null;}
    container.addEventListener("pointerdown",function(event){
      var handle=fromEvent(event);if(!handle)return;
      event.preventDefault();event.stopPropagation();
      var name=handle.dataset.taskResize;
      drag={name:name,startX:event.clientX,startWidth:widths[name],handle:handle};
      handle.classList.add("dragging");
      if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);
    });
    root.addEventListener("pointermove",function(event){
      if(!drag)return;event.preventDefault();
      set(drag.name,drag.startWidth+event.clientX-drag.startX,false);
    });
    function finish(){if(!drag)return;drag.handle.classList.remove("dragging");persist();drag=null;}
    root.addEventListener("pointerup",finish);
    root.addEventListener("pointercancel",finish);
    container.addEventListener("click",function(event){var handle=fromEvent(event);if(handle)event.stopPropagation();});
    container.addEventListener("dblclick",function(event){
      var handle=fromEvent(event);if(!handle)return;
      event.preventDefault();event.stopPropagation();reset(handle.dataset.taskResize);
    });
    container.addEventListener("keydown",function(event){
      var handle=fromEvent(event);if(!handle)return;
      var name=handle.dataset.taskResize,step=event.shiftKey?24:8;
      if(event.key==="ArrowLeft")set(name,widths[name]-step,true);
      else if(event.key==="ArrowRight")set(name,widths[name]+step,true);
      else if(event.key==="Home"||event.key==="Enter"||event.key===" ")reset(name);
      else return;
      event.preventDefault();event.stopPropagation();
    });
    apply();
    return {apply:apply,set:set,reset:reset,widths:widths};
  }
  root.YkTareasColumns={mount:mount,_test:{clamp:clamp,load:load}};
})(typeof window!=="undefined"?window:globalThis);
