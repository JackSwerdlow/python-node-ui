import type { Node } from "@xyflow/react";

/** What GET /api/nodes describes; see nodecore/server.py. */
export interface NodeSchema {
  id: string;
  description: string;
  inputs: InputSchema[];
  output: string | null; // the return type, or null if the function returns nothing
}

export interface InputSchema {
  name: string;
  type: string;
  required: boolean; // no default: a socket; has a default: a field
  default: unknown;
}

export interface RunResult {
  status: "ok" | "error" | "skipped";
  result: unknown;
  error: string | null;
}

/** A graph: what the UI sends to /api/run. See nodecore/graph.py. */
export type GraphFile = Record<string, { fn: string; args?: Record<string, unknown>; pos?: [number, number] }>;

export type FnNode = Node<{ schema: NodeSchema; values: Record<string, unknown>; result?: RunResult }, "fn">;
