#!/usr/bin/env python3
"""Executor acotado. Nunca kill-server; capturas privadas y recibos de un solo uso."""
import base64, fcntl, json, os, pathlib, re, shutil, subprocess, sys, time

TMUX = shutil.which('tmux') or next((p for p in ('/opt/homebrew/bin/tmux','/usr/local/bin/tmux') if os.path.exists(p)), 'tmux')

def redact(text):
    # Copias de paneles con secretos ocultos, como el publicador del visor.
    # -e incluye color y enlaces OSC: quitarlos antes de buscar etiquetas/tokens.
    text=re.sub(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x1b\x07]*(?:\x07|\x1b\\))','',text)
    text=re.sub(r'[\x00-\x08\x0b-\x1f\x7f]','',text)
    text=re.sub(r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)','[oculto]',text)
    patterns=[r'\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}',r'\bxai-[A-Za-z0-9_-]{20,}',r'\b(?:gh[pousr]_|github_pat_|glpat-|xox[abprs]-)[A-Za-z0-9_-]{10,}',r'\bAKIA[0-9A-Z]{16}\b',r'\bAIza[A-Za-z0-9_-]{30,}',r'\b\d{8,10}:AA[A-Za-z0-9_-]{30,}',r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}']
    for rx in patterns:text=re.sub(rx,'[oculto]',text)
    text=re.sub(r'\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}',r'\1 [oculto]',text,flags=re.I)
    text=re.sub(r'((?:pass(?:word|wd)?|pwd|contrase(?:ñ|n)a|clave|secret|api[_-]?key|access[_-]?key|token)[A-Za-z_-]*["\']?\s*[:=]\s*["\']?)([^\s"\'\x1b]{4,})',r'\1[oculto]',text,flags=re.I)
    lines=[]
    for line in text.splitlines():
        if re.search(r'code_challenge|redirect_uri=|client_id=|response_type=|[?&]state=|%3A%2F|scope=[a-z%]',line,re.I) or re.fullmatch(r'\s*[A-Za-z0-9_=%&.+-]{40,}\s*',re.sub(r'\x1b\[[0-9;]*m','',line)):
            line='[enlace de login oculto]'
        lines.append(re.sub(r'https?://\S*(?:oauth|authorize|/login|signin|sign-in|device)\S*','[enlace de login oculto]',line,flags=re.I))
    return '\n'.join(lines)+'\n'

def tm(*args):
    p = subprocess.run([TMUX, *args], capture_output=True, text=True, timeout=12)
    if p.returncode: raise RuntimeError('tmux falló: ' + args[0])
    return p.stdout

def fingerprint(t):
    return [t['id'],t['sesion'],t['creada'],t['runtime'],t.get('encargoId',''),t.get('encargoStatus','unknown')]

def self_sessions():
    """Sesión del proceso emisor/executor y todos sus antecesores, sin confiar en el body."""
    protected = set()
    if os.environ.get('TMUX_PANE'):
        protected.add(tm('display-message','-p','-t',os.environ['TMUX_PANE'],'#{session_id}').strip())
    pids = set(); pid = os.getpid()
    for _ in range(64):
        if pid < 2 or pid in pids: break
        pids.add(pid)
        p = subprocess.run(['ps','-o','ppid=','-p',str(pid)],capture_output=True,text=True)
        try: pid = int(p.stdout.strip())
        except ValueError: break
    for line in tm('list-panes','-a','-F','#{session_id}\t#{pane_pid}').splitlines():
        sid, pid = line.split('\t')
        if int(pid) in pids: protected.add(sid)
    return protected

def execute(body, collect):
    os.umask(0o077)
    plan = body.get('plan','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32}',plan): raise RuntimeError('plan inválido')
    if body.get('action') not in ('prepare','commit'): raise RuntimeError('acción inválida')
    rows = body.get('targets')
    if not isinstance(rows,list) or not rows or len(rows)>256: raise RuntimeError('destinos inválidos')
    root = pathlib.Path.home()/'.fleet'/'terminal-backups'
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    if root.is_symlink() or root.stat().st_mode & 0o077: raise RuntimeError('directorio de copia inseguro')
    with open(root/'.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if body['action']=='commit' and (root/plan/'consumed.json').exists(): raise RuntimeError('plan ya consumido')
        protected = self_sessions()
        def validate():
            current = {t['id']:t for t in collect()}
            for t in rows:
                sid = t.get('id','')
                if not re.fullmatch(r'\$\d+',sid): raise RuntimeError('sesión inválida')
                actual = current.get(sid)
                if not actual or fingerprint(actual)!=fingerprint(t): raise RuntimeError('sesión/encargo cambió')
                if sid in protected: raise RuntimeError('sesión emisora protegida')
                source = body.get('source',{})
                if source.get('kind')=='tmux' and source.get('maquina')==t.get('maquina') and source.get('sesion')==t['sesion']: raise RuntimeError('sesión emisora protegida')
                if t.get('encargoStatus','unknown') in ('in_progress','unknown') and body.get('confirmActive') is not True: raise RuntimeError('segunda confirmación requerida')
        validate()
        folder = root/plan
        if body['action']=='prepare':
            folder.mkdir(mode=0o700) # replay/no sobrescritura
            captured, pane_sets = [], {}
            for t in rows:
                panes = tm('list-panes','-s','-t',t['id'],'-F','#{pane_id}').splitlines()
                if not panes: raise RuntimeError('sesión sin panes')
                pane_sets[t['id']] = sorted(panes)
                for pane in panes:
                    if not re.fullmatch(r'%\d+',pane): raise RuntimeError('pane inválido')
                    path = folder/(t['id'][1:]+'-'+pane[1:]+'.txt')
                    with open(path,'x') as out:
                        out.write(redact(tm('capture-pane','-p','-e','-S','-','-t',pane))); out.flush(); os.fsync(out.fileno())
                    captured.append(path.name)
            validate()
            manifest = dict(body,at=time.time(),panes=captured,paneSets=pane_sets)
            with open(folder/'manifest.json','x') as out: json.dump(manifest,out); out.flush(); os.fsync(out.fileno())
            return {'ok':True,'backup':str(folder),'panes':len(captured)}
        manifest = json.loads((folder/'manifest.json').read_text())
        if folder.is_symlink() or time.time()-manifest['at']>120 or manifest['targets']!=rows or manifest['by']!=body['by'] or manifest['source']!=body['source']: raise RuntimeError('copia caducada o distinta')
        for name in manifest['panes']:
            path=folder/name
            if path.is_symlink() or not path.is_file(): raise RuntimeError('falta copia de un pane')
        for t in rows:
            if sorted(tm('list-panes','-s','-t',t['id'],'-F','#{pane_id}').splitlines())!=manifest['paneSets'].get(t['id']): raise RuntimeError('paneles cambiaron después de la copia')
        with open(folder/'consumed.json','x') as out: json.dump({'by':body['by'],'at':time.time()},out)
        killed=[]
        try:
            for t in rows:
                # Revalidación por sesión justo antes del cierre (el id exacto evita prefijos).
                actual = next((x for x in collect() if x['id']==t['id']),None)
                if not actual or fingerprint(actual)!=fingerprint(t) or t['id'] in self_sessions(): raise RuntimeError('sesión/encargo cambió antes de cerrar')
                if sorted(tm('list-panes','-s','-t',t['id'],'-F','#{pane_id}').splitlines())!=manifest['paneSets'][t['id']]: raise RuntimeError('paneles cambiaron después de la copia')
                with open(folder/'audit.jsonl','a') as out:
                    event={'by':body['by'],'session':t['sesion'],'id':t['id'],'at':time.time(),'status':'intent'}
                    out.write(json.dumps(event)+'\n'); out.flush(); os.fsync(out.fileno())
                    tm('kill-session','-t',t['id']); killed.append(t['sesion'])
                    out.write(json.dumps(dict(event,at=time.time(),status='closed'))+'\n'); out.flush(); os.fsync(out.fileno())
        except Exception as e:
            return {'ok':False,'error':str(e),'killed':killed,'backup':str(folder)}
        return {'ok':True,'killed':killed,'backup':str(folder)}

def main():
    payload=json.loads(base64.b64decode(sys.argv[1]))
    scope={'__name__':'terminal_inventory_embedded','__file__':str(pathlib.Path.home()/'.fleet'/'terminal-inventory.py')}
    exec(payload.pop('inventorySource'),scope)
    try: print(json.dumps(execute(payload,scope['collect'])))
    except Exception as e: print(json.dumps({'ok':False,'error':str(e)})); return 1

if __name__=='__main__': sys.exit(main() or 0)
