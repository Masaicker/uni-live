const { test } = require("node:test");
const assert = require("node:assert/strict");
const { followedRooms } = require("../src/features/monitor/library.ts");
const { monitorReducer: reduce, initialMonitorState, workspaceSnapshot } = require("../src/features/monitor/state.ts");
const { createRoom, restoreWorkspace, shareWorkspace, WORKSPACE_KEY } = require("../src/features/monitor/storage.ts");
const { defaultLayout, autoLayouts } = require("../src/features/monitor/geometry.ts");
const { watchingHistory } = require("../src/features/monitor/library.ts");

const open = (state, id) => reduce(reduce(state, { type: "add", room: createRoom(`https://www.douyu.com/${id}`, id) }), { type: "open", id, layout: defaultLayout });

test("live priority never overwrites manual follow order; cross-status moves and new follows persist", () => {
  let state = initialMonitorState;
  for (const id of ["1", "2", "3", "4", "5"]) {
    state = reduce(open(state, id), { type: "follow", id, followed: true });
    state = reduce(state, { type: "room", id, patch: { liveStatus: id === "5" ? null : ["2", "4"].includes(id) } });
  }
  const ids = (live = false) => followedRooms(state.rooms, live).map((room) => room.id);
  assert.deepEqual(ids(), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids(true), ["2", "4", "1", "3", "5"]);
  state = reduce(state, { type: "room", id: "2", patch: { liveStatus: false } });
  assert.deepEqual(ids(true), ["4", "1", "2", "3", "5"]);
  state = reduce(state, { type: "reorder-followed", from: "4", to: "1" });
  assert.deepEqual(ids(), ["4", "1", "2", "3", "5"]);
  state = reduce(state, { type: "room", id: "2", patch: { liveStatus: true } });
  assert.deepEqual(ids(true), ["4", "2", "1", "3", "5"]);
  state = reduce(open(state, "6"), { type: "follow", id: "6", followed: true });
  assert.deepEqual(ids(), ["4", "1", "2", "3", "5", "6"]);
  const restored = restoreWorkspace({ getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(workspaceSnapshot(state)) : null }, {});
  assert.deepEqual(followedRooms(restored.rooms).map((room) => room.id), ids());
  state = reduce(state, { type: "follow", id: "1", followed: false });
  state = reduce(state, { type: "follow", id: "1", followed: true });
  assert.deepEqual(ids(), ["4", "2", "3", "5", "6", "1"]);
});

test("unverified temporary rooms do not become followed or history before successful playback", () => {
  let state = open(initialMonitorState, "1");
  assert.equal(state.rooms[0].followed, false); assert.equal(watchingHistory(state.rooms).length, 0);
  state = reduce(state, { type: "video", id: "1", patch: { status: "error" } });
  assert.equal(watchingHistory(state.rooms).length, 0);
  state = reduce(state, { type: "close", id: "1" });
  assert.equal(state.rooms.length, 0);
  state = open(state, "2");
  state = reduce(state, { type: "played", id: "2", at: 100 });
  state = reduce(state, { type: "close", id: "2" });
  assert.equal(state.rooms.length, 1); assert.equal(watchingHistory(state.rooms)[0].id, "2");
  state = reduce(state, { type: "played", id: "1", at: 200 });
  assert.equal(state.rooms.length, 1);
});

test("verified offline rooms persist in history without opening, including after browser restore", () => {
  const room = { ...createRoom("https://www.douyu.com/1", "offline"), anchorName: "Offline anchor", liveStatus: false };
  let state = reduce(initialMonitorState, { type: "add", room });
  state = reduce(state, { type: "visited", id: room.id, at: 100 });
  assert.equal(state.videos.length, 0);
  assert.equal(state.rooms[0].followed, false);
  assert.equal(watchingHistory(state.rooms)[0].id, "offline");
  state = reduce(state, { type: "visited", id: room.id, at: 200 });
  assert.equal(state.rooms.length, 1);
  const restored = restoreWorkspace({ getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(workspaceSnapshot(state)) : null }, {});
  assert.deepEqual(restored.openIds, []);
  assert.equal(restored.rooms[0].lastWatchedAt, 200);
  assert.equal(restored.rooms[0].liveStatus, false);
});

test("undo unfollow restores the original order without reopening or replacing updated room metadata", () => {
  let state = initialMonitorState;
  for (const id of ["1", "2", "3"]) state = reduce(open(state, id), { type: "follow", id, followed: true });
  const saved = { ...state.rooms.find((room) => room.id === "2") };
  state = reduce(state, { type: "close", id: "2" });
  state = reduce(state, { type: "follow", id: "2", followed: false });
  assert.equal(state.rooms.some((room) => room.id === "2"), false);
  state = reduce(state, { type: "restore-follow", room: saved });
  assert.deepEqual(followedRooms(state.rooms).map((room) => room.id), ["1", "2", "3"]);
  assert.equal(state.videos.some((video) => video.id === "2"), false);
  state = reduce(state, { type: "room", id: "2", patch: { title: "Updated title" } });
  state = reduce(state, { type: "follow", id: "2", followed: false });
  state = reduce(state, { type: "restore-follow", room: saved });
  assert.equal(state.rooms.find((room) => room.id === "2").title, saved.title);
  state = reduce(state, { type: "visited", id: "2", at: 300 });
  state = reduce(state, { type: "follow", id: "2", followed: false });
  state = reduce(state, { type: "room", id: "2", patch: { title: "New retained title" } });
  state = reduce(state, { type: "restore-follow", room: saved });
  assert.equal(state.rooms.find((room) => room.id === "2").title, "New retained title");
});

test("history has a 50-room limit while open rooms and explicit follows survive eviction", () => {
  let state = initialMonitorState;
  for (let i = 1; i <= 60; i++) {
    const id = String(i); state = open(state, id);
    if (i === 1) state = reduce(state, { type: "follow", id, followed: true });
    state = reduce(state, { type: "played", id, at: i });
    if (i !== 2) state = reduce(state, { type: "close", id });
  }
  assert.equal(watchingHistory(state.rooms).length, 50);
  assert.equal(watchingHistory(state.rooms)[0].id, "60");
  assert.equal(state.rooms.find((r) => r.id === "1").followed, true);
  assert.equal(state.videos[0].id, "2");
  state = reduce(state, { type: "clear-history" });
  assert.equal(watchingHistory(state.rooms).length, 0); assert.equal(state.rooms.length, 2);
  assert.equal(state.videos.length, 1);
});

test("cleaning temporary rooms leaves history, does not open closed follows, and restores focus audio", () => {
  let state = open(open(open(initialMonitorState, "1"), "2"), "3");
  state = reduce(state, { type: "follow", id: "1", followed: true });
  state = reduce(state, { type: "follow", id: "3", followed: true });
  state = reduce(state, { type: "close", id: "3" });
  state = reduce(state, { type: "played", id: "2", at: 10 });
  state = reduce(state, { type: "focus", id: "1" });
  const temporary = state.videos.filter((v) => !v.followed);
  state = reduce(state, { type: "focus", id: null });
  for (const video of temporary) state = reduce(state, { type: "close", id: video.id });
  state = reduce(state, { type: "arrange", layouts: autoLayouts(state.videos.map((v) => v.id), { width: 1440, height: 900 }) });
  assert.deepEqual(state.videos.map((v) => v.id), ["1"]);
  assert.equal(state.videos[0].muted, true); assert.equal(state.manual, false);
  assert.equal(state.rooms.find((r) => r.id === "3").followed, true);
  assert.equal(watchingHistory(state.rooms)[0].id, "2");
});

test("v2 automatic favorites migrate to history; shared layouts preserve recipient follows", () => {
  const oldRoom = createRoom("https://www.douyu.com/1", "local");
  const old = { version: 2, rooms: [oldRoom], openIds: ["local"], manual: false };
  const migrated = restoreWorkspace({ getItem: (key) => key === "uni-live.workspace.v2" ? JSON.stringify(old) : null }, {});
  assert.equal(migrated.version, 3); assert.equal(migrated.rooms[0].followed, false); assert.ok(migrated.rooms[0].lastWatchedAt);
  let state = open(initialMonitorState, "2"); state = reduce(state, { type: "follow", id: "2", followed: true });
  const local = workspaceSnapshot(state);
  const share = new URL(shareWorkspace("http://localhost", migrated));
  const restored = restoreWorkspace({ getItem: (key) => key === WORKSPACE_KEY ? JSON.stringify(local) : null }, { shareVideo: share.searchParams.get("video"), shareLayoutMode: "auto" });
  assert.equal(restored.rooms.find((r) => r.id === "2").followed, true);
  assert.deepEqual(restored.openIds, ["local"]);
});
