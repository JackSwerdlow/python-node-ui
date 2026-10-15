import type { Edge } from "@xyflow/react";
import { toGraph } from "./graph";
import type { AnyNode, NodeSchema, RunResult } from "./types";

export async function fetchNodes(): Promise<NodeSchema[]> {
  const res = await fetch("/api/nodes");
  if (!res.ok) throw new Error(`Couldn't load nodes (${res.status})`);
  return res.json();
}

export async function runGraph(nodes: AnyNode[], edges: Edge[]): Promise<Record<string, RunResult>> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGraph(nodes, edges)),
  });
  if (!res.ok) throw new Error(res.status === 422 ? (await res.json()).detail : `Run failed (${res.status})`);
  return res.json();
}
