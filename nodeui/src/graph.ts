import type { Edge } from "@xyflow/react";
import type { AnyNode, GraphFile, NodeSchema, ValueType } from "./types";

/** The canvas as a graph file (see README): field values stay values, connections become {ref} arguments. */
export function toGraph(nodes: AnyNode[], edges: Edge[]): GraphFile {
  return Object.fromEntries(
    nodes.map((n) => {
      const pos: [number, number] = [Math.round(n.position.x), Math.round(n.position.y)];
      if (n.type === "variable") {
        const { annotation, value } = n.data;
        return [n.id, { statement: "assign", annotation, value, pos }];
      }
      const refs = edges.filter((e) => e.target === n.id).map((e) => [e.targetHandle ?? "", { ref: e.source }]);
      return [n.id, { fn: n.data.schema.id, args: { ...n.data.values, ...Object.fromEntries(refs) }, pos }];
    }),
  );
}

/** Field defaults for a new node. Sockets get no value. */
export function initialValues(schema: NodeSchema): Record<string, unknown> {
  return Object.fromEntries(schema.inputs.filter((i) => !i.required).map((i) => [i.name, i.default]));
}

/** The types a variable can have. */
export const VALUE_TYPES: ValueType[] = ["str", "int", "float", "bool"];

/** What a new variable of each type holds. */
export const STARTING_VALUE: Record<ValueType, unknown> = { str: "<enter text here>", int: 0, float: 0.0, bool: false };

/** A new variable's name: var_1, var_2, ... whichever is free. */
export function freeName(nodes: AnyNode[]): string {
  const taken = new Set(nodes.map((n) => n.id));
  let n = 1;
  while (taken.has(`var_${n}`)) n++;
  return `var_${n}`;
}

/** Whether a name can be a Python variable's. (Keywords aren't caught yet.) */
export const isName = (name: string) => /^[A-Za-z_]\w*$/.test(name);

/** "split_text" -> "split text". */
export const label = (name: string) => name.replace(/_/g, " ");

/** "split_text" -> "Split text". */
export const title = (name: string) => label(name).replace(/^./, (c) => c.toUpperCase());
