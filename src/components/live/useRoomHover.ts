"use client";

import { useEffect, useState, type RefObject } from "react";

const objects = ".monitor-tile[data-room-id], [data-library-room]";
const blocked = "[role='dialog'], [role='menu'], [data-sorting='true']";

export function useRoomHover(workspace: RefObject<HTMLDivElement | null>, viewKey: string) {
  const [hover, setHover] = useState<{ hoveredId: string | null; sidebarHoveredId: string | null }>({ hoveredId: null, sidebarHoveredId: null });
  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    let pressed = false;
    let source: HTMLElement | null = null;
    const publish = () => {
      const sidebarHoveredId = source?.dataset.libraryRoom ?? null;
      const hoveredId = source?.dataset.roomIdle === "true" ? null : source?.dataset.roomId ?? sidebarHoveredId;
      setHover((previous) => previous.hoveredId === hoveredId && previous.sidebarHoveredId === sidebarHoveredId
        ? previous : { hoveredId, sidebarHoveredId });
    };
    publish();
    const locate = (node: EventTarget | null) => {
      const element = node instanceof Element ? node : null;
      const object = element?.closest<HTMLElement>(objects);
      source = !document.hidden && object && root.contains(object) && !element?.closest(blocked)
        && !root.querySelector(blocked) ? object : null;
      publish();
    };
    const over = (event: PointerEvent) => { if (!pressed && event.pointerType !== "touch") locate(event.target); };
    const out = (event: PointerEvent) => { if (!pressed && event.pointerType !== "touch") locate(event.relatedTarget); };
    const down = (event: PointerEvent) => {
      pressed = true;
      if ((event.target as Element)?.closest(".tile-header, .resize-handle, [data-sort-handle]")) { source = null; publish(); }
    };
    const up = (event: PointerEvent) => { pressed = false; locate(event.pointerType === "touch" ? null : document.elementFromPoint(event.clientX, event.clientY)); };
    const clear = () => { pressed = false; source = null; publish(); };
    const observer = new MutationObserver((records) => {
      // Media frames and danmaku also mutate this subtree; only source removal or
      // entering sort mode invalidates the source. Idle changes only update its hint.
      if (source && (!source.isConnected || records.some((record) => record.attributeName === "data-sorting" && (record.target as HTMLElement).dataset.sorting === "true"))) {
        source = null; publish();
      } else if (source && records.some((record) => record.target === source && record.attributeName === "data-room-idle")) {
        publish();
      }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-sorting", "data-room-idle"] });
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
  return hover;
}
