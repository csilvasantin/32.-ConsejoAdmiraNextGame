import importlib, sys, os

# Render entry point — council-api.py has a hyphen so can't be imported directly
sys.path.insert(0, os.path.dirname(__file__))
spec = importlib.util.spec_from_file_location(
    "council_api",
    os.path.join(os.path.dirname(__file__), "council-api.py"),
)
module = importlib.util.module_from_spec(spec)
sys.modules["council_api"] = module
spec.loader.exec_module(module)
app = module.app
