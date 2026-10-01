"use client";
import clsx from "clsx";
import type { ReactNode } from "react";
export function IconButton({ label, children, onClick, active, danger, disabled, className }: {
  label: string; children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean; className?: string;
}) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={clsx("icon-button", active && "is-active", danger && "is-danger", className)}>{children}</button>;
}
