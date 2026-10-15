/** A call node (see README) and its settings in the side panel. A slot per parameter, each a socket to
 *  wire into, plus a box to type its value in if its type has one and it's shown. Wired, the box is greyed out and
 *  shows what comes in. *args / **kwargs: as many slots as you add. One output: what the function returns. */
import { type Edge, type NodeProps, useEdges, useNodeConnections, useNodesData, useReactFlow } from "@xyflow/react";
import { Code } from "./Code";
import { isName, isStarred, isValueType, startingValue } from "./graph";
import { signature, statement } from "./python";
import { useResize } from "./Resize";
import type { AnyNode, CallNode, VariableNode } from "./types";
import { ValueBox, WiredBox } from "./ValueBox";
import { NameField, VarBox } from "./Variable";

export function CallView({ id, data, selected }: NodeProps<CallNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AnyNode>();
  const { schema, values, shown, showResult, result } = data;
  const { ref, grip } = useResize(id, 120);
  // What comes in on each wired socket: a variable's value, or a call's result once it has run.
  const connections = useNodeConnections({ handleType: "target" });
  const sources = useNodesData<AnyNode>(connections.map((c) => c.source));
  const incoming = new Map(connections.map((c) => [c.targetHandle, outputOf(sources.find((s) => s.id === c.source))]));
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
    <div ref={ref} className={`node call ${selected ? "selected" : ""} ${result ? `status-${result.status}` : ""}`}>
      {grip}
      <header title={schema.doc}>
        <span className="name">{schema.name}</span>
        <span className="type">func</span>
      </header>
      {slots}
      {schema.inputs.length > 0 && schema.output && <div className="divider" />}
      {schema.output && (
        <VarBox name={id} type={schema.output} socket="source" className="result">
          {showResult && (
            <div className="field-box wired nodrag nowheel">
              {result?.status === "ok" ? format(result.result) : "-"}
            </div>
          )}
        </VarBox>
      )}
      {result?.error && <p className="message error">{result.error}</p>}
    </div>
  );
}

/** One parameter's slot: a variable's box with an input socket. Its value box shows if its type has one and box is
 *  on: greyed out with what comes in if it's wired. */
function Slot({
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

/** The panel's settings for a call node: its docstring, which parameters show their box, and whether its
 *  result is shown. A parameter whose type has no box can't show one. */
export function CallSettings({ node }: { node: CallNode }) {
  const { updateNodeData } = useReactFlow<AnyNode>();
  const { schema, shown, showResult } = node.data;
  const edges = useEdges();
  return (
    <>
      <h2>
        {schema.name} <span className="type">func</span>
      </h2>
      {schema.doc && <p className="doc">{schema.doc}</p>}
      {schema.output && (
        <>
          <h3>Output var name</h3>
          <NameField id={node.id} />
        </>
      )}
      <h3>Python</h3>
      <Code
        lines={[
          ...signature(schema)
            .split("\n")
            .map((text) => ({ text })),
          { text: "" },
          { text: statement(node, edges), node },
        ]}
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
      {schema.output && (
        <>
          <h3>Output</h3>
          <label className="check">
            <span>
              {node.id}: <span className="type">{schema.output}</span>
            </span>
            show result
            <input
              type="checkbox"
              checked={showResult}
              onChange={(e) => updateNodeData(node.id, { showResult: e.target.checked })}
            />
          </label>
        </>
      )}
    </>
  );
}

function AddButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <div className="row">
      <button type="button" className="slot-button nodrag" onClick={onClick}>
        + {text}
      </button>
    </div>
  );
}

/** What a node gives its output wire: a variable's value, or a call's result once it has run (else undefined). */
const outputOf = (node: { type?: string; data: AnyNode["data"] } | undefined): unknown => {
  if (!node) return undefined;
  if (node.type === "variable") return (node.data as VariableNode["data"]).value;
  const result = (node.data as CallNode["data"]).result;
  return result?.status === "ok" ? result.result : undefined;
};

const format = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
