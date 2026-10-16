import type { Edge, XYPosition } from "@xyflow/react";
import type {
  AnyNode,
  Body,
  Call,
  CallNode,
  GraphFile,
  InputSchema,
  InputsNode,
  NodeSchema,
  OutputsNode,
  Param,
  RunResult,
  Statement,
  SubgraphNode,
  ValueType,
} from "./types";

/** The canvas as a graph file (see README): typed values stay values, wires become {ref} arguments. A subgraph is
 *  a call node's arguments, plus its def: its body as its own graph, its Inputs node its params, what's wired into
 *  its Outputs node what it returns. */
export function toGraph(nodes: AnyNode[], edges: Edge[]): GraphFile {
  const ref = (e: Edge) => ({ ref: refName(e, nodes) });
  return Object.fromEntries(
    nodes.flatMap((n): [string, Statement][] => {
      const pos = round(n.position);
      if (n.type === "inputs" || n.type === "outputs") return [];
      if (n.type === "variable") {
        const { annotation, value } = n.data;
        return [[n.id, { statement: "assign", annotation, value, pos }]];
      }
      // A parameter's box is passed if it's shown; *args / **kwargs items always are. A wire replaces what's typed
      // in its slot: "text", or "parts.1" for an *args item.
      const schema = schemaOf(n);
      const { values, shown } = n.data;
      const kwargs = schema.inputs.some((i) => i.kind === "var_keyword");
      const args = Object.fromEntries(
        Object.entries(values).filter(([name]) => {
          const input = schema.inputs.find((i) => i.name === name);
          return input ? isStarred(input) || shown[name] : kwargs;
        }),
      );
      for (const e of edges.filter((e) => e.target === n.id)) {
        const [name, index] = (e.targetHandle ?? "").split(".");
        if (index === undefined) args[name] = ref(e);
        else args[name] = (args[name] as unknown[]).map((item, i) => (i === Number(index) ? ref(e) : item));
      }
      if (n.type === "call") return [[n.id, { statement: "assign", value: { call: schema.name, args }, pos }]];
      const { body } = n.data;
      const subgraph: Statement = {
        statement: "subgraph",
        params: Object.fromEntries(inputsNode(body).data.params.map((p) => [p.name, p.type])),
        body: toGraph(body.nodes, body.edges),
        returns: subgraphOutputs(body).map((o) => o.name),
        args,
        io_pos: { "@inputs": round(inputsNode(body).position), "@outputs": round(outputsNode(body).position) },
        pos,
      };
      return [[n.id, subgraph]];
    }),
  );
}

const round = (p: XYPosition): [number, number] => [Math.round(p.x), Math.round(p.y)];

/** A graph file onto the canvas: the reverse of toGraph. */
export function fromGraph(graph: GraphFile, schemas: NodeSchema[]): Body {
  return load(graph, schemas, [], []);
}

/** A graph onto a canvas, given its params' names and the names it returns (a subgraph's body), each wired into its
 *  Outputs node. sources: the node and socket each name comes from: a node's own, a subgraph's output, or a param's
 *  on the Inputs node. */
function load(graph: GraphFile, schemas: NodeSchema[], params: string[], returns: string[]): Body {
  const nodes: AnyNode[] = [];
  const edges: Edge[] = [];
  const sources = new Map<string, [string, string]>(params.map((p) => [p, ["@inputs", p]]));
  for (const [id, node] of Object.entries(graph)) {
    sources.set(id, [id, "result"]);
    if (node.statement === "subgraph") for (const name of node.returns) sources.set(name, [id, name]);
  }
  const wire = (name: string, target: string, targetHandle: string) => {
    const from = sources.get(name);
    if (!from) throw new Error(`Node ${target}: no ${name} to wire in`);
    const [source, sourceHandle] = from;
    edges.push({
      id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
      source,
      sourceHandle,
      target,
      targetHandle,
    });
  };

  for (const [id, node] of Object.entries(graph)) {
    const [x, y] = node.pos ?? [0, 0];
    const position = { x, y };
    if (node.statement === "assign" && !isCall(node.value)) {
      if (!node.annotation) throw new Error(`Node ${id}: a variable needs an annotation (str, int, float or bool)`);
      nodes.push({ id, type: "variable", position, data: { annotation: node.annotation, value: node.value } });
      continue;
    }
    let schema: NodeSchema | undefined;
    let args: Record<string, unknown>;
    let body: Body | undefined;
    if (node.statement === "subgraph") {
      const params = Object.entries(node.params).map(([name, type]) => ({ name, type }));
      const inner = load(
        node.body,
        schemas,
        params.map((p) => p.name),
        node.returns,
      );
      const [ix, iy] = node.io_pos?.["@inputs"] ?? [-320, 0];
      const [ox, oy] = node.io_pos?.["@outputs"] ?? [640, 0];
      body = { nodes: [...inner.nodes, ...ioNodes(params, { x: ix, y: iy }, { x: ox, y: oy })], edges: inner.edges };
      schema = subgraphSchema(id, body);
      args = node.args;
    } else {
      const call = node.value as Call;
      schema = schemas.find((s) => s.name === call.call);
      if (!schema) throw new Error(`Node ${id}: unknown function ${call.call}`);
      args = call.args ?? {};
    }
    // A value in the file shows its box. A wired **kwargs item gets a value under its wire, so it has a slot.
    const kwargs = schema.inputs.find((i) => i.kind === "var_keyword");
    const { values, shown, hidden } = newCallData(schema);
    for (const [name, arg] of Object.entries(args)) {
      const type = (schema.inputs.find((i) => i.name === name) ?? kwargs)?.type ?? "";
      const under = startingValue(type);
      if (isRef(arg)) {
        wire(arg.ref, id, name);
        values[name] = under;
      } else if (Array.isArray(arg)) {
        values[name] = arg.map((item, i) => {
          if (!isRef(item)) return item;
          wire(item.ref, id, `${name}.${i}`);
          return under;
        });
      } else {
        values[name] = arg;
        shown[name] = true;
      }
    }
    const data = { values, shown, hidden };
    if (body) nodes.push({ id, type: "subgraph", position, width: 220, data: { ...data, body } });
    else nodes.push({ id, type: "call", position, width: 220, data: { ...data, schema } });
  }
  returns.forEach((name, i) => {
    wire(name, "@outputs", i === 0 ? "out" : `out_${i + 1}`);
  });
  return { nodes, edges };
}

/** A subgraph's Inputs node (its params), and its Outputs node, where they are in its body. */
function ioNodes(params: Param[], inputs: XYPosition, outputs: XYPosition): AnyNode[] {
  return [
    { id: "@inputs", type: "inputs", position: inputs, width: 220, deletable: false, data: { params } },
    { id: "@outputs", type: "outputs", position: outputs, width: 220, deletable: false, data: {} },
  ];
}

/** A new, empty subgraph: no params, no outputs. */
export function newSubgraphData(): SubgraphNode["data"] {
  const nodes = ioNodes([], { x: 0, y: 0 }, { x: 400, y: 0 });
  return { values: {}, shown: {}, hidden: {}, body: { nodes, edges: [] } };
}

/** A subgraph's Inputs node, and its Outputs node. */
export const inputsNode = (body: Body) => body.nodes.find((n): n is InputsNode => n.type === "inputs") as InputsNode;
export const outputsNode = (body: Body) =>
  body.nodes.find((n): n is OutputsNode => n.type === "outputs") as OutputsNode;

/** A subgraph's outputs: each wire into its Outputs node, the name and type it carries. */
export const subgraphOutputs = (body: Body) =>
  body.edges
    .filter((e) => e.target === "@outputs")
    .map((e) => ({ name: refName(e, body.nodes), type: refType(e, body.nodes) }));

/** A subgraph's function, as a registered function's is described (see NodeSchema): its params, each with no
 *  default; its output, if it has one (more than one: a tuple). */
export function subgraphSchema(id: string, body: Body): NodeSchema {
  const types = subgraphOutputs(body).map((o) => o.type);
  return {
    name: id,
    module: "",
    doc: "",
    inputs: inputsNode(body).data.params.map((p) => ({
      name: p.name,
      type: p.type,
      required: true,
      default: null,
      kind: "positional_or_keyword",
    })),
    output: types.length === 0 ? null : types.length === 1 ? types[0] : `tuple[${types.join(", ")}]`,
  };
}

/** A call or subgraph node's function. */
export const schemaOf = (node: CallNode | SubgraphNode) =>
  node.type === "call" ? node.data.schema : subgraphSchema(node.id, node.data.body);

/** A call or subgraph node's outputs: a call's result, named by the node; a subgraph's, each named by what's
 *  returned. socket: its output socket's id. */
export function outputsOf(node: CallNode | SubgraphNode): { name: string; type: string; socket: string }[] {
  if (node.type === "subgraph") return subgraphOutputs(node.data.body).map((o) => ({ ...o, socket: o.name }));
  const type = node.data.schema.output;
  return type ? [{ name: node.id, type, socket: "result" }] : [];
}

/** What a call or subgraph node's output socket gives once it has run, else undefined. A subgraph with more than
 *  one output returns a tuple: one item per output. */
export function outputValue(node: CallNode | SubgraphNode, socket: string | null): unknown {
  const result = node.data.result;
  if (result?.status !== "ok") return undefined;
  const outputs = outputsOf(node);
  if (outputs.length < 2) return result.result;
  return (result.result as unknown[])[outputs.findIndex((o) => o.socket === socket)];
}

/** What's in a param's box: what was typed, if it fits the param's type, else its type's starting value. */
export function paramValue(param: Param, values: Record<string, unknown>): unknown {
  const value = values[param.name];
  return typeof value === typeof startingValue(param.type) ? value : startingValue(param.type);
}

/** The Python name a wire carries: a subgraph output's or a param's (its socket), else its node's. */
export function refName(edge: Edge, nodes: AnyNode[]): string {
  const type = nodes.find((n) => n.id === edge.source)?.type;
  return type === "subgraph" || type === "inputs" ? (edge.sourceHandle ?? "") : edge.source;
}

/** The type of what a wire carries. */
export function refType(edge: Edge, nodes: AnyNode[]): string {
  const source = nodes.find((n) => n.id === edge.source);
  if (!source || source.type === "outputs") return "";
  if (source.type === "variable") return source.data.annotation;
  if (source.type === "inputs") return source.data.params.find((p) => p.name === edge.sourceHandle)?.type ?? "";
  return outputsOf(source).find((o) => o.socket === edge.sourceHandle)?.type ?? "None";
}

/** The subgraph open at the top of the stack, closed: its body is what was on the canvas (view). Its values are
 *  kept to its params (what they hold fitting their types: they may have changed inside), and the parent's wires
 *  into params or out of outputs that are gone (removed or renamed inside) are taken out. */
export function closeSubgraph(view: Body, parent: Opened): Body {
  const params = inputsNode(view).data.params;
  const outputs = new Set(subgraphOutputs(view).map((o) => o.name));
  const close = (n: SubgraphNode): SubgraphNode => {
    const values = Object.fromEntries(params.map((p) => [p.name, paramValue(p, n.data.values)]));
    return { ...n, data: { ...n.data, body: view, values } };
  };
  return {
    nodes: parent.nodes.map((n) => (n.id === parent.id && n.type === "subgraph" ? close(n) : n)),
    edges: parent.edges.filter(
      (e) =>
        !(e.target === parent.id && !params.some((p) => p.name === e.targetHandle)) &&
        !(e.source === parent.id && !outputs.has(e.sourceHandle ?? "")),
    ),
  };
}

/** A subgraph opened: which (id), and the canvas it was opened from, to go back to. */
export interface Opened extends Body {
  id: string;
}

/** The subgraphs ids opened, from the graph (root) down: each one opened (the stack), and the canvas the last
 *  one's body (view). */
export function reopen(root: Body, ids: string[]): { stack: Opened[]; view: Body } {
  const stack: Opened[] = [];
  let view = root;
  for (const id of ids) {
    stack.push({ id, ...view });
    view = (view.nodes.find((n) => n.id === id) as SubgraphNode).data.body;
  }
  return { stack, view };
}

/** A canvas's nodes given what the graph's run gave them (results: by name): each call and subgraph its result,
 *  and inside a subgraph, the same from its body's run, its Inputs node what each param was given. A variable
 *  isn't run, it just holds its value. */
export function withResults(nodes: AnyNode[], results: Record<string, RunResult>): AnyNode[] {
  return nodes.map((n): AnyNode => {
    const result = results[n.id] as RunResult | undefined;
    if (n.type === "call") return { ...n, data: { ...n.data, result } };
    if (n.type === "subgraph") {
      const body = { ...n.data.body, nodes: withResults(n.data.body.nodes, result?.body ?? {}) };
      return { ...n, data: { ...n.data, result, body } };
    }
    if (n.type === "inputs") {
      const args = Object.fromEntries(n.data.params.map((p) => [p.name, results[p.name]?.result]));
      return { ...n, data: { ...n.data, args } };
    }
    return n;
  });
}

/** The Python names a canvas's nodes bind, or that would hide something if bound: each node's, each subgraph
 *  output's, each param's, and each function's called. */
export function scopeNames(nodes: AnyNode[]): Set<string> {
  const names = new Set<string>();
  for (const n of nodes) {
    if (n.type === "inputs") for (const p of n.data.params) names.add(p.name);
    else if (n.type !== "outputs") names.add(n.id);
    if (n.type === "call") names.add(n.data.schema.name);
    if (n.type === "subgraph") for (const o of subgraphOutputs(n.data.body)) names.add(o.name);
  }
  return names;
}

const isCall = (value: unknown): value is Call => typeof value === "object" && value !== null && "call" in value;

const isRef = (value: unknown): value is { ref: string } =>
  typeof value === "object" && value !== null && "ref" in value;

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
  return { schema, values, shown, hidden: {} };
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

/** A new name: base, else base_2, base_3, ... whichever isn't taken. A variable's base is "var", a call's
 *  "<function>_result". */
export function freeName(taken: Set<string>, base: string): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** Whether a name can be a Python variable's. (Keywords aren't caught yet.) */
export const isName = (name: string) => /^[A-Za-z_]\w*$/.test(name);
