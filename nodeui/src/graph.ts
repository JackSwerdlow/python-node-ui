import type { Edge } from "@xyflow/react";
import type { AnyNode, CallNode, GraphFile, InputSchema, NodeSchema, ValueType } from "./types";

/** The canvas as a graph file (see README): typed values stay values, wires become {ref} arguments. */
export function toGraph(nodes: AnyNode[], edges: Edge[]): GraphFile {
  return Object.fromEntries(
    nodes.map((n) => {
      const pos: [number, number] = [Math.round(n.position.x), Math.round(n.position.y)];
      if (n.type === "variable") {
        const { annotation, value } = n.data;
        return [n.id, { statement: "assign", annotation, value, pos }];
      }
      // A parameter's box is passed if it's shown; *args / **kwargs items always are. A wire replaces what's typed
      // in its slot: "text", or "parts.1" for an *args item.
      const { schema, values, shown } = n.data;
      const args = Object.fromEntries(
        Object.entries(values).filter(([name]) => {
          const input = schema.inputs.find((i) => i.name === name);
          return !input || isStarred(input) || shown[name];
        }),
      );
      for (const e of edges.filter((e) => e.target === n.id)) {
        const [name, index] = (e.targetHandle ?? "").split(".");
        const ref = { ref: e.source };
        if (index === undefined) args[name] = ref;
        else args[name] = (args[name] as unknown[]).map((item, i) => (i === Number(index) ? ref : item));
      }
      return [n.id, { statement: "assign", value: { call: schema.name, args }, pos }];
    }),
  );
}

/** A new call node. A parameter whose type has a box shows it if it has a default, holding the default; one
 *  with no default has its box hidden, holding its type's starting value for when it's shown. *args starts with no
 *  items. */
export function newCallData(schema: NodeSchema): CallNode["data"] {
  const typed = schema.inputs.filter((i) => !isStarred(i) && isValueType(i.type));
  const values: Record<string, unknown> = Object.fromEntries(
    typed.map((i) => [i.name, i.required ? startingValue(i.type) : i.default]),
  );
  for (const i of schema.inputs) if (i.kind === "var_positional") values[i.name] = [];
  const shown = Object.fromEntries(typed.map((i) => [i.name, !i.required]));
  return { schema, values, shown, showResult: true };
}

/** Whether a parameter is *args or **kwargs: as many slots as you add. */
export const isStarred = (input: InputSchema) => input.kind === "var_positional" || input.kind === "var_keyword";

/** Whether a parameter has a default in Python. */
export const hasDefault = (input: InputSchema) => !input.required && !isStarred(input);

/** Whether a type has a box to type its value in. */
export const isValueType = (type: string): type is ValueType => (VALUE_TYPES as string[]).includes(type);

/** The types with a box to type a value in: a variable's, or a function slot's. */
export const VALUE_TYPES: ValueType[] = ["str", "int", "float", "bool"];

/** What a new box of each type holds. */
export const STARTING_VALUE: Record<ValueType, unknown> = { str: "<enter text here>", int: 0, float: 0.0, bool: false };

/** What a new box of a type holds: its starting value, or null if the type has no box. */
export const startingValue = (type: string) => (isValueType(type) ? STARTING_VALUE[type] : null);

/** A new node's name: base, else base_2, base_3, ... whichever is free. A variable's base is "var", a call's
 *  "<function>_result". */
export function freeName(nodes: AnyNode[], base: string): string {
  const taken = new Set(nodes.map((n) => n.id));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** Whether a name can be a Python variable's. (Keywords aren't caught yet.) */
export const isName = (name: string) => /^[A-Za-z_]\w*$/.test(name);
