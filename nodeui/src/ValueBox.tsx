/** The box a value is typed in, by its type: text, a number, or a True/False toggle. */
import { useEffect, useState } from "react";
import type { ValueType } from "./types";

export function ValueBox({
  type,
  value,
  onChange,
}: {
  type: ValueType;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
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

/** A box greyed out, showing a value that comes in by a wire: "-" until it's known (a call's, until it has run). */
export function WiredBox({ type, value }: { type: ValueType; value: unknown }) {
  const known = value !== undefined;
  if (type === "bool")
    return (
      <div className={`field-box toggle wired ${value === true ? "on" : ""}`}>
        {known ? (value ? "True" : "False") : "-"}
        <span className="dot" />
      </div>
    );
  const number = type === "int" || type === "float";
  const text = !known ? "-" : typeof value === "string" ? value : JSON.stringify(value);
  return <div className={`field-box wired nodrag nowheel ${number ? "number" : ""}`}>{text}</div>;
}
