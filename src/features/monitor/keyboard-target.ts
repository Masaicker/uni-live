// Keyboard ownership is transient and independent of layout, audio and saved rooms.
export class KeyboardRoomTarget {
  private normal: string | null = null;
  private mode: { kind: "focus" | "fullscreen"; id: string; target: string | null } | null = null;

  update(ids: readonly string[], focused: string | null, fullscreen: string | null): string | null {
    const exists = (id: string | null) => id !== null && ids.includes(id);
    if (!exists(this.normal)) this.normal = null;
    const kind = exists(fullscreen) ? "fullscreen" : exists(focused) ? "focus" : null;
    const id = kind === "fullscreen" ? fullscreen : focused;
    if (!kind || !id) this.mode = null;
    else if (this.mode?.kind !== kind || this.mode.id !== id) this.mode = { kind, id, target: id };
    else if (!exists(this.mode.target)) this.mode.target = kind === "fullscreen" ? id : null;
    return this.mode ? this.mode.target : this.normal;
  }

  select(id: string): void {
    if (this.mode?.kind === "fullscreen") return;
    if (this.mode) this.mode.target = id;
    else this.normal = id;
  }
}
