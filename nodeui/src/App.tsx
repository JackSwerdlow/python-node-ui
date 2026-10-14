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
import { initialValues, title } from "./graph";
import { NodeView } from "./NodeView";
import type { FnNode, NodeSchema } from "./types";

const nodeTypes = { fn: NodeView };

function Editor() {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FnNode>([]);
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

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const results = await runGraph(nodes, edges);
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, result: results[n.id] } })));
    } catch (err) {
      setError((err as Error).message);
    }
    setRunning(false);
  };

  return (
    <div className="app">
      <aside className="palette">
        <h1>Nodes</h1>
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
