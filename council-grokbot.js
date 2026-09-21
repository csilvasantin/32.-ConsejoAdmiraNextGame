/* The native GrokBot conversation, observed through the authenticated Mac Mini bridge.
 * Desktop selection is explicit; history polling never moves the native UI or sends a prompt.
 */
(function (root) {
  'use strict';
  const PEOPLE = Object.freeze({
    'Steve Jobs': 'Jobs', 'Steve Wozniak': 'Wozniak',
    'Walt Disney': 'Disney', 'George Lucas': 'Lucas'
  });
  const FULL = Object.fromEntries(Object.entries(PEOPLE).map(([name, alias]) => [alias, name]));
  const LABELS = Object.freeze({pending:'Enviado · esperando al bot',in_progress:'El bot está trabajando',ack:'Recibido por el bot',done:'Respuesta recibida',blocked:'El bot necesita atención',failed:'No se pudo completar',unknown:'Envío sin confirmar · consulta el historial antes de repetir'});
  const terminal = status => ['done','blocked','failed','unknown'].includes(status);
  const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : Date.parse(value) || 0;
  const native = row => row.source === 'desktop' && row.native === true;
  const signature = row => JSON.stringify([row.prompt || '',row.text || '',row.status,row.source,row.native,row.attachments||[]]);
  function reconcile(previous, incoming) {
    const rows = new Map((previous || []).map(row => [row.id, row]));
    for (const row of incoming || []) {
      if (!row || !/^gb_[a-zA-Z0-9_-]+$/.test(row.id || '') || !FULL[row.persona]) continue;
      const prior = rows.get(row.id);
      if (!prior || timestamp(row.updatedAt) >= timestamp(prior.updatedAt)) rows.set(row.id, {...row});
    }
    return [...rows.values()].sort((a,b) => timestamp(a.createdAt)-timestamp(b.createdAt) || a.id.localeCompare(b.id));
  }
  function mount(options) {
    const doc=options.document || root.document;
    const base=options.base || 'https://fleet.admira.live/api/grokbot';
    const request=options.fetch || root.fetch.bind(root);
    let selected=null, selectedEpoch=0, capabilities=null, destroyed=false, selectionReady=false, connected=false, pollTimer=null, refreshing=null, selecting=null;
    let renderedPersona=null;
    const attachments=new Map(), uploading=new Set();
    const histories=new Map(), pendingSends=new Set(), requests=new Set(), announced=new Map(), settled=new Map(), baselined=new Set();
    const details=doc.createElement(options.mountInside?'section':'details'); details.className='council-chat';
    details.innerHTML='<summary>Chat de GrokBot <span class="council-chat__connection"></span></summary><div class="council-chat__toolbar"><strong class="council-chat__person"></strong><button type="button" data-chat-refresh>Actualizar</button><button type="button" data-chat-screen>Escritorio</button><button type="button" data-chat-attach hidden>Adjuntar</button><input type="file" data-chat-file hidden><button type="button" data-chat-routines hidden>Rutinas</button><button type="button" data-chat-stop hidden>Detener</button><a href="grokbot://" class="council-chat__native">Abrir GrokBot ↗</a></div><p class="council-chat__scope">Los mismos mensajes visibles en GrokBot, sincronizados a través del Mac Mini. Historial observado en GrokBot; puede faltar contenido antiguo.</p><p class="council-chat__status" role="status"></p><div class="council-chat__attachments" hidden></div><div class="council-chat__operations" hidden></div><div class="council-chat__messages" role="log" aria-label="Mensajes visibles de GrokBot"></div><p class="council-chat__limits">El Mac Mini y GrokBot deben estar disponibles. Las aprobaciones y los resultados descargables todavía se gestionan en GrokBot. Adjuntos: un archivo de hasta 4 MB por mensaje.</p>';
    if(options.mountInside)details.innerHTML=details.innerHTML.replace('<summary>', '<header class="council-chat__heading">').replace('</summary>','</header>');
    details.hidden=true;
    if(options.mountInside){options.container.append(details);details.open=true;}
    else options.container.insertAdjacentElement('afterend',details);
    const $=s=>details.querySelector(s);
    const status=$('.council-chat__status'), log=$('.council-chat__messages'), operations=$('.council-chat__operations');
    if(options.mountInside)$('.council-chat__toolbar').append($('.council-chat__connection'));
    const current=epoch=>!destroyed && epoch===selectedEpoch;
    const desktop=()=>capabilities?.mode==='desktop';
    function say(message){if(destroyed)return;status.textContent=message;options.onStatus?.(message);}
    function rowsFor(name){return histories.get(PEOPLE[name]) || [];}
    function merge(rows){
      for(const alias of Object.values(PEOPLE)) histories.set(alias,reconcile(histories.get(alias),rows.filter(r=>r?.persona===alias)));
    }
    function appendText(node,text){
      // Native output is untrusted text. Link only explicit HTTP(S) URLs,
      // without HTML parsing or executable/custom URL schemes.
      const re=/https?:\/\/[^\s<>"']+/g;let offset=0;
      for(const match of text.matchAll(re)){
        const url=match[0].replace(/[.,;!?)+\]}]+$/,'');
        node.append(doc.createTextNode(text.slice(offset,match.index)));
        const link=doc.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=url;node.append(link);
        offset=match.index+url.length;
      }
      node.append(doc.createTextNode(text.slice(offset)));
    }
    function render(){
      if(destroyed)return;
      const oldTop=log.scrollTop;
      const follow=renderedPersona!==selected || !options.mountInside || log.scrollHeight-log.clientHeight-oldTop<48;
      renderedPersona=selected;
      log.replaceChildren();
      if(!selected)return;
      $('.council-chat__person').textContent=selected;
      const rows=rowsFor(selected);
      for(const group of [rows.filter(native),rows.filter(row=>!native(row))]){
        if(group.length && !native(group[0])){
          const label=doc.createElement('h4');label.textContent='Encargos anteriores';log.append(label);
          const note=doc.createElement('p');note.textContent='Historial del conector anterior; estos encargos no son el chat nativo de GrokBot.';log.append(note);
        }
        for(const row of group){
          const item=doc.createElement('article');item.className='council-chat__turn';
          if(row.prompt){
            const user=doc.createElement('p');user.className='council-chat__user';
            const userName=doc.createElement('strong');userName.textContent='Tú';user.append(userName,doc.createTextNode(row.prompt));item.append(user);
          }
          if(row.text){
            const reply=doc.createElement('p');reply.className='council-chat__reply';
            const botName=doc.createElement('strong');botName.textContent=FULL[row.persona];reply.append(botName);appendText(reply,row.text);item.append(reply);
          }
          for(const file of row.attachments||[]){const p=doc.createElement('p');p.className='council-chat__file';p.textContent='📎 '+file.name;item.append(p);}
          const meta=doc.createElement('span');meta.className='council-chat__meta';meta.textContent=LABELS[row.status] || 'Estado pendiente';item.append(meta);log.append(item);
        }
      }
      if(!log.childElementCount){const p=doc.createElement('p');p.textContent='Aún no se han observado mensajes visibles de este consejero en GrokBot.';log.append(p);}
      log.scrollTop=follow?log.scrollHeight:oldTop;
    }
    function connection(available){
      if(destroyed)return;
      connected=available;
      if($('[data-chat-attach]'))$('[data-chat-attach]').hidden=!available||!capabilities?.attachments;
      if($('[data-chat-routines]'))$('[data-chat-routines]').hidden=!available||!capabilities?.routines;
      if($('[data-chat-stop]'))$('[data-chat-stop]').hidden=!available||!capabilities?.interrupt||capabilities?.status!=='busy'||!capabilities?.runKey;
      const node=$('.council-chat__connection');
      const nativePersona=PEOPLE[capabilities?.selectedPersona] || capabilities?.selectedPersona;
      const observedAt=timestamp(capabilities?.lastObservedAt);
      node.textContent=!available?'· Sincronización desconectada':capabilities?.status==='draft'?'· Borrador en GrokBot':!selectionReady?'· Selección pendiente':nativePersona&&nativePersona!==PEOPLE[selected]?'· Chat nativo en otro consejero':!observedAt?'· Esperando observación nativa':Date.now()-observedAt>15000?'· Observación con retraso':'· Sincronización activa';
      node.title=(capabilities?.lastObservedAt?'Última observación: '+capabilities.lastObservedAt:'Aún no hay una observación del chat nativo.')+(nativePersona?' · Chat abierto: '+(FULL[nativePersona]||nativePersona):'');
    }
    function errorMessage(error){
      if(error.code==='desktop_draft_present')return 'Hay un borrador en GrokBot. Guárdalo o envíalo allí y vuelve a seleccionar el consejero; no se ha cambiado el chat.';
      if(error.code==='desktop_busy')return 'GrokBot está ocupado. La sincronización volverá a intentarlo; no se reenviará ningún mensaje.';
      const explanations={
        desktop_attachments_unavailable:'El puente aún no admite adjuntos. Se conserva el archivo; no se envía por otro modelo.',
        attachment_too_large:'El archivo supera el límite de 4 MB del puente.',
        invalid_attachment_name:'El nombre del archivo no se puede usar. Renómbralo y vuelve a adjuntarlo.',
        invalid_attachment:'El adjunto no es válido. Adjunta de nuevo el archivo.',
        attachment_not_found:'No se encuentra tu adjunto. Vuelve a adjuntarlo.',
        desktop_attachment_control_unavailable:'No se pudo preparar el archivo en GrokBot. Comprueba su compositor antes de repetir.',
        desktop_controls_unavailable:'El puente necesita actualizarse para mostrar estos controles.',
        desktop_routines_unavailable:'No se ha podido leer el panel de rutinas de GrokBot.',
        routine_changed:'La rutina ha cambiado. Ábrela de nuevo antes de modificar su estado.',
        routine_state_unconfirmed:'No se pudo confirmar el cambio de la rutina. Consulta su estado antes de repetir.',
        desktop_run_changed:'La ejecución ha cambiado. Actualiza antes de detenerla.',
        desktop_control_unavailable:'Ese control no está disponible ahora en GrokBot.',
        desktop_accessibility_required:'GrokBot está abierto, pero el puente no tiene permiso de Accesibilidad en el Mac Mini.',
        desktop_application_not_running:'GrokBot no está abierto en el Mac Mini. Ábrelo para continuar esta misma conversación.',
        desktop_not_configured:'El puente de GrokBot no está configurado en el Mac Mini.',
        desktop_state_unavailable:'El puente no puede guardar o leer el historial local. Tu mensaje no se ha enviado.',
        desktop_selection_mismatch:'No se ha podido confirmar el consejero en GrokBot. Pulsa Enviar para volver a conectarlo.',
        desktop_invalid_snapshot:'El puente no ha podido leer el chat de GrokBot. Volverá a comprobar la conexión.',
        desktop_unavailable:'El puente no ha podido leer GrokBot. Se está intentando recuperar la conexión.',
        desktop_timeout:'GrokBot está tardando en responder al puente. Se está intentando recuperar la conexión.',
        desktop_read_failed:'GrokBot está cambiando su contenido y el puente no ha podido leerlo. Se volverá a comprobar la conexión.',
        desktop_snapshot_too_large:'El chat abierto de GrokBot supera el tamaño que puede leer el puente.',
        desktop_window_unavailable:'El puente no encuentra la ventana de GrokBot en el Mac Mini.',
        desktop_structure_changed:'GrokBot ha cambiado la estructura de su chat y el puente necesita adaptarse.',
        desktop_bot_list_unavailable:'El puente no encuentra la lista de consejeros en GrokBot.',
        desktop_bot_button_unavailable:'El puente no encuentra el consejero en la lista de GrokBot.'
      };
      return explanations[error.code] || error.message;
    }
    async function api(path,body){
      const ctl=new AbortController();requests.add(ctl);const timeout=setTimeout(()=>ctl.abort(),body?.attachments?.length?60000:25000);
      try{
        const headers={Accept:'application/json'};
        if(body){headers['Content-Type']='application/json';headers['X-Fleet-CSRF']=options.csrf?.() || '';}
        const response=await request(base+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers,body:body?JSON.stringify(body):undefined,signal:ctl.signal});
        const data=await response.json().catch(()=>null);
        if(!response.ok || !data?.ok){
          const e=new Error(response.status===401?'Inicia sesión para hablar con tus bots.':response.status===503?'El puente del Mac Mini no está disponible.':typeof data?.error==='string'?data.error:'No se pudo conectar con GrokBot.');
          e.status=response.status;e.code=data?.code || data?.error;throw e;
        }
        return data;
      }finally{clearTimeout(timeout);requests.delete(ctl);}
    }
    async function connect(epoch){
      const data=await api('/capabilities');
      if(!current(epoch))return null;
      capabilities=data;
      if(!desktop())throw new Error('El chat nativo de GrokBot no está conectado. Los encargos por webhook no sustituyen esta conversación.');
      if(!data.available || data.bidirectional!==true){
        const error=new Error('El puente del Mac Mini no está disponible. Se volverá a comprobar la conexión.');
        error.code=data.reason;throw error;
      }
      return data;
    }
    function remember(row){
      if(!native(row))return;
      if(row.text)announced.set(row.id,row.text);
      if(terminal(row.status))settled.set(row.id,signature(row));
    }
    function report(row,epoch,{animate=true}={}){
      if(!current(epoch)||PEOPLE[selected]!==row.persona||!native(row))return;
      say(LABELS[row.status] || 'Esperando al bot');
      if(animate && row.text && announced.get(row.id)!==row.text){
        announced.set(row.id,row.text);options.onAnswer?.({persona:FULL[row.persona],text:row.text,messageId:row.id,status:row.status,source:'desktop',native:true});
      }
      if(terminal(row.status) && settled.get(row.id)!==signature(row)){
        settled.set(row.id,signature(row));
        if(row.text || ['blocked','failed','unknown'].includes(row.status))options.onSettled?.({persona:FULL[row.persona],messageId:row.id,status:row.status,text:row.text});
      }
    }
    function schedule(epoch){
      if(!current(epoch)||!selected)return;
      clearTimeout(pollTimer);
      pollTimer=setTimeout(()=>{pollTimer=null;return refresh({restore:false});},3000);
    }
    function refresh({restore=true}={}){
      if(!selected||destroyed)return Promise.resolve();
      const name=selected,epoch=selectedEpoch,wasDisconnected=!connected;
      if(refreshing?.epoch===epoch)return refreshing.promise;
      clearTimeout(pollTimer);pollTimer=null;
      const entry={epoch,promise:null};refreshing=entry;
      entry.promise=(async()=>{
        try{
          if(!await connect(epoch)||!current(epoch))return;
          const data=await api('/messages?persona='+encodeURIComponent(name));
          if(!current(epoch))return;
          const previousRows=rowsFor(name),previous=new Map(previousRows.map(row=>[row.id,signature(row)]));
          const latestKnown=previousRows.filter(native).at(-1);
          const restoreHistory=restore || !baselined.has(PEOPLE[name]);
          merge(data.messages||[]);
          baselined.add(PEOPLE[name]);
          if(data.lastObservedAt)capabilities={...capabilities,lastObservedAt:data.lastObservedAt};
          connection(true);
          const rows=rowsFor(name),changes=rows.filter(row=>previous.get(row.id)!==signature(row));
          if(restoreHistory||changes.length)render();
          const last=rows.filter(native).at(-1);
          if(restoreHistory){
            for(const row of rows)remember(row);
            if(last?.text)options.onRestore?.({persona:name,text:last.text,messageId:last.id,status:last.status,source:'desktop',native:true});
            if(!selectionReady)say('Historial recuperado. Pulsa Enviar para conectar con '+name+'; se conservará tu texto si no puede enviarse.');
            else if(last)say(LABELS[last.status] || 'Conversación recuperada');
            else say('Chat de GrokBot · esperando mensajes visibles de '+name+'.');
          }else{
            for(const row of changes){
              // Scrolling the native app may reveal older cards or more of an
              // older answer. Keep that history without speaking it as new work.
              if(latestKnown && timestamp(row.createdAt)<timestamp(latestKnown.createdAt))remember(row);
              else report(row,epoch);
            }
            if(!changes.length && wasDisconnected)say(selectionReady?'Chat de GrokBot · sincronización recuperada.':'Historial recuperado. Pulsa Enviar para conectar con el consejero.');
          }
        }catch(e){if(current(epoch)){connection(false);say(errorMessage(e));}}
        finally{if(refreshing===entry)refreshing=null;schedule(epoch);}
      })();
      return entry.promise;
    }
    function select(persona){
      const promise=selectNative(persona);
      const entry={persona,promise};selecting=entry;
      promise.finally(()=>{if(selecting===entry)selecting=null;});
      return promise;
    }
    async function selectNative(persona){
      if(destroyed)return false;
      const epoch=++selectedEpoch;selected=PEOPLE[persona]?persona:null;selectionReady=false;
      clearTimeout(pollTimer);pollTimer=null;options.onSelect?.(selected);
      details.hidden=!selected;
      if(operations){operations.hidden=true;operations.replaceChildren();}
      if(!selected)return false;
      log.scrollTop=log.scrollHeight;
      connected=false;$('.council-chat__connection').textContent='· Conectando…';
      renderAttachments();render();say('Abriendo el chat de '+selected+' en GrokBot…');
      try{
        if(!await connect(epoch)||!current(epoch))return false;
        await api('/selection',{persona});
        if(!current(epoch))return false;
        selectionReady=true;
        await refresh();return current(epoch);
      }catch(e){if(current(epoch)){connection(false);say(errorMessage(e));schedule(epoch);}return false;}
    }
    async function send(persona,prompt){
      if(!PEOPLE[persona]||destroyed)return false;
      if(selected!==persona){say('Selecciona el consejero antes de enviar.');return false;}
      if(uploading.has(persona)){say('Espera a que termine la subida del adjunto.');return false;}
      if(pendingSends.has(persona)){say('El envío anterior aún se está confirmando.');return false;}
      let epoch=selectedEpoch, submitted=false;
      pendingSends.add(persona);
      const message_id=root.crypto.randomUUID();
      try{
        // Sending is an explicit user action: finish the initial selection or
        // reconnect it once. Passive polling never moves the native chat.
        if(selecting?.persona===persona)await selecting.promise;
        if(!current(epoch))return false;
        if(!selectionReady){
          const ready=await select(persona);epoch=selectedEpoch;
          if(!ready || selected!==persona || !selectionReady)return false;
        }
        if(!await connect(epoch)||!current(epoch))return false;
        options.onPending?.({persona,prompt});
        submitted=true;
        const files=attachments.get(persona)||[];
        const data=await api('/messages',{message_id,persona,prompt,...(files.length?{attachments:files.map(f=>f.id)}:{})});
        if(destroyed)return true;
        merge([data.message]);
        if(PEOPLE[selected]===data.message.persona){
          const canonical=rowsFor(selected).find(row=>row.id===data.message.id);
          render();report(canonical,selectedEpoch);schedule(selectedEpoch);
        }
      }catch(e){
        if(['invalid_attachment','attachment_not_found','attachment_changed','desktop_attachments_unavailable','desktop_draft_present','desktop_busy','desktop_not_configured','desktop_owner_required','desktop_unavailable','desktop_timeout','desktop_read_failed','desktop_accessibility_required','desktop_application_not_running','desktop_selection_mismatch'].includes(e.code) || e.status===401)submitted=false;
        if(current(epoch)){
          if(e.code==='desktop_draft_present')selectionReady=false;
          connection(false);const message=e.name==='AbortError'?'No se pudo confirmar el envío. Actualiza el historial antes de repetir.':errorMessage(e);
          say(message);options.onError?.({persona,message});schedule(epoch);
        }
      }finally{pendingSends.delete(persona);if(submitted)attachments.delete(persona);renderAttachments();}
      return submitted;
    }
    function renderAttachments(){
      const node=$('.council-chat__attachments');if(!node)return;
      node.replaceChildren();const files=attachments.get(selected)||[];node.hidden=!files.length;
      for(const file of files){
        const label=doc.createElement('span');label.textContent='📎 '+file.name+' · '+Math.ceil(file.size/1024)+' KB';
        node.append(label,operationButton('Quitar adjunto',()=>{attachments.delete(selected);renderAttachments();}));
      }
    }
    async function attachDataURL(dataURL,name='imagen.png',type){
      const persona=selected,epoch=selectedEpoch;
      if(!persona||pendingSends.has(persona)||uploading.has(persona))return false;
      if((attachments.get(persona)||[]).length){say('Quita el adjunto actual antes de añadir otro.');return false;}
      const match=/^data:([^;,]*);base64,([A-Za-z0-9+/=]+)$/.exec(dataURL||'');
      if(!match){say('No se ha podido leer el archivo.');return false;}
      uploading.add(persona);
      try{
        if(!await connect(epoch)||!current(epoch))return false;
        if(!capabilities.attachments){say(errorMessage({code:'desktop_attachments_unavailable'}));return false;}
        say('Subiendo '+name+'…');
        const data=await api('/attachments',{name,type:type||match[1]||'application/octet-stream',data:match[2]});
        attachments.set(persona,[data.attachment]);
        if(current(epoch)){renderAttachments();say('Adjunto preparado. Escribe tu mensaje y pulsa Enviar.');}
        return true;
      }catch(error){if(current(epoch))say(errorMessage(error));return false;}finally{uploading.delete(persona);}
    }
    $('[data-chat-attach]')?.addEventListener('click',()=>$('[data-chat-file]').click());
    $('[data-chat-file]')?.addEventListener('change',async event=>{
      const file=event.target.files[0];event.target.value='';if(!file)return;
      if(file.size>4*1024*1024){say(errorMessage({code:'attachment_too_large'}));return;}
      const target=selected;const reader=new FileReader();reader.onload=()=>{if(selected===target)attachDataURL(reader.result,file.name,file.type);};reader.onerror=()=>say('No se pudo leer el archivo.');reader.readAsDataURL(file);
    });
    async function control(action,extra={}){
      const epoch=selectedEpoch;
      try{
        const data=await api('/controls',{persona:selected,action,...extra});
        if(!current(epoch))return null;
        return data;
      }catch(e){if(current(epoch))say(errorMessage(e));return null;}
    }
    function prepareRoutine(text){
      if(options.onDraft?.(text)!==true)say('Conserva o envía tu borrador antes de preparar esta petición.');
      else say('Petición preparada. Revísala y pulsa Enviar cuando esté lista.');
    }
    function operationButton(label,fn){const b=doc.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}});return b;}
    async function showRoutines(){
      const data=await control('routines');if(!data||!operations)return;say('Rutinas de '+selected+' leídas de GrokBot.');
      operations.hidden=false;operations.replaceChildren();
      operations.append(operationButton('Cerrar rutinas',()=>{operations.hidden=true;}),operationButton('Crear rutina…',()=>prepareRoutine('Crea una rutina: ')));
      if(data.routines===null){const p=doc.createElement('p');p.textContent='El panel de rutinas no está disponible ahora.';operations.append(p);return;}
      for(const item of data.routines||[]){
        operations.append(operationButton(item.name+' · '+item.schedule,async()=>{
          const result=await control('routine',{routine_id:item.id});if(result?.routine)showRoutine(result.routine);
        }));
      }
    }
    function showRoutine(item){
      say('Rutina '+item.name+' · '+(item.paused?'pausada':'activa'));
      operations.hidden=false;operations.replaceChildren();
      const title=doc.createElement('strong');title.textContent=item.name;
      const content=doc.createElement('p');content.textContent=item.instruction;
      operations.append(operationButton('Volver a rutinas',showRoutines),title,content,
        operationButton(item.paused?'Reanudar':'Pausar',async()=>{
          const data=await control('routine_set',{routine_id:item.id,revision:item.revision,paused:!item.paused});
          if(data?.routine)showRoutine(data.routine);
        }),
        operationButton('Editar en conversación…',()=>prepareRoutine('Edita tu rutina: '+item.name+'\n')));
    }
    $('[data-chat-routines]')?.addEventListener('click',showRoutines);
    $('[data-chat-stop]')?.addEventListener('click',async()=>{
      const data=await control('interrupt',{run_key:capabilities?.runKey});
      if(data){say(data.status==='busy'?'Parada solicitada; esperando confirmación.':'La ejecución se ha detenido.');refresh({restore:false});}
    });
    $('[data-chat-refresh]').addEventListener('click',()=>refresh());
    $('[data-chat-screen]').addEventListener('click',()=>options.onDesktop?.({persona:selected,capabilities}));
    return {select,send,refresh,attachDataURL,hasAttachments:persona=>(attachments.get(persona)||[]).length>0,has:persona=>Boolean(PEOPLE[persona]),openHistory(){if(destroyed)return;details.open=true;options.onOpenHistory?.();details.scrollIntoView({block:'nearest',behavior:'smooth'});},get selected(){return selected;},get capabilities(){return capabilities;},destroy(){destroyed=true;selectedEpoch++;clearTimeout(pollTimer);pollTimer=null;for(const ctl of requests)ctl.abort();requests.clear();details.remove();}};
  }
  root.CouncilGrokBot={mount,PEOPLE,FULL,reconcile,terminal,LABELS};
})(typeof window!=='undefined'?window:globalThis);
