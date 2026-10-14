# Python Node UI

Turn plain Python functions into nodes, wire them up on a canvas, run the graph.

    nodecore/       the core: register functions, run graphs, serve the API
    nodeui/         the UI (talks to nodecore/ over the API in nodecore/server.py)
    nodes/          built-in nodes, plus example_workflows/
    custom_nodes/   your own node folders (gitignored, except example/)

`nodeui/` and `custom_nodes/` can be deleted without breaking headless runs.

## Setup

    uv venv && source .venv/bin/activate        # or a conda env
    uv pip install -r requirements-dev.txt      # requirements.txt for runtime only
    cd nodeui && pnpm install

Pins come from the `.in` files: `uv pip compile requirements.in -o requirements.txt`
(same for `requirements-dev`).

## Run

    cd nodeui && pnpm build                        # once, and after UI changes
    python main.py                              # UI + API on http://127.0.0.1:8000
    python main.py --no-ui                      # just the API
    python main.py nodes/example_workflows/split_text.json    # run a graph, no server

Working on the UI: `pnpm dev` in `nodeui/` alongside `python main.py --no-ui` gives live reload
on http://127.0.0.1:5173.

## Graph files

The UI sends this same JSON to the API when you press Run; `python main.py graph.json` runs it directly:

    {
      "input": {"fn": "text", "args": {"text": "a, b"}, "pos": [0, 0]},
      "split": {"fn": "split_text", "args": {"text": {"ref": "input"}}}
    }

Each key is a node id. An argument is a plain value, or `{"ref": id}` for another node's result.

## Add nodes

Copy `custom_nodes/example/` to `custom_nodes/<name>/`, then:

- `functions.py`: plain typed functions; nothing here knows about nodes
- `nodes.py`: `register(my_function)` (fix its import to `custom_nodes.<name>.functions`)

No default -> socket. Default -> field on the node. The return value is the node's output.
Every `custom_nodes/*/nodes.py` is loaded at startup.

## Checks

    ruff check && ruff format --check && mypy
    cd nodeui && pnpm check                         # tsc + Biome
