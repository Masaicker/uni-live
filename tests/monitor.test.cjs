const { test } = require("node:test");
const assert = require("node:assert/strict");
const { autoLayouts, defaultLayout, insertionLayout, focusLayouts } = require("../src/features/monitor/geometry.ts");
const { monitorReducer: reduce, initialMonitorState, workspaceSnapshot } = require("../src/features/monitor/state.ts");
const { createRoom, restoreWorkspace, normalizeSnapshot, shareWorkspace } = require("../src/features/monitor/storage.ts");

const size = { width: 1440, height: 820 };
const storage = (values = {}) => ({ getItem: (key) => values[key] ?? null });
const encode = (value) => btoa(encodeURIComponent(JSON.stringify(value)));
const populated = () => ["71415", "2140934"].reduce((state, rid) => {
  const room = { ...createRoom(`https://www.douyu.com/${rid}`, rid), followed: true };
  return reduce(reduce(state, { type: "add", room }), { type: "open", id: rid, layout: defaultLayout });
}, initialMonitorState);

test("automatic 1/2/3/5/9 room layouts are equal, bounded and non-overlapping", () => {
  for (const count of [1, 2, 3, 5, 9]) for (const canvas of [size, { width: 390, height: 700 }]) {
    const rects = Object.values(autoLayouts(Array.from({ length: count }, (_, i) => String(i)), canvas));
    for (const rect of rects) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 100.001 && rect.y + rect.h <= 100.001);
      assert.equal(rect.w, rects[0].w); assert.equal(rect.h, rects[0].h);
    }
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert.ok(a.x + a.w <= b.x + .001 || b.x + b.w <= a.x + .001 || a.y + a.h <= b.y + .001 || b.y + b.h <= a.y + .001)));
    if (count === 1) assert.deepEqual(rects[0], defaultLayout);
  }
});

test("two rooms arrange side by side on wide canvases, vertically on narrow ones, and stay deterministic", () => {
  const wide = autoLayouts(["a", "b"], { width: 1300, height: 970 });
  assert.equal(wide.a.y, wide.b.y); assert.ok(wide.b.x > wide.a.x);
  assert.deepEqual(autoLayouts(["a", "b"], { width: 1300, height: 970 }), wide);
  const narrow = autoLayouts(["a", "b"], { width: 390, height: 800 });
  assert.equal(narrow.a.x, narrow.b.x); assert.ok(narrow.b.y > narrow.a.y);
});

test("manual addition leaves prior rectangles unchanged and arrange exits manual mode", () => {
  let state = populated();
  const layout = { ...defaultLayout, w: 45, h: 50, x: 2, y: 3 };
  state = reduce(state, { type: "layout", id: "71415", layout });
  const before = structuredClone(state.videos.map((v) => v.layout));
  const room = createRoom("https://www.douyu.com/3", "3");
  state = reduce(reduce(state, { type: "add", room }), { type: "open", id: room.id, layout: insertionLayout(before, size) });
  assert.deepEqual(state.videos.slice(0, 2).map((v) => v.layout), before);
  assert.equal(state.manual, true);
  state = reduce(state, { type: "arrange", layouts: autoLayouts(state.videos.map((v) => v.id), size) });
  assert.equal(state.manual, false);
});

test("focus restores prior muted/on/zero volume states, does not change other audio or ordinary geometry", () => {
  for (const muted of [true, false]) for (const volume of [0, .7]) {
    let state = reduce(populated(), { type: "audio", id: "71415", muted, volume });
    state = reduce(state, { type: "audio", id: "2140934", muted: false, volume: .3 });
    const original = structuredClone(state.videos);
    state = reduce(state, { type: "focus", id: "71415" });
    assert.equal(state.videos[0].muted, false); assert.ok(state.videos[0].volume > 0);
    assert.deepEqual(state.videos[1], original[1]);
    assert.deepEqual(state.videos[0].layout, original[0].layout);
    state = reduce(state, { type: "focus", id: null });
    assert.equal(state.videos[0].muted, muted); assert.equal(state.videos[0].volume, volume);
  }
});

test("raising overlapping rooms preserves placement, playback, spatial order and automatic mode", () => {
  const state = populated();
  const id = state.videos[0].id;
  // Migrated layouts can have equal z-index values, so equality must also raise.
  const raised = reduce(state, { type: "raise", id });
  assert.equal(raised.manual, false);
  assert.deepEqual(raised.videos.map((video) => video.id), state.videos.map((video) => video.id));
  assert.deepEqual(raised.videos[1], state.videos[1]);
  assert.deepEqual(raised.videos[0], { ...state.videos[0], layout: { ...state.videos[0].layout, zIndex: 2 } });
  assert.equal(raised.rooms[0].layout.zIndex, 2);
  assert.equal(reduce(raised, { type: "raise", id }), raised);
  const snapshot = workspaceSnapshot(raised);
  assert.equal(reduce(initialMonitorState, { type: "hydrate", snapshot }).videos[0].layout.zIndex, 2);
  for (const kind of ["focus", "fullscreen"]) {
    const viewing = reduce(state, kind === "focus" ? { type: kind, id, autoAudio: false } : { type: kind, id, active: true, autoAudio: false });
    assert.equal(reduce(viewing, { type: "raise", id: state.videos[1].id }), viewing);
  }
});

test("user adjustment, mute-all, focus switching and closing respect audio ownership", () => {
  let state = reduce(populated(), { type: "focus", id: "71415" });
  state = reduce(state, { type: "audio", id: "71415", muted: false, volume: .8 });
  state = reduce(state, { type: "focus", id: "2140934" });
  assert.equal(state.videos[0].muted, false); assert.equal(state.videos[0].volume, .8);
  state = reduce(state, { type: "mute-all" });
  state = reduce(state, { type: "focus", id: null });
  assert.ok(state.videos.every((v) => v.muted));
  state = reduce(state, { type: "focus", id: "71415" });
  state = reduce(state, { type: "close", id: "71415" });
  assert.equal(state.focus, null); assert.equal(state.rooms.length, 2);
  state = reduce(state, { type: "follow", id: "2140934", followed: false });
  assert.equal(state.videos.length, 1);
  state = reduce(state, { type: "close", id: "2140934" });
  assert.equal(state.rooms.length, 1); assert.equal(state.videos.length, 0);
});

test("focus and fullscreen are exclusive and share optional sound across direct mode switches", () => {
  let state = populated();
  state = reduce(state, { type: "focus", id: "71415", autoAudio: false });
  assert.equal(state.videos[0].muted, true);
  state = reduce(state, { type: "audio-policy", enabled: true });
  assert.equal(state.videos[0].muted, false);
  state = reduce(state, { type: "fullscreen", id: "71415", active: true, autoAudio: true });
  assert.equal(state.focus, null); assert.equal(state.fullscreen.muted, true);
  state = reduce(state, { type: "focus", id: "71415", autoAudio: true });
  assert.equal(state.fullscreen, null); assert.equal(state.focus.muted, true);
  // A late native fullscreen exit cannot clear the new focus session.
  state = reduce(state, { type: "fullscreen", id: "71415", active: false, autoAudio: true });
  assert.equal(state.focus.id, "71415");
  assert.equal(state.videos[0].muted, false);
  state = reduce(state, { type: "focus", id: null });
  assert.equal(state.videos[0].muted, true);
  state = reduce(state, { type: "fullscreen", id: "71415", active: true, autoAudio: true });
  assert.equal(state.videos[0].muted, false);
  state = reduce(state, { type: "audio-policy", enabled: false });
  assert.equal(state.videos[0].muted, true);
  state = reduce(state, { type: "audio", id: "71415", muted: false, volume: .8 });
  state = reduce(state, { type: "fullscreen", id: "71415", active: false, autoAudio: false });
  assert.equal(state.videos[0].muted, false); assert.equal(state.videos[0].volume, .8);
  assert.equal(state.fullscreen, null);
  state = reduce(state, { type: "fullscreen", id: "2140934", active: true, autoAudio: false });
  assert.equal(state.videos[1].muted, true);
  state = reduce(state, { type: "close", id: "2140934" });
  assert.equal(state.fullscreen, null);
});

test("mode switches keep manual audio, restore original zero/on states and leave other rooms unchanged", () => {
  for (const muted of [true, false]) for (const volume of [0, .7]) for (const autoAudio of [false, true]) {
    let state = reduce(populated(), { type: "audio", id: "71415", muted, volume });
    state = reduce(state, { type: "audio", id: "2140934", muted: false, volume: .3 });
    const other = structuredClone(state.videos[1]);
    state = reduce(state, { type: "focus", id: "71415", autoAudio });
    state = reduce(state, { type: "fullscreen", id: "71415", active: true, autoAudio });
    assert.equal(state.focus, null); assert.ok(state.fullscreen);
    state = reduce(state, { type: "fullscreen", id: "71415", active: false, autoAudio });
    assert.equal(state.videos[0].muted, muted); assert.equal(state.videos[0].volume, volume);
    assert.deepEqual(state.videos[1], other);
  }
  let state = reduce(populated(), { type: "fullscreen", id: "71415", active: true, autoAudio: true });
  state = reduce(state, { type: "audio", id: "71415", muted: true, volume: .2 });
  state = reduce(state, { type: "focus", id: "71415", autoAudio: true });
  assert.equal(state.videos[0].muted, true); assert.equal(state.focus.adjusted, true);
  state = reduce(state, { type: "audio-policy", enabled: true });
  state = reduce(state, { type: "fullscreen", id: "71415", active: true, autoAudio: true });
  state = reduce(state, { type: "fullscreen", id: "71415", active: false, autoAudio: true });
  assert.equal(state.videos[0].muted, true); assert.equal(state.videos[0].volume, .2);
  state = reduce(state, { type: "focus", id: "71415", autoAudio: true });
  state = reduce(state, { type: "fullscreen", id: "2140934", active: true, autoAudio: true });
  assert.equal(state.focus, null); assert.equal(state.videos[0].muted, true);
  state = reduce(state, { type: "mute-all" });
  state = reduce(state, { type: "fullscreen", id: "2140934", active: false, autoAudio: true });
  assert.ok(state.videos.every((video) => video.muted));
});

test("late responses cannot recreate closed rooms; restoring sessions starts muted", () => {
  let state = reduce(populated(), { type: "audio", id: "71415", muted: false, volume: .6 });
  state = reduce(state, { type: "close", id: "2140934" });
  state = reduce(state, { type: "video", id: "2140934", patch: { stream: "late", status: "playing" } });
  assert.equal(state.videos.length, 1);
  const snapshot = workspaceSnapshot(state);
  assert.ok(!JSON.stringify(snapshot).includes('"stream"'));
  const restored = reduce(initialMonitorState, { type: "hydrate", snapshot });
  assert.equal(restored.videos.length, 1); assert.equal(restored.rooms.length, 2);
  assert.equal(restored.videos[0].muted, true); assert.equal(restored.focus, null);
});

test("focus rails keep every video and allow bounded scrolling without overwriting layouts", () => {
  const ids = Array.from({ length: 40 }, (_, i) => String(i));
  const result = focusLayouts(ids, "0", size, { left: 0, right: 0, top: 10000, bottom: 10000 });
  assert.equal(Object.keys(result.layouts).length, ids.length);
  assert.equal(result.layouts["0"].w, 70);
  assert.ok(result.limits.top > 0 && result.limits.bottom > 0);
  assert.ok(Object.values(result.layouts).every((r) => r.w > 0 && r.h > 0));
});

test("legacy grid/free/hidden/danmaku migration preserves local data and deduplicates platform identities", () => {
  const legacy = [{ id: "a", url: "https://www.douyu.com/71415", qnName: "原画" }, { id: "b", url: "https://www.douyu.com/2140934", layout: { ...defaultLayout, visible: false } }];
  const grid = { rows: 2, cols: 2, gap: 0, slots: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2, videoId: "a" }] };
  const values = { videoOrderList: JSON.stringify(legacy), layoutMode: "grid", gridLayout: JSON.stringify(grid), danmakuList: JSON.stringify([{ url: legacy[0].url }, { url: "https://live.bilibili.com/71415" }]) };
  const result = restoreWorkspace(storage(values), {});
  assert.equal(result.rooms.length, 3); assert.deepEqual(result.openIds, ["a"]);
  assert.equal(result.rooms[0].layout.w, 100); assert.equal(result.rooms[0].layout.h, 50);
  assert.equal(result.manual, true); assert.ok(result.rooms.every((r) => r.danmakuEnabled));
});

test("malformed saved rooms are isolated; shares omit credentials, follow-only rooms and runtime sound", () => {
  const state = reduce(populated(), { type: "close", id: "2140934" });
  const snapshot = workspaceSnapshot(state);
  const normalized = normalizeSnapshot({ ...snapshot, rooms: [...snapshot.rooms, null, { url: "https://douyu.com/" }] });
  assert.equal(normalized.rooms.length, 2);
  const link = new URL(shareWorkspace("http://localhost:3000", snapshot));
  const data = JSON.parse(decodeURIComponent(atob(link.searchParams.get("video"))));
  assert.equal(data.length, 1); assert.equal(data[0].id, "71415");
  for (const field of ["cookie", "volume", "muted", "stream"]) assert.ok(!Object.hasOwn(data[0], field));
  const imported = restoreWorkspace(storage({ danmakuList: JSON.stringify([{ url: "https://www.douyu.com/999" }]) }), { shareVideo: encode(data), shareLayoutMode: "auto" });
  assert.equal(imported.rooms.length, 1); assert.equal(imported.manual, false);
});
