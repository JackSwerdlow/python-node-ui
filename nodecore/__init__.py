"""Turn plain Python functions into nodes and run graphs of them.

Example:
```
register(my_function)
results = run_graph({
    "node_a": {
        "fn": "my_function",
        "args": {"x": 1},
    },
})
```
"""

from nodecore.graph import run_graph
from nodecore.registry import register

__all__ = ["register", "run_graph"]
