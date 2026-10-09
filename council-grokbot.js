/* The native GrokBot conversation, observed through the authenticated Mac Mini bridge.
 * Desktop selection is explicit; history polling never moves the native UI or sends a prompt.
 */
(function (root) {
  'use strict';
  const PEOPLE = Object.freeze({
    'Steve Jobs': 'Jobs', 'Steve Wozniak': 'Wozniak',
    'Walt Disney': 'Disney', 'George Lucas': 'Lucas',
    'Elon Musk': 'Musk',
    'Jensen Huang': 'Huang',
    'Gwynne Shotwell': 'Shotwell'
  });
  const FULL = Object.fromEntries(Object.entries(PEOPLE).map(([name, alias]) => [alias, name]));
  const LABELS = Object.freeze({pending:'Enviado · esperando al bot',in_progress:'El bot está trabajando',ack:'Recibido por el bot',done:'Respuesta recibida',blocked:'El bot necesita atención',failed:'No se pudo completar',unknown:'Envío sin confirmar · consulta el historial antes de repetir'});
  // Modo encargo (Elon → Merovingio, Jensen → Cypher): estados como en un chat de GrokBot.
  const ENCARGO_LABELS = Object.freeze({pending:'Enviado',ack:'Escribiendo…',in_progress:'Escribiendo…',done:'Respondido',blocked:'No ha podido contestar',failed:'No se pudo enviar',unknown:LABELS.unknown});
  const typing = status => ['pending','ack','in_progress'].includes(status);
  const terminal = status => ['done','blocked','failed','unknown'].includes(status);
  const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : Date.parse(value) || 0;
  const visitAt = Date.now();
  const inThisVisit = row => Math.max(timestamp(row?.createdAt), timestamp(row?.updatedAt)) >= visitAt - 5000;
  // encargo: Elon responde por su deepagent (encargo MCP de admira.live), no por el escritorio AX.
  const native = row => row.native === true && (row.source === 'desktop' || row.source === 'encargo' || row.source === 'inbox');
  const signature = row => JSON.stringify([row.prompt || '',row.text || '',row.status,row.source,row.native,row.attachments||[],row.fallbackAvailable,row.notice,row.replyProvider]);
  function reconcile(previous, incoming) {
    const rows = new Map((previous || []).map(row => [row.id, row]));
    for (let row of incoming || []) {
      if (!row || !/^gb_[a-zA-Z0-9_-]+$/.test(row.id || '') || !FULL[row.persona]) continue;
      if(row.source==='encargo'&&/sin\s+ESTADO\s*:\s*done|(?:^|\n)\s*(?:ESTADO|Estado real)\s*:|encargo_sin_mision|Traceback|mcp_tool_error/i.test(row.text||''))row={...row,text:''};
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
    let renderedPersona=null, selectionError=null;
    const attachments=new Map(), uploading=new Set();
    const recentSends=new Map();
    const histories=new Map(), pendingSends=new Set(), requests=new Set(), announced=new Map(), settled=new Map(), baselined=new Set();
    const details=doc.createElement(options.mountInside?'section':'details'); details.className='council-chat';
    details.innerHTML='<summary>Chat de GrokBot <span class="council-chat__connection"></span></summary><div class="council-chat__toolbar"><strong class="council-chat__person"></strong><button type="button" data-chat-refresh>Actualizar</button><button type="button" data-chat-screen>Escritorio</button><button type="button" data-chat-attach hidden>Adjuntar</button><input type="file" data-chat-file hidden><button type="button" data-chat-routines hidden>Rutinas</button><button type="button" data-chat-stop hidden>Detener</button><a href="grokbot://" class="council-chat__native">Abrir GrokBot ↗</a></div><p class="council-chat__scope">Los mismos mensajes visibles en GrokBot, sincronizados a través del Mac Mini. Historial observado en GrokBot; puede faltar contenido antiguo.</p><p class="council-chat__status" role="status"></p><div class="council-chat__attachments" hidden></div><div class="council-chat__operations" hidden></div><div class="council-chat__messages" role="log" aria-label="Mensajes visibles de GrokBot"></div><p class="council-chat__limits">El Mac Mini y GrokBot deben estar disponibles. Las aprobaciones y los resultados descargables todavía se gestionan en GrokBot. Adjuntos: un archivo de hasta 4 MB por mensaje.</p>';
    if(options.mountInside)details.innerHTML=details.innerHTML.replace('<summary>', '<header class="council-chat__heading">').replace('</summary>','</header>');
    details.hidden=true;
    if(options.mountInside){options.container.append(details);details.open=true;}
    else options.container.insertAdjacentElement('afterend',details);
    const $=s=>details.querySelector(s);
    /* Hilo compartido (Jobs): lo que se escribe aquí va al MISMO hilo que GrokBot y /chat/jobs/
       (POST /api/chat/enviar vía assets/chat-hilo-client.js). En la home («modo menú inicial») cada
       visita empieza en blanco: no se carga el histórico (vive en /chat/jobs/, enlace «Ver histórico»);
       solo se ven los mensajes enviados en esta visita y las respuestas de Jobs posteriores al primero.
       Los demás consejeros siguen por el puente de GrokBot sin cambios. */
    const hilo=options.sharedThread===false?null:(options.hilo||root.ChatHiloClient||null);
    const sharedOf=name=>hilo&&name?hilo.personaDe(name):null;
    const sh={timer:null,tic:null,busy:false,again:false,sending:false,turnos:[],locales:[],enviados:{},desde:null,primero:null,firma:'',seen:new Set(),epoch:-1};
    // «Ver histórico» → /chat/jobs/ (solo en el hilo compartido).
    const historico=doc.createElement('a');historico.className='council-chat__historico';historico.textContent='Ver histórico';historico.target='_blank';historico.rel='noopener';historico.hidden=true;
    $('.council-chat__toolbar')?.append(historico);
    // Aviso de acceso: solo aparece al ENVIAR sin sesión de Google (escribir siempre se puede).
    let signin=null;
    function signinBox(){
      if(signin)return signin;
      signin=doc.createElement('div');signin.className='council-chat__signin';
      const p=doc.createElement('p');p.textContent='Para enviar a Steve Jobs entra con tu cuenta de Google de admira.live. Tu texto se conserva y se envía al entrar.';
      const btn=doc.createElement('button');btn.type='button';btn.textContent='Entrar con Google';
      const gbtn=doc.createElement('div');gbtn.className='council-chat__gbtn';
      const err=doc.createElement('p');err.className='council-chat__signin-error';err.hidden=true;
      signin.append(p,btn,gbtn,err);signin.err=err;
      btn.addEventListener('click',()=>{
        hilo.cargarGoogle(gbtn,()=>{const name=selected;if(!sharedOf(name))return;signin.hidden=true;sharedChrome();say('Sesión iniciada. Enviando a '+name+'…');options.onAuthReady?.(name);if(sh.desde!==null)sharedRefresh();},m=>{err.hidden=false;err.textContent=m;});
      });
      const messages=$('.council-chat__messages');messages.parentNode?messages.parentNode.insertBefore(signin,messages):details.append(signin);
      return signin;
    }
    const status=$('.council-chat__status'), log=$('.council-chat__messages'), operations=$('.council-chat__operations');
    if(options.mountInside)$('.council-chat__toolbar').append($('.council-chat__connection'));
    const current=epoch=>!destroyed && epoch===selectedEpoch;
    const desktop=()=>capabilities?.mode==='desktop'||capabilities?.mode==='encargo'||capabilities?.mode==='inbox';
    const encargo=()=>capabilities?.mode==='encargo';
    const inbox=()=>capabilities?.mode==='inbox';
    const SCOPE_DESKTOP='Los mismos mensajes visibles en GrokBot, sincronizados a través del Mac Mini. Historial observado en GrokBot; puede faltar contenido antiguo.';
    const agente=()=>capabilities?.agente||'su deepagent';
    const scopeEncargo=()=>(selected||'El consejero')+' contesta a través de su deepagent, '+agente()+'. Si está sin señal responde Grok 4.6. Si pasan 90 segundos sin acuse puedes pedir ese mismo plan B. Solo ves tus propios mensajes.';
    const LIMITS_DESKTOP='El Mac Mini y GrokBot deben estar disponibles. Las aprobaciones y los resultados descargables todavía se gestionan en GrokBot. Adjuntos: un archivo de hasta 4 MB por mensaje.';
    const LIMITS_ENCARGO='Solo texto, sin adjuntos. El plan B es una respuesta de Grok 4.6 por la API del Consejo, no de la sesión del deepagent; puede tener coste y usa hasta 1.000 tokens de salida. La API y el relé deben estar disponibles.';
    const SCOPE_INBOX=(selected||'El consejero')+' sigue el hilo en su lado. Esta visita abre el chat en blanco, sin el historial anterior en pantalla. No cambia el usuario abierto en GrokBot y no se publica en el Ágora ni en Telegram.';
    const LIMITS_INBOX='Solo texto, sin adjuntos. El mensaje crea un encargo en bot.yokup.com con marca [chat-coetaneos]; no sale al grupo de Telegram. La rutina del consejero contesta aquí.';
    const label=status=>(encargo()||inbox()?ENCARGO_LABELS:LABELS)[status];
    function say(message){if(destroyed)return;status.textContent=message;options.onStatus?.(message);}
    function rowsFor(name){return histories.get(PEOPLE[name]) || [];}
    const isPending=persona=>sharedOf(persona)?sh.sending:pendingSends.has(persona)||rowsFor(persona).some(r=>native(r)&&['pending','in_progress','ack','unknown'].includes(r.status));
    function syncPending(){options.onPendingChange?.({persona:selected,pending:isPending(selected)});}
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
      renderedPersona=selected;syncPending();
      if(sharedOf(selected)){$('.council-chat__person').textContent=selected;renderShared(follow,oldTop);return;}
      log.replaceChildren();
      if(!selected)return;
      $('.council-chat__person').textContent=selected;
      const rows=rowsFor(selected).filter(inThisVisit);
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
          if(row.notice){const notice=doc.createElement('p');notice.className='council-chat__meta';notice.textContent=row.notice;item.append(notice);}
          if(row.text){
            const reply=doc.createElement('p');reply.className='council-chat__reply';
            const botName=doc.createElement('strong');botName.textContent=FULL[row.persona];reply.append(botName);appendText(reply,row.text);item.append(reply);
          }else if((encargo()||inbox())&&native(row)&&typing(row.status)){
            // Indicador «escribiendo…» mientras su deepagent contesta (como en GrokBot).
            const reply=doc.createElement('p');reply.className='council-chat__reply council-chat__typing';reply.title=FULL[row.persona]+' está escribiendo';
            const botName=doc.createElement('strong');botName.textContent=FULL[row.persona];
            const dots=doc.createElement('span');dots.className='council-chat__dots';dots.textContent=row.status==='pending'?'pensando':'escribiendo';
            for(let i=0;i<3;i++){const d=doc.createElement('i');d.textContent='.';dots.append(d);}
            reply.append(botName,dots);item.append(reply);
          }
          for(const file of row.attachments||[]){const p=doc.createElement('p');p.className='council-chat__file';p.textContent='📎 '+file.name;item.append(p);}
          if(row.fallbackAvailable){
            const fallback=doc.createElement('button');fallback.type='button';fallback.textContent='Responder con Grok 4.6';
            fallback.title='Plan B por la API del Consejo (puede tener coste). La sesión original aún puede responder.';
            fallback.addEventListener('click',async()=>{
              fallback.disabled=true;
              try{const data=await api('/messages/'+encodeURIComponent(row.id)+'/fallback',{});if(destroyed)return;merge([data.message]);render();report(data.message,selectedEpoch);schedule(selectedEpoch);}
              catch(e){say(errorMessage(e));fallback.disabled=false;}
            });item.append(fallback);
          }
          const meta=doc.createElement('span');meta.className='council-chat__meta';meta.textContent=label(row.status) || 'Estado pendiente';item.append(meta);log.append(item);
        }
      }
      if(!log.childElementCount){const p=doc.createElement('p');p.textContent=encargo()?'Esta visita empieza en blanco con '+selected+'. Escribe y pulsa Enviar: le llega a su deepagent, '+agente()+', y te contesta aquí.':inbox()?'Esta visita empieza en blanco con '+selected+'. Escribe y pulsa Enviar: el consejero sigue su hilo y te contesta aquí, sin publicar en Ágora ni en Telegram.':'Esta visita empieza en blanco. Aún no hay mensajes nuevos de este consejero en GrokBot.';log.append(p);}
      log.scrollTop=follow?log.scrollHeight:oldTop;
    }
    function connection(available){
      if(destroyed)return;
      connected=available;
      if($('[data-chat-attach]'))$('[data-chat-attach]').hidden=!available||!capabilities?.attachments;
      if($('[data-chat-routines]'))$('[data-chat-routines]').hidden=!available||!capabilities?.routines;
      if($('[data-chat-stop]'))$('[data-chat-stop]').hidden=!available||!capabilities?.interrupt||capabilities?.status!=='busy'||!capabilities?.runKey;
      const scope=$('.council-chat__scope');if(scope)scope.textContent=encargo()?scopeEncargo():inbox()?SCOPE_INBOX:SCOPE_DESKTOP;
      const limits=$('.council-chat__limits');if(limits)limits.textContent=encargo()?LIMITS_ENCARGO:inbox()?LIMITS_INBOX:LIMITS_DESKTOP;
      if($('[data-chat-screen]'))$('[data-chat-screen]').hidden=encargo()||inbox();
      const nativeLink=$('.council-chat__native');if(nativeLink)nativeLink.hidden=encargo()||inbox();
      const node=$('.council-chat__connection');
      const nativePersona=PEOPLE[capabilities?.selectedPersona] || capabilities?.selectedPersona;
      const observedAt=timestamp(capabilities?.lastObservedAt);
      node.textContent=!available?'· Sincronización desconectada':encargo()&&capabilities?.signal===false?'· '+agente()+' sin señal · Grok 4.6':encargo()?'· Vía '+(capabilities?.destino||agente()):inbox()?'· Vía bot-inbox · grokbot':capabilities?.status==='draft'?'· Borrador en GrokBot':!selectionReady?'· Selección pendiente':nativePersona&&nativePersona!==PEOPLE[selected]?'· Chat nativo en otro consejero':!observedAt?'· Esperando observación nativa':Date.now()-observedAt>15000?'· Observación con retraso':'· Sincronización activa';
      node.title=(capabilities?.lastObservedAt?'Última observación: '+capabilities.lastObservedAt:'Aún no hay una observación del chat nativo.')+(nativePersona?' · Chat abierto: '+(FULL[nativePersona]||nativePersona):'');
    }
    function errorMessage(error){
      if(error.code==='desktop_draft_present')return 'Hay un borrador en GrokBot. Guárdalo o envíalo allí y vuelve a seleccionar el consejero; no se ha cambiado el chat.';
      if(error.code?.startsWith('desktop_attachment_')||error.code==='desktop_control_unavailable')return 'El archivo no llegó a prepararse en GrokBot; no se envió el mensaje. Se conservan el texto y el adjunto. Comprueba el compositor nativo antes de reintentar.';
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
        desktop_focus_unavailable:'No se pudo activar la ventana de GrokBot; tu mensaje no se ha enviado. Abre GrokBot y vuelve a intentarlo.',
        desktop_send_not_ready:'GrokBot conserva el texto como borrador: su botón Enviar aún no estaba disponible. No se ha enviado; puedes completarlo en GrokBot.',
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
      const ctl=new AbortController();requests.add(ctl);const timeout=setTimeout(()=>ctl.abort(),60000);
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
      const data=await api('/capabilities'+(selected&&PEOPLE[selected]?'?persona='+encodeURIComponent(PEOPLE[selected]):''));
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
      const recent=recentSends.get(FULL[row.persona]);if(recent&&recent.prompt===row.prompt&&(['done','ack'].includes(row.status)||(row.status==='in_progress'&&row.replyProvider!=='council-api')))recent.confirmed=true;
      say(row.notice || label(row.status) || 'Esperando al bot');
      if(animate && row.text && announced.get(row.id)!==row.text){
        announced.set(row.id,row.text);options.onAnswer?.({persona:FULL[row.persona],text:row.text,messageId:row.id,status:row.status,source:row.source||'desktop',native:true});
      }
      if(terminal(row.status) && settled.get(row.id)!==signature(row)){
        settled.set(row.id,signature(row));
        if(row.text || ['blocked','failed','unknown'].includes(row.status))options.onSettled?.({persona:FULL[row.persona],messageId:row.id,status:row.status,text:row.text});
      }
    }
    function schedule(epoch){
      if(!current(epoch)||!selected)return;
      if(sharedOf(selected))return sharedSchedule();
      clearTimeout(pollTimer);
      pollTimer=setTimeout(()=>{pollTimer=null;return refresh({restore:false});},3000);
    }
    function refresh({restore=true}={}){
      if(!selected||destroyed)return Promise.resolve();
      if(sharedOf(selected))return sharedRefresh();
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
          if(restoreHistory){
            for(const row of rows)remember(row);
            if(!selectionReady)say(selectionError||'Chat limpio. Pulsa Enviar para conectar con '+name+'; se conservará tu texto si no puede enviarse.');
            else say('Chat limpio. Escribe para empezar con '+name+'.');
          }else{
            for(const row of changes){
              // Scrolling the native app may reveal older cards or more of an
              // older answer. Keep that history without speaking it as new work.
              if(latestKnown && timestamp(row.createdAt)<timestamp(latestKnown.createdAt))remember(row);
              else report(row,epoch);
            }
            if(!changes.length && wasDisconnected)say(selectionReady?'Chat de GrokBot · sincronización recuperada.':selectionError||'Chat limpio. Pulsa Enviar para conectar con el consejero.');
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
      const epoch=++selectedEpoch;selected=PEOPLE[persona]?persona:null;selectionReady=false;selectionError=null;
      clearTimeout(pollTimer);pollTimer=null;stopShared();options.onSelect?.(selected);
      details.hidden=!selected;details.classList?.toggle('council-chat--hilo',!!sharedOf(selected));if(signin)signin.hidden=true;historico.hidden=true;
      if(operations){operations.hidden=true;operations.replaceChildren();}
      if(!selected)return false;
      if(sharedOf(selected))return startShared(epoch);
      log.scrollTop=log.scrollHeight;
      connected=false;$('.council-chat__connection').textContent='· Conectando…';
      renderAttachments();render();say('Abriendo el chat de '+selected+'…');
      try{
        if(!await connect(epoch)||!current(epoch))return false;
        await api('/selection',{persona});
        if(!current(epoch))return false;
        selectionReady=true;
        await refresh();return current(epoch);
      }catch(e){if(current(epoch)){selectionError=errorMessage(e);connection(false);say(selectionError);schedule(epoch);}return false;}
    }
    async function send(persona,prompt){
      if(!PEOPLE[persona]||destroyed)return false;
      if(selected!==persona){say('Selecciona el consejero antes de enviar.');return false;}
      if(sharedOf(persona))return sharedSend(persona,prompt);
      if(uploading.has(persona)){say('Espera a que termine la subida del adjunto.');return false;}
      const recent=recentSends.get(persona);
      if(recent&&recent.prompt===prompt.trim()&&Date.now()-recent.at<120000&&!recent.confirmed){say('Este mensaje ya está pendiente de confirmación.');return true;}
      if(isPending(persona)){say('El envío anterior aún se está confirmando.');return false;}
      let epoch=selectedEpoch, submitted=false;
      pendingSends.add(persona);syncPending();
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
        submitted=true;recentSends.set(persona,{prompt:prompt.trim(),at:Date.now(),confirmed:false});
        const files=attachments.get(persona)||[];
        const data=await api('/messages',{message_id,persona,prompt,...(files.length?{attachments:files.map(f=>f.id)}:{})});
        if(destroyed)return true;
        merge([data.message]);
        if(PEOPLE[selected]===data.message.persona){
          const canonical=rowsFor(selected).find(row=>row.id===data.message.id);
          render();report(canonical,selectedEpoch);schedule(selectedEpoch);
        }
      }catch(e){
        if(e.code?.startsWith('desktop_attachment_')||e.code==='desktop_control_unavailable'||['desktop_send_not_ready','desktop_focus_unavailable','invalid_attachment','attachment_not_found','attachment_changed','desktop_attachments_unavailable','desktop_draft_present','desktop_busy','desktop_not_configured','desktop_owner_required','desktop_unavailable','desktop_timeout','desktop_read_failed','desktop_accessibility_required','desktop_application_not_running','desktop_selection_mismatch'].includes(e.code) || e.status===401)submitted=false;
        if(current(epoch)){
          if(e.code==='desktop_draft_present')selectionReady=false;
          connection(false);const message=e.name==='AbortError'?'No se pudo confirmar el envío. Actualiza el historial antes de repetir.':errorMessage(e);
          say(message);options.onError?.({persona,message});schedule(epoch);
        }
      }finally{pendingSends.delete(persona);if(!submitted)recentSends.delete(persona);if(submitted)attachments.delete(persona);renderAttachments();syncPending();}
      return submitted;
    }
    // ── Hilo compartido (home: visita en blanco) ───────────────────────────
    const SCOPE_HILO='Esta visita empieza en blanco. Lo que escribes le llega a Jobs y se guarda en la misma conversación que en Grok Bot y en /chat/jobs/ (allí está el histórico). No se publica en el Ágora ni en Telegram.';
    const LIMITS_HILO='Solo texto, sin adjuntos. Mientras esperas respuesta se comprueba cada 2 s (hasta 3 min), solo con este panel visible.';
    const horaHilo=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'});
    const shortName=name=>PEOPLE[name]||name;
    const panelVisible=()=>!destroyed&&!doc.hidden&&!details.hidden&&details.getClientRects().length>0;
    const introHilo=name=>'Chat limpio. Escribe a '+name+' y pulsa Enviar: le llega a Jobs y se guarda en la misma conversación que en Grok Bot.';
    function stopShared(){if(sh.timer){clearTimeout(sh.timer);sh.timer=null;}if(sh.tic){clearInterval(sh.tic);sh.tic=null;}sh.again=false;}
    function visibles(){const m=hilo.fundir(sh.turnos,sh.locales);sh.locales=m.locales;const t=hilo.turnosDeVisita(m.turnos,sh.enviados,sh.desde);return {turnos:t,firma:t.map(x=>[x.id,x.entrega||'',x.encargo||'',x.encargo_estado||''].join(':')).join('|')};}
    function sharedChrome(){
      for(const sel of ['[data-chat-attach]','[data-chat-routines]','[data-chat-stop]','[data-chat-screen]','.council-chat__native'])if($(sel))$(sel).hidden=true;
      historico.href='/chat/'+sharedOf(selected)+'/';historico.hidden=false;
      const scope=$('.council-chat__scope');if(scope)scope.textContent=SCOPE_HILO;
      const limits=$('.council-chat__limits');if(limits)limits.textContent=LIMITS_HILO;
      const node=$('.council-chat__connection');node.textContent='· Misma conversación que en Grok Bot';node.title='POST /api/chat/enviar · respuestas por GET /api/chat/hilo';
    }
    function startShared(epoch){
      // Sin red al seleccionar: la home no carga el histórico.
      sh.epoch=epoch;sh.turnos=[];sh.locales=[];sh.enviados={};sh.desde=null;sh.primero=null;sh.firma='';sh.seen=new Set();
      sharedChrome();render();say(introHilo(selected));
      return Promise.resolve(true);
    }
    function askSignin(message){
      const box=signinBox();box.hidden=false;
      box.err.hidden=!message;box.err.textContent=message||'';
      say('Entra con Google para enviar a '+selected+'; tu texto se conserva.');
    }
    function sharedSchedule(){
      clearTimeout(sh.timer);sh.timer=null;
      if(destroyed||!sharedOf(selected)||sh.desde===null)return;
      // Fuera de vista (otra pestaña del panel o pestaña del navegador oculta) no se pide nada.
      const wait=hilo.intervaloSondeo(visibles().turnos,Date.now());
      sh.timer=setTimeout(()=>{sh.timer=null;if(panelVisible())sharedRefresh();else sharedSchedule();},panelVisible()?wait:hilo.RAPIDO_MS);
    }
    function adoptarDesde(id,ts){const t=Date.parse(ts);if(id===sh.primero&&Number.isFinite(t))sh.desde=t;}
    function sharedRefresh(){
      const name=selected,persona=sharedOf(name),epoch=selectedEpoch;
      if(!persona||destroyed||sh.desde===null)return Promise.resolve();
      if(sh.busy){sh.again=true;return Promise.resolve();}
      clearTimeout(sh.timer);sh.timer=null;
      if(!hilo.credencial()){askSignin('Tu sesión ha caducado. Vuelve a entrar para ver la respuesta.');return Promise.resolve();}
      sh.busy=true;
      return hilo.leerHilo(persona,{fetch:request,limite:60}).then(r=>{
        if(!current(epoch))return;
        if(r.status===401){askSignin('Tu sesión ha caducado. Vuelve a entrar para ver la respuesta.');return;}
        if(!r.ok){say('No se pudo comprobar la respuesta de '+name+'. Se reintentará.');return;}
        sh.turnos=r.turnos;
        for(const t of r.turnos)if(t&&t.id===sh.primero)adoptarDesde(t.id,t.ts);
        for(const t of visibles().turnos){
          if(t.rol!=='carlos'&&!sh.seen.has(t.id))options.onAnswer?.({persona:name,text:String(t.texto||''),messageId:t.id,status:'done',source:'hilo',native:true});
          sh.seen.add(t.id);
        }
        render();
      }).catch(()=>{if(current(epoch))say('Sin conexión con la conversación. Se reintentará.');})
      .finally(()=>{sh.busy=false;if(!current(epoch))return;if(sh.again){sh.again=false;sharedRefresh();}else sharedSchedule();});
    }
    function renderShared(follow,oldTop){
      const v=visibles();
      const typingText=hilo.textoEscribiendo(v.turnos,Date.now(),shortName(selected));
      if(v.firma!==sh.firma||!log.childElementCount){
        sh.firma=v.firma;log.replaceChildren();sh.typingNode=null;
        if(!v.turnos.length){
          const p=doc.createElement('p');p.className='council-chat__intro';p.textContent=introHilo(selected);log.append(p);
          const p2=doc.createElement('p');p2.className='council-chat__intro';p2.textContent='El histórico de vuestras conversaciones está en «Ver histórico».';log.append(p2);
        }
        for(const t of v.turnos){
          const carlos=t.rol==='carlos';
          const item=doc.createElement('article');item.className='council-chat__turn council-chat__hilo '+(carlos?'council-chat__hilo--carlos':'council-chat__hilo--persona');
          const body=doc.createElement('p');body.className=carlos?'council-chat__user':'council-chat__reply';
          const who=doc.createElement('strong');who.textContent=carlos?'Tú':selected;body.append(who);appendText(body,String(t.texto||''));item.append(body);
          const meta=doc.createElement('span');meta.className='council-chat__meta';
          const ts=Date.parse(t.ts);meta.textContent=Number.isFinite(ts)?horaHilo.format(new Date(ts)):'';
          const est=hilo.textoEstado(t,shortName(selected));if(est){const e=doc.createElement('span');e.className='council-chat__estado';e.textContent=' · '+est;meta.append(e);}
          item.append(meta);log.append(item);
        }
      }
      let node=sh.typingNode&&log.children&&[...log.children].includes(sh.typingNode)?sh.typingNode:null;
      if(!typingText){node?.remove();if(sh.tic){clearInterval(sh.tic);sh.tic=null;}}
      else{
        if(!node){
          node=doc.createElement('article');node.className='council-chat__turn council-chat__hilo council-chat__hilo--persona council-chat__typing-hilo';
          const reply=doc.createElement('p');reply.className='council-chat__reply council-chat__typing';
          const txt=doc.createElement('span');txt.className='council-chat__typing-text';
          const dots=doc.createElement('span');dots.className='council-chat__dots';for(let i=0;i<3;i++){const d=doc.createElement('i');d.textContent='.';dots.append(d);}
          reply.append(txt,dots);node.append(reply);node.typingText=txt;sh.typingNode=node;
        }
        if(log.lastElementChild!==node)log.append(node);
        node.typingText.textContent=typingText;
        if(!sh.tic)sh.tic=setInterval(()=>{if(sharedOf(selected))renderShared(false,log.scrollTop);else{clearInterval(sh.tic);sh.tic=null;}},1000);
      }
      log.scrollTop=follow?log.scrollHeight:oldTop;
    }
    function sharedSend(persona,prompt){
      const name=persona,api_persona=sharedOf(persona),epoch=selectedEpoch,texto=String(prompt||'').trim();
      if(!texto)return Promise.resolve(false);
      if(sh.sending){say('El mensaje anterior aún se está enviando.');return Promise.resolve(false);}
      // Sin sesión: se puede escribir igual; al enviar se pide entrar y el texto se conserva
      // (council-integration lo devuelve al compositor y lo reenvía en onAuthReady).
      if(!hilo.credencial()){askSignin('');return Promise.resolve(false);}
      if(signin)signin.hidden=true;
      const id=hilo.nuevoId(),firstOfVisit=sh.desde===null;
      const local={id,rol:'carlos',origen:'live',texto,ts:new Date().toISOString(),entrega:'enviando'};
      sh.enviados[id]=1;if(firstOfVisit){sh.primero=id;sh.desde=Date.now()-1000;}
      const undo=()=>{sh.locales=sh.locales.filter(l=>l!==local);delete sh.enviados[id];if(firstOfVisit&&sh.primero===id&&!Object.keys(sh.enviados).length){sh.primero=null;sh.desde=null;}};
      sh.locales.push(local);sh.sending=true;syncPending();sh.firma='';render();log.scrollTop=log.scrollHeight;say('Enviando a '+name+'…');
      let accepted=true;
      return hilo.enviarTurno(api_persona,texto,id,{fetch:request}).then(x=>{
        if(x.status===401){accepted=false;undo();if(current(epoch))askSignin('Tu sesión ha caducado. Vuelve a entrar; el mensaje no se envió y se conserva.');return;}
        local.entrega=x.turno&&x.turno.entrega?x.turno.entrega:'error';local.encargo=x.turno&&x.turno.encargo;
        if(local.entrega==='error'){accepted=false;undo();if(current(epoch))say('No se pudo enviar a '+name+'. Tu texto se conserva.');return;}
        if(x.turno&&x.turno.id&&x.turno.id!==id){sh.enviados[x.turno.id]=1;if(sh.primero===id)sh.primero=x.turno.id;}
        if(x.turno&&x.turno.ts){local.ts=x.turno.ts;adoptarDesde(x.turno.id||id,x.turno.ts);}
        if(current(epoch))say('Enviado a '+name+' · guardado en la misma conversación que en Grok Bot.');
      }).catch(()=>{local.entrega='sin_confirmar';if(current(epoch))say('Envío sin confirmar · revisa «Ver histórico» antes de repetir.');})
      .then(()=>{sh.sending=false;syncPending();if(current(epoch)){sh.firma='';render();if(accepted)sharedRefresh();}return accepted;});
    }
    doc.addEventListener?.('visibilitychange',()=>{if(!doc.hidden&&sharedOf(selected)&&sh.desde!==null&&!sh.busy)sharedRefresh();});
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
      if(sharedOf(persona)){say('El hilo compartido con '+persona+' admite solo texto.');return false;}
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
    return {select,send,refresh,attachDataURL,hasAttachments:persona=>(attachments.get(persona)||[]).length>0,has:persona=>Boolean(PEOPLE[persona]),openHistory(){if(destroyed)return;details.open=true;options.onOpenHistory?.();details.scrollIntoView({block:'nearest',behavior:'smooth'});},isPending,get selected(){return selected;},get capabilities(){return capabilities;},destroy(){destroyed=true;selectedEpoch++;stopShared();clearTimeout(pollTimer);pollTimer=null;for(const ctl of requests)ctl.abort();requests.clear();details.remove();}};
  }
  root.CouncilGrokBot={mount,PEOPLE,FULL,reconcile,terminal,LABELS};
})(typeof window!=='undefined'?window:globalThis);
