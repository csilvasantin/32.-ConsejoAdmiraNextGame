import { test } from 'node:test';
import assert from 'node:assert/strict';
import { region,pixels,difference,createMonitor,controlURL } from './analysis.js';
import { readFileSync } from 'node:fs';
test('ROI rejects invalid, out-of-bounds and tiny selections',()=>{
  for(const r of [{x:-1,y:0,w:50,h:50},{x:90,y:0,w:20,h:20},{x:0,y:0,w:0,h:10},{x:'bad',y:0,w:10,h:10}]) assert.throws(()=>region(r));
  assert.equal(region({x:0,y:0,w:100,h:100}).w,100);
});
test('luminance and frame difference',()=>{
  assert.equal(pixels(new Uint8Array([255,255,255,255])).brightness,1);
  assert.equal(pixels(new Uint8Array([0,0,0,255])).brightness,0);
  assert.equal(difference(new Float32Array([0]),new Float32Array([1])),1);
  assert.equal(difference(null,new Float32Array([1])),null);
});
const frame=(at,extra={})=>({gray:new Float32Array([.5,.5]),brightness:.5,at,...extra});
test('static artwork is not a freeze unless motion expected',()=>{
  const m=createMonitor(); for(let at=0;at<40;at++) assert.deepEqual(m.sample(frame(at)).alarms,[]);
  m.reset();let r;for(let at=0;at<=15;at++)r=m.sample(frame(at,{expectMotion:true}));assert.ok(r.alarms.includes('frozen'));
});
test('darkness must persist, one bad sample not enough',()=>{
  const m=createMonitor(); assert.deepEqual(m.sample(frame(0,{brightness:0})).alarms,[]);
  m.sample(frame(1));let r;for(let at=2;at<=16;at++)r=m.sample(frame(at,{brightness:0}));assert.deepEqual(r.alarms,[]);
  assert.ok(m.sample(frame(17,{brightness:0})).alarms.includes('dark'));
});
test('missing frames and gaps cannot establish continuity',()=>{
  const m=createMonitor();for(let at=0;at<14;at++)m.sample(frame(at,{brightness:0}));
  assert.equal(m.sample(frame(14,{fresh:false})).state,'unknown');
  assert.deepEqual(m.sample(frame(50,{brightness:0})).alarms,[]);
  m.reset();for(let at=0;at<14;at++)m.sample(frame(at,{expectMotion:true}));
  assert.deepEqual(m.sample(frame(25,{expectMotion:true})).alarms,[]);
});
test('reference deviation is optional and persistent',()=>{
  const m=createMonitor();let r;for(let at=0;at<=15;at++)r=m.sample(frame(at,{reference:new Float32Array([1,1])}));
  assert.ok(r.alarms.includes('reference'));
  assert.deepEqual(m.sample(frame(16)).alarms,[]);
});
test('control is scoped, encoded, never javascript or all fleet',()=>{
  const u=new URL(controlURL('macbookairrosa'));assert.equal(u.searchParams.get('machine'),'macbookairrosa');assert.equal(u.searchParams.get('solo'),'1');
  for(const id of ['', 'javascript:alert(1)','rosa&all=1','../'])assert.throws(()=>controlURL(id));
});
test('camera safety contract: gesture only, no fetch/upload, cleanup and visibility gate',()=>{
  const js=readFileSync(new URL('./tester.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.match(js,/\$\('start'\)\.onclick/);assert.match(js,/audio:false/);assert.match(js,/getTracks\(\)\.forEach\(track=>track.stop\(\)\)/);
  assert.match(js,/visibilitychange/);assert.match(js,/pagehide/);assert.match(js,/attempt!==generation/);
  assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|MediaRecorder/);
  assert.match(html,/connect-src 'none'/);assert.match(html,/sin subida de imágenes/);
});
