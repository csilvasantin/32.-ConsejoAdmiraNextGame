#!/usr/bin/env python3
"""Read-only inventory of actual local tmux agent sessions; no quadratura conf.

collect() accepts a tmux(*args) -> (returncode, stdout) callback, the shared
estado-agente module, a process-table callback and an HTTP opener for testing.
Only explicit session identity/runtime environment or an actual agent process
identifies an agent session. Session names alone never establish a runtime.
"""
import importlib.util
import json
import os
import re
import shlex
import subprocess
import unicodedata
import urllib.parse
import urllib.request
import socket

RUNTIMES = {"claude", "codex", "grok", "opencode", "cursor"}
ESTADOS = {"vivo", "idle", "pendiente", "login"}
STATUSES = {"in_progress", "pending", "ack", "done"}
PERSONAS = {
    "neo": "Neo", "morfeo": "Morfeo", "trinity": "Trinity",
    "oraculo": "Oraculo", "niobe": "Niobe", "smith": "Smith",
    "merovingio": "Merovingio", "whiterabbit": "WhiteRabbit",
    "link": "Link", "cypher": "Cypher", "woz": "Woz", "walt": "Walt",
}
TMUX = next((p for p in ("/opt/homebrew/bin/tmux", "/usr/local/bin/tmux",
                         "/usr/bin/tmux") if os.path.exists(p)), "tmux")


def _tmux(*args):
    result = subprocess.run([TMUX, *args], capture_output=True, text=True, timeout=8)
    return result.returncode, result.stdout


def _processes():
    result = subprocess.run(["ps", "-axo", "pid=,ppid=,args="], capture_output=True,
                            text=True, timeout=8)
    return result.stdout if result.returncode == 0 else ""


def _load_estado():
    """Load the same local state module as visor-publicar, including SSH use."""
    home = os.path.expanduser("~")
    source = globals().get("__file__", "")
    paths = [os.environ.get("ESTADO_AGENTE", ""),
             os.path.join(home, "Claude", "vista", "estado-agente.py")]
    if source:
        paths.append(os.path.join(os.path.dirname(os.path.abspath(source)), "estado-agente.py"))
    for path in paths:
        if not path or not os.path.isfile(path):
            continue
        try:
            spec = importlib.util.spec_from_file_location("terminal_estado_agente", path)
            if not spec or not spec.loader:
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        except Exception:
            continue
    return None


def _text(value, limit=260):
    return re.sub(r"[\x00-\x1f\x7f]", " ", str(value or "")).strip()[:limit]


def _runtime(value):
    name = os.path.basename(str(value or "")).lower()
    aliases = {"claude-code": "claude", "codex-cli": "codex", "grok-cli": "grok",
               "cursor-agent": "cursor", "cursor-cli": "cursor"}
    return name if name in RUNTIMES else aliases.get(name, "")


def _process_runtime(command):
    try:
        args = shlex.split(command)
    except ValueError:
        return ""
    if not args:
        return ""
    runtime = _runtime(args[0])
    if runtime:
        return runtime
    # Node/Python launchers execute a script. Do not match agent names occurring
    # only in arbitrary shell commands, test names, prompts or other arguments.
    binary = os.path.basename(args[0]).lower()
    if binary in {"node", "nodejs", "python", "python3", "python3.9", "bun"}:
        script = next((a for a in args[1:] if not a.startswith("-")), "")
        base = os.path.basename(script).lower()
        if base in {"claude.js", "codex.js", "grok.js", "grok.py", "grok-cli.js",
                    "opencode.js", "cursor-agent.js"}:
            return _runtime(base.rsplit(".", 1)[0])
        if base == "cli.js" and ("@anthropic-ai/claude-code/" in script
                                 or "/claude-code/" in script):
            return "claude"
    return ""


def _table(text):
    table = {}
    for line in text.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            table[int(parts[0])] = (int(parts[1]), parts[2])
    return table


def _descendant_runtimes(roots, table):
    children = {}
    for pid, (parent, _) in table.items():
        children.setdefault(parent, []).append(pid)
    found, seen, queue = [], set(), list(roots)
    while queue:
        pid = queue.pop(0)
        if pid in seen:
            continue
        seen.add(pid)
        if pid in table:
            runtime = _process_runtime(table[pid][1])
            if runtime and runtime not in found:
                found.append(runtime)
        queue.extend(children.get(pid, []))
    return found


def _persona(session):
    normalized = unicodedata.normalize("NFKD", session).encode("ascii", "ignore").decode().lower()
    for key, name in PERSONAS.items():
        if re.match(r"^(?:sub|infra)?" + re.escape(key) + r"(?:$|[-_.]|mbp\d|macmini|mini|air)", normalized):
            return name
    # Runtime/process evidence is required by the caller before this fallback.
    return _text(session, 80)


def _stamp(item):
    values = []
    for key in ("ts", "ack_at", "done_at", "updated_at", "created_at"):
        try:
            values.append(float(item.get(key) or 0))
        except (ValueError, TypeError):
            pass
    return max(values or [0])


def _inbox(persona, estado, opener):
    unknown = {"encargo": "encargo desconocido", "encargoId": "", "encargoStatus": "unknown", "mision": ""}
    base = getattr(estado, "INBOX", "") if estado else ""
    if not base:
        return unknown
    request = urllib.request.Request(base + urllib.parse.quote(persona, safe=""),
                                     headers={"user-agent": "terminal-inventory/1"})
    try:
        with opener(request, timeout=5) as response:
            document = json.loads(response.read())
        if not isinstance(document, dict) or not isinstance(document.get("items"), list):
            return unknown
        def machine_key(value):
            return re.sub(r'[^a-z0-9]', '', str(value or '').lower().split('.')[0])
        # La bandeja por persona abarca varias máquinas. No atribuir aquí trabajo de otro Mac.
        local_machine = os.environ.get('VISOR_MAQUINA') or socket.gethostname().split('.')[0]
        local_key = machine_key(local_machine)
        items = [i for i in document["items"] if isinstance(i, dict) and i.get("status") != "cancelled"
                 and (not i.get('target_machine') or machine_key(i.get('target_machine')) == local_key)]
        if not items:
            return dict(unknown, encargo="sin encargos", encargoStatus="done")
        # An older in_progress item must not disappear behind a newer pending or
        # completed item: the second kill confirmation protects any active work.
        progress = [i for i in items if i.get("status") == "in_progress"]
        opened = [i for i in items if i.get("status") in {"pending", "ack"}]
        item = max(progress or opened or items, key=_stamp)
        status = item.get("status") if item.get("status") in STATUSES else "unknown"
        identifier = _text(item.get("id"), 80)
        description = _text(item.get("text"))
        mission = next((item[k] for k in ("mission_public_id", "mission_code", "mision_id", "mission_id", "mission")
                        if isinstance(item.get(k), (str, int))), "")
        return {"encargo": "#%s · %s · %s" % (identifier, status, description),
                "encargoId": identifier, "encargoStatus": status, "mision": _text(mission)}
    except Exception:
        return unknown


def collect(tmux=None, estado=None, processes=None, opener=None):
    """Return one row per actual agent session, inspecting every pane/process.

    An unavailable tmux server raises rather than pretending it has no sessions.
    Per-session metadata failures produce unknown state/inbox information.
    """
    tmux = tmux or _tmux
    processes = processes or _processes
    opener = opener or urllib.request.urlopen
    if estado is None:
        estado = _load_estado()
    rc, listing = tmux("list-sessions", "-F", "#{session_id}\t#{session_name}\t#{session_created}")
    if rc:
        raise RuntimeError("tmux inventory unavailable")
    try:
        table = _table(processes())
    except Exception:
        table = {}
    rows, inboxes = [], {}
    for line in listing.splitlines():
        parts = line.split("\t")
        if len(parts) != 3 or not re.fullmatch(r"\$\d+", parts[0]):
            continue
        identifier, session, created = parts
        try:
            created = int(created)
        except ValueError:
            continue
        env = {}
        try:
            erc, environment = tmux("show-environment", "-t", identifier)
            if erc == 0:
                for entry in environment.splitlines():
                    key, sep, value = entry.partition("=")
                    if sep and key in {"AGENT_PERSONA", "YOKUP_PERSONA", "YOKUP_RUNTIME", "AGENT_RUNTIME"}:
                        env[key] = _text(value, 80)
        except Exception:
            pass
        roots = []
        try:
            prc, panes = tmux("list-panes", "-s", "-t", identifier, "-F", "#{pane_pid}\t#{pane_current_command}")
            if prc == 0:
                for pane in panes.splitlines():
                    pid = pane.split("\t", 1)[0]
                    if pid.isdigit():
                        roots.append(int(pid))
        except Exception:
            pass
        actual = _descendant_runtimes(roots, table)
        declared = _runtime(env.get("YOKUP_RUNTIME") or env.get("AGENT_RUNTIME"))
        persona = env.get("AGENT_PERSONA") or env.get("YOKUP_PERSONA")
        if not (persona or declared or actual):
            continue
        persona = persona or _persona(session)
        runtime = actual[0] if actual else declared or "desconocido"
        state, mission = "desconocido", ""
        if estado and callable(getattr(estado, "decidir", None)):
            try:
                state_persona = estado.persona_de(persona) if callable(getattr(estado, "persona_de", None)) else persona
                decision = estado.decidir(session, state_persona)
                if isinstance(decision, dict):
                    if decision.get("estado") in ESTADOS:
                        state = decision["estado"]
                    mission = _text(decision.get("mision"))
            except Exception:
                pass
        if persona not in inboxes:
            inboxes[persona] = _inbox(persona, estado, opener)
        row = {"sesion": session, "id": identifier, "creada": created,
               "agente": persona, "runtime": runtime, "estado": state, **inboxes[persona]}
        if not row["mision"]:
            row["mision"] = mission
        rows.append(row)
    return rows
