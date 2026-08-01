(function(){
  'use strict';
  var modes={sources:{panel:'reportsSourcesRail',cls:'reports-sources-open'},settings:{panel:'reportsSettingsRail',cls:'reports-settings-open'},console:{panel:'reportsConsoleRail',cls:'reports-console-open'}};
  var state={sources:false,settings:false,console:false};
  function render(){Object.keys(modes).forEach(function(k){var p=document.getElementById(modes[k].panel),b=document.querySelector('[data-reports-toggle="'+k+'"]');document.body.classList.toggle(modes[k].cls,state[k]);if(p)p.hidden=!state[k];if(b)b.setAttribute('aria-expanded',String(state[k]))})}
  function toggle(k,v){state[k]=v===undefined?!state[k]:Boolean(v);if(innerWidth<760&&state[k]&&(k==='sources'||k==='settings'))state[k==='sources'?'settings':'sources']=false;render()}
  function diagnostics(){var src=window.S&&window.S.live?window.S.live.size:document.querySelectorAll('#live-list input:checked').length;var files=window.S&&window.S.files?window.S.files.length:document.querySelectorAll('.fileitem').length;var narrative=document.getElementById('narr-on')?.classList.contains('on');set('reportsDiagSources',src);set('reportsDiagFiles',files);set('reportsDiagNarrative',narrative?'Sí':'No');var con=document.getElementById('reportsExpertConsole');if(con)con.textContent='ADMIRANEXT REPORT ENGINE\nfuentes: '+src+'\nficheros: '+files+'\nnarrativa: '+(narrative?'activa':'desactivada')+'\nprincipio: las cifras no las inventa el LLM'}
  function set(id,v){var n=document.getElementById(id);if(n)n.textContent=v}
  document.addEventListener('click',function(e){var b=e.target.closest('[data-reports-toggle]');if(b){toggle(b.dataset.reportsToggle);return}var c=e.target.closest('[data-reports-close]');if(c){toggle(c.dataset.reportsClose,false);return}var j=e.target.closest('[data-reports-target]');if(j){document.getElementById(j.dataset.reportsTarget)?.scrollIntoView({behavior:'smooth',block:'start'})}});
  document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var k=state.console?'console':state.settings?'settings':state.sources?'sources':null;if(k)toggle(k,false)});
  document.addEventListener('change',diagnostics);document.addEventListener('input',diagnostics);
  ['live-list','filelist'].forEach(function(id){var node=document.getElementById(id);if(node)new MutationObserver(diagnostics).observe(node,{childList:true,subtree:true})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){render();diagnostics()},{once:true});else{render();diagnostics()}
})();
