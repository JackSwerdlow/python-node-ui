/** A call node (see README) and its settings in the side panel. A slot per parameter, each a socket to
 *  wire into, plus a box to type its value in if its type has one and it's shown. Wired, the box is greyed out and
 *  shows what comes in. *args / **kwargs: as many slots as you add. One output: what the function returns.
 *
 *  A subgraph node is a call node too, its function read from its body (see graph.subgraphSchema): an output per
 *  name it returns, and a button to open it. */
import {
  type Edge,
  type NodeProps,
  useEdges,
  useNodeConnections,
  useNodes,
  useNodesData,
  useReactFlow,
} from "@xyflow/react";
import { createContext, useContext } from "react";
import { Code } from "./Code";
import { isName, isStarred, isValueType, outputsOf, outputValue, schemaOf, startingValue } from "./graph";
import { def, signature, statement } from "./python";
import { useResize } from "./Resize";
import type { AnyNode, CallNode, InputsNode, SubgraphNode, VariableNode } from "./types";
import { ValueBox, WiredBox } from "./ValueBox";
import { NameField, VarBox } from "./Variable";

/** Opens a subgraph, by id: its body replaces what's on the canvas. */
export const OpenSubgraph = createContext<(id: string) => void>(() => {});

export function CallView({ id, type, data, selected }: NodeProps<CallNode | SubgraphNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AnyNode>();
  const open = useContext(OpenSubgraph);
  const node = { id, type, data } as CallNode | SubgraphNode;
  const schema = schemaOf(node);
  const outputs = outputsOf(node);
  const { values, shown, hidden, result } = data;
  const { ref, grip } = useResize(id, 120);
  const incoming = useIncoming();
  const set = (next: Record<string, unknown>) => updateNodeData(id, { values: next });
  const named = new Set(schema.inputs.map((i) => i.name));

  const slots = schema.inputs.map((i) => {
    if (i.kind === "var_positional") {
      const items = (values[i.name] as unknown[] | undefined) ?? [];
      // Taking an item out moves the wires on the items after it up one.
      const remove = (n: number) => {
        set({ ...values, [i.name]: items.filter((_, m) => m !== n) });
        setEdges((es) =>
          es.flatMap((e): Edge[] => {
            const [name, index] = (e.targetHandle ?? "").split(".");
            if (e.target !== id || name !== i.name || Number(index) < n) return [e];
            if (Number(index) === n) return [];
            const handle = `${name}.${Number(index) - 1}`;
            return [{ ...e, id: `${e.source}->${id}.${handle}`, targetHandle: handle }];
          }),
        );
      };
      return (
        <div key={i.name}>
          {items.map((item, n) => (
            <Slot
              // biome-ignore lint/suspicious/noArrayIndexKey: an *args item has nothing but its place
              key={n}
              name={`${i.name}[${n}]`}
              type={i.type}
              socket={`${i.name}.${n}`}
              value={item}
              incoming={incoming}
              onChange={(v) => set({ ...values, [i.name]: items.map((x, m) => (m === n ? v : x)) })}
              onRemove={() => remove(n)}
            />
          ))}
          <AddButton
            text={`*${i.name}`}
            onClick={() => set({ ...values, [i.name]: [...items, startingValue(i.type)] })}
          />
        </div>
      );
    }
    if (i.kind === "var_keyword") {
      const add = () => {
        const name = window.prompt(`Name for the new **${i.name} item`)?.trim();
        if (name && isName(name) && !named.has(name) && !(name in values))
          set({ ...values, [name]: startingValue(i.type) });
      };
      const remove = (name: string) => {
        const { [name]: _, ...rest } = values;
        set(rest);
        setEdges((es) => es.filter((e) => !(e.target === id && e.targetHandle === name)));
      };
      return (
        <div key={i.name}>
          {Object.keys(values)
            .filter((name) => !named.has(name))
            .map((name) => (
              <Slot
                key={name}
                name={name}
                type={i.type}
                socket={name}
                value={values[name]}
                incoming={incoming}
                onChange={(v) => set({ ...values, [name]: v })}
                onRemove={() => remove(name)}
              />
            ))}
          <AddButton text={`**${i.name}`} onClick={add} />
        </div>
      );
    }
    return (
      <Slot
        key={i.name}
        name={i.name}
        type={i.type}
        socket={i.name}
        value={values[i.name]}
        incoming={incoming}
        box={!!shown[i.name]}
        onChange={(v) => set({ ...values, [i.name]: v })}
      />
    );
  });

  return (
    <div
      ref={ref}
      className={`node call ${type} ${selected ? "selected" : ""} ${result ? `status-${result.status}` : ""}`}
    >
      {grip}
      <header title={schema.doc}>
        <span className="name">{schema.name}</span>
        <span className="type">{type === "subgraph" ? "subgraph" : "func"}</span>
      </header>
      {slots}
      {schema.inputs.length > 0 && outputs.length > 0 && <div className="divider" />}
      {/* The last output fills the node (resized by its grip); any above it are resized by their own. */}
      {outputs.map((o, n) => (
        <VarBox
          key={o.socket}
          name={o.name}
          type={o.type}
          socket="source"
          socketId={o.socket}
          className={n === outputs.length - 1 ? "result" : ""}
        >
          {!hidden[o.socket] && (
            <div className="field-box wired nodrag nowheel">
              {result?.status === "ok" ? format(outputValue(node, o.socket)) : "-"}
            </div>
          )}
        </VarBox>
      ))}
      {type === "subgraph" && (
        <div className="row">
          <button type="button" className="slot-button nodrag" onClick={() => open(id)}>
            Open subgraph
          </button>
        </div>
      )}
      {result?.error && <p className="message error">{result.error}</p>}
    </div>
  );
}

/** What comes in on each of a node's wired sockets, by socket: a variable's value, or a call's (or subgraph
 *  output's) result once it has run. */
export function useIncoming(): Map<string | null, unknown> {
  const connections = useNodeConnections({ handleType: "target" });
  const sources = useNodesData<AnyNode>(connections.map((c) => c.source));
  return new Map(
    connections.map((c) => [
      c.targetHandle,
      outputOf(
        sources.find((s) => s.id === c.source),
        c.sourceHandle,
      ),
    ]),
  );
}

/** One parameter's slot: a variable's box with an input socket. Its value box shows if its type has one and box is
 *  on: greyed out with what comes in if it's wired. */
export function Slot({
  name,
  type,
  socket,
  value,
  incoming,
  box = true,
  onChange,
  onRemove,
}: {
  name: string;
  type: string;
  socket: string;
  value: unknown;
  incoming: Map<string | null, unknown>;
  box?: boolean;
  onChange: (value: unknown) => void;
  onRemove?: () => void;
}) {
  return (
    <VarBox name={name} type={type} socket="target" socketId={socket} onRemove={onRemove}>
      {box &&
        isValueType(type) &&
        (incoming.has(socket) ? (
          <WiredBox type={type} value={incoming.get(socket)} />
        ) : (
          <ValueBox type={type} value={value} onChange={onChange} />
        ))}
    </VarBox>
  );
}

/** The panel's settings for a call (or subgraph) node: its docstring, which parameters show their box, and
 *  which outputs show their result. A parameter whose type has no box can't show one. */
export function CallSettings({ node }: { node: CallNode | SubgraphNode }) {
  const { updateNodeData } = useReactFlow<AnyNode>();
  const schema = schemaOf(node);
  const outputs = outputsOf(node);
  const { shown, hidden } = node.data;
  // A call's function is described by its signature (its body is in its code); a subgraph's def is all there.
  const header = node.type === "subgraph" ? def(node) : signature(schema).split("\n");
  const edges = useEdges();
  const nodes = useNodes<AnyNode>();
  return (
    <>
      <h2>
        {schema.name} <span className="type">{node.type === "subgraph" ? "subgraph" : "func"}</span>
      </h2>
      {schema.doc && <p className="doc">{schema.doc}</p>}
      {node.type === "subgraph" ? (
        <>
          <h3>Name</h3>
          <NameField id={node.id} />
        </>
      ) : (
        schema.output && (
          <>
            <h3>Output var name</h3>
            <NameField id={node.id} />
          </>
        )
      )}
      <h3>Python</h3>
      <Code
        lines={[...header.map((text) => ({ text })), { text: "" }, { text: statement(node, nodes, edges), node }]}
      />
      <h3>Inputs</h3>
      {schema.inputs.map((i) =>
        isStarred(i) ? (
          <p className="check" key={i.name}>
            {i.kind === "var_positional" ? "*" : "**"}
            {i.name}: <span className="type">{i.type}</span>
          </p>
        ) : (
          <label className="check" key={i.name}>
            <span>
              {i.name}: <span className="type">{i.type}</span>
            </span>
            show
            <input
              type="checkbox"
              disabled={!isValueType(i.type)}
              checked={!!shown[i.name]}
              onChange={(e) => updateNodeData(node.id, { shown: { ...shown, [i.name]: e.target.checked } })}
            />
          </label>
        ),
      )}
      {outputs.length > 0 && (
        <>
          <h3>Output</h3>
          {outputs.map((o) => (
            <label className="check" key={o.socket}>
              <span>
                {o.name}: <span className="type">{o.type}</span>
              </span>
              show result
              <input
                type="checkbox"
                checked={!hidden[o.socket]}
                onChange={(e) => updateNodeData(node.id, { hidden: { ...hidden, [o.socket]: !e.target.checked } })}
              />
            </label>
          ))}
        </>
      )}
    </>
  );
}

export function AddButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div className="row">
      <button type="button" className="slot-button nodrag" onClick={onClick}>
        + {text}
      </button>
    </div>
  );
}

/** What a node gives its output wire (from socket): a variable's value, a call's result (a subgraph's output) once
 *  it has run, or a param's argument (a subgraph's Inputs node) once the subgraph has run; else undefined. */
const outputOf = (node: { id: string; type?: string; data: AnyNode["data"] } | undefined, socket: string | null) => {
  if (node?.type === "variable") return (node.data as VariableNode["data"]).value;
  if (node?.type === "inputs") return (node.data as InputsNode["data"]).args?.[socket ?? ""];
  if (node?.type !== "call" && node?.type !== "subgraph") return undefined;
  return outputValue(node as CallNode | SubgraphNode, socket);
};

export const format = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
