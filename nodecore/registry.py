"""Turn plain Python functions into nodes.

The functions are left untouched. describe() is what the UI sees: each parameter is an input
(no default -> a socket, has a default -> a field), and the return value is the single output.
"""

import inspect
from collections.abc import Callable
from typing import Any, get_type_hints

REGISTRY: dict[str, Callable[..., Any]] = {}


def register(*fns: Callable[..., Any]) -> None:
    """Make functions available as nodes, by name."""
    for fn in fns:
        REGISTRY[fn.__name__] = fn


def describe(fn: Callable[..., Any]) -> dict[str, Any]:
    """The node schema the UI draws a node from."""
    hints = get_type_hints(fn)
    returns = hints.get("return", Any)
    return {
        "id": fn.__name__,
        "description": inspect.getdoc(fn) or "",
        "inputs": [
            {
                "name": param.name,
                "type": _type_name(hints.get(param.name, Any)),
                "required": param.default is param.empty,
                "default": None if param.default is param.empty else param.default,
            }
            for param in inspect.signature(fn).parameters.values()
        ],
        "output": None if returns is type(None) else _type_name(returns),
    }


def _type_name(annotation: object) -> str:
    """A label for the UI, e.g. "str" or "list[str]"."""
    return annotation.__name__ if isinstance(annotation, type) else str(annotation).replace("typing.", "")
