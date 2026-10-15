/** Resizing a node by dragging its bottom-right corner (the grip), never smaller than what's in it. */
import { NodeResizeControl, useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** ref goes on the node's box, grip inside it. A node resized smaller than what's in it now (e.g. a value box
 *  changed, or a text box was dragged taller) grows to fit. */
export function useResize(id: string, minWidth: number) {
  const { updateNode, getNode } = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(60);
  // The shortest it can be is its height with nothing stretched, measured by squashing it: down to the bottom of
  // the lowest thing in it (and its margin), plus the node's own padding and borders.
  const fit = () => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "0";
    const bottoms = [...node.children].map(
      (c) =>
        (c as HTMLElement).offsetTop +
        (c as HTMLElement).offsetHeight +
        Number.parseFloat(getComputedStyle(c).marginBottom),
    );
    const style = getComputedStyle(node);
    const min =
      Math.max(0, ...bottoms) +
      Number.parseFloat(style.paddingBottom) +
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    node.style.height = "";
    setMinHeight(min);
    // The size set by dragging the grip (not the measured size): none until it's been resized.
    const { width, height } = getNode(id) ?? {};
    if (width !== undefined && width < minWidth) updateNode(id, { width: minWidth });
    if (height !== undefined && height < min) updateNode(id, { height: min });
  };
  useLayoutEffect(fit); // after every draw
  // A box in it resized without a redraw (a text box dragged by its own grip): watched for.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => fit());
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  });
  const grip = <NodeResizeControl position="bottom-right" minWidth={minWidth} minHeight={minHeight} className="grip" />;
  return { ref, grip };
}
