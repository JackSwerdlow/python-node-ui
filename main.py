"""Serve the UI and API, or run a graph file without them.

python main.py               the UI + API on http://127.0.0.1:8000 (build the UI first: `pnpm build` in nodeui/)
python main.py --no-ui       just the API
python main.py graph.json    run a graph file and print each node's result
"""

import argparse
import importlib
import json
import sys
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

from nodecore import run_graph
from nodecore.server import app

ROOT = Path(__file__).parent
UI = ROOT / "nodeui" / "dist"


def load_nodes() -> None:
    """Import nodes/nodes.py and every custom_nodes/*/nodes.py; each registers its functions."""
    for path in [*ROOT.glob("nodes/nodes.py"), *sorted(ROOT.glob("custom_nodes/*/nodes.py"))]:
        importlib.import_module(".".join(path.relative_to(ROOT).with_suffix("").parts))


def main() -> None:
    """Load the nodes, then serve or run."""
    parser = argparse.ArgumentParser(description="Serve the UI and API, or run a graph file.")
    parser.add_argument("graph", nargs="?", type=Path, help="run this graph file instead of serving")
    parser.add_argument("--no-ui", action="store_true", help="serve just the API")
    args = parser.parse_args()

    load_nodes()

    if args.graph:
        graph = json.loads(args.graph.read_text(encoding="utf-8"))
        for nid, r in run_graph(graph).items():
            print(f"{nid}: {r.result!r}" if r.status == "ok" else f"{nid}: {r.status}, {r.error}")
        return

    if not args.no_ui:
        if not UI.is_dir():
            sys.exit("No built UI in nodeui/dist: run `pnpm build` in nodeui/, or use --no-ui.")
        app.mount("/", StaticFiles(directory=UI, html=True))  # after the /api routes, so they still match first
    uvicorn.run(app)


if __name__ == "__main__":
    main()
