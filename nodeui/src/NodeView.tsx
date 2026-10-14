/** The one generic node: inputs without defaults as sockets, inputs with defaults as fields,
 *  and the last run's result underneath. */
import { Handle, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { Field } from "./Field";
import { label, title } from "./graph";
import type { FnNode } from "./types";

export function NodeView({ id, data, selected }: NodeProps<FnNode>) {
  const { updateNodeData } = useReactFlow();
  const { schema, values, result } = data;
  const sockets = schema.inputs.filter((i) => i.required);
  const fields = schema.inputs.filter((i) => !i.required);
  const setValue = (name: string, value: unknown) => updateNodeData(id, { values: { ...values, [name]: value } });

  return (
    <div className={`node ${selected ? "selected" : ""} ${result ? `status-${result.status}` : ""}`}>
      <header title={schema.description}>{title(schema.id)}</header>

      <div className="rows">
        {sockets.map((i) => (
          <div className="row" key={i.name}>
            <Handle type="target" id={i.name} position={Position.Left} className="socket" />
            <span>{label(i.name)}</span>
            <span className="type">{i.type}</span>
          </div>
        ))}
        {schema.output && (
          <div className="row row-out">
            <span className="type">{schema.output}</span>
            <span>result</span>
            <Handle type="source" id="result" position={Position.Right} className="socket" />
          </div>
        )}
      </div>

      {fields.length > 0 && (
        <div className="fields">
          {fields.map((i) => (
            <Field key={i.name} input={i} value={values[i.name]} onChange={(v) => setValue(i.name, v)} />
          ))}
        </div>
      )}

      {result?.error && <p className="message error">{result.error}</p>}

      {result?.status === "ok" && schema.output && <pre className="output nodrag nowheel">{format(result.result)}</pre>}
    </div>
  );
}

const format = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
