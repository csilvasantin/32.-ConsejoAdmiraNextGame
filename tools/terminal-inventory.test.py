#!/usr/bin/env python3
"""Unit tests: no tmux mutation, subprocess execution or network requests."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("terminal_inventory", Path(__file__).with_name("terminal-inventory.py"))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class InventoryTests(unittest.TestCase):
    def collect(self, sessions, environments=None, panes=None, processes="", decisions=None, items=None, opener=None):
        environments, panes, decisions = environments or {}, panes or {}, decisions or {}
        self.calls, self.requests = [], []

        def tmux(*args):
            self.calls.append(args)
            if args[0] == "list-sessions":
                return 0, sessions
            if args[0] == "show-environment":
                return 0, environments.get(args[2], "")
            if args[0] == "list-panes":
                return 0, panes.get(args[3], "")
            self.fail("Unexpected tmux command: " + str(args))

        def fetch(request, timeout):
            self.requests.append((request, timeout))
            return io.BytesIO(json.dumps({"items": items or []}).encode())

        estado = SimpleNamespace(INBOX="https://example.invalid/inbox?persona=",
                                decidir=lambda session, persona: decisions.get(session, {"estado": "idle"}))
        return inventory.collect(tmux=tmux, estado=estado, processes=lambda: processes, opener=opener or fetch)

    def test_only_real_sessions_with_agent_evidence(self):
        rows = self.collect("$1\tneo\t100\n$2\toraculo\t101\n$3\twork\t102\n",
                            panes={"$1": "10\tzsh", "$2": "20\tzsh", "$3": "30\tbash"},
                            processes="10 1 zsh\n11 10 /opt/bin/claude\n20 1 zsh\n30 1 bash\n31 30 echo codex\n")
        self.assertEqual([r["sesion"] for r in rows], ["neo"])
        self.assertEqual((rows[0]["agente"], rows[0]["runtime"], rows[0]["creada"]), ("Neo", "claude", 100))
        self.assertEqual({c[0] for c in self.calls}, {"list-sessions", "show-environment", "list-panes"})

    def test_all_panes_and_deep_descendants(self):
        rows = self.collect("$4\tother\t120\n", panes={"$4": "10\tzsh\n20\tzsh"},
                            processes="10 1 zsh\n20 1 zsh\n21 20 bash\n22 21 node /opt/node_modules/@openai/codex/bin/codex.js\n")
        self.assertEqual(rows[0]["runtime"], "codex")
        self.assertEqual(rows[0]["agente"], "other")

    def test_marked_test_session_and_live_runtime_precedence(self):
        rows = self.collect("$7\ttest-terminal-safe\t200\n",
                            environments={"$7": "AGENT_PERSONA=OraculoMBP16\nAGENT_RUNTIME=claude\n"},
                            panes={"$7": "30\tzsh"}, processes="30 1 zsh\n31 30 /opt/bin/codex\n")
        self.assertEqual(rows[0]["agente"], "OraculoMBP16")
        self.assertEqual(rows[0]["runtime"], "codex")

    def test_env_runtime_preserves_agent_shell_after_exit(self):
        rows = self.collect("$8\ttest-terminal-idle\t220\n", environments={"$8": "YOKUP_PERSONA=Walt\nYOKUP_RUNTIME=cursor-agent\n"})
        self.assertEqual(rows[0]["runtime"], "cursor")
        self.assertEqual(rows[0]["estado"], "idle")

    def test_persona_only_does_not_invent_runtime(self):
        rows = self.collect("$9\toraculo\t250\n", environments={"$9": "AGENT_PERSONA=Oraculo\n"})
        self.assertEqual(rows[0]["runtime"], "desconocido")

    def test_active_encargo_retained_even_when_idle_and_newer_done(self):
        rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo\nAGENT_RUNTIME=claude\n"},
                            items=[{"id": 5704, "status": "in_progress", "ts": 100, "text": "Implementar terminal", "mission_code": "FLT-101949"},
                                   {"id": 5705, "status": "done", "ts": 200},
                                   {"id": 5706, "status": "pending", "ts": 300}])
        self.assertEqual(rows[0]["estado"], "idle")
        self.assertEqual((rows[0]["encargoId"], rows[0]["encargoStatus"], rows[0]["mision"]), ("5704", "in_progress", "FLT-101949"))
        self.assertEqual(self.requests[0][1], 5)
        self.assertEqual(self.requests[0][0].get_header("User-agent"), "terminal-inventory/1")

    def test_foreign_in_progress_does_not_override_local_pending(self):
        with mock.patch.object(inventory.socket, "gethostname", return_value="macbook-pro-16.local"), \
                mock.patch.dict(os.environ, {"VISOR_MAQUINA": ""}):
            rows = self.collect("$1\tmorfeo\t100\n", environments={"$1": "AGENT_PERSONA=Morfeo\nAGENT_RUNTIME=claude"},
                                items=[{"id": 4659, "status": "in_progress", "target_machine": "MacMini", "ts": 300},
                                       {"id": 5704, "status": "pending", "target_machine": "macbook-pro-16", "ts": 100}])
        self.assertEqual((rows[0]["encargoId"], rows[0]["encargoStatus"]), ("5704", "pending"))

    def test_machine_matching_normalizes_local_suffix_and_hyphens(self):
        for hostname, target in (("macbook-pro-16.local", "MacBookPro16"),
                                 ("MacBookPro16.local", "macbook-pro-16.local"),
                                 ("macbook-pro-16", "macbook-pro-16.tail48b61c.ts.net")):
            with self.subTest(hostname=hostname, target=target), \
                    mock.patch.object(inventory.socket, "gethostname", return_value=hostname), \
                    mock.patch.dict(os.environ, {"VISOR_MAQUINA": ""}):
                rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo"},
                                    items=[{"id": 5704, "status": "in_progress", "target_machine": target, "ts": 100}])
            self.assertEqual((rows[0]["encargoId"], rows[0]["encargoStatus"]), ("5704", "in_progress"))

    def test_visor_machine_override_wins_over_hostname(self):
        with mock.patch.object(inventory.socket, "gethostname", return_value="macmini.local"), \
                mock.patch.dict(os.environ, {"VISOR_MAQUINA": "MacBook-Pro-16.local"}):
            rows = self.collect("$1\toraculo\t100\n", environments={"$1": "AGENT_PERSONA=Oraculo"},
                                items=[{"id": 4659, "status": "in_progress", "target_machine": "MacMini", "ts": 300},
                                       {"id": 5704, "status": "ack", "target_machine": "MacBookPro16", "ts": 100}])
        self.assertEqual((rows[0]["encargoId"], rows[0]["encargoStatus"]), ("5704", "ack"))

    def test_only_foreign_assignments_mean_no_local_assignment(self):
        with mock.patch.object(inventory.socket, "gethostname", return_value="macbook-pro-16.local"), \
                mock.patch.dict(os.environ, {"VISOR_MAQUINA": ""}):
            rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo"},
                                items=[{"id": 4659, "status": "in_progress", "target_machine": "MacMini", "ts": 100}])
        self.assertEqual(rows[0]["encargoId"], "")
        self.assertEqual(rows[0]["encargoStatus"], "done")
        self.assertEqual(rows[0]["encargo"], "sin encargos")

    def test_unaddressed_assignment_is_not_filtered_out(self):
        with mock.patch.object(inventory.socket, "gethostname", return_value="macbook-pro-16.local"), \
                mock.patch.dict(os.environ, {"VISOR_MAQUINA": ""}):
            rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo"},
                                items=[{"id": 5704, "status": "in_progress", "ts": 100}])
        self.assertEqual((rows[0]["encargoId"], rows[0]["encargoStatus"]), ("5704", "in_progress"))

    def test_inbox_failure_is_unknown_not_idle_or_done(self):
        def offline(*args, **kwargs):
            raise TimeoutError("offline")
        rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo\nAGENT_RUNTIME=claude"}, opener=offline)
        self.assertEqual(rows[0]["encargoStatus"], "unknown")
        self.assertEqual(rows[0]["encargo"], "encargo desconocido")

    def test_confirmed_empty_inbox_is_known_without_encargo(self):
        rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo\nAGENT_RUNTIME=claude"})
        self.assertEqual(rows[0]["encargoStatus"], "done")
        self.assertEqual(rows[0]["encargoId"], "")
        self.assertEqual(rows[0]["encargo"], "sin encargos")

    def test_omitted_estado_dynamically_loads_local_module(self):
        with tempfile.TemporaryDirectory() as directory:
            module_path = Path(directory) / "estado-agente.py"
            module_path.write_text(
                "INBOX = 'https://example.invalid/inbox?persona='\n"
                "def persona_de(persona): return 'Normalized'\n"
                "def decidir(session, persona):\n"
                "    assert persona == 'Normalized'\n"
                "    return {'estado': 'pendiente', 'mision': 'FLT-1234'}\n")

            def tmux(*args):
                if args[0] == "list-sessions":
                    return 0, "$2\ttest-terminal-state\t300\n"
                if args[0] == "show-environment":
                    return 0, "AGENT_PERSONA=Oráculo\nAGENT_RUNTIME=codex\n"
                if args[0] == "list-panes":
                    return 0, ""
                self.fail(str(args))

            requests = []

            def opener(request, timeout):
                requests.append(request.full_url)
                return io.BytesIO(b'{"items": []}')

            with mock.patch.dict(os.environ, {"ESTADO_AGENTE": str(module_path)}):
                rows = inventory.collect(tmux=tmux, processes=lambda: "", opener=opener)
            self.assertEqual(rows[0]["estado"], "pendiente")
            self.assertEqual(rows[0]["mision"], "FLT-1234")
            self.assertEqual(rows[0]["agente"], "Oráculo")
            self.assertEqual(rows[0]["encargoStatus"], "done")
            self.assertEqual(requests, ["https://example.invalid/inbox?persona=Or%C3%A1culo"])

    def test_omitted_estado_loader_failure_remains_unknown(self):
        def tmux(*args):
            if args[0] == "list-sessions":
                return 0, "$2\tneo\t300\n"
            if args[0] == "show-environment":
                return 0, "AGENT_PERSONA=Neo\nAGENT_RUNTIME=claude\n"
            return 0, ""

        with mock.patch.object(inventory, "_load_estado", return_value=None):
            rows = inventory.collect(tmux=tmux, processes=lambda: "")
        self.assertEqual(rows[0]["estado"], "desconocido")
        self.assertEqual(rows[0]["encargoStatus"], "unknown")

    def test_invalid_shared_state_not_treated_as_idle(self):
        rows = self.collect("$1\tneo\t100\n", environments={"$1": "AGENT_PERSONA=Neo"}, decisions={"neo": {"estado": "nosesion"}})
        self.assertEqual(rows[0]["estado"], "desconocido")

    def test_unavailable_tmux_does_not_report_empty(self):
        with self.assertRaisesRegex(RuntimeError, "unavailable"):
            inventory.collect(tmux=lambda *args: (1, ""), processes=lambda: "")

    def test_process_arguments_cannot_spoof_runtime(self):
        for command in ("echo codex", "bash -c claude", "node test-codex.js", "python3 -c grok", "cargo run codex"):
            self.assertEqual(inventory._process_runtime(command), "", command)
        self.assertEqual(inventory._process_runtime("node /x/@anthropic-ai/claude-code/cli.js"), "claude")

    def test_inbox_fetch_cached_per_persona(self):
        self.collect("$1\tneo\t100\n$2\ttest-terminal-neo\t200\n", environments={"$1": "AGENT_PERSONA=Neo", "$2": "AGENT_PERSONA=Neo"})
        self.assertEqual(len(self.requests), 1)


if __name__ == "__main__":
    unittest.main()
