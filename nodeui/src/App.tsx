import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { type ReactNode, useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./styles.css";

import { fetchNodes, fetchWorkflow, fetchWorkflows, runGraph } from "./api";
import { CallSettings, CallView, OpenSubgraph } from "./Call";
import { Code } from "./Code";
import {
  closeSubgraph,
  freeName,
  fromGraph,
  newCallData,
  newSubgraphData,
  type Opened,
  refName,
  reopen,
  STARTING_VALUE,
  scopeNames,
  withResults,
} from "./graph";
import { def, script } from "./python";
import { InputsSettings, InputsView, OutputsView } from "./Subgraph";
import type { AnyNode, Body, NodeSchema, SubgraphNode } from "./types";
import { VariableSettings, VariableView } from "./Variable";

const nodeTypes = {
  call: CallView,
  variable: VariableView,
  subgraph: CallView,
  inputs: InputsView,
  outputs: OutputsView,
};

function Editor() {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [panelWidth, setPanelWidth] = useState(300);
  // The subgraphs opened, outermost first: the canvas shows the last one's body (or the graph, if none are).
  const [opened, setOpened] = useState<Opened[]>([]);
  // Counts the times the canvas is replaced (a workflow loaded, a subgraph opened or left): each time, it's drawn
  // anew. Bodies share node ids ("@inputs", ...), and a node drawn again under the same id would keep where the
  // last one's sockets were.
  const [canvas, setCanvas] = useState(0);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    fetchNodes()
      .then(setSchemas)
      .catch((err: Error) => setError(err.message));
    fetchWorkflows()
      .then(setWorkflows)
      .catch((err: Error) => setError(err.message));
  }, []);

  const loadWorkflow = async (name: string) => {
    setError(null);
    try {
      const graph = fromGraph(await fetchWorkflow(name), schemas);
      setOpened([]);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setCanvas((c) => c + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // The subgraph open, if one is (the canvas is its body), and the names taken in the scope it's in: its outputs
  // can't be any of them.
  const parent = opened.at(-1);
  const outer = new Set(parent ? scopeNames(parent.nodes.filter((n) => n.id !== parent.id)).add(parent.id) : []);

  // One connection per input: a new one replaces the old, in its place (the order of a subgraph's outputs is the
  // order of the wires into its Outputs node). Into the Outputs node, a wire is an output, named by what it carries
  // (into the empty socket, "+", it adds one): not another output's name, or one taken outside.
  const onConnect = (c: Connection) => {
    let connection = c;
    if (c.target === "@outputs") {
      const others = edges.filter((e) => e.target === "@outputs" && e.targetHandle !== c.targetHandle);
      const name = refName({ ...c, id: "" }, nodes);
      if (outer.has(name) || others.some((e) => refName(e, nodes) === name)) {
        setError(`${name} can't be an output: it's one already, or a name where the subgraph is`);
        return;
      }
      if (c.targetHandle === "+")
        connection = { ...c, targetHandle: freeName(new Set(others.map((e) => e.targetHandle ?? "")), "out") };
    }
    setEdges((es) => {
      const at = es.findIndex((e) => e.target === connection.target && e.targetHandle === connection.targetHandle);
      if (at < 0) return addEdge(connection, es);
      const added = addEdge(
        connection,
        es.filter((_, n) => n !== at),
      );
      return [...added.slice(0, at), ...added.slice(-1), ...added.slice(at, -1)];
    });
  };

  // New nodes go in the middle of the screen.
  const centre = () => screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // `greet_result = greet(...)`
  const addNode = (schema: NodeSchema) => {
    const data = newCallData(schema);
    setNodes((ns) => [
      ...ns,
      { id: freeName(scopeNames(ns), `${schema.name}_result`), type: "call", position: centre(), width: 220, data },
    ]);
  };

  // `var: str = "<enter text here>"`
  const addVariable = () => {
    const data = { annotation: "str" as const, value: STARTING_VALUE.str };
    setNodes((ns) => [
      ...ns,
      { id: freeName(scopeNames(ns), "var"), type: "variable", position: centre(), width: 148, data },
    ]);
  };

  // `def subgraph() -> None: pass` and `subgraph()`: no params, no outputs.
  // Its name is free in the subgraphs it's inside too, so it doesn't hide theirs.
  const addSubgraph = () =>
    setNodes((ns) => [
      ...ns,
      {
        id: freeName(new Set([...scopeNames(ns), ...opened.flatMap((o) => [...scopeNames(o.nodes)])]), "subgraph"),
        type: "subgraph",
        position: centre(),
        width: 220,
        data: newSubgraphData(),
      },
    ]);

  const open = (id: string) => {
    const node = nodes.find((n) => n.id === id) as SubgraphNode;
    setOpened((o) => [...o, { id, nodes, edges }]);
    setNodes(node.data.body.nodes);
    setEdges(node.data.body.edges);
    setCanvas((c) => c + 1);
  };

  const back = () => {
    if (!parent) return;
    const view = closeSubgraph({ nodes, edges }, parent);
    setOpened((o) => o.slice(0, -1));
    setNodes(view.nodes);
    setEdges(view.edges);
    setCanvas((c) => c + 1);
  };

  // The whole graph, with every open subgraph closed.
  const root = (): Body => opened.reduceRight((view, parent) => closeSubgraph(view, parent), { nodes, edges });

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const graph = root();
      const results = await runGraph(graph.nodes, graph.edges);
      // Results go to every node, inside subgraphs too; then the subgraphs open are opened again.
      const { stack, view } = reopen(
        { ...graph, nodes: withResults(graph.nodes, results) },
        opened.map((o) => o.id),
      );
      setOpened(stack);
      setNodes(view.nodes);
      setEdges(view.edges);
    } catch (err) {
      setError((err as Error).message);
    }
    setRunning(false);
  };

  const selectedNodes = nodes.filter((n) => n.selected);
  const selected = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  return (
    <div className="app">
      {showPalette && (
        <aside className="palette">
          <h1>Nodes</h1>
          <button type="button" className="palette-item" title="name: type = value" onClick={addVariable}>
            Variable
          </button>
          <button
            type="button"
            className="palette-item"
            title="A def, its body a graph, and a call of it"
            onClick={addSubgraph}
          >
            Empty Subgraph
          </button>
          {schemas.map((s) => (
            <button key={s.name} type="button" className="palette-item" title={s.doc} onClick={() => addNode(s)}>
              {s.name}
            </button>
          ))}
        </aside>
      )}

      <main>
        <div className="toolbar">
          <button
            type="button"
            title={showPalette ? "Hide the nodes list" : "Show the nodes list"}
            onClick={() => setShowPalette((s) => !s)}
          >
            {showPalette ? "◀" : "▶"} Nodes
          </button>
          {parent && (
            <button type="button" title="Back to where this subgraph is" onClick={back}>
              ◀ Back
            </button>
          )}
          {parent && <span className="where">{opened.map((o) => o.id).join(" › ")}</span>}
          <button type="button" className="primary" onClick={run} disabled={running || nodes.length === 0}>
            {running ? "Running…" : "Run graph"}
          </button>
          <select value="" onChange={(e) => loadWorkflow(e.target.value)} disabled={workflows.length === 0}>
            <option value="" disabled>
              Load workflow
            </option>
            {workflows.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          {error && <span className="message error">{error}</span>}
        </div>

        <OpenSubgraph.Provider value={open}>
          <ReactFlow
            key={canvas}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#b8c2ca" />
            <Controls />
          </ReactFlow>
        </OpenSubgraph.Provider>
      </main>

      {/* The panel: the selected node's settings, or with none selected, the whole graph as Python. */}
      {selected ? (
        <Panel width={panelWidth} onResize={setPanelWidth}>
          <Settings node={selected} />
        </Panel>
      ) : parent ? (
        <Panel width={panelWidth} onResize={setPanelWidth}>
          <h2>
            {parent.id} <span className="type">subgraph</span>
          </h2>
          <h3>Python</h3>
          <Code lines={def(openSubgraph(parent, { nodes, edges })).map((text) => ({ text }))} />
        </Panel>
      ) : (
        nodes.length > 0 && (
          <Panel width={panelWidth} onResize={setPanelWidth}>
            <h2>Graph</h2>
            <h3>Python</h3>
            <Code lines={script(nodes, edges)} />
          </Panel>
        )
      )}
    </div>
  );
}

/** The panel's settings for a node, by its type. A subgraph's Outputs node has none: its outputs are what's wired in. */
function Settings({ node }: { node: AnyNode }) {
  if (node.type === "variable") return <VariableSettings key={node.id} node={node} />;
  if (node.type === "call" || node.type === "subgraph") return <CallSettings key={node.id} node={node} />;
  if (node.type === "inputs") return <InputsSettings key={node.id} node={node} />;
  return <h2>Outputs</h2>;
}

/** The open subgraph (the last opened), its body what's on the canvas. */
const openSubgraph = (parent: Opened, body: Body) => {
  const node = parent.nodes.find((n) => n.id === parent.id) as SubgraphNode;
  return { ...node, data: { ...node.data, body } };
};

/** The side panel, as wide as its left edge is dragged. */
function Panel({
  width,
  onResize,
  children,
}: {
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}) {
  const drag = (e: React.PointerEvent) => {
    e.preventDefault(); // no selecting text while dragging
    const [startX, startWidth] = [e.clientX, width];
    const move = (m: PointerEvent) => onResize(Math.min(900, Math.max(220, startWidth + startX - m.clientX)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <aside className="inspector" style={{ width }}>
      <div className="panel-grip" title="Drag to resize" onPointerDown={drag} />
      {children}
    </aside>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
