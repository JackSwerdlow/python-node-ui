/** One field on a node. The widget is picked from the input's type. */
import { label } from "./graph";
import type { InputSchema } from "./types";

export function Field({
  input,
  value,
  onChange,
}: {
  input: InputSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (input.type === "bool") {
    return (
      <label className="field field-inline">
        <input
          type="checkbox"
          className="nodrag"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label(input.name)}
      </label>
    );
  }

  const isNumber = input.type === "int" || input.type === "float";
  return (
    <label className="field">
      <span>{label(input.name)}</span>
      <input
        type={isNumber ? "number" : "text"}
        className="nodrag"
        value={String(value ?? "")}
        onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
      />
    </label>
  );
}
