# Python Node UI

Turn plain Python functions into nodes, wire them up on a canvas, run the graph.

    nodecore/       the core: register functions, run graphs, serve the API
    nodeui/         the UI (talks to nodecore/ over the API in nodecore/server.py)
    nodes/          built-in nodes, plus example_workflows/
    custom_nodes/   your own node folders (gitignored, except example/)

`nodeui/` and `custom_nodes/` can be deleted without breaking headless runs.

## How node code works

The aim: any Python code drawn as nodes, and nodes written back as Python.

Python code is words arranged by syntax: the words name things and hold values, and the syntax around them, line
order and indentation, gives the structure (this is an assignment, this a call, this a class). Nodes split the
same way:

- **An outer box is structure.** A statement (an assignment so far, later a `def` or a `class`) and how the boxes
  inside it relate. It's what syntax and indentation are to Python.
- **An inner box is a typed slot.** Its type picks how you fill it: a text box (str), a number box (int, float), a
  toggle (bool); any other type only by a wire. It holds a value, or a wire.
- **A wire is a name used again.** It carries what one box makes into a slot of another, like writing a variable's
  name where it's needed. One wire = one use of the name.
- **Library code stays closed.** Registering a function is like importing it: you use it, you don't see inside.

So far:

- **Variable**: an assignment holding one inner box. Its name and type are set in the side panel:
  `greeting: str = "hello"`. It always has a value; a new one starts as `var: str = "<enter text here>"`.
- **Call**: a call of a registered function, an inner box per parameter, its result assigned to the node's name
  (set in the side panel): `readme = read_text(path=path)`.

With no node selected, the side panel shows the whole graph written as a Python script.

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
    python main.py nodes/example_workflows/readme_report.json    # run a graph, no server

Working on the UI: `pnpm dev` in `nodeui/` alongside `python main.py --no-ui` gives live reload
on http://127.0.0.1:5173.

## Graph files

The UI sends this same JSON to the API when you press Run; `python main.py graph.json` runs it directly:

    {
      "path": {"statement": "assign", "annotation": "str", "value": "README.md", "pos": [0, 0]},
      "readme": {"statement": "assign", "value": {"call": "read_text", "args": {"path": {"ref": "path"}}}}
    }

is

    path: str = "README.md"
    readme = read_text(path=path)

Each key is a node's name. Each node is a statement binding it; only `"assign"` (`name = value`) so far, `def` and
`class` to come. A value is a literal, or a call: `{"call": function, "args": {...}}`. An argument is a literal, or
`{"ref": name}`, a wire from that node. Arguments left out use the function's defaults. `"pos"` is only for the UI.

## Add nodes

Copy `custom_nodes/example/` to `custom_nodes/<name>/`, then:

- `functions.py`: plain typed functions; nothing here knows about nodes
- `nodes.py`: `register(my_function)` (fix its import to `custom_nodes.<name>.functions`)

Each parameter is a slot to wire into; a str, int, float or bool one also has a box to type in, shown if it has a
default (toggle it in the side panel). The return value is the node's output.
Every `custom_nodes/*/nodes.py` is loaded at startup.

## Checks

    ruff check && ruff format --check && mypy
    cd nodeui && pnpm check                         # tsc + Biome
