"use client";

import { useEffect, useState, type RefObject } from "react";

const objects = ".monitor-tile[data-room-id], [data-library-room]";
const blocked = "[role='dialog'], [role='menu'], [data-sorting='true']";

export function useRoomHover(workspace: RefObject<HTMLDivElement | null>, viewKey: string) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    let pressed = false;
    let source: HTMLElement | null = null;
    setHoveredId(null);
    const locate = (node: EventTarget | null) => {
      const element = node instanceof Element ? node : null;
      const object = element?.closest<HTMLElement>(objects);
      source = !document.hidden && object && root.contains(object) && !element?.closest(blocked)
        && !root.querySelector(blocked) ? object : null;
      setHoveredId(source?.dataset.roomId ?? source?.dataset.libraryRoom ?? null);
    };
    const over = (event: PointerEvent) => { if (!pressed && event.pointerType !== "touch") locate(event.target); };
    const out = (event: PointerEvent) => { if (!pressed) locate(event.relatedTarget); };
    const down = (event: PointerEvent) => {
      pressed = true;
      if ((event.target as Element)?.closest(".tile-header, .resize-handle, [data-sort-handle]")) { source = null; setHoveredId(null); }
    };
    const up = (event: PointerEvent) => { pressed = false; locate(document.elementFromPoint(event.clientX, event.clientY)); };
    const clear = () => { pressed = false; source = null; setHoveredId(null); };
    const observer = new MutationObserver((records) => {
      // Media frames and danmaku also mutate this subtree; only source removal or
      // entering sort mode invalidates the hint, without scanning every room.
      if (source && (!source.isConnected || records.some((record) => record.attributeName === "data-sorting" && (record.target as HTMLElement).dataset.sorting === "true"))) {
        source = null; setHoveredId(null);
      }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-sorting"] });
    root.addEventListener("pointerover", over);
    root.addEventListener("pointerout", out);
    root.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", clear);
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("blur", clear);
    return () => {
      observer.disconnect();
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointerout", out);
      root.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", clear);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("blur", clear);
    };
  }, [workspace, viewKey]);
  return hoveredId;
}
