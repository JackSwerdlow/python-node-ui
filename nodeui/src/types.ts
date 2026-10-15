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

/** A graph: what the UI sends to /api/run. Per node, a variable or a function call; see README, Graph files. */
export type GraphFile = Record<
  string,
  | { fn: string; args?: Record<string, unknown>; pos?: [number, number] }
  | { statement: "assign"; annotation: ValueType; value: unknown; pos?: [number, number] }
>;

/** The types a variable can have: a box to type its value in (text, a number, a toggle). */
export type ValueType = "str" | "int" | "float" | "bool";

export type FnNode = Node<{ schema: NodeSchema; values: Record<string, unknown>; result?: RunResult }, "fn">;

/** A variable: `name: str = "hello"`. Its type picks the box its value is typed in. */
export type VariableNode = Node<{ annotation: ValueType; value: unknown; result?: RunResult }, "variable">;

export type AnyNode = FnNode | VariableNode;
