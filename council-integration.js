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
  const tails={'Steve Jobs':'8%','Steve Wozniak':'40%','Tim Cook':'82%','Warren Buffett':'28%','Walt Disney':'81%','Dieter Rams':'26%','Howard Schultz':'71%','George Lucas':'88%'};
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
    bubble.classList.add('grokbot-bubble');bubble.hidden=false;
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
  function show(persona,role,text,{animate=false,messageId='message',status='done'}={}){
    prepare(persona,role);
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
  const bridge=CouncilGrokBot.mount({
    container:dock,csrf:()=>window.admiraGateCsrf?.()||'',
    onSelect(persona){if(window.__consejoDeskPoll){clearInterval(window.__consejoDeskPoll);window.__consejoDeskPoll=null;}activePersona=persona;speech.select(persona||'');table.close();close({dismiss:false});},
    onPending({persona}){if(activePersona!==persona)return;dismissed=false;activeTurn=null;prepare(persona,'GrokBot');speech.begin({persona,turnId:'pending'});bubble.querySelector('.speech-text').textContent='Enviando al bot…';},
    onAnswer({persona,text,messageId,status}){if(activePersona===persona&&!dismissed)show(persona,'GrokBot',text,{animate:true,messageId,status});},
    onRestore({persona,text,messageId,status='done'}){if(activePersona===persona){dismissed=false;show(persona,'GrokBot',text,{messageId,status});}},
    onSettled({persona,status,text,messageId}){if(activePersona!==persona||dismissed)return;if(!text){activeTurn=null;speech.cancel();bubble.querySelector('.speech-text').textContent=CouncilGrokBot.LABELS[status]||'Sin respuesta';}else if(activeTurn?.messageId===messageId){speech.update(activeTurn.token,text,{final:true,revision:++activeTurn.revision});}},
    onError({persona,message}){if(activePersona===persona){speech.cancel();bubble.querySelector('.speech-text').textContent=message;}},
    onStatus(message){if(typeof setActionLine==='function')setActionLine(message);},
    onDesktop({persona}){
      if(typeof closeTableViewer==='function')closeTableViewer();
      if(window.__consejoDeskPoll){clearInterval(window.__consejoDeskPoll);window.__consejoDeskPoll=null;}
      const alias=({'Steve Jobs':'Jobs','Steve Wozniak':'Wozniak','Walt Disney':'Disney','George Lucas':'Lucas'})[persona]||persona;
      const mini='https://macmini.tail48b61c.ts.net';
      const fleet='https://fleet.admira.live';
      table.show({persona,generation,status:'connecting',message:'Conectando escritorio GrokBot…',media:null,capabilities:{history:true,reconnect:true}});
      const csrf=window.admiraGateCsrf?.()||'';
      const urls=[mini+'/demo/grokbot-sync/screen?persona='+encodeURIComponent(alias),fleet+'/api/grokbot/screen?persona='+encodeURIComponent(alias)];
      const showLive=(data)=>{
        const media=data.media||(data.url?{kind:data.kind||'image',url:data.url}:null);
        if(!media||!media.url)return false;
        const base=media.url.replace(/([?&])t=[^&]*/g,'').replace(/[?&]$/,'');
        const stamp=()=>base+(base.includes('?')?'&':'?')+'t='+Date.now();
        media.url=stamp();
        table.show({persona,generation,status:data.status||'live',message:data.message||'Escritorio GrokBot vivo',media:{...media,url:media.url},capabilities:{history:true,reconnect:true}});
        window.__consejoDeskPoll=setInterval(()=>{
          table.show({persona,generation,status:'live',message:'Escritorio GrokBot vivo',media:{kind:'image',url:stamp(),title:media.title||('Escritorio de '+persona)},capabilities:{history:true,reconnect:true}});
        },2500);
        return true;
      };
      (async()=>{
        let lastErr='Escritorio no disponible';
        for(const url of urls){
          try{
            const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{Accept:'application/json','X-Fleet-CSRF':csrf}});
            const data=await r.json().catch(()=>null);
            if(!r.ok||!data?.ok){lastErr=(data&&(data.error||data.message))||('HTTP '+r.status);continue;}
            if(showLive(data))return;
            lastErr='Sin media.url';
          }catch(e){lastErr=e.message||String(e);}
        }
        table.show({persona,generation,status:'unavailable',message:'Escritorio GrokBot no disponible ('+lastErr+').',media:null,capabilities:{history:true,reconnect:true}});
      })();
    }
  });
  window.CouncilInterface={
    select(persona){activePersona=persona;return bridge.select(persona);},
    has:persona=>bridge.has(persona),
    send(persona,text){return bridge.send(persona,text);},
    show,close,
    setGeneration(gen){generation=gen;speech.setGeneration(gen);bridge.select(null);table.close();close();layoutBubble();},
    cancel(){speech.cancel();},
    table,bridge,speech
  };
  document.getElementById('mouth-overlays')?.replaceChildren();
  bubble.hidden=true;
})();
