/** The variable node (`name: str = "hello"`, see README), its box (VarBox, also a call node's slots and result)
 *  and its settings in the side panel. */
import { Handle, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { type ReactNode, useState } from "react";
import { Code } from "./Code";
import { isName, STARTING_VALUE, VALUE_TYPES } from "./graph";
import { variableLine } from "./python";
import { useResize } from "./Resize";
import type { AnyNode, ValueType, VariableNode } from "./types";
import { ValueBox } from "./ValueBox";

export function VariableView({ id, data, selected }: NodeProps<VariableNode>) {
  const { updateNodeData } = useReactFlow<AnyNode>();
  const { annotation, value } = data;
  const number = annotation === "int" || annotation === "float";
  const { ref, grip } = useResize(id, number ? 80 : 120);

  return (
    <div ref={ref} className={`node variable ${number ? "number" : ""} ${selected ? "selected" : ""}`}>
      {grip}
      <VarBox name={id} type={annotation} socket="source">
        <ValueBox type={annotation} value={value} onChange={(v) => updateNodeData(id, { value: v })} />
      </VarBox>
    </div>
  );
}

/** A variable's box: a grey top with its name and type, and below it, if it has one (children), the box its value
 *  is in. On its own it's a variable node, with an output socket; inside a call node it's a parameter's slot,
 *  with an input socket, or what the function returns. */
export function VarBox({
  name,
  type,
  socket,
  socketId = "result",
  className = "",
  onRemove,
  children,
}: {
  name: string;
  type: string;
  socket?: "source" | "target";
  socketId?: string;
  className?: string;
  onRemove?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`var-box ${className}`}>
      {/* The socket is level with the grey top, whether or not the value box shows. */}
      <div className="var-head">
        {socket && (
          <Handle
            type={socket}
            id={socketId}
            position={socket === "source" ? Position.Right : Position.Left}
            className="socket"
          />
        )}
        <span className="name">{name}</span>
        <span className="type">{type}</span>
        {onRemove && (
          <button type="button" className="slot-button nodrag" title="Remove" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {children ? <div className="var-body">{children}</div> : null}
    </div>
  );
}

/** The panel's settings for a variable: its name and its type. */
export function VariableSettings({ node }: { node: VariableNode }) {
  const { updateNodeData } = useReactFlow<AnyNode>();

  return (
    <>
      <h2>Variable</h2>
      <h3>Name</h3>
      <NameField id={node.id} />
      <h3>Type</h3>
      {/* A new type starts its value again: it was typed for the old one. */}
      <select
        value={node.data.annotation}
        onChange={(e) => {
          const annotation = e.target.value as ValueType;
          updateNodeData(node.id, { annotation, value: STARTING_VALUE[annotation] });
        }}
      >
        {VALUE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <h3>Python</h3>
      <Code lines={[{ text: variableLine(node), node }]} />
    </>
  );
}

/** A node's Python name (its id): a variable's, or what a call node's result is assigned to. Renaming it renames
 *  every use (its wires follow). It can't be another node's, or a function's in the graph (that would hide it). */
export function NameField({ id }: { id: string }) {
  const { setNodes, setEdges, getNodes } = useReactFlow<AnyNode>();
  const [name, setName] = useState(id);
  const taken = (n: string) => getNodes().some((m) => m.id === n || (m.type === "call" && m.data.schema.name === n));
  const problem = !isName(name) ? "Not a Python name" : name !== id && taken(name) ? `${name} is taken` : null;
  const commit = () => {
    if (problem || name === id) return;
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, id: name } : n)));
    // Its wires follow it, both ways: out of it, and into it (a call node's inputs).
    setEdges((es) =>
      es.map((e) => ({ ...e, source: e.source === id ? name : e.source, target: e.target === id ? name : e.target })),
    );
  };
  return (
    <>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {problem && <p className="message error">{problem}</p>}
    </>
  );
}
