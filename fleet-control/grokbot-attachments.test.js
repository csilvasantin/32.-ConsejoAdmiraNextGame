'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAttachments}=require('./grokbot-attachments');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grok-upload-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:createAttachments(path.join(dir,'uploads'))};}
const file={name:'prueba.txt',type:'text/plain',data:Buffer.from('PRUEBA').toString('base64')};
test('uploads are private, owner-bound and verified before use',t=>{
 const {store}=setup(t),a=store.put('owner',file),b=store.get('owner',a.id);
 assert.equal(a.name,file.name);assert.equal(fs.statSync(b.path).mode&0o777,0o600);
 assert.throws(()=>store.get('other',a.id),/attachment_not_found/);
 fs.writeFileSync(b.path,'changed');assert.throws(()=>store.get('owner',a.id),/attachment_changed/);
});
test('reject traversal, reserved names, invalid payloads and symlink substitution',t=>{
 const {store,dir}=setup(t);
 for(const name of ['../secret','/tmp/secret','x\\y','.metadata.json'])assert.throws(()=>store.put('owner',{...file,name}),/invalid_attachment_name/);
 assert.throws(()=>store.put('owner',{...file,path:'/etc/passwd'}),/invalid_attachment/);
 assert.throws(()=>store.put('owner',{...file,data:'!bad'}),/attachment_too_large/);
 const a=store.put('owner',file),b=store.get('owner',a.id);fs.unlinkSync(b.path);fs.symlinkSync(path.join(dir,'other'),b.path);
 assert.throws(()=>store.get('owner',a.id));
});

test('accepts the documented 4 MB limit and rejects a byte beyond it',t=>{
 const {store}=setup(t),data=Buffer.alloc(4*1024*1024,97);
 const a=store.put('owner',{name:'limite.txt',type:'text/plain',data:data.toString('base64')});
 assert.equal(store.get('owner',a.id).size,data.length);
 assert.throws(()=>store.put('owner',{name:'grande.txt',type:'text/plain',data:Buffer.concat([data,Buffer.from('x')]).toString('base64')}),/attachment_too_large/);
});
