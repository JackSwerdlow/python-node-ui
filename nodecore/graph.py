"""Run a graph: each node a statement (format: see README, Graph files).

- assign: `name = value`, the value a literal or a call.
- subgraph: a `def` with a graph as its body, and a call of it: `out_1, out_2 = name(param=arg)`. It runs as a call
  does, its def the function.

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
    body: "dict[str, NodeResult] | None" = None  # a subgraph's: the result for each name in its body, when it last ran


class SubgraphError(Exception):
    """A node in a subgraph's body failed."""


def run_graph(graph: Graph) -> dict[str, NodeResult]:
    """Run each node in order, after the previous, and return each nodes result."""
    scope = _run(graph, {})
    return {name: result for name, result in scope.items() if name in graph}


def _run(graph: Graph, params: dict[str, object]) -> dict[str, NodeResult]:
    """Run a graph, given the values of its params (a subgraph's body).

    Returns the result for each name: each node's, each subgraph output's, and each param's.
    """
    # The node binding each name: its own (its id), or a subgraph's output.
    owners = {name: node_id for node_id, node in graph.items() for name in [node_id, *node.get("returns", [])]}
    dependencies: dict[str, set[str]] = {}
    for node_id, node in graph.items():
        dependencies[node_id] = {owners.get(name, name) for name in _find_refs(node)}
    scope = {name: NodeResult("ok", value) for name, value in params.items()}
    sorter = TopologicalSorter(dependencies)
    run_order = sorter.static_order()
    for node_id in run_order:
        if node_id in graph:
            node = graph[node_id]
            result = scope[node_id] = _run_node(node, scope)
            # A subgraph's outputs are names too: `readme, words = load_readme(...)`
            returns: list[str] = node.get("returns", [])
            ok = result.status == "ok"
            values = cast("list[object]", result.result) if ok and len(returns) > 1 else [result.result] * len(returns)
            for name, value in zip(returns, values, strict=True):
                scope[name] = NodeResult(result.status, value)
    return scope


def _run_node(node: dict[str, Any], scope: dict[str, NodeResult]) -> NodeResult:
    """Check prior nodes succeeded; then run its statement: a literal value is the result, a call is made."""
    for name in _find_refs(node):
        result = scope.get(name)
        if result is None or result.status != "ok":
            return NodeResult("skipped", error="An input node failed or is missing")

    # Subgraph (eqv. def my_subgraph(...): ..., then out_1, out_2 = my_subgraph(x=1)): a call of its def
    runs: list[dict[str, NodeResult]] = []
    if node["statement"] == "subgraph":
        fn, args = _define(node, runs), node.get("args", {})
    else:
        # my_var = ?
        value = node["value"]

        # Variable assignment (eqv. my_var = "hello")
        if not _is_call(value):
            if node.get("annotation") == "float":
                value = float(value)
            return NodeResult("ok", value)

        # Function call (eqv. my_var = my_function(x=1))
        registered = REGISTRY.get(value["call"])
        if registered is None:
            return NodeResult("error", error=f"Unknown function {value['call']!r} - add function with `register()`")
        fn, args = registered, value.get("args", {})

    args = {name: _resolve(arg, scope) for name, arg in args.items()}
    try:
        result = NodeResult("ok", _call(fn, args))
    except Exception as err:  # ruff: ignore[blind-except]
        result = NodeResult("error", error=f"{type(err).__name__}: {err}")
    result.body = runs[-1] if runs else None
    return result


def _define(node: dict[str, Any], runs: list[dict[str, NodeResult]]) -> Callable[..., object]:
    """A subgraph's def, as a Python function.

    It runs the body as a graph, its arguments the params, and returns the names in "returns" (one: its value; more:
    a tuple; none: None). Raises SubgraphError if a node in the body fails. Each run's results (for each name in the
    body, see _run) are added to runs.
    """
    params: dict[str, str] = node.get("params", {})
    returns: list[str] = node.get("returns", [])
    body: Graph = node.get("body", {})

    def fn(**args: object) -> object:
        missing = [name for name in params if name not in args]
        if missing:
            msg = f"missing argument {missing[0]!r}"
            raise TypeError(msg)
        scope = _run(body, args)
        runs.append(scope)
        failed = next((node_id for node_id in body if scope[node_id].status == "error"), None)
        if failed:
            msg = f"{failed}: {scope[failed].error}"
            raise SubgraphError(msg)
        values = tuple(scope[name].result for name in returns)
        return None if not values else values[0] if len(values) == 1 else values

    return fn


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


def _resolve(value: object, scope: dict[str, NodeResult]) -> object:
    """An argument's value: a wire ({"ref"}) swapped for the value of that name; an *args list, item by item."""
    if isinstance(value, list):
        return [_resolve(item, scope) for item in value]
    return scope[value["ref"]].result if _is_ref(value) else value


def _find_refs(node: dict[str, Any]) -> list[str]:
    """The names wired into a node: into an argument of its call (or *args item), or of its subgraph."""
    value = node.get("value")
    args = node.get("args", {}) if node["statement"] == "subgraph" else value.get("args", {}) if _is_call(value) else {}
    items = [item for arg in args.values() for item in (arg if isinstance(arg, list) else [arg])]
    return [item["ref"] for item in items if _is_ref(item)]


def _is_ref(value: object) -> TypeIs[dict[str, str]]:
    """Whether a value is a wire: {"ref": name}."""
    return isinstance(value, dict) and value.keys() == {"ref"}


def _is_call(value: object) -> TypeIs[dict[str, Any]]:
    """Whether a value is a call: {"call": function name, "args": {...}}."""
    return isinstance(value, dict) and "call" in value
