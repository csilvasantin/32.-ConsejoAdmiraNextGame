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
  const preview=window.CouncilPreview?.mount(document.getElementById('mac-scumm'));
  const composer=document.getElementById('action-input');
  let draftPersona=null, drafts={};
  try{drafts=JSON.parse(sessionStorage.getItem('admira-grokbot-drafts')||'{}');if(!drafts||typeof drafts!=='object'||Array.isArray(drafts))drafts={};}catch(_){}
  function saveDraft(){if(draftPersona&&composer){drafts[draftPersona]=composer.value;try{sessionStorage.setItem('admira-grokbot-drafts',JSON.stringify(drafts));}catch(_){}}}
  function restoreDraft(name,text){if(!name)return;if(name===draftPersona){if(composer&&!composer.value)composer.value=text;saveDraft();}else{if(!drafts[name])drafts[name]=text;try{sessionStorage.setItem('admira-grokbot-drafts',JSON.stringify(drafts));}catch(_){}}}
  function selectDraft(name){saveDraft();draftPersona=name;if(composer)composer.value=typeof drafts[name]==='string'?drafts[name]:'';}
  composer?.addEventListener('input',saveDraft);

  const bridge=CouncilGrokBot.mount({
    container:preview?.chatHost||dock,mountInside:!!preview,onDraft(text){const input=document.getElementById('action-input');if(!input||input.value.trim())return false;input.value=text;saveDraft();input.focus();return true;},onOpenHistory(){preview?.open();},csrf:()=>window.admiraGateCsrf?.()||'',
    onSelect(persona){if(window.__consejoDeskPoll){clearInterval(window.__consejoDeskPoll);window.__consejoDeskPoll=null;}selectDraft(persona);activePersona=persona;preview?.select(persona);speech.select(persona||'');table.close();close({dismiss:false});},
    onPending({persona}){if(activePersona!==persona)return;dismissed=false;activeTurn=null;prepare(persona,'GrokBot');speech.begin({persona,turnId:'pending'});bubble.querySelector('.speech-text').textContent='Enviando al bot…';},
    onAnswer({persona,text,messageId,status}){if(activePersona===persona&&!dismissed)show(persona,'GrokBot',text,{animate:true,messageId,status});},
    onRestore({persona,text,messageId,status='done'}){if(activePersona===persona){dismissed=false;show(persona,'GrokBot',text,{messageId,status});}},
    onSettled({persona,status,text,messageId}){if(activePersona!==persona||dismissed)return;if(!text){activeTurn=null;speech.cancel();bubble.querySelector('.speech-text').textContent=CouncilGrokBot.LABELS[status]||'Sin respuesta';}else if(activeTurn?.messageId===messageId){speech.update(activeTurn.token,text,{final:true,revision:++activeTurn.revision});}},
    onError({persona,message}){if(activePersona===persona){speech.cancel();bubble.querySelector('.speech-text').textContent=message;}},
    onStatus(message){if(typeof setActionLine==='function')setActionLine(message);},
    onDesktop({persona}){
      if(preview)preview.showDesktop(persona);
      else window.MacHoy?.showRemote(persona);
    }
  });
  window.CouncilInterface={
    select(persona){return bridge.select(persona);},
    has:persona=>bridge.has(persona),
    send(persona,text){saveDraft();return bridge.send(persona,text);},
    attachDataURL:(...args)=>bridge.attachDataURL(...args),
    hasAttachments:persona=>bridge.hasAttachments(persona),
    restoreDraft,
    show,close,
    setGeneration(gen){generation=gen;speech.setGeneration(gen);bridge.select(null);table.close();close();layoutBubble();},
    cancel(){speech.cancel();},
    table,bridge,speech
  };
  document.getElementById('mouth-overlays')?.replaceChildren();
  bubble.hidden=true;
})();
