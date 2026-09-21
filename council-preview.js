/* One readable conversation in Previos, with explicit desktop/game views. */
(function(root){
  'use strict';
  function mount(element){
    if(!element)return null;
    const doc=element.ownerDocument;
    let persona=null, view='desktop', expanded=false;
    const art=element.querySelector('.mac-scumm-stage');
    element.classList.add('council-preview');
    const controls=doc.createElement('div');controls.className='council-preview__controls';
    controls.innerHTML='<div class="council-preview__views" aria-label="Vista de Previos"><button type="button" data-view="conversation">Conversación</button><button type="button" data-view="desktop">Escritorio</button><button type="button" data-view="pong">Pong</button></div><button type="button" data-preview-expand aria-label="Ampliar Previos">↗</button>';
    const chat=doc.createElement('div');chat.className='council-preview__chat';chat.hidden=true;
    const status=doc.createElement('div');status.className='council-preview__screen-status';status.hidden=true;
    const message=doc.createElement('span');message.setAttribute('role','status');
    const retry=doc.createElement('button');retry.type='button';retry.textContent='Reintentar';retry.hidden=true;
    status.append(message,retry);element.prepend(controls);element.append(chat,status);
    const empty=doc.createElement('p');empty.className='council-preview__empty';empty.textContent='Pulsa Preguntar y elige un consejero para ver su conversación.';chat.append(empty);
    function setView(next,{activate=true}={}){
      if(!['conversation','desktop','pong'].includes(next))return;
      view=next;element.dataset.previewView=view;
      chat.hidden=view!=='conversation';art.hidden=view==='conversation';status.hidden=view!=='desktop'||!message.textContent;
      controls.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
      if(!activate)return;
      const mac=root.MacHoy;
      mac?.closeFront();
      if(view==='conversation'){mac?.setModo('logo');return;}
      if(view==='desktop'){
        if(persona)mac?.showRemote(persona);
        else{message.textContent='Elige un consejero con Examinar para ver su escritorio.';status.hidden=false;}
      }else{mac?.setVisible(true);if(mac?.modoActual()!=='pong')mac?.alternaPong();}
    }
    function expand(on){
      expanded=on;element.classList.toggle('is-expanded',on);
      const b=controls.querySelector('[data-preview-expand]');b.textContent=on?'Volver a Previos':'↗';b.setAttribute('aria-label',on?'Reducir Previos':'Ampliar Previos');
      root.MacHoy?.fitScreen();b.focus();
    }
    controls.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.view)setView(button.dataset.view);else if(button.hasAttribute('data-preview-expand'))expand(!expanded);
    });
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){expand(false);event.preventDefault();}});
    retry.addEventListener('click',()=>{if(persona)root.MacHoy?.showRemote(persona);});
    doc.addEventListener('mac-screen-mode',event=>{
      if(event.detail.persona)persona=event.detail.persona;
      if(event.detail.mode==='remote')setView('desktop',{activate:false});
      if(event.detail.mode==='pong')setView('pong',{activate:false});
    });
    doc.addEventListener('mac-remote-status',event=>{
      const s=event.detail;if(s.persona)persona=s.persona;
      message.textContent=s.message+(s.lastFrameAt?' · Imagen recibida '+new Date(s.lastFrameAt).toLocaleTimeString('es-ES'):'');
      retry.hidden=!s.retry;status.hidden=view!=='desktop'||!message.textContent;
    });
    setView('desktop',{activate:false});
    return {chatHost:chat,select(name){persona=name;empty.hidden=!!name;setView('conversation');},open(){setView('conversation');expand(true);},showDesktop(name){persona=name;setView('desktop');},get view(){return view;}};
  }
  root.CouncilPreview={mount};
})(typeof window!=='undefined'?window:globalThis);
