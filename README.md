# Python Node UI

Turn plain Python functions into nodes, wire them up on a canvas, run the graph.

    nodecore/       the core: register functions, run graphs, serve the API
    nodeui/         the UI (talks to nodecore/ over the API in nodecore/server.py)
    nodes/          built-in nodes, plus example_workflows/
    custom_nodes/   your own node folders (gitignored, except example/)

`nodeui/` and `custom_nodes/` can be deleted without breaking headless runs.

## How node code works

The aim: any Python code, drawn as nodes (and nodes back to Python eventually).

Python code is words arranged by syntax: the words name things and hold values, and the syntax around them, line
order and indentation, gives the structure (this is an assignment, this a call, this a class). Nodes split the
same way:

- **An outer box is structure.** What it is (an assignment, a call, later a `def` or a `class`) and how the boxes
  inside it relate. It's what syntax and indentation are to Python.
- **An inner box is a typed slot.** Its type (str, int, float, bool) picks how you fill it: a text box, a number
  box, a toggle. It holds a value, or a wire.
- **A wire is a name used again.** It carries what one box makes into a slot of another, like writing a variable's
  name where it's needed. One wire = one use of the name.
- **Library code stays closed.** Registering a function is like importing it: you use it, you don't see inside.

So far:

- **Variable**: an assignment holding one inner box. Its name and type are set in the side panel:
  `greeting: str = "hello"`. It always has a value; a new one starts as `var_1: str = "<enter text here>"`.
- **Function**: a call of a registered function, an inner box per parameter: `split = split_text(text=greeting)`.

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
      "greeting": {"statement": "assign", "annotation": "str", "value": "a, b", "pos": [0, 0]},
      "split": {"fn": "split_text", "args": {"text": {"ref": "greeting"}}}
    }

is

    greeting: str = "a, b"
    split = split_text(text=greeting)

Each key is a node id. An argument is a plain value, or `{"ref": id}` (a wire) for another node's result.
Arguments left out use the function's defaults. `"pos"` is only for the UI.

## Add nodes

Copy `custom_nodes/example/` to `custom_nodes/<name>/`, then:

- `functions.py`: plain typed functions; nothing here knows about nodes
- `nodes.py`: `register(my_function)` (fix its import to `custom_nodes.<name>.functions`)

No default -> socket. Default -> field on the node. The return value is the node's output.
Every `custom_nodes/*/nodes.py` is loaded at startup.

## Checks

    ruff check && ruff format --check && mypy
    cd nodeui && pnpm check                         # tsc + Biome
