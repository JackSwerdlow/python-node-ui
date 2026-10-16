/** Inside a subgraph (see README): its Inputs node (its params) and its Outputs node (what it returns), and the
 *  Inputs node's settings in the side panel. Outside, a subgraph is a call node (see Call.tsx). */
import { type NodeProps, useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { AddButton } from "./Call";
import { isName, refName, refType, scopeNames } from "./graph";
import { useResize } from "./Resize";
import type { AnyNode, InputsNode, OutputsNode, Param } from "./types";
import { VarBox } from "./Variable";

/** A subgraph's params, each an output socket to wire into its body. */
export function InputsView({ id, data, selected }: NodeProps<InputsNode>) {
  const { updateNodeData, setEdges, getNodes } = useReactFlow<AnyNode>();
  const { ref, grip } = useResize(id, 120);
  const add = () => {
    const name = window.prompt("Name for the new input")?.trim();
    if (name && isName(name) && !scopeNames(getNodes()).has(name))
      updateNodeData(id, { params: [...data.params, { name, type: "str" }] });
  };
  const remove = (name: string) => {
    updateNodeData(id, { params: data.params.filter((p) => p.name !== name) });
    setEdges((es) => es.filter((e) => !(e.source === id && e.sourceHandle === name)));
  };
  return (
    <div ref={ref} className={`node call io ${selected ? "selected" : ""}`}>
      {grip}
      <header>
        <span className="name">Inputs</span>
      </header>
      {data.params.map((p) => (
        <VarBox
          key={p.name}
          name={p.name}
          type={p.type}
          socket="source"
          socketId={p.name}
          onRemove={() => remove(p.name)}
        />
      ))}
      <AddButton text="input" onClick={add} />
    </div>
  );
}

/** A subgraph's outputs: a socket per wire into it, showing the name and type it carries (what's returned), and an
 *  empty socket to wire a new one into (see App's onConnect). Removing one takes its wire out. */
export function OutputsView({ id, selected }: NodeProps<OutputsNode>) {
  const { setEdges } = useReactFlow<AnyNode>();
  const { ref, grip } = useResize(id, 120);
  const edges = useEdges();
  const nodes = useNodes<AnyNode>();
  return (
    <div ref={ref} className={`node call io ${selected ? "selected" : ""}`}>
      {grip}
      <header>
        <span className="name">Outputs</span>
      </header>
      {edges
        .filter((e) => e.target === id)
        .map((e) => (
          <VarBox
            key={e.targetHandle}
            name={refName(e, nodes)}
            type={refType(e, nodes)}
            socket="target"
            socketId={e.targetHandle ?? ""}
            onRemove={() => setEdges((es) => es.filter((x) => x.id !== e.id))}
          />
        ))}
      <VarBox name="wire in to add" type="" socket="target" socketId="+" className="empty" />
    </div>
  );
}

/** The panel's settings for a subgraph's Inputs node: each param's name and type. */
export function InputsSettings({ node }: { node: InputsNode }) {
  return (
    <>
      <h2>Inputs</h2>
      {node.data.params.map((p) => (
        <ParamField key={p.name} id={node.id} param={p} />
      ))}
    </>
  );
}

/** A param's name and type. Renamed, its wires inside follow; wires into it outside are taken out. */
function ParamField({ id, param }: { id: string; param: Param }) {
  const { updateNodeData, setEdges, getNodes } = useReactFlow<AnyNode>();
  const [name, setName] = useState(param.name);
  const problem = !isName(name)
    ? "Not a Python name"
    : name !== param.name && scopeNames(getNodes()).has(name)
      ? `${name} is taken`
      : null;
  const params = () => (getNodes().find((n) => n.id === id) as InputsNode).data.params;
  const set = (changed: Param) =>
    updateNodeData(id, { params: params().map((p) => (p.name === param.name ? changed : p)) });
  const commit = () => {
    if (problem || name === param.name) return;
    set({ ...param, name });
    setEdges((es) =>
      es.map((e) => (e.source === id && e.sourceHandle === param.name ? { ...e, sourceHandle: name } : e)),
    );
  };
  return (
    <>
      <h3>{param.name}</h3>
      <div className="check">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <input
          className="type-field"
          value={param.type}
          title="Type"
          onChange={(e) => set({ ...param, type: e.target.value })}
        />
      </div>
      {problem && <p className="message error">{problem}</p>}
    </>
  );
}
