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

import { fetchNodes, runGraph } from "./api";
import { CallSettings, CallView } from "./Call";
import { Code } from "./Code";
import { freeName, newCallData, STARTING_VALUE } from "./graph";
import { script } from "./python";
import type { AnyNode, NodeSchema } from "./types";
import { VariableSettings, VariableView } from "./Variable";

const nodeTypes = { call: CallView, variable: VariableView };

function Editor() {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [panelWidth, setPanelWidth] = useState(300);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    fetchNodes()
      .then(setSchemas)
      .catch((err: Error) => setError(err.message));
  }, []);

  // One connection per input: a new one replaces the old.
  const onConnect = (c: Connection) =>
    setEdges((es) =>
      addEdge(
        c,
        es.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle)),
      ),
    );

  // New nodes go in the middle of the screen.
  const centre = () => screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // `greet_result = greet(...)`
  const addNode = (schema: NodeSchema) => {
    const data = newCallData(schema);
    setNodes((ns) => [
      ...ns,
      { id: freeName(ns, `${schema.name}_result`), type: "call", position: centre(), width: 220, data },
    ]);
  };

  // `var: str = "<enter text here>"`
  const addVariable = () => {
    const data = { annotation: "str" as const, value: STARTING_VALUE.str };
    setNodes((ns) => [...ns, { id: freeName(ns, "var"), type: "variable", position: centre(), width: 148, data }]);
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const results = await runGraph(nodes, edges);
      // Only call nodes show a result: a variable isn't run, it just holds its value.
      setNodes((ns) => ns.map((n) => (n.type === "call" ? { ...n, data: { ...n.data, result: results[n.id] } } : n)));
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
          <button type="button" className="primary" onClick={run} disabled={running || nodes.length === 0}>
            {running ? "Running…" : "Run graph"}
          </button>
          {error && <span className="message error">{error}</span>}
        </div>

        <ReactFlow
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
      </main>

      {/* The panel: the selected node's settings, or with none selected, the whole graph as Python. */}
      {selected ? (
        <Panel width={panelWidth} onResize={setPanelWidth}>
          {selected.type === "variable" ? (
            <VariableSettings key={selected.id} node={selected} />
          ) : (
            <CallSettings key={selected.id} node={selected} />
          )}
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
