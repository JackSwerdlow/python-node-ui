import type { Node } from "@xyflow/react";

/** What GET /api/nodes describes; see nodecore/server.py. */
export interface NodeSchema {
  name: string; // the function's
  module: string; // where it's imported from
  doc: string; // its docstring
  inputs: InputSchema[];
  output: string | null; // the return type, or null if the function returns nothing
}

export interface InputSchema {
  name: string;
  type: string;
  required: boolean; // no default
  default: unknown;
  kind: "positional_only" | "positional_or_keyword" | "var_positional" | "keyword_only" | "var_keyword";
}

export interface RunResult {
  status: "ok" | "error" | "skipped";
  result: unknown;
  error: string | null;
}

/** A graph: what the UI sends to /api/run. Per node, a statement binding its name: `name: str = "Ada"` (a
 *  variable) or `name = greet(...)` (a call); see README, Graph files. */
export type GraphFile = Record<
  string,
  { statement: "assign"; annotation?: ValueType; value: unknown; pos?: [number, number] }
>;

/** A call, as a node's value in a graph file: the function's name, and its arguments (a wire is {"ref": name}). */
export interface Call {
  call: string;
  args: Record<string, unknown>;
}

/** The types a variable can have: a box to type its value in (text, a number, a toggle). */
export type ValueType = "str" | "int" | "float" | "bool";

/** A call of a registered function. values: what's typed into its slots, by parameter name (*args: a list;
 *  **kwargs: extra names). shown: which parameters show their box (a hidden one is left out of the call). */
export type CallNode = Node<
  {
    schema: NodeSchema;
    values: Record<string, unknown>;
    shown: Record<string, boolean>;
    showResult: boolean;
    result?: RunResult;
  },
  "call"
>;

/** A variable: `name: str = "hello"`. Its type picks the box its value is typed in. */
export type VariableNode = Node<{ annotation: ValueType; value: unknown }, "variable">;

export type AnyNode = CallNode | VariableNode;
