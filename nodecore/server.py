"""HTTP API for the UI. This is the whole contract between nodecore/ and nodeui/.

GET  /api/nodes  -> [describe(fn), ...]                         see registry.py
POST /api/run    <- a graph                                     see graph.py
-> {node_id: {"status": "ok" | "error" | "skipped", "result": ..., "error": str | None}}
-> 422 {"detail": "The graph has a loop"}
"""

from dataclasses import asdict
from graphlib import CycleError
from typing import Any

from fastapi import FastAPI, HTTPException

from nodecore.graph import Graph, run_graph
from nodecore.registry import REGISTRY, describe

app = FastAPI()


@app.get("/api/nodes")
def list_nodes() -> list[dict[str, Any]]:
    """Every registered function, for the palette."""
    return [describe(fn) for fn in REGISTRY.values()]


@app.post("/api/run")
def run(graph: Graph) -> dict[str, dict[str, Any]]:
    """Run a graph and return each node's result."""
    try:
        return {node_id: asdict(node_result) for node_id, node_result in run_graph(graph).items()}
    except CycleError as err:
        raise HTTPException(status_code=422, detail="The graph has a loop") from err
