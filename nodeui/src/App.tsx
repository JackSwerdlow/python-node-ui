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
import { useCallback, useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./styles.css";

import { fetchNodes, runGraph } from "./api";
import { freeName, initialValues, STARTING_VALUE, title } from "./graph";
import { NodeView } from "./NodeView";
import type { AnyNode, NodeSchema } from "./types";
import { VariableSettings, VariableView } from "./Variable";

const nodeTypes = { fn: NodeView, variable: VariableView };

function Editor() {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    fetchNodes()
      .then(setSchemas)
      .catch((err: Error) => setError(err.message));
  }, []);

  // One connection per input: a new one replaces the old.
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          c,
          eds.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle)),
        ),
      ),
    [setEdges],
  );

  const addNode = (schema: NodeSchema) => {
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = `${schema.id}-${crypto.randomUUID().slice(0, 8)}`;
    setNodes((ns) => [...ns, { id, type: "fn", position: centre, data: { schema, values: initialValues(schema) } }]);
  };

  // `var_1: str = "<enter text here>"`
  const addVariable = () => {
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const data = { annotation: "str" as const, value: STARTING_VALUE.str };
    setNodes((ns) => [...ns, { id: freeName(ns), type: "variable", position: centre, width: 148, data }]);
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const results = await runGraph(nodes, edges);
      // Either kind of node keeps its own data, with the result added.
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, result: results[n.id] } }) as AnyNode));
    } catch (err) {
      setError((err as Error).message);
    }
    setRunning(false);
  };

  const selectedNodes = nodes.filter((n) => n.selected);
  const selected = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  return (
    <div className="app">
      <aside className="palette">
        <h1>Nodes</h1>
        <button type="button" className="palette-item" title="name: type = value" onClick={addVariable}>
          Variable
        </button>
        {schemas.map((s) => (
          <button key={s.id} type="button" className="palette-item" title={s.description} onClick={() => addNode(s)}>
            {title(s.id)}
          </button>
        ))}
      </aside>

      <main>
        <div className="toolbar">
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

      {/* The panel for the selected variable: its name and type. */}
      {selected?.type === "variable" && (
        <aside className="inspector">
          <VariableSettings key={selected.id} node={selected} />
        </aside>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
