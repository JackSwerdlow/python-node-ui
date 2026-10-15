"""Run a graph: each node a statement, `name = value`, the value a literal or a call (format: see README, Graph files).

Nodes run after the nodes wired into them. A node that fails is marked "error" and the nodes after it "skipped". A
loop raises graphlib.CycleError.
"""

import inspect
from collections.abc import Callable
from dataclasses import dataclass
from graphlib import TopologicalSorter
from typing import Any, Literal, TypeIs, cast

from nodecore.registry import REGISTRY

type Graph = dict[str, dict[str, Any]]


@dataclass
class NodeResult:
    """What happened when one node ran."""

    status: Literal["ok", "error", "skipped"]
    result: object = None
    error: str | None = None


def run_graph(graph: Graph) -> dict[str, NodeResult]:
    """Run each node in order, after the previous, and return each nodes result."""
    dependencies: dict[str, set[str]] = {}
    for node_id, node in graph.items():
        dependencies[node_id] = set(_find_refs(node))
    results: dict[str, NodeResult] = {}
    sorter = TopologicalSorter(dependencies)
    run_order = sorter.static_order()
    for node_id in run_order:
        if node_id in graph:
            results[node_id] = _run_node(graph[node_id], results)
    return results


def _run_node(node: dict[str, Any], results: dict[str, NodeResult]) -> NodeResult:
    """Check prior nodes succeeded; then run its statement: a literal value is the result, a call is made."""
    for node_id in _find_refs(node):
        result = results.get(node_id)
        if result is None or result.status != "ok":
            return NodeResult("skipped", error="An input node failed or is missing")

    # my_var = ?
    value = node["value"]

    # Variable assignment (eqv. my_var = "hello")
    if not _is_call(value):
        if node.get("annotation") == "float":
            value = float(value)
        return NodeResult("ok", value)

    # Function call (eqv. my_var = my_function(x=1))
    fn = REGISTRY.get(value["call"])
    if fn is None:
        return NodeResult("error", error=f"Unknown function {value['call']!r} - add function with `register()`")
    args = {name: _resolve(arg, results) for name, arg in value.get("args", {}).items()}
    try:
        return NodeResult("ok", _call(fn, args))
    except Exception as err:  # ruff: ignore[blind-except]
        return NodeResult("error", error=f"{type(err).__name__}: {err}")


def _call(fn: Callable[..., object], args: dict[str, object]) -> object:
    """Call fn with args by name, except what Python needs by position: *args, and the parameters before it or `/`."""
    params = list(inspect.signature(fn).parameters.values())
    has_var_args = any(p.kind is p.VAR_POSITIONAL for p in params)
    positional: list[object] = []
    for param in params:
        if param.kind is param.VAR_POSITIONAL:
            positional.extend(cast("list[object]", args.pop(param.name, [])))
        elif param.kind is param.POSITIONAL_ONLY or (has_var_args and param.kind is param.POSITIONAL_OR_KEYWORD):
            if param.name in args:
                positional.append(args.pop(param.name))
            elif param.default is not param.empty:
                positional.append(param.default)
            else:
                break  # if missing a parameter, we let Python raise its own error on the call
    return fn(*positional, **args)


def _resolve(value: object, results: dict[str, NodeResult]) -> object:
    """An argument's value: a wire ({"ref"}) swapped for that node's result; an *args list, item by item."""
    if isinstance(value, list):
        return [_resolve(item, results) for item in value]
    return results[value["ref"]].result if _is_ref(value) else value


def _find_refs(node: dict[str, Any]) -> list[str]:
    """The node ids wired into a node: into an argument of its call, or an *args item."""
    value = node.get("value")
    args = value.get("args", {}) if _is_call(value) else {}
    items = [item for arg in args.values() for item in (arg if isinstance(arg, list) else [arg])]
    return [item["ref"] for item in items if _is_ref(item)]


def _is_ref(value: object) -> TypeIs[dict[str, str]]:
    """Whether a value is a wire: {"ref": node_id}."""
    return isinstance(value, dict) and value.keys() == {"ref"}


def _is_call(value: object) -> TypeIs[dict[str, Any]]:
    """Whether a value is a call: {"call": function name, "args": {...}}."""
    return isinstance(value, dict) and "call" in value
