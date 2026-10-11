/* /terminal — inventario tmux real y cierre confirmado. Encargo #5704, OraculoMBP16. */
(function(root) {
  'use strict';
  var mesh, pending = null;
  function T(es,en) { return root.AdmiraIdioma ? root.AdmiraIdioma.t(es,en) : es; }
  function parse(text) {
    var m = String(text || '').trim().match(/^\/terminal(?:\s+(.*))?$/i);
    if (!m) return null;
    var p = (m[1] || '').trim().split(/\s+/).filter(Boolean), a = (p.shift() || 'list').toLowerCase();
    if (['list','lista','help','ayuda','cancelar','cancel','confirmar','confirm'].indexOf(a)>=0) return p.length ? {ok:false} : {ok:true,action:a};
    if (a !== 'kill') return {ok:false};
    var yes = p.indexOf('--si')>=0;
    p=p.filter(function(x){return x!=='--si';});
    if (p.length>1 || p.some(function(x){return !/^[\w.-]{1,80}$/.test(x);})) return {ok:false};
    return {ok:true,action:'kill',machine:p[0] || '*',yes:yes};
  }
  function help() { return T('/terminal — inventario vivo · /terminal kill [MBP14|MBP16|MacMini|Air|nombre completo] [--si] · /terminal confirmar · /terminal cancelar. --si confirma sólo el primer paso; los encargos en curso o desconocidos requieren otra confirmación. /demo terminal es una simulación segura.',
    '/terminal — live inventory · /terminal kill [MBP14|MBP16|MacMini|Air|full name] [--si] · /terminal confirm · /terminal cancel. --si confirms only the first step; active or unknown assignments require another confirmation. /demo terminal is a safe simulation.'); }
  function hour(ts) { return ts ? new Date(ts).toLocaleTimeString(root.AdmiraIdioma && root.AdmiraIdioma.lang()==='en'?'en-GB':'es-ES',{hour:'2-digit',minute:'2-digit'}) : T('hora desconocida','unknown time'); }
  function missing(m) { if(m.motivo==='sin ruta de control registrada')return T('Sin ruta de control para ','No control route for ')+m.maquina+T(' · no se cerrará',' · will not close'); return T('sin datos de ','no data from ') + (m.nombre || m.maquina) + T(' desde ',' since ') + hour(m.ultimoLatido) + (m.motivo && m.motivo!=='sin datos' ? ' · '+m.motivo : ''); }
  function row(t,m) { return [m || t.maquina,t.sesion,t.agente,t.runtime,t.encargo || T('sin encargos','no assignments'),t.estado==='vivo'?T('trabajando','working'):t.estado==='desconocido'?T('estado desconocido','unknown state'):T('parada','idle')].join(' · '); }
  function listing(d) {
    var lines=[T('MÁQUINA · TMUX · AGENTE · RUNTIME · ENCARGO · ESTADO · ÚLTIMO LATIDO','MACHINE · TMUX · AGENT · RUNTIME · ASSIGNMENT · STATE · LAST HEARTBEAT')];
    (d.maquinas || []).forEach(function(m) { if(!m.disponible) lines.push(missing(m)); else if(!m.terminales.length) lines.push((m.nombre || m.maquina)+T(' · sin terminales de agente abiertas · ',' · no open agent terminals · ')+hour(m.ultimoLatido)); else m.terminales.forEach(function(t){lines.push(row(t,m.nombre || m.maquina)+' · '+hour(m.ultimoLatido));}); });
    return lines.join('\n');
  }
  function preview(d) {
    var lines=[T('Se cerrarán estas sesiones (se guardarán todos sus paneles antes):','These sessions will close (all panes will be saved first):')];
    (d.targets || []).forEach(function(t){lines.push(row(t));});
    (d.missing || []).forEach(function(m){lines.push('⚠ '+missing(m));});
    (d.protectedSessions || []).forEach(function(t){lines.push(T('PROTEGIDA · ','PROTECTED · ')+row(t));});
    if (!(d.targets || []).length) lines.push(T('Ninguna sesión elegible.','No eligible sessions.'));
    if ((d.active || []).length) { lines.push(T('⚠ ENCARGOS EN CURSO O DESCONOCIDOS: segunda confirmación obligatoria','⚠ ACTIVE OR UNKNOWN ASSIGNMENTS: a second confirmation is required')); d.active.forEach(function(t){lines.push(row(t)+' · '+t.encargoStatus);}); }
    lines.push(T('Escribe /terminal confirmar para continuar, o /terminal cancelar.','Type /terminal confirm to continue, or /terminal cancel.'));
    return lines.join('\n');
  }
  function load() {
    if (mesh) return Promise.resolve(mesh);
    function create() { mesh = root.AdmiraFleetMesh.create({timeoutMs:60000}); return mesh; }
    if(root.AdmiraFleetMesh) return Promise.resolve(create());
    return new Promise(function(resolve,reject){var s=document.createElement('script');s.src='/control/fleet-mesh.js?v=5704-terminal';s.onload=function(){root.AdmiraFleetMesh?resolve(create()):reject(new Error('fleet-mesh'));};s.onerror=reject;document.head.appendChild(s);});
  }
  async function request(path,body,relay) {
    var M=await load();
    var opts={retry:false};
    if(relay)opts.relayId=relay;
    if(body){opts.method='POST';opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(body);}
    var r=await M.json('/terminal/'+path,opts);
    if(!r.response.ok || r.data.ok===false && !r.data.results)throw new Error(r.data.error || 'HTTP '+r.response.status);
    return {data:r.data,relay:r.data._mesh && r.data._mesh.relay.id};
  }
  async function confirm(say) {
    if(!pending){say(T('No hay cierre pendiente. Usa /terminal kill para previsualizar.','No pending close. Use /terminal kill to preview.'));return;}
    var p=pending;
    try {
      var r=await request('confirm',{plan:p.plan,confirm:true,confirmActive:p.stage==='active'},p.relay),d=r.data;
      if(d.stage==='active') {pending={plan:d.plan,stage:d.stage,relay:r.relay};say(T('SEGUNDA CONFIRMACIÓN · ','SECOND CONFIRMATION · ')+preview(d));return;}
      pending=null;
      say((d.ok?'✓ ':'⚠ ')+T('Resultado del cierre:','Close results:')+'\n'+d.results.map(function(x){return x.machine+' · '+JSON.stringify(x.result);}).join('\n')+'\n'+T('Registro guardado con administrador, sesiones, copias y hora.','Audit saved with administrator, sessions, backups and time.'));
    } catch(e) {pending=null;throw e;}
  }
  async function run(text,say) {
    say=say || function(){};var o=parse(text);if(!o)return false;
    if(!o.ok){say(help());return true;}
    try {
      if(o.action==='help'||o.action==='ayuda')say(help());
      else if(o.action==='cancel'||o.action==='cancelar'){pending=null;say(T('Cierre cancelado.','Close cancelled.'));}
      else if(o.action==='confirm'||o.action==='confirmar')await confirm(say);
      else if(o.action==='kill'){pending=null;var r=await request('plan',{machine:o.machine}),d=r.data;say(preview(d));if(d.targets.length){pending={plan:d.plan,stage:d.stage,relay:r.relay};if(o.yes)await confirm(say);}}
      else say(listing((await request('inventory')).data));
    }catch(e){say('⚠ '+(e.message || String(e)));}
    return true;
  }
  function demo(say) {
    say(T('SIMULACIÓN · datos de ejemplo, sin enviar órdenes a ningún equipo.','SIMULATION · example data, no commands sent to any machine.'));
    var t={maquina:'Mac de prueba',sesion:'test-terminal-5704',agente:'Agente de prueba',runtime:'codex',encargo:'#TEST · in_progress',encargoStatus:'in_progress',estado:'idle'};
    say(listing({maquinas:[{maquina:t.maquina,disponible:true,ultimoLatido:Date.now(),terminales:[t]},{maquina:'Equipo sin publicador',disponible:false,ultimoLatido:Date.now()-180000}]}));
    say(preview({targets:[t],active:[t]}));
    say(T('1. Confirmar el listado → aviso in_progress.\n2. Confirmar otra vez → copia privada de todos los panes, revalidación y cierre exacto.\n3. Registro: administrador + sesión + hora + ruta de la copia. Ninguna sesión real se ha cerrado en esta demo.',
      '1. Confirm the list → in_progress warning.\n2. Confirm again → private backup of every pane, revalidation and exact close.\n3. Audit: administrator + session + time + backup path. No real sessions were closed by this demo.'));
  }
  function li(log,t){String(t).split('\n').forEach(function(s){var e=document.createElement('li');e.textContent=s;log.appendChild(e);});log.scrollTop=log.scrollHeight;}
  function show(text) {
    var panel=document.getElementById('terminal-output');
    if(!panel){panel=document.createElement('section');panel.id='terminal-output';panel.setAttribute('aria-label',T('Resultado de /terminal','/terminal output'));panel.setAttribute('aria-live','polite');panel.style.cssText='position:fixed;left:12px;right:12px;top:15vh;max-height:55vh;overflow:auto;padding:12px;background:#06120b;color:#cfffdf;border:2px solid #33ff99;z-index:2147483150;font:13px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere';var close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',T('Cerrar resultado','Close output'));close.style.cssText='float:right;color:#fff;background:#153b24;border:1px solid #33ff99;font-size:20px';close.onclick=function(){panel.remove();};panel.appendChild(close);document.body.appendChild(panel);}
    var paragraph=document.createElement('p');paragraph.style.margin='0 0 12px';paragraph.textContent=String(text);panel.appendChild(paragraph);panel.scrollTop=panel.scrollHeight;
  }
  function register(){var E=root.AdmiraExperto;if(!E || !E.verb)return false;if(E.has && E.has('terminal'))return true;E.verb({name:'terminal',args:'[kill [equipo] [--si] | confirmar | cancelar | help]',desc:[help(),help()],run:function(parts,log){run('/terminal '+parts.join(' '),function(t){li(log,t);});}});return true;}
  if(root.document){var attempts=0;(function wait(){if(!register() && attempts++<120)setTimeout(wait,250);})();document.addEventListener('submit',function(e){var f=e.target;if(!f.closest || !f.matches('form.ax-cli-form, form.ax-own-form'))return;var input=f.querySelector('input,textarea');if(!/^\/?demo\s+terminal\s*$/i.test(input && input.value || ''))return;e.preventDefault();e.stopImmediatePropagation();input.value='';var log=(f.closest('.ax-cli') || document).querySelector('.ax-cli-out');if(log)demo(function(t){li(log,t);});},true);}
  root.AdmiraTerminal={parse:parse,run:run,help:help,listing:listing,preview:preview,demo:demo,show:show};
})(typeof globalThis!=='undefined'?globalThis:this);
