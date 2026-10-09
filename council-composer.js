/* A persistent composer shared by compact Previos and its expanded view.
 * FLT-101758: paste (Ctrl/Cmd-V) de image/* en el textarea → onPasteImage(file) + miniatura. */
(function(root){
  'use strict';
  function mount({container,onInput,onSend,onPasteImage}){
    const doc=container.ownerDocument;
    const form=doc.createElement('form');form.className='council-composer';
    const thumbs=doc.createElement('div');thumbs.className='council-composer__thumbs';thumbs.hidden=true;
    const field=doc.createElement('textarea');field.rows=2;field.maxLength=16000;
    field.placeholder='Escribe un mensaje… · pega una imagen';field.setAttribute('aria-label','Mensaje al consejero');
    const footer=doc.createElement('div');footer.className='council-composer__footer';
    const hint=doc.createElement('span');hint.textContent='Enter: enviar · Mayús+Enter: nueva línea · pega imagen';
    const button=doc.createElement('button');button.type='submit';button.textContent='Enviar';
    footer.append(hint,button);form.append(thumbs,field,footer);container.append(form);
    let pending=null; // {name,url,type}
    function renderThumb(){
      thumbs.replaceChildren();
      if(!pending){thumbs.hidden=true;return;}
      thumbs.hidden=false;
      const img=doc.createElement('img');img.alt=pending.name||'imagen';img.src=pending.url;
      const meta=doc.createElement('span');meta.textContent='🖼️ '+(pending.name||'imagen')+' · lista para enviar';
      const x=doc.createElement('button');x.type='button';x.className='council-composer__thumb-x';x.textContent='×';x.title='Quitar imagen';
      x.addEventListener('click',()=>{pending=null;renderThumb();});
      thumbs.append(img,meta,x);
    }
    field.addEventListener('input',()=>onInput(field.value));
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(button.disabled)return;
      onSend(field.value,{image:pending});
    });
    field.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!button.disabled)form.requestSubmit();}
    });
    field.addEventListener('paste',event=>{
      const items=(event.clipboardData&&event.clipboardData.items)||[];
      for(let i=0;i<items.length;i++){
        const it=items[i];
        if(it&&it.type&&it.type.indexOf('image/')===0){
          const file=it.getAsFile();
          if(!file)continue;
          event.preventDefault();
          if(typeof onPasteImage==='function'){
            Promise.resolve(onPasteImage(file)).then(info=>{
              if(info&&info.url){pending={name:info.name||file.name||'imagen.png',url:info.url,type:info.type||file.type||'image/png'};renderThumb();}
            });
          }else{
            const reader=new FileReader();
            reader.onload=()=>{pending={name:file.name||'imagen.png',url:reader.result,type:file.type||'image/png'};renderThumb();};
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    });
    return {
      update({persona,value,pending:busy=false,image=null}){
        if(field.value!==value)field.value=value;
        field.disabled=!persona;button.disabled=!persona||busy;
        field.setAttribute('aria-label',persona?'Mensaje a '+persona:'Mensaje al consejero');
        field.placeholder=persona?'Escribe a '+persona+'… · pega una imagen':'Elige un consejero';
        button.textContent=busy?'Enviando…':'Enviar';
        if(image===null){/* keep */}
        else if(!image){pending=null;renderThumb();}
        else{pending=image;renderThumb();}
      },
      focus(){field.focus();},
      clearImage(){pending=null;renderThumb();},
      getImage(){return pending;}
    };
  }
  root.CouncilComposer={mount};
})(typeof window!=='undefined'?window:globalThis);
