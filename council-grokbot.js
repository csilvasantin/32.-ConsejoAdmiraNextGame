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
  const signature = row => JSON.stringify([row.prompt || '',row.text || '',row.status,row.source,row.native]);
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
    let selected=null, selectedEpoch=0, capabilities=null, destroyed=false, selectionReady=false, connected=false, pollTimer=null, refreshing=null;
    const histories=new Map(), pendingSends=new Set(), requests=new Set(), announced=new Map(), settled=new Map(), baselined=new Set();
    const details=doc.createElement('details'); details.className='council-chat';
    details.innerHTML='<summary>Chat de GrokBot <span class="council-chat__connection"></span></summary><div class="council-chat__toolbar"><strong class="council-chat__person"></strong><button type="button" data-chat-refresh>Actualizar</button><button type="button" data-chat-screen>Escritorio</button><a href="grokbot://" class="council-chat__native">Abrir GrokBot ↗</a></div><p class="council-chat__scope">Los mismos mensajes visibles en GrokBot, sincronizados a través del Mac Mini. El historial observado es parcial; no se importa la conversación completa.</p><p class="council-chat__status" role="status"></p><div class="council-chat__messages" role="log" aria-label="Mensajes visibles de GrokBot"></div><p class="council-chat__limits">El Mac Mini y GrokBot deben estar disponibles. Los adjuntos, las aprobaciones, las rutinas y la pantalla cloud se abren en GrokBot.</p>';
    details.hidden=true;
    options.container.insertAdjacentElement('afterend',details);
    const $=s=>details.querySelector(s);
    const status=$('.council-chat__status'), log=$('.council-chat__messages');
    const current=epoch=>!destroyed && epoch===selectedEpoch;
    const desktop=()=>capabilities?.mode==='desktop';
    function say(message){if(destroyed)return;status.textContent=message;options.onStatus?.(message);}
    function rowsFor(name){return histories.get(PEOPLE[name]) || [];}
    function merge(rows){
      for(const alias of Object.values(PEOPLE)) histories.set(alias,reconcile(histories.get(alias),rows.filter(r=>r?.persona===alias)));
    }
    function render(){
      if(destroyed)return;
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
            const botName=doc.createElement('strong');botName.textContent=FULL[row.persona];reply.append(botName,doc.createTextNode(row.text));item.append(reply);
          }
          const meta=doc.createElement('span');meta.className='council-chat__meta';meta.textContent=LABELS[row.status] || 'Estado pendiente';item.append(meta);log.append(item);
        }
      }
      if(!log.childElementCount){const p=doc.createElement('p');p.textContent='Aún no se han observado mensajes visibles de este consejero en GrokBot.';log.append(p);}
      log.scrollTop=log.scrollHeight;
    }
    function connection(available){
      if(destroyed)return;
      connected=available;
      const node=$('.council-chat__connection');
      const nativePersona=PEOPLE[capabilities?.selectedPersona] || capabilities?.selectedPersona;
      const observedAt=timestamp(capabilities?.lastObservedAt);
      node.textContent=!available?'· Sincronización desconectada':capabilities?.status==='draft'?'· Borrador en GrokBot':!selectionReady?'· Selección pendiente':nativePersona&&nativePersona!==PEOPLE[selected]?'· Chat nativo en otro consejero':!observedAt?'· Esperando observación nativa':Date.now()-observedAt>15000?'· Observación con retraso':'· Sincronización activa';
      node.title=(capabilities?.lastObservedAt?'Última observación: '+capabilities.lastObservedAt:'Aún no hay una observación del chat nativo.')+(nativePersona?' · Chat abierto: '+(FULL[nativePersona]||nativePersona):'');
    }
    function errorMessage(error){
      if(error.code==='desktop_draft_present')return 'Hay un borrador en GrokBot. Guárdalo o envíalo allí y vuelve a seleccionar el consejero; no se ha cambiado el chat.';
      if(error.code==='desktop_busy')return 'GrokBot está ocupado. La sincronización volverá a intentarlo; no se reenviará ningún mensaje.';
      return error.message;
    }
    async function api(path,body){
      const ctl=new AbortController();requests.add(ctl);const timeout=setTimeout(()=>ctl.abort(),25000);
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
      if(!data.available || data.bidirectional!==true)throw new Error('El puente del Mac Mini no está disponible. Comprueba GrokBot y el permiso de Accesibilidad.');
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
            if(last)say(LABELS[last.status] || 'Conversación recuperada');
            else say('Chat de GrokBot · esperando mensajes visibles de '+name+'.');
          }else{
            for(const row of changes){
              // Scrolling the native app may reveal older cards or more of an
              // older answer. Keep that history without speaking it as new work.
              if(latestKnown && timestamp(row.createdAt)<timestamp(latestKnown.createdAt))remember(row);
              else report(row,epoch);
            }
            if(!changes.length && wasDisconnected)say(selectionReady?'Chat de GrokBot · sincronización recuperada.':'Historial observado. Vuelve a seleccionar el consejero para confirmar su chat antes de enviar.');
          }
        }catch(e){if(current(epoch)){connection(false);say(errorMessage(e));}}
        finally{if(refreshing===entry)refreshing=null;schedule(epoch);}
      })();
      return entry.promise;
    }
    async function select(persona){
      if(destroyed)return false;
      const epoch=++selectedEpoch;selected=PEOPLE[persona]?persona:null;selectionReady=false;
      clearTimeout(pollTimer);pollTimer=null;options.onSelect?.(selected);
      details.hidden=!selected;
      if(!selected)return false;
      connected=false;$('.council-chat__connection').textContent='· Conectando…';
      render();say('Abriendo el chat de '+selected+' en GrokBot…');
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
      if(selected!==persona||!selectionReady){say('Selecciona de nuevo el consejero para confirmar su chat en GrokBot antes de enviar.');return true;}
      if(pendingSends.has(persona)){say('El envío anterior aún se está confirmando.');return true;}
      const epoch=selectedEpoch;
      pendingSends.add(persona);
      const message_id=root.crypto.randomUUID();
      try{
        if(!await connect(epoch)||!current(epoch))return true;
        options.onPending?.({persona,prompt});
        const data=await api('/messages',{message_id,persona,prompt});
        if(destroyed)return true;
        merge([data.message]);
        if(PEOPLE[selected]===data.message.persona){
          const canonical=rowsFor(selected).find(row=>row.id===data.message.id);
          render();report(canonical,selectedEpoch);schedule(selectedEpoch);
        }
      }catch(e){
        if(current(epoch)){
          if(e.code==='desktop_draft_present')selectionReady=false;
          connection(false);const message=e.name==='AbortError'?'No se pudo confirmar el envío. Actualiza el historial antes de repetir.':errorMessage(e);
          say(message);options.onError?.({persona,message});schedule(epoch);
        }
      }finally{pendingSends.delete(persona);}
      return true;
    }
    $('[data-chat-refresh]').addEventListener('click',()=>refresh());
    $('[data-chat-screen]').addEventListener('click',()=>options.onDesktop?.({persona:selected,capabilities}));
    return {select,send,refresh,has:persona=>Boolean(PEOPLE[persona]),openHistory(){if(destroyed)return;details.open=true;details.scrollIntoView({block:'nearest',behavior:'smooth'});},get selected(){return selected;},get capabilities(){return capabilities;},destroy(){destroyed=true;selectedEpoch++;clearTimeout(pollTimer);pollTimer=null;for(const ctl of requests)ctl.abort();requests.clear();details.remove();}};
  }
  root.CouncilGrokBot={mount,PEOPLE,FULL,reconcile,terminal,LABELS};
})(typeof window!=='undefined'?window:globalThis);
