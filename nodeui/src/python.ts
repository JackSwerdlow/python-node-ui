/** Nodes written as Python, read from the nodes alone (see README): a function's signature, each node's statement,
 *  and the whole graph as a script. A node's id is its Python name: a variable's, or what a call is assigned to. */
import type { Edge } from "@xyflow/react";
import { hasDefault } from "./graph";
import type { AnyNode, CallNode, InputSchema, NodeSchema, VariableNode } from "./types";

/** `def name(params) -> type: ...`: what's known of a registered function (its body is in its code, not the nodes).
 *  On one line if that fits the panel, else a parameter per line. */
export function signature(schema: NodeSchema): string {
  const params: string[] = [];
  schema.inputs.forEach((i, n) => {
    const before = schema.inputs.slice(0, n);
    if (i.kind === "keyword_only" && !before.some((p) => p.kind === "keyword_only" || p.kind === "var_positional"))
      params.push("*");
    const stars = i.kind === "var_positional" ? "*" : i.kind === "var_keyword" ? "**" : "";
    params.push(`${stars}${i.name}: ${i.type}${hasDefault(i) ? ` = ${literal(i.default, i.type)}` : ""}`);
    if (i.kind === "positional_only" && schema.inputs[n + 1]?.kind !== "positional_only") params.push("/");
  });
  const returns = schema.output ?? "None";
  const line = `def ${schema.name}(${params.join(", ")}) -> ${returns}: ...`;
  if (line.length <= 40) return line;
  return `def ${schema.name}(\n${params.map((p) => `    ${p},`).join("\n")}\n) -> ${returns}: ...`;
}

/** `name: str = "hello"` */
export const variableLine = (node: VariableNode) =>
  `${node.id}: ${node.data.annotation} = ${literal(node.data.value, node.data.annotation)}`;

/** A node's statement: a variable's line, or a call node's call assigned to its name (just the call if the
 *  function returns nothing). */
export function statement(node: AnyNode, edges: Edge[]): string {
  if (node.type === "variable") return variableLine(node);
  return node.data.schema.output ? `${node.id} = ${call(node, edges)}` : call(node, edges);
}

/** A call node as the call it is: `count_words(text, top=3)`. Arguments are passed as the backend passes
 *  them (graph.py): by position where Python needs it, else by name; a hidden box is left out. A wire is the name
 *  of the node it comes from. */
export function call(node: CallNode, edges: Edge[]): string {
  const { schema, values, shown } = node.data;
  const wires = new Map(edges.filter((e) => e.target === node.id).map((e) => [e.targetHandle ?? "", e.source]));
  const arg = (input: InputSchema, socket: string, value: unknown): string | undefined =>
    wires.get(socket) ?? (value === undefined ? undefined : literal(value, input.type));

  // As in graph._call: positional-only parameters, and any before *args, go by position; one left out takes its
  // default (so the ones after it keep their places), or ends them (Python's "missing argument").
  const hasArgs = schema.inputs.some((i) => i.kind === "var_positional");
  const positional: { text: string; isDefault: boolean }[] = [];
  const keyword: string[] = [];
  let ended = false;
  for (const i of schema.inputs) {
    if (i.kind === "var_positional") {
      const items = (values[i.name] as unknown[] | undefined) ?? [];
      if (!ended)
        items.forEach((item, n) => {
          positional.push({ text: arg(i, `${i.name}.${n}`, item) ?? "None", isDefault: false });
        });
    } else if (i.kind === "var_keyword") {
      const extra = Object.keys(values).filter((name) => !schema.inputs.some((p) => p.name === name));
      for (const name of extra) keyword.push(`${name}=${arg(i, name, values[name])}`);
    } else {
      const text = arg(i, i.name, shown[i.name] ? values[i.name] : undefined);
      if (i.kind === "positional_only" || (hasArgs && i.kind === "positional_or_keyword")) {
        if (ended) continue;
        if (text !== undefined) positional.push({ text, isDefault: false });
        else if (hasDefault(i)) positional.push({ text: literal(i.default, i.type), isDefault: true });
        else ended = true;
      } else if (text !== undefined) keyword.push(`${i.name}=${text}`);
    }
  }
  while (positional.at(-1)?.isDefault) positional.pop(); // defaults at the end needn't be written
  return `${schema.name}(${[...positional.map((p) => p.text), ...keyword].join(", ")})`;
}

/** A line of Python, and the node it's the statement of (if it is one). */
export interface Line {
  text: string;
  node?: AnyNode;
}

/** The whole graph as a Python script: imports (registering a function is importing it), then each node's
 *  statement, in blocks by depth: a node's depth is the longest chain of wires leading to it, so each block uses
 *  only names from the blocks above it. */
export function script(nodes: AnyNode[], edges: Edge[]): Line[] {
  const modules = new Map<string, Set<string>>();
  for (const n of nodes)
    if (n.type === "call")
      modules.set(n.data.schema.module, (modules.get(n.data.schema.module) ?? new Set()).add(n.data.schema.name));
  const imports = [...modules]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, fns]) => `from ${module} import ${[...fns].sort().join(", ")}`);

  const depth = depths(nodes, edges);
  const blocks: Line[][] = [];
  // Within a block: variables first, then as the nodes are listed.
  for (const n of [...nodes.filter((n) => n.type === "variable"), ...nodes.filter((n) => n.type === "call")]) {
    const d = depth.get(n.id) ?? 0;
    blocks[d] = [...(blocks[d] ?? []), { text: statement(n, edges), node: n }];
  }
  const parts = [imports.map((text) => ({ text })), ...blocks.filter(Boolean)].filter((b) => b.length);
  return parts.flatMap((block, i) => (i === 0 ? block : [{ text: "" }, ...block])); // a blank line between blocks
}

/** Each node's depth: 0 if nothing is wired into it, else one more than the deepest node wired into it. */
function depths(nodes: AnyNode[], edges: Edge[]): Map<string, number> {
  const depth = new Map<string, number>();
  const ids = new Set(nodes.map((n) => n.id));
  const of = (id: string, path: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 0; // a loop
    const inner = new Set(path).add(id);
    const from = edges.filter((e) => e.target === id && ids.has(e.source)).map((e) => of(e.source, inner) + 1);
    const d = Math.max(0, ...from);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) of(n.id, new Set());
  return depth;
}

/** A value as Python writes it: "text", 3, 2.0, True, None. */
function literal(value: unknown, type: string): string {
  if (typeof value === "string") return pythonString(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return type === "float" && Number.isInteger(value) ? value.toFixed(1) : String(value);
  if (value === null || value === undefined) return "None";
  return JSON.stringify(value);
}

/** Text in quotes, as black / ruff write it: double quotes, unless it has one and no single quote. */
function pythonString(text: string): string {
  const quote = text.includes('"') && !text.includes("'") ? "'" : '"';
  const escaped = text
    .replaceAll("\\", "\\\\")
    .replaceAll(quote, `\\${quote}`)
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `${quote}${escaped}${quote}`;
}
