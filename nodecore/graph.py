"""Run a graph: variables and calls of registered functions (format: see README, Graph files).

Nodes run after the nodes wired into them. A node that fails is marked "error" and the nodes after it "skipped". A
loop raises graphlib.CycleError.
"""

from dataclasses import dataclass
from graphlib import TopologicalSorter
from typing import Any, Literal

from nodecore.registry import REGISTRY

type Graph = dict[str, dict[str, Any]]


@dataclass
class NodeResult:
    """What happened when one node ran."""

    status: Literal["ok", "error", "skipped"]
    result: Any = None
    error: str | None = None


def run_graph(graph: Graph) -> dict[str, NodeResult]:
    """Run each node in order, after the previous, and return each nodes result."""
    dependencies: dict[str, set[str]] = {}
    for node_id, node in graph.items():
        connections = _find_connections(node)
        dependencies[node_id] = set(connections.values())
    results: dict[str, NodeResult] = {}
    sorter = TopologicalSorter(dependencies)
    run_order = sorter.static_order()
    for node_id in run_order:
        if node_id in graph:
            results[node_id] = _run_node(graph[node_id], results)
    return results


def _run_node(node: dict[str, Any], results: dict[str, NodeResult]) -> NodeResult:
    """Check prior nodes succeeded; then a variable gives its value, a function node is called with its args."""
    connections = _find_connections(node)

    for node_id in connections.values():
        result = results.get(node_id)
        if result is None or result.status != "ok":
            return NodeResult("skipped", error="An input node failed or is missing")

    # Variable assignment (eqv. my_var = "hello")
    if node.get("statement") == "assign":
        value = node.get("value")
        if node.get("annotation") == "float" and type(value) is int:
            value = float(value)
        return NodeResult("ok", value)

    fn_name = node.get("fn", "")
    fn = REGISTRY.get(fn_name)
    if fn is None:
        return NodeResult("error", error=f"Unknown function {fn_name!r} - add function with `register()`")

    args = {}
    for arg_name, value in node.get("args", {}).items():
        if arg_name in connections:
            node_id = connections[arg_name]
            args[arg_name] = results[node_id].result
        else:
            args[arg_name] = value

    try:
        return NodeResult("ok", fn(**args))
    except Exception as err:  # ruff: ignore[blind-except]
        return NodeResult("error", error=f"{type(err).__name__}: {err}")


def _find_connections(node: dict[str, Any]) -> dict[str, str]:
    """Return arguments that are wired to another node: {arg_name: node_id}."""
    connections = {}
    for arg_name, value in node.get("args", {}).items():
        is_ref = isinstance(value, dict) and value.keys() == {"ref"}
        if is_ref:
            connections[arg_name] = value["ref"]
    return connections
