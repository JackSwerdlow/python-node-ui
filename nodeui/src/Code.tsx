/** Python in the side panel. A node's statement is red if the node (a call or subgraph) failed when the graph last
 *  ran. A line too long for the panel wraps onto more, each indented 4 past where the line is. */
import { Fragment } from "react";
import type { Line } from "./python";

export function Code({ lines }: { lines: Line[] }) {
  return (
    <pre className="code">
      {lines.map((line, i) => {
        const node = line.node;
        const failed = (node?.type === "call" || node?.type === "subgraph") && node.data.result?.status === "error";
        const hang = line.text.length - line.text.trimStart().length + 4;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines have nothing but their place
          <Fragment key={i}>
            <span className={failed ? "error" : ""} style={{ paddingLeft: `${hang}ch`, textIndent: `-${hang}ch` }}>
              {line.text}
            </span>
            {i < lines.length - 1 && "\n"}
          </Fragment>
        );
      })}
    </pre>
  );
}
