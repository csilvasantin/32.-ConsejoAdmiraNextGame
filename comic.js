/* ============================================================================
 * comic.js — cómic de viñetas de una reunión del Consejo
 * ----------------------------------------------------------------------------
 * Al cerrar la Mesa, convierte la conversación en una tira de cómic. 3 motores
 * con cascada (preferencia → red de seguridad):
 *   1. gpt-image-1  (OpenAI, vía worker COMIC_API)  — cuando haya API key
 *   2. navegador    (tu ChatGPT: copia el prompt y abre chatgpt.com)
 *   3. svg          (viñetas dibujadas en la web con avatares — SIEMPRE funciona)
 *
 * API: AdmiraComic.open({panels, tema, names, engine})
 *   panels: [{persona, role, text, avatarStyle, color, mod?}]
 *   engine: 'auto' | 'gpt' | 'navegador' | 'svg'
 * ========================================================================== */
(function () {
  'use strict';
  const COMIC_API = 'https://fallback.admira.store/comic'; // worker con OPENAI_API_KEY (cuando se ponga)
  const MAX_PANELS = 6;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function trim(s, n){ s=String(s||'').replace(/\s+/g,' ').trim(); return s.length>n ? s.slice(0,n-1)+'…' : s; }

  // Elige viñetas representativas: apertura, repartidas, y cierre/acta.
  function pickPanels(panels){
    if (panels.length <= MAX_PANELS) return panels;
    const out=[panels[0]]; const step=(panels.length-2)/(MAX_PANELS-2);
    for(let i=1;i<MAX_PANELS-1;i++) out.push(panels[Math.round(i*step)]);
    out.push(panels[panels.length-1]); return out;
  }

  function buildPrompt(panels, tema, names){
    const sel=pickPanels(panels);
    const lines=sel.map((p,i)=>`Viñeta ${i+1} — ${p.persona} (${p.role}): "${trim(p.text,140)}"`).join('\n');
    return `Crea una TIRA DE CÓMIC de ${sel.length} viñetas, estilo cómic moderno limpio y colorido, con bocadillos de diálogo EN ESPAÑOL y texto legible. Es una reunión del Consejo de Admira (caricaturas amables de líderes tecnológicos, NO fotorrealista). Tema: "${tema}". Participantes: ${names}.\nViñetas:\n${lines}\nComposición en cuadrícula horizontal, líneas nítidas, cada bocadillo corto y claro.`;
  }

  // ── Modal ──
  function modal(){
    let m=document.getElementById('admira-comic'); if(m) return m;
    m=document.createElement('div'); m.id='admira-comic';
    m.style.cssText='position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,Arial,sans-serif';
    m.innerHTML='<div id="ac-card" style="background:#11131f;border:2px solid #2a2f45;border-radius:14px;max-width:1100px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 18px 60px #000"></div>';
    m.addEventListener('click',e=>{ if(e.target===m) m.remove(); });
    document.body.appendChild(m); return m;
  }
  function header(engine){
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #2a2f45;position:sticky;top:0;background:#11131f;z-index:2">
      <b style="color:#e8eef7;font-size:15px">🎨 Cómic del Consejo</b>
      <select id="ac-engine" style="margin-left:auto;background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 8px;font:inherit;font-size:12px">
        <option value="auto"${engine==='auto'?' selected':''}>Auto (IA→SVG)</option>
        <option value="gpt"${engine==='gpt'?' selected':''}>gpt-image-1</option>
        <option value="navegador"${engine==='navegador'?' selected':''}>Mi ChatGPT (navegador)</option>
        <option value="svg"${engine==='svg'?' selected':''}>SVG en la web</option>
      </select>
      <button id="ac-regen" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">↻ Regenerar</button>
      <button id="ac-close" style="background:#1a2030;color:#e8eef7;border:1px solid #2a2f45;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px">✕</button>
    </div>`;
  }

  // ── Tier SVG/HTML (siempre funciona) ──
  function renderSVG(panels, tema, names){
    const sel=pickPanels(panels);
    const cells=sel.map((p,i)=>`
      <div style="position:relative;background:#fffdf5;border:3px solid #111;border-radius:6px;overflow:hidden;min-height:190px;display:flex;flex-direction:column">
        <div style="position:absolute;top:6px;left:6px;background:#ffd54a;border:2px solid #111;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#111">${i+1}</div>
        <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;background:
          repeating-radial-gradient(circle at 20% 20%, #e9efff 0 2px, transparent 2px 7px), linear-gradient(180deg,#dfe7ff,#f2efe0)">
          <div style="width:118px;height:118px;border-radius:50%;border:3px solid #111;margin-bottom:8px;${p.avatarStyle||''};background-color:#ccd"></div>
        </div>
        <div style="background:#fff;border-top:3px solid #111;padding:8px 10px">
          <div style="font-weight:800;font-size:12px;color:${p.color||'#111'};text-transform:uppercase">${p.mod?'🎙️ ':''}${esc(p.persona)} <span style="color:#888;font-weight:600">· ${esc(p.role)}</span></div>
          <div style="font-size:13px;color:#111;line-height:1.35;margin-top:3px">${esc(trim(p.text,160))}</div>
        </div>
      </div>`).join('');
    return `<div id="ac-sheet" style="padding:16px">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-weight:900;font-size:20px;color:#111;background:#ffd54a;display:inline-block;padding:6px 16px;border:3px solid #111;border-radius:8px;transform:rotate(-1deg)">EL CONSEJO DE ADMIRA</div>
        <div style="color:#cdd6e6;font-size:13px;margin-top:8px">“${esc(tema)}” · ${esc(names)}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${sel.length>=3?3:sel.length},1fr);gap:12px">${cells}</div>
      <div style="text-align:center;margin-top:12px">
        <button id="ac-dl" style="background:#5bd6c0;color:#06231e;border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font:inherit;font-weight:700">💾 Descargar PNG</button>
      </div>
    </div>`;
  }

  async function downloadSheet(){
    const sheet=document.getElementById('ac-sheet'); if(!sheet) return;
    const w=sheet.scrollWidth, h=sheet.scrollHeight;
    // Serializa el HTML a SVG foreignObject → canvas → PNG (imágenes same-origin, sin taint)
    const clone=sheet.cloneNode(true); const dl=clone.querySelector('#ac-dl'); if(dl) dl.remove();
    const html=`<div xmlns="http://www.w3.org/1999/xhtml" style="background:#11131f">${clone.innerHTML}</div>`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=w*2; c.height=h*2; const x=c.getContext('2d'); x.scale(2,2); x.fillStyle='#11131f'; x.fillRect(0,0,w,h); x.drawImage(img,0,0);
      c.toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='comic-consejo.png'; a.click(); }); };
    img.onerror=()=>alert('No se pudo exportar el PNG (intenta captura de pantalla).');
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }

  function showImage(card, url, prompt){
    card.querySelector('#ac-body').innerHTML=`<div style="padding:16px;text-align:center">
      <img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid #2a2f45">
      <div style="margin-top:10px"><a href="${url}" download="comic-consejo.png" style="color:#5bd6c0">💾 Descargar</a></div></div>`;
  }
  function note(card, msg){ const n=card.querySelector('#ac-note'); if(n) n.innerHTML=msg; }

  async function run(card, data, engine){
    const body=card.querySelector('#ac-body');
    const prompt=buildPrompt(data.panels, data.tema, data.names);

    if(engine==='navegador'){
      try{ await navigator.clipboard.writeText(prompt); }catch(e){}
      window.open('https://chatgpt.com/','_blank');
      body.innerHTML=`<div style="padding:18px;color:#cdd6e6;font-size:14px">
        Abrí <b>chatgpt.com</b> en otra pestaña y copié el prompt al portapapeles.
        Pégalo (⌘V) y pídele la imagen. <div style="margin-top:10px;background:#0c0e18;border:1px solid #2a2f45;border-radius:8px;padding:10px;white-space:pre-wrap;font-size:12px;color:#aeb8cc">${esc(prompt)}</div></div>`;
      return;
    }

    if(engine==='gpt' || engine==='auto'){
      body.innerHTML='<div style="padding:28px;text-align:center;color:#8a97ab">🎨 generando con gpt-image-1…</div>';
      try{
        const r=await fetch(COMIC_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
        const d=await r.json().catch(()=>({}));
        if(r.ok && (d.url||d.b64)){ showImage(card, d.url||('data:image/png;base64,'+d.b64), prompt); return; }
        if(engine==='gpt'){ body.innerHTML=`<div style="padding:18px;color:#ffb454">gpt-image no disponible (${esc(d.error||('HTTP '+r.status))}). ${d.needKey?'Falta configurar la API key de OpenAI en el worker.':''}</div>`; return; }
        // auto → cae a SVG
      }catch(e){ if(engine==='gpt'){ body.innerHTML='<div style="padding:18px;color:#ffb454">gpt-image error: '+esc(e.message)+'</div>'; return; } }
    }

    // svg (o fallback de auto)
    body.innerHTML=renderSVG(data.panels, data.tema, data.names);
    const dl=card.querySelector('#ac-dl'); if(dl) dl.onclick=downloadSheet;
    if(engine==='auto') note(card,'🛟 IA no disponible — cómic SVG (siempre funciona).');
  }

  function open(data){
    const engine=data.engine||'auto';
    const m=modal(); const card=m.querySelector('#ac-card');
    card.innerHTML=header(engine)+'<div id="ac-note" style="color:#8a97ab;font-size:12px;padding:0 16px"></div><div id="ac-body"></div>';
    card.querySelector('#ac-close').onclick=()=>m.remove();
    const go=eng=>run(card,data,eng);
    card.querySelector('#ac-engine').onchange=e=>go(e.target.value);
    card.querySelector('#ac-regen').onclick=()=>go(card.querySelector('#ac-engine').value);
    go(engine);
  }

  window.AdmiraComic = { open, buildPrompt };
})();
