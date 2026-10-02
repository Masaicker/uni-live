"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

type DropTarget = { id: string; edge: "before" | "after" };

export function useRoomSortDrag(enabled: boolean, list: RefObject<HTMLDivElement | null>, ids: string[], onReorder: (from: string, to: string) => void) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const latest = useRef({ ids, onReorder });
  latest.current = { ids, onReorder };
  const session = useRef<{
    id: string; pointerId: number; handle: HTMLElement; row: HTMLElement;
    x: number; y: number; startX: number; startY: number; offsetX: number; offsetY: number;
    preview: HTMLElement | null; target: DropTarget | null;
  } | null>(null);
  const cancel = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let frame = 0, previousTime = 0;
    const updateTarget = () => {
      const drag = session.current, container = list.current;
      if (!drag?.preview || !container) return;
      const bounds = container.getBoundingClientRect();
      let target: DropTarget | null = null;
      if (drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom) {
        const rows = [...container.querySelectorAll<HTMLElement>("[data-library-room]")];
        const row = rows.find((row) => row.getBoundingClientRect().bottom >= drag.y) ?? rows.at(-1);
        const id = row?.dataset.libraryRoom;
        const from = latest.current.ids.indexOf(drag.id), to = id ? latest.current.ids.indexOf(id) : -1;
        if (from >= 0 && to >= 0 && from !== to) target = { id: id!, edge: from < to ? "after" : "before" };
      }
      drag.target = target;
      setDropTarget((current) => current?.id === target?.id && current?.edge === target?.edge ? current : target);
    };
    const finish = (commit: boolean) => {
      const drag = session.current;
      if (!drag) return;
      updateTarget();
      session.current = null;
      cancelAnimationFrame(frame);
      previousTime = 0;
      drag.preview?.remove();
      if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
      setDragged(null); setDropTarget(null);
      if (commit && drag.preview && drag.target) latest.current.onReorder(drag.id, drag.target.id);
    };
    cancel.current = () => finish(false);
    const tick = (time: number) => {
      const drag = session.current, container = list.current;
      if (!drag?.preview || !container) return;
      const bounds = container.getBoundingClientRect();
      const elapsed = previousTime ? Math.min(32, time - previousTime) : 16;
      previousTime = time;
      if (drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom) {
        const edge = Math.min(56, bounds.height / 3);
        const speed = drag.y < bounds.top + edge ? -(bounds.top + edge - drag.y) / edge
          : drag.y > bounds.bottom - edge ? (drag.y - bounds.bottom + edge) / edge : 0;
        container.scrollTop += speed * 900 * elapsed / 1000;
      }
      updateTarget();
      frame = requestAnimationFrame(tick);
    };
    const move = (event: globalThis.PointerEvent) => {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.preview && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5) {
        const bounds = drag.row.getBoundingClientRect();
        drag.preview = drag.row.cloneNode(true) as HTMLElement;
        drag.preview.removeAttribute("data-library-room");
        drag.preview.classList.add("library-drag-preview");
        drag.preview.setAttribute("aria-hidden", "true");
        Object.assign(drag.preview.style, { position: "fixed", width: `${bounds.width}px`, height: `${bounds.height}px` });
        document.body.appendChild(drag.preview);
        setDragged(drag.id);
        frame = requestAnimationFrame(tick);
      }
      if (drag.preview) {
        event.preventDefault();
        drag.preview.style.left = `${drag.x - drag.offsetX}px`;
        drag.preview.style.top = `${drag.y - drag.offsetY}px`;
        updateTarget();
      }
    };
    const up = (event: globalThis.PointerEvent) => { if (session.current?.pointerId === event.pointerId) { session.current.x = event.clientX; session.current.y = event.clientY; finish(true); } };
    const abortPointer = (event: globalThis.PointerEvent) => { if (session.current?.pointerId === event.pointerId) finish(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && session.current) { event.preventDefault(); event.stopPropagation(); finish(false); } };
    const blur = () => finish(false);
    const hidden = () => { if (document.hidden) finish(false); };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", abortPointer);
    document.addEventListener("lostpointercapture", abortPointer);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    return () => {
      finish(false);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", abortPointer);
      document.removeEventListener("lostpointercapture", abortPointer);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
    };
  }, [enabled, list]);

  const begin = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    cancel.current();
    const row = event.currentTarget.closest<HTMLElement>("[data-library-room]");
    if (!row) return;
    event.preventDefault();
    const bounds = row.getBoundingClientRect();
    session.current = { id, pointerId: event.pointerId, handle: event.currentTarget, row,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, preview: null, target: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return { dragged, dropTarget, begin, cancel: () => cancel.current() };
}
