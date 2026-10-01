const { test } = require("node:test");
const assert = require("node:assert/strict");
const { autoLayouts, arrangeByPosition, defaultLayout } = require("../src/features/monitor/geometry.ts");
const { monitorReducer: reduce, initialMonitorState, workspaceSnapshot } = require("../src/features/monitor/state.ts");
const { createRoom, normalizeSnapshot, restoreWorkspace, shareWorkspace, WORKSPACE_KEY } = require("../src/features/monitor/storage.ts");
const size = { width: 1440, height: 900 };

test("position arrangement preserves reversed/multirow placement and is stable with overlaps", () => {
  for (const count of [1, 2, 3, 5, 9]) {
    const ids = Array.from({ length: count }, (_, index) => String(index));
    const slots = ids.map((id) => autoLayouts(ids, size)[id]);
    const rooms = ids.map((id, index) => ({ id, layout: slots[count - index - 1] }));
    const arranged = arrangeByPosition(rooms, size);
    for (const room of rooms) assert.deepEqual(arranged[room.id], room.layout);
    assert.deepEqual(arrangeByPosition(rooms.map((room) => ({ ...room, layout: arranged[room.id] })), size), arranged);
    const overlapping = rooms.map((room) => ({ ...room, layout: defaultLayout }));
    const result = arrangeByPosition(overlapping, size);
    assert.equal(new Set(Object.values(result).map((rect) => `${rect.x},${rect.y}`)).size, count);
    assert.deepEqual(arrangeByPosition(overlapping.map((room) => ({ ...room, layout: result[room.id] })), size), result);
  }
  assert.deepEqual(arrangeByPosition([], size), {});
});

test("position assignment minimizes total pixel travel across all windows, rather than greedy selection", () => {
  const rooms = [
    { id: "a", layout: { ...defaultLayout, x: 37, y: 2, w: 30, h: 20 } },
    { id: "b", layout: { ...defaultLayout, x: 2, y: 30, w: 20, h: 30 } },
    { id: "c", layout: { ...defaultLayout, x: 10, y: 60, w: 35, h: 20 } },
    { id: "d", layout: { ...defaultLayout, x: 60, y: 15, w: 30, h: 40 } },
    { id: "e", layout: { ...defaultLayout, x: 45, y: 40, w: 30, h: 25 } },
  ];
  const distance = (a, b, canvas) => ((a.x + a.w / 2 - b.x - b.w / 2) * canvas.width / 100) ** 2 + ((a.y + a.h / 2 - b.y - b.h / 2) * canvas.height / 100) ** 2;
  const permutations = (values) => values.length < 2 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map((tail) => [value, ...tail]));
  for (const canvas of [size, { width: 390, height: 844 }]) {
    const slots = Object.values(autoLayouts(rooms.map((room) => room.id), canvas));
    const minimum = Math.min(...permutations(slots).map((assigned) => rooms.reduce((sum, room, index) => sum + distance(room.layout, assigned[index], canvas), 0)));
    const result = arrangeByPosition(rooms, canvas);
    const actual = rooms.reduce((sum, room) => sum + distance(room.layout, result[room.id], canvas), 0);
    assert.ok(Math.abs(actual - minimum) < .001);
  }
});

test("arranged order survives resize, normalized storage and share import without losing playback state", () => {
  let state = initialMonitorState;
  for (const id of ["a", "b", "c"]) state = reduce(reduce(state, { type: "add", room: createRoom(`https://www.douyu.com/${id}`, id) }), { type: "open", id, layout: defaultLayout });
  const slots = Object.values(autoLayouts(["a", "b", "c"], size));
  state = { ...state, videos: state.videos.map((video, index) => ({ ...video, layout: slots[2 - index], stream: "fixture-stream", playbackKey: 3, muted: false, status: "playing" })) };
  state = reduce(state, { type: "arrange", layouts: arrangeByPosition(state.videos, size) });
  assert.deepEqual(state.videos.map((video) => video.id), ["c", "b", "a"]);
  assert.ok(state.videos.every((video) => video.stream === "fixture-stream" && video.playbackKey === 3 && !video.muted));
  const snapshot = workspaceSnapshot(state);
  const normalized = normalizeSnapshot({ ...snapshot, openIds: [...snapshot.openIds, "missing", "c"] });
  assert.deepEqual(normalized.openIds, ["c", "b", "a"]);
  const storage = { getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(snapshot) : null };
  const restored = reduce(initialMonitorState, { type: "hydrate", snapshot: restoreWorkspace(storage, {}) });
  assert.deepEqual(restored.videos.map((video) => video.id), ["c", "b", "a"]);
  const resized = reduce(restored, { type: "arrange", layouts: autoLayouts(restored.videos.map((video) => video.id), { width: 390, height: 844 }) });
  assert.deepEqual(resized.videos.map((video) => video.id), ["c", "b", "a"]);
  const link = new URL(shareWorkspace("http://localhost", snapshot));
  const imported = restoreWorkspace({ getItem: () => null }, { shareVideo: link.searchParams.get("video"), shareLayoutMode: "auto" });
  assert.deepEqual(imported.openIds, ["c", "b", "a"]);
});

test("close-all keeps follows/history and undo restores failed temporary rooms and manual layouts muted", () => {
  let state = initialMonitorState;
  for (const id of ["a", "b", "c"]) state = reduce(reduce(state, { type: "add", room: createRoom(`https://www.douyu.com/${id}`, id) }), { type: "open", id, layout: defaultLayout });
  state = reduce(state, { type: "follow", id: "a", followed: true });
  state = reduce(state, { type: "played", id: "b", at: 100 });
  state = reduce(state, { type: "layout", id: "a", layout: { ...defaultLayout, x: 20, y: 30, w: 35, h: 40 } });
  const backup = { rooms: state.videos.map((video) => ({ ...state.rooms.find((room) => room.id === video.id), layout: video.layout })), manual: state.manual };
  state = reduce(state, { type: "focus", id: "a" });
  const closed = reduce(state, { type: "close-all" });
  assert.equal(closed.videos.length, 0); assert.equal(closed.focus, null); assert.equal(closed.fullscreen, null); assert.equal(closed.manual, false);
  assert.deepEqual(closed.rooms.map((room) => room.id), ["a", "b"]);
  assert.equal(closed.rooms[0].followed, true); assert.equal(closed.rooms[1].lastWatchedAt, 100);
  const restored = reduce(closed, { type: "restore-closed", ...backup });
  assert.equal(restored.manual, true); assert.equal(restored.videos.length, 3);
  assert.deepEqual(restored.videos.map((video) => video.layout), backup.rooms.map((room) => room.layout));
  assert.ok(restored.videos.every((video) => video.muted && video.status === "idle" && !video.stream));
  const repeat = reduce(restored, { type: "restore-closed", ...backup });
  assert.equal(repeat.videos.length, 3);
});
