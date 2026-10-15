import type { Edge } from "@xyflow/react";
import { toGraph } from "./graph";
import type { AnyNode, GraphFile, NodeSchema, RunResult } from "./types";

/** GET some JSON from the API; what: what it is, for the error message. */
async function get<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${what} (${res.status})`);
  return res.json();
}

export const fetchNodes = () => get<NodeSchema[]>("/api/nodes", "nodes");
export const fetchWorkflows = () => get<string[]>("/api/workflows", "workflows");
export const fetchWorkflow = (name: string) =>
  get<GraphFile>(`/api/workflows/${encodeURIComponent(name)}`, `workflow ${name}`);

export async function runGraph(nodes: AnyNode[], edges: Edge[]): Promise<Record<string, RunResult>> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGraph(nodes, edges)),
  });
  if (!res.ok) throw new Error(res.status === 422 ? (await res.json()).detail : `Run failed (${res.status})`);
  return res.json();
}
