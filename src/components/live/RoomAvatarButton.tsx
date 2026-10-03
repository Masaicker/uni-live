"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FollowedRoom } from "@/types";
import { platformNames, roomLabel } from "@/lib/room-identity";
import { RoomAvatar } from "./RoomAvatar";

interface Props {
  room: FollowedRoom;
  watching: boolean;
  menuOpen: boolean;
  status: string;
  onToggle: () => void;
  onMenu: (button: HTMLButtonElement) => void;
}

export function RoomAvatarButton({ room, watching, menuOpen, status, onToggle, onMenu }: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gesture = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    gesture.current = null;
    setHolding(false);
  }, []);
  const interrupt = useCallback(() => { suppressClick.current = true; cancel(); }, [cancel]);

  useEffect(() => {
    if (!holding) return;
    const hidden = () => { if (document.visibilityState === "hidden") interrupt(); };
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("scroll", interrupt, true);
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", interrupt);
    return () => {
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("scroll", interrupt, true);
      document.removeEventListener("pointerup", cancel);
      document.removeEventListener("pointercancel", interrupt);
    };
  }, [holding, cancel, interrupt]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return <button type="button" aria-label={`${watching ? "关闭画面" : "打开画面"}：${roomLabel(room)}`}
    aria-haspopup="menu" aria-expanded={menuOpen}
    title={`${roomLabel(room)} · ${platformNames[room.platform]} · ${status} · 右键／长按操作`}
    onMouseDown={(event) => { if (event.button === 1 || suppressClick.current) event.preventDefault(); }}
    onPointerDown={(event) => {
      cancel();
      suppressClick.current = false;
      if (event.pointerType === "mouse" || event.button !== 0) return;
      const button = event.currentTarget;
      gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setHolding(true);
      timer.current = setTimeout(() => {
        suppressClick.current = true;
        cancel();
        if (button.isConnected && document.visibilityState === "visible") onMenu(button);
      }, 450);
    }}
    onPointerMove={(event) => {
      const start = gesture.current;
      if (start?.pointerId === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) interrupt();
    }}
    onPointerUp={cancel} onPointerCancel={interrupt}
    onPointerLeave={() => { if (gesture.current) interrupt(); }}
    onContextMenu={(event) => {
      event.preventDefault(); event.stopPropagation(); cancel();
      // Touch browsers may emit contextmenu after our long press has already opened the menu.
      if (!suppressClick.current) onMenu(event.currentTarget);
    }}
    onKeyDown={(event) => {
      if ([" ", "Enter"].includes(event.key)) suppressClick.current = false;
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault(); event.stopPropagation(); onMenu(event.currentTarget);
      }
    }}
    onClick={(event) => {
      event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; }
      onToggle();
    }}>
    <RoomAvatar url={room.avatarUrl} platform={room.platform} />
    {watching && <span className="avatar-layout-badge" aria-label="在布局中" />}
  </button>;
}
