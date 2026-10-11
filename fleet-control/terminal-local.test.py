#!/usr/bin/env python3
"""Prueba con servidor tmux aislado: ningún comando alcanza sesiones de agentes."""
import importlib.util, json, os, pathlib, shutil, subprocess, tempfile, unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('terminal_local',HERE/'terminal-local.py'); local=importlib.util.module_from_spec(spec);spec.loader.exec_module(local)

class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.socket=str(self.root/'test.sock')
        self.binary=shutil.which('tmux') or '/opt/homebrew/bin/tmux'
        def isolated(*args):
            p=subprocess.run([self.binary,'-S',self.socket,*args],capture_output=True,text=True,timeout=10)
            if p.returncode: raise RuntimeError('test tmux failed '+args[0])
            return p.stdout
        self.tm=isolated
        self.tm('new-session','-d','-s','test-terminal-5704','printf "TEST PANE ONE\\n"; sleep 180')
        self.tm('split-window','-d','-t','test-terminal-5704','printf "TEST PANE TWO\\n"; sleep 180')
        self.tm('set-option','-t','test-terminal-5704','remain-on-exit','on')
        sid,name,created=self.tm('list-sessions','-F','#{session_id}\t#{session_name}\t#{session_created}').strip().split('\t')
        self.row={'id':sid,'sesion':name,'creada':int(created),'runtime':'codex','encargoId':'TEST','encargoStatus':'in_progress','maquina':'test-machine'}
        self.body={'action':'prepare','plan':'T'*32,'targets':[self.row],'source':{'kind':'browser'},'by':'test-admin@example.test','confirmActive':True}
        self.patches=[patch.object(local,'tm',self.tm),patch.object(pathlib.Path,'home',return_value=self.root),patch.dict(os.environ,{},clear=False)]
        for p in self.patches:p.start()
        self.pane=os.environ.pop('TMUX_PANE',None)
    def tearDown(self):
        subprocess.run([self.binary,'-S',self.socket,'kill-server'],capture_output=True)
        if self.pane is not None:os.environ['TMUX_PANE']=self.pane
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def collect(self):return [self.row.copy()]
    def test_two_panes_saved_before_test_session_closed_and_replay_rejected(self):
        result=local.execute(self.body,self.collect);self.assertTrue(result['ok']);self.assertEqual(result['panes'],2)
        folder=pathlib.Path(result['backup']);self.assertEqual(folder.stat().st_mode&0o777,0o700)
        for p in folder.glob('*.txt'):
            self.assertEqual(p.stat().st_mode&0o777,0o600)
            self.assertIn('TEST PANE',p.read_text())
        self.tm('has-session','-t',self.row['id'])
        result=local.execute(dict(self.body,action='commit'),self.collect);self.assertEqual(result['killed'],['test-terminal-5704'])
        self.assertTrue((folder/'audit.jsonl').is_file())
        self.tm('new-session','-d','-s','test-remaining','sleep 180')
        with self.assertRaisesRegex(RuntimeError,'consumido'):local.execute(dict(self.body,action='commit'),self.collect)
    def test_in_progress_requires_second_confirmation(self):
        with self.assertRaisesRegex(RuntimeError,'segunda confirmación'):local.execute(dict(self.body,confirmActive=False),self.collect)
        self.tm('has-session','-t',self.row['id'])
    def test_emitter_is_never_killed(self):
        with patch.object(local,'self_sessions',return_value={self.row['id']}):
            with self.assertRaisesRegex(RuntimeError,'emisora protegida'):local.execute(self.body,self.collect)
        self.tm('has-session','-t',self.row['id'])
    def test_missing_backup_blocks_commit(self):
        result=local.execute(self.body,self.collect);folder=pathlib.Path(result['backup']);next(folder.glob('*.txt')).unlink()
        with self.assertRaisesRegex(RuntimeError,'falta copia'):local.execute(dict(self.body,action='commit'),self.collect)
        self.tm('has-session','-t',self.row['id'])
    def test_changed_assignment_blocks_close(self):
        local.execute(self.body,self.collect)
        def changed():return [dict(self.row,encargoId='CHANGED')]
        with self.assertRaisesRegex(RuntimeError,'cambió'):local.execute(dict(self.body,action='commit'),changed)
        self.tm('has-session','-t',self.row['id'])
    def test_expired_backup_blocks_close(self):
        result=local.execute(self.body,self.collect);path=pathlib.Path(result['backup'])/'manifest.json';d=json.loads(path.read_text());d['at']-=180;path.write_text(json.dumps(d))
        with self.assertRaisesRegex(RuntimeError,'caducada'):local.execute(dict(self.body,action='commit'),self.collect)
    def test_new_pane_after_backup_blocks_close(self):
        local.execute(self.body,self.collect)
        self.tm('split-window','-d','-t','test-terminal-5704','sleep 180')
        with self.assertRaisesRegex(RuntimeError,'paneles cambiaron'):local.execute(dict(self.body,action='commit'),self.collect)
        self.tm('has-session','-t',self.row['id'])
    def test_secrets_are_redacted_before_persisting_pane(self):
        original=self.tm
        def sensitive(*args):
            if args[0]=='capture-pane':return 'Safe pane\napi_key=test-super-secret-value\nBearer test-secret-authorization-value\nhttps://login.example/authorize?client_id=test-client\n'
            return original(*args)
        with patch.object(local,'tm',sensitive):result=local.execute(self.body,self.collect)
        for file in pathlib.Path(result['backup']).glob('*.txt'):
            text=file.read_text();self.assertIn('Safe pane',text);self.assertNotIn('test-super-secret',text);self.assertNotIn('test-secret-authorization',text);self.assertNotIn('test-client',text)
    def test_ansi_cannot_hide_secret_assignments_or_authorization(self):
        value='synthetic-sensitive-value-5704'
        for content in ['api_key=\x1b[32m'+value+'\x1b[0m','Bearer \x1b[32m'+value+'\x1b[0m','api_\x1b[31mkey='+value]:
            self.assertNotIn(value,local.redact(content))
            self.assertIn('[oculto]',local.redact(content))
    def test_partial_failure_preserves_exact_result_and_backup(self):
        self.tm('new-session','-d','-s','test-terminal-5704-second','sleep 180')
        sid,name,created=self.tm('display-message','-p','-t','test-terminal-5704-second','#{session_id}\t#{session_name}\t#{session_created}').strip().split('\t')
        second=dict(self.row,id=sid,sesion=name,creada=int(created));body=dict(self.body,targets=[self.row,second]);collect=lambda:[self.row.copy(),second.copy()]
        local.execute(body,collect)
        def failing(*args):
            if args[0]=='kill-session' and args[-1]==sid:raise RuntimeError('test close failure')
            return self.tm(*args)
        with patch.object(local,'tm',failing):result=local.execute(dict(body,action='commit'),collect)
        self.assertFalse(result['ok']);self.assertEqual(result['killed'],['test-terminal-5704']);self.assertTrue(pathlib.Path(result['backup']).is_dir());self.tm('has-session','-t',sid)

if __name__=='__main__':unittest.main()
