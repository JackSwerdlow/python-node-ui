/** The variable node (`name: str = "hello"`, see README) and its settings in the side panel. */
import { Handle, type NodeProps, NodeResizeControl, Position, useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isName, STARTING_VALUE, VALUE_TYPES } from "./graph";
import type { AnyNode, ValueType, VariableNode } from "./types";

export function VariableView({ id, data, selected, width, height }: NodeProps<VariableNode>) {
  const { updateNodeData, updateNode } = useReactFlow<AnyNode>();
  const { annotation, value, result } = data;
  const number = annotation === "int" || annotation === "float";
  const minWidth = number ? 80 : 120;
  const ref = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(60);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what's in the node changes its height
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0";
    const min = node.scrollHeight + node.offsetHeight - node.clientHeight; // + its borders
    node.style.height = "";
    setMinHeight(min);
    if (width !== undefined && width < minWidth) updateNode(id, { width: minWidth });
    if (height !== undefined && height < min) updateNode(id, { height: min });
  }, [id, annotation, value, result, width, height]);

  return (
    <div
      ref={ref}
      className={`node variable ${number ? "number" : ""} ${selected ? "selected" : ""} ${result ? `status-${result.status}` : ""}`}
    >
      {/* Drag the bottom-right corner to resize; a name too long for the width is cut short ("varia…"). */}
      <NodeResizeControl position="bottom-right" minWidth={minWidth} minHeight={minHeight} className="grip" />
      <header>
        <span className="name">{id}</span>
        <span className="type">{annotation}</span>
      </header>
      <div className="row">
        <ValueBox type={annotation} value={value} onChange={(v) => updateNodeData(id, { value: v })} />
        <Handle type="source" id="result" position={Position.Right} className="socket" />
      </div>
      {result?.error && <p className="message error">{result.error}</p>}
    </div>
  );
}

/** The box a value is typed in, picked by its type: text, a number, or a True/False toggle. */
function ValueBox({ type, value, onChange }: { type: ValueType; value: unknown; onChange: (v: unknown) => void }) {
  if (type === "bool") {
    // The dot is filled when True.
    return (
      <button type="button" className={`field-box toggle nodrag ${value ? "on" : ""}`} onClick={() => onChange(!value)}>
        {value ? "True" : "False"}
        <span className="dot" />
      </button>
    );
  }
  if (type === "int" || type === "float")
    return <NumberBox float={type === "float"} value={value} onChange={onChange} />;
  // Text wraps onto more lines rather than running on in one.
  return (
    <textarea
      rows={1}
      className="field-box nodrag nowheel"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A number box. It keeps the text as typed (so "2." can become "2.5"), and shows a whole float as one: 0.0. An int
 *  box takes whole numbers only: "." can't be typed, and a pasted decimal is refused. Emptied, it keeps the last
 *  number (put back when you click away). */
function NumberBox({ float, value, onChange }: { float: boolean; value: unknown; onChange: (v: number) => void }) {
  const [text, setText] = useState(numberText(value, float));
  // A value changed from outside (not by typing here) replaces the text.
  useEffect(() => {
    setText((t) => (t !== "" && Number(t) === value ? t : numberText(value, float)));
  }, [value, float]);
  return (
    <input
      type="number"
      step={float ? "any" : 1}
      className="field-box nodrag"
      value={text}
      onKeyDown={(e) => !float && [".", ",", "e", "E"].includes(e.key) && e.preventDefault()}
      onChange={(e) => {
        if (!float && e.target.value !== "" && !Number.isInteger(Number(e.target.value))) return;
        setText(e.target.value);
        if (e.target.value !== "") onChange(Number(e.target.value));
      }}
      onBlur={() => setText(numberText(value, float))}
    />
  );
}

const numberText = (value: unknown, float: boolean) =>
  typeof value !== "number" ? "" : float && Number.isInteger(value) ? value.toFixed(1) : String(value);

/** The panel's settings for a variable: its name (renaming it renames every use: its wires follow) and its type. */
export function VariableSettings({ node }: { node: VariableNode }) {
  const { setNodes, setEdges, getNodes, updateNodeData } = useReactFlow<AnyNode>();
  const [name, setName] = useState(node.id);
  const problem = !isName(name)
    ? "Not a Python name"
    : name !== node.id && getNodes().some((n) => n.id === name)
      ? `${name} is taken`
      : null;
  const commit = () => {
    if (problem || name === node.id) return;
    setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, id: name } : n)));
    setEdges((es) => es.map((e) => (e.source === node.id ? { ...e, source: name } : e)));
  };

  return (
    <>
      <h2>Variable</h2>
      <h3>Name</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {problem && <p className="message error">{problem}</p>}
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
    </>
  );
}
