"""HTTP API for the UI. This is the whole contract between nodecore/ and nodeui/.

GET  /api/nodes            -> [describe(fn), ...]               see registry.py
GET  /api/workflows        -> ["readme_report", ...]            the graph files in nodes/example_workflows/
GET  /api/workflows/{name} -> a graph
POST /api/run              <- a graph                           see graph.py
-> {node_id: {"status": "ok" | "error" | "skipped", "result": ..., "error": str | None}}
-> 422 {"detail": "The graph has a loop"}
"""

import json
from dataclasses import asdict
from graphlib import CycleError
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

from nodecore.graph import Graph, run_graph
from nodecore.registry import REGISTRY, describe

WORKFLOWS = Path(__file__).parent.parent / "nodes" / "example_workflows"

app = FastAPI()


@app.get("/api/nodes")
def list_nodes() -> list[dict[str, Any]]:
    """Every registered function, for the palette."""
    return [describe(fn) for fn in REGISTRY.values()]


@app.get("/api/workflows")
def list_workflows() -> list[str]:
    """The names of the saved graphs."""
    return sorted(path.stem for path in WORKFLOWS.glob("*.json"))


@app.get("/api/workflows/{name}")
def load_workflow(name: str) -> Graph:
    """One saved graph, by name."""
    if name not in list_workflows():
        raise HTTPException(status_code=404, detail=f"No workflow {name!r}")
    graph: Graph = json.loads((WORKFLOWS / f"{name}.json").read_text(encoding="utf-8"))
    return graph


@app.post("/api/run")
def run(graph: Graph) -> dict[str, dict[str, Any]]:
    """Run a graph and return each node's result."""
    try:
        return {node_id: asdict(node_result) for node_id, node_result in run_graph(graph).items()}
    except CycleError as err:
        raise HTTPException(status_code=422, detail="The graph has a loop") from err
