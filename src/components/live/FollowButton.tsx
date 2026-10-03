"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Star } from "@phosphor-icons/react";

const HOLD_MS = 1250;

export function FollowButton({ followed, onChange, size = 17, menuItem = false }: {
  followed: boolean; onChange: (followed: boolean) => void; size?: number; menuItem?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const latest = useRef({ followed, onChange });
  latest.current = { followed, onChange };
  const cancel = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; setHolding(false); }, []);
  const start = () => {
    if (!followed || timer.current) return;
    suppressClick.current = true;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      if (latest.current.followed) latest.current.onChange(false);
    }, HOLD_MS);
  };
  useEffect(() => {
    if (!followed) cancel();
  }, [followed, cancel]);
  useEffect(() => {
    const node = button.current;
    // Swapping the pressed SVG can omit pointerout; native pointerleave still fires.
    node?.addEventListener("pointerleave", cancel);
    return () => node?.removeEventListener("pointerleave", cancel);
  }, [cancel]);
  useEffect(() => {
    if (!holding) return;
    const hidden = () => { if (document.visibilityState === "hidden") cancel(); };
    const moved = (event: PointerEvent) => {
      const bounds = button.current?.getBoundingClientRect();
      if (bounds && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("pointermove", moved);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("pointerup", cancel);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("pointermove", moved);
    };
  }, [holding, cancel]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = followed ? "长按取消关注" : "关注房间";
  return <button ref={button} type="button" role={menuItem ? "menuitem" : undefined} aria-label={label}
    title={followed ? "长按 1.25 秒取消关注，松开可中止" : label} aria-pressed={menuItem ? undefined : followed}
    className={`icon-button follow-button ${followed ? "is-active" : ""} ${holding ? "is-holding" : ""}`}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      suppressClick.current = false;
      if (followed) { event.preventDefault(); event.currentTarget.focus(); start(); }
    }}
    onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onBlur={cancel}
    onContextMenu={(event) => { if (holding) event.preventDefault(); }}
    onKeyDown={(event) => {
      if (!followed && !event.repeat && [" ", "Enter"].includes(event.key)) suppressClick.current = false;
      if (followed && [" ", "Enter"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) start(); }
      if (event.key === "Escape") cancel();
    }}
    onKeyUp={(event) => { if ([" ", "Enter"].includes(event.key) && suppressClick.current) { event.preventDefault(); cancel(); } }}
    onClick={(event) => {
      event.stopPropagation();
      if (suppressClick.current) { suppressClick.current = false; return; }
      if (!followed) onChange(true);
    }}>
    {holding ? <span className="unfollow-progress" aria-hidden="true" style={{ width: size, height: size }}>
      <Star size={size} className="unfollow-outline" />
      <Star size={size} weight="fill" className="unfollow-fill" />
      <span className="unfollow-minus"><Minus size={8} weight="bold" /></span>
    </span> : <Star size={size} weight={followed ? "fill" : "regular"} />}
  </button>;
}
