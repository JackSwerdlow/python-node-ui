/** Python in the side panel. A node's statement is red if the node failed when the graph last ran. */
import type { Line } from "./python";

export function Code({ lines }: { lines: Line[] }) {
  return (
    <pre className="code">
      {lines.map((line, i) => {
        const failed = line.node?.type === "call" && line.node.data.result?.status === "error";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines have nothing but their place
          <span key={i} className={failed ? "error" : ""}>
            {line.text}
            {i < lines.length - 1 && "\n"}
          </span>
        );
      })}
    </pre>
  );
}
