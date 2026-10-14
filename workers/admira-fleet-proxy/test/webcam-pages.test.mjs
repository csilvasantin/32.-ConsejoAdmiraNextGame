import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFleetProxy} from '../src/index.js';
test('Fleet carries its HttpOnly session to fixed Pages origin, preserving movement exactly once',async()=>{
 const calls=[];
 const proxy=createFleetProxy({fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({ok:true},{headers:{'Set-Cookie':'discard','Location':'discard'}})}});
 const response=await proxy.fetch(new Request('https://fleet.admira.live/api/webcam/mover',{method:'POST',headers:{Origin:'https://www.admira.live',Cookie:'__Host-fleet_session=fixture','X-Fleet-CSRF':'a'.repeat(32),'Content-Type':'application/json',Authorization:'Bearer discard'},body:'{"preset":"puerta"}'}));
 assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://www.admira.live/api/webcam/mover');
 assert.equal(calls[0].options.headers.get('Cookie'),'__Host-fleet_session=fixture');assert.equal(calls[0].options.headers.get('Authorization'),null);
 assert.equal(await new Response(calls[0].options.body).text(),'{"preset":"puerta"}');
 assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Location'),null);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');
});
test('Pages routing neither retries mutations nor follows redirects',async()=>{
 for(const failure of ['network','redirect']){
  let calls=0;const proxy=createFleetProxy({fetchImpl:async()=>{calls++;if(failure==='network')throw new Error('secret');return new Response(null,{status:302,headers:{Location:'https://evil.example'}})}});
  const r=await proxy.fetch(new Request('https://fleet.admira.live/api/webcam/mover',{method:'POST',headers:{Origin:'https://www.admira.live'},body:'{}'}));
  assert.equal(r.status,502);assert.equal(calls,1);assert.ok(!(await r.text()).includes('secret'));
 }
});
