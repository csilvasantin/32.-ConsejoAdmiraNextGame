/* Real Grok Bot conversations through the existing authenticated webhook/MCP relay.
 * This provider does not expose the desktop app's transcript, VNC or automations.
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
    let selected=null, selectedEpoch=0, capabilities=null, destroyed=false;
    const histories=new Map(), pendingSends=new Set(), pollers=new Map(), announced=new Set();
    const details=doc.createElement('details'); details.className='council-chat';
    details.innerHTML='<summary>Conversación del consejero <span class="council-chat__connection"></span></summary><div class="council-chat__toolbar"><strong class="council-chat__person"></strong><button type="button" data-chat-refresh>Actualizar</button><button type="button" data-chat-screen>Escritorio</button><a href="grokbot://" class="council-chat__native">Abrir GrokBot ↗</a></div><p class="council-chat__scope">Mensajes enviados desde admira.live y respuestas del mismo bot por su conector.</p><p class="council-chat__status" role="status"></p><div class="council-chat__messages" role="log" aria-label="Historial del consejero"></div><p class="council-chat__limits">El historial completo, los adjuntos, las rutinas y la pantalla cloud siguen disponibles en GrokBot.</p>';
    details.hidden=true;
    options.container.insertAdjacentElement('afterend',details);
    const $=s=>details.querySelector(s);
    const status=$('.council-chat__status'), log=$('.council-chat__messages');
    function say(message){status.textContent=message;options.onStatus?.(message);}
    function rowsFor(name){return histories.get(PEOPLE[name]) || [];}
    function merge(rows){
      for(const alias of Object.values(PEOPLE)) histories.set(alias,reconcile(histories.get(alias),rows.filter(r=>r.persona===alias)));
    }
    function render(){
      log.replaceChildren();
      if(!selected)return;
      $('.council-chat__person').textContent=selected;
      for(const row of rowsFor(selected)){
        const item=doc.createElement('article'); item.className='council-chat__turn';
        const user=doc.createElement('p');user.className='council-chat__user';
        const userName=doc.createElement('strong');userName.textContent='Tú';user.append(userName,doc.createTextNode(row.prompt || ''));
        const reply=doc.createElement('p');reply.className='council-chat__reply';
        const botName=doc.createElement('strong');botName.textContent=FULL[row.persona];reply.append(botName,doc.createTextNode(row.text || ''));
        const meta=doc.createElement('span');meta.className='council-chat__meta';meta.textContent=LABELS[row.status] || 'Estado pendiente';
        item.append(user);if(row.text)item.append(reply);item.append(meta);log.append(item);
      }
      if(!log.childElementCount){const p=doc.createElement('p');p.textContent='Aún no hay mensajes enviados desde esta interfaz a este consejero.';log.append(p);}
      log.scrollTop=log.scrollHeight;
    }
    async function api(path,body){
      const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),25000);
      try{
        const headers={Accept:'application/json'};
        if(body){headers['Content-Type']='application/json';headers['X-Fleet-CSRF']=options.csrf?.() || '';}
        const response=await request(base+path,{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers,body:body?JSON.stringify(body):undefined,signal:ctl.signal});
        const data=await response.json().catch(()=>null);
        if(!response.ok || !data?.ok){const e=new Error(response.status===401?'Inicia sesión para hablar con tus bots.':response.status===503?'El puente de GrokBot no está disponible.':data?.error || 'No se pudo conectar con GrokBot.');e.status=response.status;throw e;}
        return data;
      }finally{clearTimeout(timeout);}
    }
    async function connect(){
      try{capabilities=await api('/capabilities');$('.council-chat__connection').textContent=capabilities.available?'· Conector disponible':'· Puente no disponible';return capabilities;}
      catch(e){capabilities=null;$('.council-chat__connection').textContent='· Sin conexión';throw e;}
    }
    function report(row,epoch,{animate=true}={}){
      if(destroyed || selectedEpoch!==epoch || PEOPLE[selected]!==row.persona)return;
      render();say(LABELS[row.status] || 'Esperando al bot');
      if(row.text){
        const key=row.id+':'+row.text;
        if(animate&&!announced.has(key)){announced.add(key);options.onAnswer?.({persona:FULL[row.persona],text:row.text,messageId:row.id,status:row.status});}
      }
      if(terminal(row.status))options.onSettled?.({persona:FULL[row.persona],messageId:row.id,status:row.status,text:row.text});
    }
    function poll(row,epoch){
      if(terminal(row.status)||pollers.has(row.id)||destroyed||epoch!==selectedEpoch)return;
      const started=Date.now();
      const entry={timer:null,epoch};
      const current=()=>!destroyed&&epoch===selectedEpoch&&pollers.get(row.id)===entry;
      const remove=()=>{if(pollers.get(row.id)===entry)pollers.delete(row.id);};
      const tick=async()=>{
        if(!current()){remove();return;}
        try{
          const data=await api('/messages/'+encodeURIComponent(row.id));merge([data.message]);
          if(!current()){remove();return;}
          const canonical=(histories.get(row.persona)||[]).find(r=>r.id===row.id);report(canonical,epoch);
          if(terminal(canonical.status)){remove();return;}
        }catch(e){if(current())say('Conexión interrumpida. Actualiza para recuperar la respuesta; no se reenviará el mensaje.');remove();return;}
        if(Date.now()-started>600000){remove();if(selectedEpoch===epoch)say('El bot sigue pendiente. Puedes actualizar más tarde; el mensaje ya está enviado.');return;}
        entry.timer=setTimeout(tick,3500);
      };
      pollers.set(row.id,entry);entry.timer=setTimeout(tick,1500);
    }
    async function refresh({restore=true}={}){
      if(!selected)return;
      const name=selected,epoch=selectedEpoch;
      try{
        if(!capabilities)await connect();
        const data=await api('/messages?persona='+encodeURIComponent(name));merge(data.messages||[]);
        if(epoch!==selectedEpoch||destroyed)return;
        render();const rows=rowsFor(name),last=rows.at(-1);
        if(last){say(LABELS[last.status] || 'Conversación recuperada');if(restore&&last.text){announced.add(last.id+':'+last.text);options.onRestore?.({persona:name,text:last.text,messageId:last.id,status:last.status});}for(const row of rows)poll(row,epoch);}
        else say(capabilities?.available?'Escribe abajo para hablar con '+name+'.':'El puente de GrokBot no está disponible.');
      }catch(e){if(epoch===selectedEpoch)say(e.message);}
    }
    async function select(persona){
      selectedEpoch++;selected=PEOPLE[persona]?persona:null;options.onSelect?.(selected);
      // A selection invalidates old presentation callbacks, never the accepted remote job.
      for(const entry of pollers.values())clearTimeout(entry.timer);pollers.clear();
      details.hidden=!selected;
      if(!selected)return false;
      render();say('Abriendo la conversación de '+selected+'…');await refresh();return true;
    }
    async function send(persona,prompt){
      if(!PEOPLE[persona])return false;
      if(pendingSends.has(persona)){say('El envío anterior aún se está confirmando.');return true;}
      const epoch=selectedEpoch;
      pendingSends.add(persona);options.onPending?.({persona,prompt});
      const message_id=root.crypto.randomUUID();
      try{
        if(!capabilities)await connect();
        if(!capabilities?.available)throw new Error('El puente no está disponible. El mensaje no se ha enviado.');
        const data=await api('/messages',{message_id,persona,prompt});merge([data.message]);
        const responseEpoch=PEOPLE[selected]===data.message.persona?selectedEpoch:epoch;
        report(data.message,responseEpoch,{animate:false});poll(data.message,responseEpoch);
      }catch(e){
        if(selectedEpoch===epoch){say(e.name==='AbortError'?'No se pudo confirmar el envío. Actualiza el historial antes de repetir.':e.message);options.onError?.({persona,message:e.message});}
      }finally{pendingSends.delete(persona);}
      return true;
    }
    $('[data-chat-refresh]').addEventListener('click',()=>refresh());
    $('[data-chat-screen]').addEventListener('click',()=>options.onDesktop?.({persona:selected,capabilities}));
    return {select,send,refresh,has:persona=>Boolean(PEOPLE[persona]),openHistory(){details.open=true;details.scrollIntoView({block:'nearest',behavior:'smooth'});},get selected(){return selected;},destroy(){destroyed=true;selectedEpoch++;for(const entry of pollers.values())clearTimeout(entry.timer);pollers.clear();details.remove();}};
  }
  root.CouncilGrokBot={mount,PEOPLE,FULL,reconcile,terminal,LABELS};
})(typeof window!=='undefined'?window:globalThis);
