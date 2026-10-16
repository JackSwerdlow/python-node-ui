import type { Edge, Node } from "@xyflow/react";

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
  body: Record<string, RunResult> | null; // a subgraph's: the result for each name in its body, when it last ran
}

/** A graph: what the UI sends to /api/run. Per node, a statement binding its name: `name: str = "Ada"` (a
 *  variable), `name = greet(...)` (a call), or a subgraph's def and its call; see README, Graph files. */
export type GraphFile = Record<string, Statement>;

export type Statement =
  | { statement: "assign"; annotation?: ValueType; value: unknown; pos?: [number, number] }
  | {
      statement: "subgraph";
      params: Record<string, string>; // name: type
      body: GraphFile;
      returns: string[]; // the names returned (and bound where the subgraph is)
      args: Record<string, unknown>;
      io_pos?: { "@inputs": [number, number]; "@outputs": [number, number] }; // the Inputs and Outputs nodes'
      pos?: [number, number];
    };

/** A call, as a node's value in a graph file: the function's name, and its arguments (a wire is {"ref": name}). */
export interface Call {
  call: string;
  args: Record<string, unknown>;
}

/** The types a variable can have: a box to type its value in (text, a number, a toggle). */
export type ValueType = "str" | "int" | "float" | "bool";

/** A call of a registered function. values: what's typed into its slots, by parameter name (*args: a list;
 *  **kwargs: extra names). shown: which parameters show their box (a hidden one is left out of the call). hidden:
 *  which outputs hide their result, by output socket. */
export type CallNode = Node<
  {
    schema: NodeSchema;
    values: Record<string, unknown>;
    shown: Record<string, boolean>;
    hidden: Record<string, boolean>;
    result?: RunResult;
  },
  "call"
>;

/** A variable: `name: str = "hello"`. Its type picks the box its value is typed in. */
export type VariableNode = Node<{ annotation: ValueType; value: unknown }, "variable">;

/** A subgraph: a call of a def whose body is a graph (see README). Like a call node, but its function is read
 *  from its body: its params from the Inputs node, its outputs what's wired into the Outputs node. */
export type SubgraphNode = Node<Omit<CallNode["data"], "schema"> & { body: Body }, "subgraph">;

/** A canvas's nodes and wires: the graph's, or a subgraph's body. */
export interface Body {
  nodes: AnyNode[];
  edges: Edge[];
}

/** A subgraph's params, inside it: an output socket per param. args: what each was given when the subgraph last
 *  ran, to pass on to what's wired to it. */
export type InputsNode = Node<{ params: Param[]; args?: Record<string, unknown> }, "inputs">;

export interface Param {
  name: string;
  type: string;
}

/** A subgraph's outputs, inside it: a socket per wire into it, returned as the name (and type) it carries; plus an
 *  empty one, to wire a new output into. */
export type OutputsNode = Node<Record<string, never>, "outputs">;

export type AnyNode = CallNode | VariableNode | SubgraphNode | InputsNode | OutputsNode;
