import test from 'node:test';import assert from 'node:assert/strict';
import {remotePoint,remoteKey} from './assets/mac-remote.js';
test('letterboxed portrait maps only the visible remote image, with scale and offsets',()=>{
 const rect={left:100,top:50,width:1200,height:800};
 assert.equal(remotePoint(150,400,rect,600,900),null);
 assert.deepEqual(remotePoint(700,450,rect,600,900),{x:.5,y:.5});
 const edge=remotePoint(700,50,rect,600,900);assert.equal(edge.y,0);
 assert.equal(remotePoint(700,851,rect,600,900),null);
});
test('landscape preserves coordinates on retina and refuses empty frames',()=>{
 const rect={left:0,top:40,width:1000,height:1000};
 assert.deepEqual(remotePoint(250,540,rect,2000,1000),{x:.25,y:.5});
 assert.equal(remotePoint(250,100,rect,2000,1000),null);
 assert.equal(remotePoint(0,0,rect,0,0),null);
});
test('typing, editing shortcuts and navigation are separate from local Escape and system shortcuts',()=>{
 assert.deepEqual(remoteKey({key:'ñ'}),{type:'text',text:'ñ'});
 assert.deepEqual(remoteKey({key:'A',metaKey:true}),{type:'key',key:'a',modifiers:['meta']});
 assert.deepEqual(remoteKey({key:'ArrowDown',shiftKey:true}),{type:'key',key:'ArrowDown',modifiers:['shift']});
 assert.equal(remoteKey({key:'Escape'}),null);assert.equal(remoteKey({key:'q',metaKey:true}),null);
});
