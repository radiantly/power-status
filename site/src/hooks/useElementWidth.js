import { useEffect, useState } from "react";

/**
 * Observed content width of an element, or 0 before first measurement.
 *
 * @returns {[(node: Element | null) => void, number]} ref callback and width
 */
export function useElementWidth() {
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
}
