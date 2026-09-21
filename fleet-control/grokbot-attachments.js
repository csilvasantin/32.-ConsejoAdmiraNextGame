'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_FILE=4*1024*1024,ID=/^ga_[a-f0-9]{32}$/;
class AttachmentError extends Error{constructor(code){super(code);this.code=code;}}
function createAttachments(folder){
  function safeDir(dir,create=false){
    if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const s=fs.lstatSync(dir);
    if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid()))throw new AttachmentError('attachment_storage_unavailable');
  }
  function readFile(file){
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||(process.getuid&&s.uid!==process.getuid())||s.size>MAX_FILE)throw new AttachmentError('invalid_attachment');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
  }
  function put(owner,body){
    if(!body||Object.keys(body).some(k=>!['name','type','data'].includes(k))||typeof body.name!=='string'||typeof body.data!=='string'||typeof body.type!=='string')throw new AttachmentError('invalid_attachment');
    const name=body.name.normalize('NFC');
    if(!name||name.length>160||name==='.'||name==='..'||name==='.metadata.json'||/[\\/\x00-\x1f\x7f]/.test(name))throw new AttachmentError('invalid_attachment_name');
    if(body.data.length>Math.ceil(MAX_FILE/3)*4||!body.data||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))throw new AttachmentError('attachment_too_large');
    const bytes=Buffer.from(body.data,'base64');if(!bytes.length||bytes.length>MAX_FILE)throw new AttachmentError('attachment_too_large');
    const id='ga_'+crypto.randomBytes(16).toString('hex');safeDir(folder,true);const dir=path.join(folder,id);safeDir(dir,true);
    const meta={id,name,type:body.type.slice(0,100),size:bytes.length,owner,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(dir,'.metadata.json'),JSON.stringify(meta),{flag:'wx',mode:0o600});
    return {id,name,type:meta.type,size:meta.size};
  }
  function get(owner,id){
    if(!ID.test(id||''))throw new AttachmentError('invalid_attachment');
    safeDir(folder);const dir=path.join(folder,id);safeDir(dir);
    const meta=JSON.parse(readFile(path.join(dir,'.metadata.json')).toString('utf8'));
    if(meta.owner!==owner||meta.id!==id)throw new AttachmentError('attachment_not_found');
    if(typeof meta.name!=='string'||meta.name==='.'||meta.name==='..'||/[\\/\x00-\x1f]/.test(meta.name))throw new AttachmentError('invalid_attachment');
    const file=path.join(dir,meta.name),bytes=readFile(file);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw new AttachmentError('attachment_changed');
    return {...meta,path:file};
  }
  return {put,get};
}
module.exports={createAttachments,AttachmentError,MAX_FILE};
