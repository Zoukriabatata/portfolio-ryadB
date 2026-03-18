"""
Entry point for running the agent server directly:
    py -m ml.agent          → starts FastAPI on port 8765
    py -m ml.agent.server   → same

Visit http://localhost:8765/docs for the interactive API docs.
"""
from .server import run_server

run_server()
