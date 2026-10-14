import type { Edge } from "@xyflow/react";
import type { FnNode, GraphFile, NodeSchema } from "./types";

/** The canvas as a graph file: field values stay values, connections become {ref} arguments. */
export function toGraph(nodes: FnNode[], edges: Edge[]): GraphFile {
  return Object.fromEntries(
    nodes.map((n) => {
      const refs = edges.filter((e) => e.target === n.id).map((e) => [e.targetHandle ?? "", { ref: e.source }]);
      const pos: [number, number] = [Math.round(n.position.x), Math.round(n.position.y)];
      return [n.id, { fn: n.data.schema.id, args: { ...n.data.values, ...Object.fromEntries(refs) }, pos }];
    }),
  );
}

/** Field defaults for a new node. Sockets get no value. */
export function initialValues(schema: NodeSchema): Record<string, unknown> {
  return Object.fromEntries(schema.inputs.filter((i) => !i.required).map((i) => [i.name, i.default]));
}

/** "split_text" -> "split text". */
export const label = (name: string) => name.replace(/_/g, " ");

/** "split_text" -> "Split text". */
export const title = (name: string) => label(name).replace(/^./, (c) => c.toUpperCase());
