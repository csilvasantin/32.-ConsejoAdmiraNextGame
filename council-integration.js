(function () {
  'use strict';
  const scene=document.querySelector('.council-image');
  const image=document.getElementById('council-img');
  const bubble=document.getElementById('speech-bubble');
  if(!scene||!image||!bubble||!window.CouncilSpeech||!window.CouncilGrokBot||!window.CouncilTable)return;
  const overlay=bubble.parentElement;
  const dock=document.createElement('div');dock.className='council-speech-dock';dock.hidden=true;
  document.querySelector('.stage-row').insertAdjacentElement('afterend',dock);
  let activePersona=null,generation='leyendas',activeTurn=null,dismissed=false;
  const positions={
    'Steve Jobs':'left','Steve Wozniak':'left','Tim Cook':'left','Warren Buffett':'center',
    'Walt Disney':'center','Dieter Rams':'right','Howard Schultz':'right','George Lucas':'right'
  };
  // Bocadillo grande (Carlos, 24-10-2026 14:48): ocupa toda la ventana del fondo (12%–88% de la escena),
  // así que la cola apunta al consejero dentro de ese ancho.
  const tails={'Steve Jobs':'5%','Steve Wozniak':'14%','Tim Cook':'26%','Warren Buffett':'43%','Walt Disney':'60%','Dieter Rams':'76%','Howard Schultz':'90%','George Lucas':'95%'};
  function layoutBubble(){
    const compact=image.getBoundingClientRect().width<1250||generation!=='leyendas';
    bubble.classList.toggle('grokbot-docked',compact);
    if(compact){dock.append(bubble);dock.hidden=bubble.hidden;}
    else{overlay.append(bubble);dock.hidden=true;}
  }
  const resize=new ResizeObserver(layoutBubble);resize.observe(image);
  const speech=CouncilSpeech.create({scene,image,textElement:bubble.querySelector('.speech-text'),onUpdate(state){
    bubble.dataset.speechState=state.state;
    const text=bubble.querySelector('.speech-text');text.scrollTop=text.scrollHeight;
  }});
  function prepare(persona,role){
    bubble.classList.add('grokbot-bubble');bubble.hidden=false;delete bubble.dataset.aviso;
    bubble.dataset.side=positions[persona]||'center';bubble.style.display='flex';
    bubble.style.setProperty('--speech-tail',tails[persona]||'50%');
    bubble.querySelector('.speaker').textContent=(role?role+' · ':'')+persona;
    const link=bubble.querySelector('.speech-ficha');
    if(bridge.has(persona)){
      link.textContent='Conversación completa →';link.href='#conversacion-consejero';link.removeAttribute('target');
      link.onclick=e=>{e.preventDefault();bridge.openHistory();};
    }else{
      link.textContent='Ver ficha completa →';link.href='consejero.html?p='+persona.toLowerCase().replace(/\s+/g,'-');link.target='_blank';link.onclick=null;
    }
    layoutBubble();
  }
  // Una sola conversación (Carlos, 24-10-2026): la respuesta completa vive en la caja «Conversación»;
  // el cartel de la mesa es solo un bocadillo con la última frase (~80 caracteres, con elipsis).
  // Dibujos ASCII (24-10-2026 14:48): si la respuesta trae un bloque ```…```, el bocadillo enseña el
  // bloque entero tal cual (monoespaciado, sin juntar líneas), p. ej. la bandera de Canadá de Woz.
  function bloqueAscii(text){
    const m=String(text||'').match(/```[^\n]*\n([\s\S]*?)(?:```|$)/);
    if(!m)return '';
    const bloque=m[1].replace(/\s+$/,'');
    return bloque.split('\n').length>=2?bloque:'';
  }
  function bocadillo(text,max=160){
    const ascii=bloqueAscii(text);
    bubble.classList.toggle('grokbot-ascii',!!ascii);
    if(ascii)return ascii;
    const plano=String(text||'').replace(/\s+/g,' ').trim();
    if(!plano)return '';
    const frases=plano.match(/[^.!?…]+[.!?…]+["»”)]*|[^.!?…]+$/g)||[plano];
    let ultima=(frases.map(f=>f.trim()).filter(f=>/[\p{L}\p{N}]/u.test(f)).pop()||plano).trim();
    if(ultima.length>max)ultima=ultima.slice(0,max-1).replace(/\s+\S*$/,'').replace(/[\s,;:.]+$/,'')+'…';
    return ultima;
  }
  // VOCES DEL CONSEJO (11-11-2026): si se activa en /voces («Locutar en la portada»), el bocadillo
  // final de una respuesta nueva se dice con la voz propia del consejero. Por defecto, muda.
  function locutar(persona,dicho){try{const V=window.AdmiraVoces;if(V&&dicho&&V.portadaOn()&&V.casting(persona))V.speak(persona,dicho);}catch(_){}}
  function show(persona,role,text,{animate=false,messageId='message',status='done'}={}){
    prepare(persona,role);text=bocadillo(text);
    if(animate){
      if(!activeTurn||activeTurn.persona!==persona||activeTurn.messageId!==messageId){
        speech.select(persona);
        activeTurn={persona,messageId,token:speech.begin({persona,turnId:messageId}),revision:0};
      }
      speech.update(activeTurn.token,text,{final:CouncilGrokBot.terminal(status),revision:++activeTurn.revision});
    }else{
      const live=!CouncilGrokBot.terminal(status);
      speech.select(persona);speech.restore({persona,turnId:messageId,text,live});
      activeTurn=live?{persona,messageId,token:speech.snapshot().token,revision:0}:null;
      bubble.querySelector('.speech-text').scrollTop=0;
    }
  }
  function close({dismiss=true}={}){dismissed=dismiss;activeTurn=null;speech.close();bubble.hidden=true;bubble.style.display='none';dock.hidden=true;}
  const table=CouncilTable.mount({scene,generation,allowedOrigins:[location.origin,'https://macmini.tail48b61c.ts.net','https://fleet.admira.live'],onAction(action){if(action==='history')bridge.openHistory();}});
  const preview=window.CouncilPreview?.mount(document.getElementById('mac-scumm'));
  const composer=document.getElementById('action-input');
  let draftPersona=null, drafts={}, inlineComposer=null, mirroredValue=composer?.value||'';
  const sendingDrafts=new Set();
  try{drafts=JSON.parse(sessionStorage.getItem('admira-grokbot-drafts')||'{}');if(!drafts||typeof drafts!=='object'||Array.isArray(drafts))drafts={};}catch(_){}
  function persistDrafts(){try{sessionStorage.setItem('admira-grokbot-drafts',JSON.stringify(drafts));}catch(_){}}
  function syncComposer(){const pending=sendingDrafts.has(draftPersona)||!!bridge?.isPending?.(draftPersona);inlineComposer?.update({persona:draftPersona,value:typeof drafts[draftPersona]==='string'?drafts[draftPersona]:'',pending});const send=document.querySelector('.action-send');if(send)send.disabled=pending;}
  // Sin eco (24-10-2026): con la caja «Conversación» montada, la barra de arriba ya no repite lo que
  // Carlos escribe abajo (ni al revés). Sigue sirviendo para preguntar: envía y se vacía.
  function saveDraft(){if(draftPersona&&composer&&!inlineComposer&&composer.value!==mirroredValue){drafts[draftPersona]=composer.value;mirroredValue=composer.value;persistDrafts();}syncComposer();}
  function writeDraft(value){if(!draftPersona)return;drafts[draftPersona]=value;if(composer&&!inlineComposer){composer.value=value;mirroredValue=composer.value;}persistDrafts();syncComposer();}
  function restoreDraft(name,text){
    if(!name)return;
    if(name===draftPersona){
      saveDraft();writeDraft(drafts[name]?text+'\n'+drafts[name]:text);
    }else{drafts[name]=drafts[name]?text+'\n'+drafts[name]:text;persistDrafts();}
  }
  function selectDraft(name){saveDraft();draftPersona=name;if(composer&&!inlineComposer){composer.value=typeof drafts[name]==='string'?drafts[name]:'';mirroredValue=composer.value;}syncComposer();}
  composer?.addEventListener('input',saveDraft);
  function downscaleImageFile(file,maxSide=1280,quality=0.72){
    return new Promise(resolve=>{
      if(!file||!(file.type||'').startsWith('image/'))return resolve(null);
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{
        let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
        const scale=Math.min(1,maxSide/Math.max(w,h||1));
        w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
        URL.revokeObjectURL(url);
        try{resolve({url:canvas.toDataURL('image/jpeg',quality),name:(file.name||'imagen').replace(/\.[^.]+$/,'')+'.jpg',type:'image/jpeg'});}
        catch(e){resolve(null);}
      };
      img.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};
      img.src=url;
    });
  }
  function mesaHablar(){
    const C=window.AdmiraHablarCmd;
    const g=C&&typeof C.mesaActiva==='function'?C.mesaActiva(document):null;
    return g||generation||'leyendas';
  }
  function avisoHablar(msg){
    const el=document.getElementById('sentence-line');
    if(el)el.textContent=msg;
  }
  let hablarMic=null,hablarDestino=null;
  function pararHablarMic(){
    try{hablarMic&&hablarMic.parar();}catch(_){}
    hablarMic=null;hablarDestino=null;
  }
  function arrancarHablarMic(persona){
    const C=window.AdmiraHablarCmd;
    if(!C||typeof C.crearMic!=='function')return;
    pararHablarMic();
    hablarDestino=persona;
    hablarMic=C.crearMic({
      onTexto(t){if(t&&hablarDestino)sendPreview(t);},
      onSinMic(){avisoHablar('🎤 Hablas con '+persona+' · este navegador no reconoce la voz; escribe en el chat. /hablar off cuelga');},
      onSinPermiso(){avisoHablar('Sin permiso de micrófono. Puedes escribir igual. /hablar off cuelga');}
    });
    const ok=hablarMic.arrancar();
    if(ok)avisoHablar('🎤 Hablas con '+persona+' · /hablar off cuelga');
  }
  async function aplicarHablar(linea){
    const C=window.AdmiraHablarCmd;
    if(!linea)return;
    if(linea.accion==='colgar'){
      const quien=hablarDestino||draftPersona;
      pararHablarMic();
      avisoHablar(quien?'Has colgado de '+quien+'.':'Has colgado.');
      return;
    }
    if(linea.accion==='ayuda'){avisoHablar(C?C.listaAyuda():'/hablar [consejero] [mensaje] · /hablar off cuelga');return;}
    if(linea.accion==='estado'){
      const p=hablarDestino||draftPersona;
      avisoHablar(p?'En conversación con '+p+' · /hablar off cuelga.':'No hay conversación. /hablar a secas habla con el consejero de la mesa.');
      return;
    }
    if(linea.accion==='error'&&/^conversacion/.test(linea.mensaje||'')){
      avisoHablar(linea.mensaje==='conversacion-tema'?'Falta el tema: /conversacion jobs vs elon PortAventuraNeXT':linea.mensaje==='conversacion-mismo'?'Elige dos consejeros distintos: /conversacion jobs vs elon PortAventuraNeXT':'Uso: /conversacion <consejero> vs <consejero> <tema> · p. ej. /conversacion jobs vs elon PortAventuraNeXT');
      return;
    }
    // t1347u: /consejero <nombre> desaparecer|aparecer — solo la mesa; nada al consejero, sin voz.
    if(linea.accion==='consejero'||(linea.accion==='error'&&/^consejero/.test(linea.mensaje||''))){
      const M=window.CouncilConsejeroMesa;
      if(linea.accion==='consejero'&&M){avisoHablar(M.aplicar(linea).msg);return;}
      avisoHablar(M?M.mensajeError(linea):'Uso: /consejero <nombre> desaparecer · /consejero <nombre> aparecer');
      return;
    }
    if(linea.accion==='error'){avisoHablar('No reconozco a ese consejero. Prueba /hablar Lucas, Jobs, Woz, Disney, Elon o Jensen.');return;}
    // t1341u: «@Elon texto» en Conversación habla con ese consejero (sin micrófono).
    if(linea.accion==='mencion'){
      const persona=linea.persona;
      if(!(bridge&&bridge.has(persona))){avisoHablar(persona+' aún no tiene línea directa desde aquí. Prueba Jobs, Woz, Disney, Lucas, Elon o Jensen.');return;}
      if(bridge.selected!==persona)await bridge.select(persona);
      if(linea.texto)await sendPreviewTexto(linea.texto);
      else avisoHablar('Ahora hablas con '+persona+'.');
      return;
    }
    // t1341u: /conversacion <a> vs <b> <tema>. Reutiliza el canal del consejero A (hilo
    // compartido) y la transcripción entre consejeros, que el panel Conversación ya pinta
    // en su recuadro y locuta con las voces de cada consejero (nunca la del sistema).
    if(linea.accion==='conversacion'){
      const a=linea.a,b=linea.b;
      if(!(bridge&&bridge.has(a))||!(bridge&&bridge.has(b))){avisoHablar('Para /conversacion los dos consejeros necesitan línea: Jobs, Woz, Disney, Lucas, Elon o Jensen.');return;}
      pararHablarMic();
      if(bridge.selected!==a)await bridge.select(a);
      preview?.select(a);
      const prompt=C&&typeof C.promptConversacion==='function'?C.promptConversacion(linea):('Conversación entre '+a+' y '+b+' sobre: '+linea.tema);
      await sendPreviewTexto(prompt);
      avisoHablar('Conversación '+a+' vs '+b+' sobre «'+linea.tema+'»: '+(linea.turnos||10)+' líneas cada uno, alternando. La transcripción y sus voces salen en Conversación.');
      return;
    }
    if(linea.accion==='conectar'||linea.accion==='preguntar'){
      const persona=linea.persona;
      const pregunta=linea.pregunta||linea.texto||'';
      const C2=window.AdmiraHablarCmd;
      if(C2&&!C2.tieneLinea(persona)&&!(bridge&&bridge.has(persona))){
        pararHablarMic();
        avisoHablar(persona+' aún no tiene línea directa desde aquí. Prueba Jobs, Woz, Disney, Lucas, Elon o Jensen.');
        return;
      }
      if(bridge&&persona&&bridge.has(persona)&&bridge.selected!==persona)await bridge.select(persona);
      arrancarHablarMic(persona);
      if(pregunta)await sendPreviewTexto(pregunta);
    }
  }
  async function sendPreview(text,meta){
    const C=window.AdmiraHablarCmd;
    const raw=String(text||'').trim();
    if(C&&typeof C.parseLinea==='function'){
      const linea=C.parseLinea(raw,{generation:mesaHablar(),persona:draftPersona});
      if(linea){
        writeDraft('');
        await aplicarHablar(linea);
        return;
      }
    }
    await sendPreviewTexto(text,meta);
  }
  async function sendPreviewTexto(text,meta){
    const persona=draftPersona;
    if(!persona||sendingDrafts.has(persona))return;
    let prompt=String(text||'').trim();
    const imgMeta=meta&&meta.image;
    if(imgMeta&&imgMeta.url&&bridge&&!bridge.hasAttachments(persona)){
      await bridge.attachDataURL(imgMeta.url,imgMeta.name||'imagen.jpg',imgMeta.type||'image/jpeg');
    }
    if(!prompt&&bridge.hasAttachments(persona))prompt='🖼 Imagen adjunta';
    if(!prompt)return;
    sendingDrafts.add(persona);
    writeDraft('');
    if(inlineComposer&&inlineComposer.clearImage)inlineComposer.clearImage();
    let accepted=false;
    try{accepted=await bridge.send(persona,prompt);}
    finally{if(!accepted)restoreDraft(persona,text||prompt);sendingDrafts.delete(persona);syncComposer();}
  }

  const bridge=CouncilGrokBot.mount({
    container:preview?.chatHost||dock,mountInside:!!preview,onDraft(text){const input=document.getElementById('action-input');if(!input||input.value.trim())return false;writeDraft(text);if(inlineComposer)inlineComposer.focus();else input.focus();return true;},onOpenHistory(){preview?.open();},csrf:()=>window.admiraGateCsrf?.()||'',
    onSelect(persona){if(window.__consejoDeskPoll){clearInterval(window.__consejoDeskPoll);window.__consejoDeskPoll=null;}selectDraft(persona);activePersona=persona;preview?.select(persona);speech.select(persona||'');table.close();close({dismiss:false});},
    onPendingChange(){syncComposer();},
    // Hilo compartido (Jobs): tras entrar con Google se envía el texto conservado en el compositor.
    onAuthReady(persona){const text=typeof drafts[persona]==='string'?drafts[persona]:'';if(persona===draftPersona&&text.trim())sendPreview(text);},
    onPending({persona}){if(activePersona!==persona)return;dismissed=false;activeTurn=null;prepare(persona,'GrokBot');speech.begin({persona,turnId:'pending'});bubble.querySelector('.speech-text').textContent='Enviando al bot…';},
    onAnswer({persona,text,messageId,status}){if(activePersona===persona&&!dismissed)show(persona,'GrokBot',text,{animate:true,messageId,status});},
    onRestore({persona,text,messageId,status='done'}){if(activePersona===persona){dismissed=false;show(persona,'GrokBot',text,{messageId,status});}},
    onSettled({persona,status,text,messageId}){if(activePersona!==persona||dismissed)return;if(!text){activeTurn=null;speech.cancel();bubble.querySelector('.speech-text').textContent=CouncilGrokBot.LABELS[status]||'Sin respuesta';}else if(activeTurn?.messageId===messageId){const dicho=bocadillo(text);speech.update(activeTurn.token,dicho,{final:true,revision:++activeTurn.revision});locutar(persona,dicho);}},
    onError({persona,message}){if(activePersona===persona){speech.cancel();bubble.querySelector('.speech-text').textContent=message;}},
    onStatus(message){if(typeof setActionLine==='function')setActionLine(message);},
    onDesktop({persona}){
      if(preview)preview.showDesktop(persona);
      else window.MacHoy?.showRemote(persona);
    }
  });
  if(preview&&window.CouncilComposer){
    const host=preview.chatHost.querySelector('.council-chat');
    if(host)inlineComposer=CouncilComposer.mount({
      container:host,onInput:writeDraft,onSend:sendPreview,
      onPasteImage:async(file)=>{
        const info=await downscaleImageFile(file);
        if(!info){if(typeof setActionLine==='function')setActionLine('No pude leer la imagen pegada');return null;}
        if(bridge&&draftPersona)await bridge.attachDataURL(info.url,info.name,info.type);
        return info;
      }
    });
    syncComposer();
  }
  // PREVIOS en una línea (Carlos, 24-10-2026): pestañas (Conversación/Escritorio/Pong/↗) y la fila
  // «consejero · Actualizar · Ver histórico · Mensajes privados» suben a la tira de PREVIOS, en pequeño.
  // Se mueven los nodos (conservan sus eventos); con Previos ampliado vuelven dentro del panel.
  const macEl=document.getElementById('mac-scumm');
  if(preview&&macEl&&macEl.querySelector&&typeof MutationObserver==='function')try{
    const tools=document.createElement('div');tools.className='previos-head-tools';
    function placeTools(){
      const chatBox=preview.chatHost.querySelector('.council-chat');
      const controls=macEl.querySelector('.council-preview__controls');
      const bar=(chatBox||macEl).querySelector('.council-chat__toolbar')||tools.querySelector('.council-chat__toolbar');
      const head=macEl.closest('.scumm-module')?.querySelector('.scumm-module-head');
      const inHead=!!head&&!macEl.classList.contains('is-expanded');
      document.documentElement.classList.toggle('previos-una-linea',inHead);
      if(inHead){
        if(tools.parentElement!==head)head.insertBefore(tools,head.querySelector('.scumm-module-close'));
        if(controls&&controls.parentElement!==tools)tools.prepend(controls);
        if(bar&&bar.parentElement!==tools)tools.append(bar);
      }else{
        const c=tools.querySelector('.council-preview__controls');if(c)macEl.prepend(c);
        const t=tools.querySelector('.council-chat__toolbar');if(t&&chatBox)chatBox.prepend(t);
      }
    }
    placeTools();
    new MutationObserver(placeTools).observe(macEl,{attributes:true,attributeFilter:['class']});
    new MutationObserver(()=>{const head=macEl.closest('.scumm-module')?.querySelector('.scumm-module-head');if(head&&!macEl.classList.contains('is-expanded')&&tools.parentElement!==head)placeTools();}).observe(document.body,{childList:true,subtree:true});
  }catch(_){}
  const working=window.CouncilWorking?CouncilWorking.create({speech,generation}):null;
  window.CouncilInterface={
    select(persona){return bridge.select(persona);},
    has:persona=>bridge.has(persona),
    // La barra «Preguntar a <X> … Enviar» usa el mismo camino que el panel (para Jobs, el hilo
    // compartido). Si no se acepta (p. ej. falta entrar con Google) el texto vuelve al compositor.
    async send(persona,text){
      saveDraft();
      const C=window.AdmiraHablarCmd;
      if(C&&typeof C.parseLinea==='function'){
        const linea=C.parseLinea(String(text||'').trim(),{generation:mesaHablar(),persona:persona||draftPersona});
        if(linea){writeDraft('');await aplicarHablar(linea);return true;}
      }
      if(bridge.selected!==persona&&bridge.has(persona))await bridge.select(persona);
      let ok=false;
      try{ok=await bridge.send(persona,text);}
      finally{if(!ok&&String(text||'').trim()&&!String(drafts[persona]||'').includes(String(text).trim()))restoreDraft(persona,text);}
      return ok;
    },
    hablar:linea=>aplicarHablar(linea),
    attachDataURL:(...args)=>bridge.attachDataURL(...args),
    hasAttachments:persona=>bridge.hasAttachments(persona),
    restoreDraft,bocadillo,
    show,close,
    setGeneration(gen){generation=gen;speech.setGeneration(gen);if(working)working.setGeneration(gen);pararHablarMic();bridge.select(null);table.close();close();layoutBubble();},
    cancel(){speech.cancel();},
    table,bridge,speech,working
  };
  document.getElementById('mouth-overlays')?.replaceChildren();
  bubble.hidden=true;
})();
