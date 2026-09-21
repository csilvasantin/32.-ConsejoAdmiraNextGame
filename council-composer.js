/* A persistent composer shared by compact Previos and its expanded view. */
(function(root){
  'use strict';
  function mount({container,onInput,onSend}){
    const doc=container.ownerDocument;
    const form=doc.createElement('form');form.className='council-composer';
    const field=doc.createElement('textarea');field.rows=2;field.maxLength=16000;
    field.placeholder='Escribe un mensaje…';field.setAttribute('aria-label','Mensaje al consejero');
    const footer=doc.createElement('div');footer.className='council-composer__footer';
    const hint=doc.createElement('span');hint.textContent='Enter: enviar · Mayús+Enter: nueva línea';
    const button=doc.createElement('button');button.type='submit';button.textContent='Enviar';
    footer.append(hint,button);form.append(field,footer);container.append(form);
    field.addEventListener('input',()=>onInput(field.value));
    form.addEventListener('submit',event=>{event.preventDefault();if(!button.disabled)onSend(field.value);});
    field.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!button.disabled)form.requestSubmit();}
    });
    return {update({persona,value,pending=false}){
      if(field.value!==value)field.value=value;
      field.disabled=!persona;button.disabled=!persona||pending;
      field.setAttribute('aria-label',persona?'Mensaje a '+persona:'Mensaje al consejero');
      field.placeholder=persona?'Escribe a '+persona+'…':'Elige un consejero';
      button.textContent=pending?'Enviando…':'Enviar';
    },focus(){field.focus();}};
  }
  root.CouncilComposer={mount};
})(typeof window!=='undefined'?window:globalThis);
