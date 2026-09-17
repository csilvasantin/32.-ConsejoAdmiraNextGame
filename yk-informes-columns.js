(function(root){
  "use strict";
  function clamp(value,spec){var numeric=Number(value);if(!Number.isFinite(numeric))numeric=spec.default;return Math.min(spec.max,Math.max(spec.min,Math.round(numeric)));}
  function load(storage,key,specs){
    var saved={};
    try{saved=JSON.parse(storage&&storage.getItem(key)||"{}")||{};}catch(_){saved={};}
    return Object.keys(specs).reduce(function(out,name){out[name]=clamp(saved[name],specs[name]);return out;},{});
  }
  function total(widths){return Object.keys(widths).reduce(function(sum,name){return sum+(Number(widths[name])||0);},0);}
  // Mantiene la suma dentro del ancho real de la hoja. La columna que se está
  // manipulando queda protegida y el delta se reparte entre las demás sin
  // violar mínimos/máximos; si ya no tienen recorrido, se limita el gesto.
  function rebalance(input,specs,target,locked){
    var widths={},names=Object.keys(specs),goal=Math.round(Number(target)||0);
    names.forEach(function(name){widths[name]=clamp(input[name],specs[name]);});
    if(goal<=0)return widths;
    var delta=goal-total(widths),order=names.filter(function(name){return name!==locked;});
    function absorb(keys){
      var guard=0;
      while(delta!==0&&guard++<100){
        var grow=delta>0,candidates=keys.filter(function(name){return grow?widths[name]<specs[name].max:widths[name]>specs[name].min;});
        if(!candidates.length)break;
        var step=Math.max(1,Math.ceil(Math.abs(delta)/candidates.length));
        candidates.forEach(function(name){
          if(delta===0)return;
          var room=grow?specs[name].max-widths[name]:widths[name]-specs[name].min;
          var move=Math.min(room,step,Math.abs(delta));
          widths[name]+=grow?move:-move;delta+=grow?-move:move;
        });
      }
    }
    absorb(order);if(delta!==0&&locked)absorb([locked]);
    return widths;
  }
  function mount(container,specs,options){
    options=options||{};
    var storage=options.storage||(typeof localStorage!=="undefined"?localStorage:null);
    var storageKey=options.storageKey||"yokup.informes.columnWidths.v1";
    var widths=load(storage,storageKey,specs),drag=null,layoutTotal=0;
    function measure(){return Math.round(Number(container.clientWidth||(container.parentElement&&container.parentElement.clientWidth))||0);}
    function replace(next){Object.keys(specs).forEach(function(name){widths[name]=next[name];});}
    function fit(){var measured=measure();if(measured>0){layoutTotal=measured;replace(rebalance(widths,specs,layoutTotal,null));}}
    function persist(){try{if(storage)storage.setItem(storageKey,JSON.stringify(widths));}catch(_){}}
    function label(name){var s=specs[name],w=widths[name];return "Redimensionar columna "+s.label+". Ancho "+w+" píxeles. Flechas cambian el ancho; Inicio, Intro o Espacio restauran "+s.default+" píxeles.";}
    function apply(){
      fit();
      Object.keys(specs).forEach(function(name){container.style.setProperty("--col-"+name,widths[name]+"px");});
      container.querySelectorAll("[data-resize]").forEach(function(handle){
        var name=handle.dataset.resize;if(!specs[name])return;
        handle.setAttribute("aria-valuenow",String(widths[name]));
        handle.setAttribute("aria-valuetext",widths[name]+" píxeles");
        handle.setAttribute("aria-label",label(name));
        handle.title="Arrastrar para cambiar ancho · doble clic para restaurar";
      });
    }
    function set(name,value,save){
      if(!specs[name])return;
      var measured=measure();
      // Entornos sin caja medible (tests, prerender o elemento aún desconectado)
      // conservan el contrato independiente anterior. En pantalla real siempre
      // hay medida y se activa la redistribución sin overflow.
      if(!measured){widths[name]=clamp(value,specs[name]);apply();if(save!==false)persist();return;}
      if(!layoutTotal)layoutTotal=measured;
      var next={};Object.keys(specs).forEach(function(key){next[key]=widths[key];});next[name]=clamp(value,specs[name]);
      replace(rebalance(next,specs,layoutTotal,name));apply();if(save!==false)persist();
    }
    function reset(name){set(name,specs[name].default,true);}
    function handleFrom(event){return event.target&&event.target.closest?event.target.closest("[data-resize]"):null;}
    container.addEventListener("pointerdown",function(event){
      var handle=handleFrom(event);if(!handle)return;
      event.preventDefault();event.stopPropagation();
      drag={name:handle.dataset.resize,startX:event.clientX,startWidth:widths[handle.dataset.resize],handle:handle};
      handle.classList.add("dragging");if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);
    });
    root.addEventListener("pointermove",function(event){if(!drag)return;event.preventDefault();set(drag.name,drag.startWidth+event.clientX-drag.startX,false);});
    function finishDrag(){if(!drag)return;drag.handle.classList.remove("dragging");persist();drag=null;}
    root.addEventListener("pointerup",finishDrag);
    root.addEventListener("pointercancel",finishDrag);
    root.addEventListener("resize",function(){apply();});
    container.addEventListener("dblclick",function(event){var handle=handleFrom(event);if(!handle)return;event.preventDefault();event.stopPropagation();reset(handle.dataset.resize);});
    container.addEventListener("keydown",function(event){
      var handle=handleFrom(event);if(!handle)return;
      var name=handle.dataset.resize,step=event.shiftKey?24:8;
      if(event.key==="ArrowLeft")set(name,widths[name]-step,true);
      else if(event.key==="ArrowRight")set(name,widths[name]+step,true);
      else if(event.key==="Home"||event.key==="Enter"||event.key===" ")reset(name);else return;
      event.preventDefault();event.stopPropagation();
    });
    apply();
    return {apply:apply,set:set,reset:reset,widths:widths};
  }
  root.YkInformesColumns={mount:mount,_test:{clamp:clamp,load:load,rebalance:rebalance,total:total}};
})(typeof window!=="undefined"?window:globalThis);
